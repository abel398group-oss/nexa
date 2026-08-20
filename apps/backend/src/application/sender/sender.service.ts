import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { createRedisClient } from '@/shared/redis/redis.factory';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { OptOutRegistryService } from '@/application/contacts/opt-out-registry.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { WahaClientService, linhasConfiguradas, LINHA_PRINCIPAL } from '@/shared/waha/waha-client.service';
import { NumberBudgetService } from '@/shared/waha/number-budget.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { looksLikeCompetitor } from './competitor-names.const';
import { canReceiveCampaign, rejectionReason } from './phone-eligibility';
import { spin, lowVariationWarning } from './spintax';
import { firstName, tidyMissingName } from './name-render';
import { assessHealth, healthThresholdsFromEnv, type HealthAssessment } from './sender-health';
import { dedupSentAtFilter, dedupWindowLabel } from './campaign-dedup';
import { precisaTrocarMercado } from './conversation-market';
import { motivoDeBloqueioDoDisparo } from '@/application/markets/market-gate';
import { marcarLinkDaCampanha } from './campaign-link';
import { resolveSignature } from '@/application/email/email-signature';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { comEscopo } from '@/shared/auth/seller-scope';

// Config anti-ban (env com defaults)
const BUSINESS_START = Number(process.env.SENDER_BUSINESS_START ?? 7); // 7h
const BUSINESS_END = Number(process.env.SENDER_BUSINESS_END ?? 19); // 19h
// delay entre envios: aleatório 30-90s (anti-ban) — varia a cada envio
const DELAY_MIN_MS = Number(process.env.SENDER_DELAY_MIN_MS ?? 30000);
const DELAY_MAX_MS = Number(process.env.SENDER_DELAY_MAX_MS ?? 90000);
// Validade do veredito de saúde de engajamento (a query varre 24h de alvos).
const HEALTH_CACHE_MS = 10 * 60_000;
// limite diário efetivo por fase de aquecimento (G7) — número novo começa baixo e cresce.
// Exportado para `SenderWarmupService`, que é quem faz o número SUBIR de degrau: aqui
// a escada só é lida para decidir o teto do dia.
export const WARMUP_DAILY = [10, 15, 20, 30];

/**
 * Espelho dos defaults de `SenderNumber` no schema. Usado para descrever uma linha
 * configurada que ainda não tem registro (ver `linhaSemRegistro`): sem isto, a tela
 * teria que inventar números, e número inventado numa tela de anti-ban é pior que
 * campo vazio.
 *
 * `sender-defaults.spec.ts` lê o `schema.prisma` e falha se qualquer um destes três
 * divergir — é o que impede a tela de mentir depois de uma migration.
 */
export const SENDER_DEFAULTS = { dailyLimit: 30, hourlyLimit: 8, warmupStage: 0 } as const;

// Chaves Redis para estado anti-ban compartilhado entre réplicas (BUG-001 fix)
const REDIS_KEY_LAST_SENT = 'sender:lastSentAt';
const REDIS_KEY_NEXT_DELAY = 'sender:nextDelayMs';
const REDIS_STATE_TTL_S = 3600; // 1h de TTL — se o worker parar, estado expira sozinho

@Injectable()
export class SenderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Sender');
  // Estado local como fallback quando Redis não está disponível
  private lastSentAt = 0;
  private nextDelayMs = DELAY_MIN_MS;
  /** Veredito de saúde por tenant — a query varre 24h e não pode rodar a cada tick. */
  private healthCache = new Map<string, { at: number; unhealthy: boolean }>();
  private redis: Redis | null = null;

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = createRedisClient(url, 'sender');
      this.logger.log('Sender: estado anti-ban via Redis (multi-instância)');
    } else {
      this.logger.warn('Sender: REDIS_URL ausente — estado anti-ban em memória (single-instance)');
    }
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit();
  }

  // Lê lastSentAt e nextDelayMs do Redis (ou do estado local como fallback)
  private async readAntibanState(): Promise<{ lastSentAt: number; nextDelayMs: number }> {
    if (this.redis) {
      try {
        const [lastStr, delayStr] = await this.redis.mget(REDIS_KEY_LAST_SENT, REDIS_KEY_NEXT_DELAY);
        return {
          lastSentAt: lastStr ? parseInt(lastStr, 10) : 0,
          nextDelayMs: delayStr ? parseInt(delayStr, 10) : DELAY_MIN_MS,
        };
      } catch {
        // Redis temporariamente indisponível — cai no estado local
      }
    }
    return { lastSentAt: this.lastSentAt, nextDelayMs: this.nextDelayMs };
  }

  // Persiste lastSentAt e nextDelayMs no Redis (e atualiza local como cache)
  private async writeAntibanState(lastSentAt: number, nextDelayMs: number): Promise<void> {
    this.lastSentAt = lastSentAt;
    this.nextDelayMs = nextDelayMs;
    if (this.redis) {
      try {
        await this.redis
          .multi()
          .set(REDIS_KEY_LAST_SENT, lastSentAt.toString(), 'EX', REDIS_STATE_TTL_S)
          .set(REDIS_KEY_NEXT_DELAY, nextDelayMs.toString(), 'EX', REDIS_STATE_TTL_S)
          .exec();
      } catch {
        // Redis indisponível — estado já salvo no local, worker continua funcionando
      }
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly followup: FollowUpService,
    private readonly waha: WahaClientService,
    private readonly tmsLookup: TmsLookupService,
    private readonly lock: RedisLockService,
    private readonly optOutRegistry: OptOutRegistryService,
    // Opcional de propósito: as specs constroem este serviço posicionalmente, e o
    // freio de engajamento não pode depender de notificação para funcionar — sem
    // ela o número ainda é desativado e o motivo ainda vai para o log.
    private readonly notifications?: NotificationsService,
    // Também opcional pelo mesmo motivo: as specs constroem posicionalmente, e
    // um teto de segurança não pode ser condição para o worker existir. Sem ele
    // valem só os limites por número (o comportamento anterior a 2026-08-09).
    private readonly budget?: NumberBudgetService,
  ) {}

  // ── Reconexão do número (WAHA) ──────────────────────────────────────────────
  // Reinicia a sessão do WhatsApp (recuperar de "Falha na sessão") e devolve o
  // status/QR para a tela de Saúde dos números.
  // `linha` desde 13/08/2026: sem ela a tela só alcançava o número principal, e
  // o segundo número não teria como ser pareado nem recuperado pela interface.
  async restartWahaSession(linha?: string) {
    return this.waha.restartSession(linha);
  }

  async getWahaQr(linha?: string) {
    return this.waha.getQr(linha);
  }

  /**
   * Linhas de WhatsApp e o estado de cada uma — é o que a tela de Saúde precisa
   * para deixar de tratar "o número" como se fosse um só.
   *
   * O status vai junto de propósito: separado, a tela faria uma chamada por
   * linha e mostraria as duas dessincronizadas por alguns segundos, que é
   * exatamente quando alguém aperta "reconectar" na errada.
   *
   * Uma linha fora do ar não derruba a lista: vem com status desconhecido e as
   * outras aparecem normalmente.
   */
  async listWahaLinhas() {
    const nomes = linhasConfiguradas();
    return Promise.all(
      nomes.map(async (nome) => {
        const alvo = this.waha.resolveLinha(nome);
        const st = await this.waha.getSessionStatus(nome).catch(() => null);
        return {
          linha: nome,
          // `principal` sem env própria e uma linha declarada que caiu na
          // principal são casos diferentes, e a tela precisa distinguir.
          configurada: !!alvo.baseUrl,
          status: st?.status ?? 'UNKNOWN',
          conectada: st?.status === 'WORKING',
        };
      }),
    );
  }

  // ---------- número do pool ----------
  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  private thisHour(): string {
    return `${this.today()}-${String(new Date().getHours()).padStart(2, '0')}`;
  }

  // limite diário efetivo considerando aquecimento (G7)
  effectiveDailyLimit(n: { dailyLimit: number; warmupStage: number }): number {
    const warm = WARMUP_DAILY[Math.min(n.warmupStage, WARMUP_DAILY.length - 1)];
    return Math.min(n.dailyLimit, warm);
  }

  /**
   * `linha` isola o registro (13/08/2026 — divisão de números): a principal e a
   * vendas são chips DIFERENTES, e aquecimento/teto diário de um não pode valer
   * para o outro. Sem `linha`, cai na principal — mesmo comportamento de sempre
   * para quem não passa nada.
   */
  async ensureNumber(tenantId: string, linha: string = 'principal') {
    let n = await this.prisma.senderNumber.findFirst({ where: { tenantId, active: true, linha } as any });
    if (!n) {
      const phoneEnvKey = linha === 'principal' ? 'WAHA_SENDER_PHONE' : `WAHA_${linha.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_SENDER_PHONE`;
      // Pergunta ao WAHA qual chip está pareado nesta linha. Vem antes da env porque é a
      // verdade do momento; a env é reserva para quando o WAHA está fora do ar na hora
      // exata em que o registro nasce.
      const foneDoWaha = (await this.waha.getSessionStatus(linha).catch(() => null))?.phone ?? null;
      const phone = foneDoWaha ?? process.env[phoneEnvKey] ?? (linha === 'principal' ? '5512997880659' : `sem-numero-${linha}`);
      if (phone.startsWith('sem-numero-')) {
        this.logger.warn(`ensureNumber: WAHA não informou o número e falta ${phoneEnvKey} — rótulo na tela fica "${phone}" (não afeta o envio)`);
      }
      n = await this.prisma.senderNumber.create({
        data: { tenantId, phone, sessionName: 'default', linha } as any,
      });
    }
    // reseta contador diário se virou o dia
    if (n.dayStamp !== this.today()) {
      n = await this.prisma.senderNumber.update({ where: { id: n.id }, data: { sentToday: 0, dayStamp: this.today() } });
    }
    // reseta contador horário se virou a hora
    if (n.hourStamp !== this.thisHour()) {
      n = await this.prisma.senderNumber.update({ where: { id: n.id }, data: { sentThisHour: 0, hourStamp: this.thisHour() } });
    }
    return n;
  }

  /**
   * Linha configurada que ainda não tem registro no banco.
   *
   * `ensureNumber` cria a linha do `senderNumber` no PRIMEIRO envio. Até lá a tela de
   * Saúde mostrava as duas linhas conectadas no topo e listava um número só embaixo —
   * e pior, "Enviados hoje 14/30" e "Capacidade usada 47%" descreviam só a principal,
   * como se fossem o total. Quem acabou de parear um chip não tinha onde ver o
   * aquecimento dele justamente no momento em que isso mais importa.
   *
   * Devolver aqui, e não criar o registro, porque isto é um GET: listar não escreve. O
   * registro nasce no primeiro envio, que é quando existe algo para contar.
   *
   * Os valores espelham os defaults do schema (ver `sender-defaults.spec.ts`, que
   * falha se o schema mudar e esta linha virar mentira).
   */
  private linhaSemRegistro(linha: string, foneDoWaha: string | null) {
    const chaveFone =
      linha === LINHA_PRINCIPAL
        ? 'WAHA_SENDER_PHONE'
        : `WAHA_${linha.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_SENDER_PHONE`;
    return {
      id: `sem-registro:${linha}`,
      linha,
      // O WAHA sabe qual chip está pareado (`me.id`), então perguntar a ele vem PRIMEIRO:
      // é a verdade do momento, e não depende de alguém lembrar de declarar a env — nem
      // fica desatualizado quando o chip é trocado. A env é reserva, e `null` é o último
      // caso: a tela diz "número ainda não identificado", que é melhor que um rótulo
      // falso com cara de telefone numa tela de anti-ban.
      phone: foneDoWaha ?? process.env[chaveFone] ?? null,
      active: true,
      dailyLimit: SENDER_DEFAULTS.dailyLimit,
      sentToday: 0,
      hourlyLimit: SENDER_DEFAULTS.hourlyLimit,
      sentThisHour: 0,
      warmupStage: SENDER_DEFAULTS.warmupStage,
      effectiveDailyLimit: this.effectiveDailyLimit({
        dailyLimit: SENDER_DEFAULTS.dailyLimit,
        warmupStage: SENDER_DEFAULTS.warmupStage,
      }),
      // Sem histórico não há saúde nem orçamento a mostrar. `null` faz a tela omitir os
      // blocos, em vez de desenhar zeros que parecem chip ocioso.
      health: null,
      budget: null,
      semRegistro: true,
    };
  }

  async listNumbers(tenantId: string) {
    const numbers = await this.prisma.senderNumber.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    const health = await this.engagementHealth(tenantId).catch(() => null);
    // Linha declarada no ambiente que ainda não apareceu na tabela.
    const comRegistro = new Set(numbers.map((n: any) => n.linha ?? LINHA_PRINCIPAL));
    const pendentes = linhasConfiguradas().filter((l) => !comRegistro.has(l));
    // `sentToday` conta só o disparo de campanha. `budget` conta o que o número
    // realmente mandou, por todos os canais — é o número que importa para risco
    // de bloqueio, e sem ele a tela de saúde mostrava um chip ocioso que na
    // verdade estava a plena carga.
    //
    // Por NÚMERO, não mais um snapshot global (13/08/2026): com duas linhas,
    // cada `SenderNumber` tem o orçamento do próprio chip — misturar os dois
    // aqui reintroduziria o mesmo bug que corrigimos no NumberBudgetService.
    // enriquece com o limite diário EFETIVO (já considerando a fase de aquecimento)
    // e com a saúde de engajamento das últimas 24h (freio anti-queima).
    const registrados = await Promise.all(
      numbers.map(async (n: any) => ({
        ...n,
        effectiveDailyLimit: this.effectiveDailyLimit({ dailyLimit: n.dailyLimit, warmupStage: n.warmupStage }),
        health,
        budget: (await this.budget?.snapshot(n.linha ?? 'principal').catch(() => null)) ?? null,
        semRegistro: false,
      })),
    );
    // Uma consulta ao WAHA por linha PENDENTE (nunca por linha já registrada), e só para
    // descobrir o número do chip. WAHA fora do ar devolve null e a tela diz que o número
    // não foi identificado — nunca quebra a listagem.
    const semRegistro = await Promise.all(
      pendentes.map(async (l) => {
        const st = await this.waha.getSessionStatus(l).catch(() => null);
        return this.linhaSemRegistro(l, st?.phone ?? null);
      }),
    );
    return [...registrados, ...semRegistro];
  }

  /**
   * Saúde de engajamento do tenant nas últimas 24h (ver sender-health.ts).
   *
   * ESCOPO: por TENANT, não por número. Hoje `ensureNumber()` sempre devolve o
   * primeiro número ativo, então na prática há um número disparando por vez e os
   * dois recortes coincidem. Quando existir rodízio de verdade, isto precisa de um
   * `senderNumberId` no CampaignTarget para não somar a reputação de números
   * diferentes no mesmo balde.
   *
   * "Respondeu" = existe mensagem inbound daquele telefone DEPOIS do envio. Um SQL
   * só, com EXISTS — carregar as conversas para cruzar em memória não escala com a
   * base de leads.
   */
  async engagementHealth(tenantId: string): Promise<HealthAssessment> {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<{ sent: bigint; replied: bigint; failed: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE t.status = 'sent')   AS sent,
        COUNT(*) FILTER (WHERE t.status = 'failed') AS failed,
        COUNT(*) FILTER (
          WHERE t.status = 'sent' AND (
            -- resposta na conversa do próprio alvo (caso normal)
            EXISTS (
              SELECT 1
                FROM ai_messages m
                JOIN ai_conversations c ON c.id = m.conversation_id
               WHERE c.tenant_id = t.tenant_id
                 AND c.phone = t.phone
                 AND m.direction = 'inbound'
                 AND m.created_at >= t.sent_at
            )
            -- ou resposta de e-mail vinda de OUTRO endereço, reconhecida pelo
            -- Message-ID: a conversa é outra, com outro phone, e o EXISTS acima não
            -- a vê. Sem esta perna, o freio de engajamento lê uma taxa de resposta
            -- menor que a real e pode desativar um número saudável.
            OR t.replied_at IS NOT NULL
          )
        ) AS replied
      FROM campaign_targets t
      WHERE t.tenant_id = ${tenantId}
        AND t.phone <> ''
        AND t.created_at >= ${desde}
    `;
    const r = rows[0] ?? { sent: 0n, replied: 0n, failed: 0n };
    return assessHealth(
      { sent: Number(r.sent), replied: Number(r.replied), failed: Number(r.failed) },
      healthThresholdsFromEnv(),
    );
  }

  /**
   * Freio: desativa o número quando o engajamento despenca.
   *
   * Roda no tick, mas o veredito é cacheado por 10 min — a query varre 24h de alvos e
   * não pode rodar a cada 15s. Desativar é reversível pela tela de Saúde dos Números;
   * o custo de reativar à mão é irrisório perto do de perder o chip.
   */
  private async pauseIfUnhealthy(tenantId: string, numberId: string): Promise<boolean> {
    const cached = this.healthCache.get(tenantId);
    if (cached && Date.now() - cached.at < HEALTH_CACHE_MS) return cached.unhealthy;

    let verdict: HealthAssessment;
    try {
      verdict = await this.engagementHealth(tenantId);
    } catch (e: any) {
      // Freio é proteção, não pré-requisito: se a apuração falhar, o disparo segue.
      this.logger.warn(`Saúde de engajamento não apurada (${e?.message}) — disparo segue`);
      return false;
    }

    this.healthCache.set(tenantId, { at: Date.now(), unhealthy: !verdict.healthy });
    if (verdict.healthy) return false;

    await this.prisma.senderNumber.update({ where: { id: numberId }, data: { active: false } });
    this.logger.warn(`FREIO DE ENGAJAMENTO: número desativado (tenant=${tenantId}) — ${verdict.reason}`);
    await this.notifications
      ?.create(tenantId, {
        type: 'info',
        title: '🛑 Disparo pausado — engajamento baixo',
        body:
          `${verdict.reason}. O número foi desativado para não ser bloqueado pelo WhatsApp. ` +
          `Revise a lista e a mensagem antes de reativar em Saúde dos Números.`,
        link: '/numeros',
      })
      .catch(() => null);
    return true;
  }

  // ---------- campanhas ----------
  async createCampaign(
    tenantId: string,
    dto: {
      name: string; template: string; type?: string; productCode?: string;
      phones?: { phone: string; name?: string }[]; fromContacts?: boolean;
      /**
       * Dispara para os contatos de UM LOTE (19/08/2026).
       *
       * Terceira origem de alvos, ao lado de `phones` (telefone avulso) e
       * `fromContacts` (base inteira). Existe porque o caminho do meio faltava: quem
       * importava um CSV, peneirava e distribuía não tinha como dizer "manda para
       * esta lista" — exportava o mesmo CSV e subia de novo aqui, refazendo a peneira.
       */
      fromBatchId?: string;
      link?: string; sendLinkOnFirst?: boolean;
      mediaUrl?: string; mediaName?: string; sendLimit?: number; scheduledAt?: string;
      /** Vendedor dono. Vem do token quando quem cria é vendedor. */
      ownerSellerId?: string | null;
      /**
       * Linha de WhatsApp (13/08/2026). Sem escolha explícita, campanha NOVA sai
       * pela vendas — é o funil de prospecção migrando pro número dedicado
       * (Mateus). Linha inexistente/mal configurada cai na principal sozinha
       * (ver `WahaClientService.resolveLinha`), então o default aqui nunca
       * derruba um disparo por falta de configuração.
       */
      linha?: string;
    },
  ) {
    const ownerSellerId = dto.ownerSellerId || null;
    const campaignType = dto.type === 'status' ? 'status' : 'message';
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const linha = dto.linha || 'vendas';

    // Trava de mercado NA API, não só no seletor (ADR 037). O e-mail já barrava
    // mercado em rascunho/inexistente na criação; o WhatsApp aceitava qualquer
    // string como productCode — dava para disparar de um mercado não validado e
    // a Lia caía numa conversa sem base de conhecimento. Ver market-gate.ts.
    await this.assertMercadoLiberado(dto.productCode);

    // ── Campanha de Status WhatsApp: sem targets, cria direto e retorna ────────
    if (campaignType === 'status') {
      const camp = await this.prisma.campaign.create({
        data: {
          tenantId,
          name: dto.name,
          type: 'status',
          productCode: dto.productCode || null,
          template: dto.template,
          mediaUrl: dto.mediaUrl || null,
          mediaName: dto.mediaName || null,
          scheduledAt,
          ownerSellerId,
          ...({ linha } as any),
          ...(scheduledAt ? { status: 'running', startedAt: new Date() } : {}),
        },
      });
      return { ...camp, included: 0, skippedOptOut: 0, skippedTms: 0 };
    }

    let targets = dto.phones ?? [];
    if (dto.fromContacts) {
      const contacts = await this.prisma.contact.findMany({
        where: { tenantId, status: 'active' }, // nunca dispara p/ opted_out (LGPD)
        select: { phone: true, name: true },
      });
      targets = contacts.map((c: any) => ({ phone: c.phone, name: c.name ?? undefined }));
    } else if (dto.fromBatchId) {
      // O lote é do tenant — checado no `where`, não confiado no parâmetro: sem isso
      // bastava mandar o id de um lote alheio para disparar para a lista de outro.
      const lote = await this.prisma.leadBatch.findFirst({
        where: { id: dto.fromBatchId, tenantId },
        select: { id: true, name: true },
      });
      if (!lote) throw new BadRequestException('Lista de leads não encontrada.');

      const contacts = await this.prisma.contact.findMany({
        where: { tenantId, batchId: lote.id, status: 'active' }, // opted_out fora (LGPD)
        select: { phone: true, name: true },
      });
      if (!contacts.length) {
        // Mensagem específica: "0 alvos" numa lista que a tela mostra com 500 leads
        // manda o operador procurar defeito no disparo, e o motivo é a peneira —
        // todos viraram cliente, opt-out ou bloqueado desde a importação.
        throw new BadRequestException(
          `A lista "${lote.name}" não tem nenhum contato ativo — todos saíram por opt-out, ` +
            `bloqueio ou por já serem clientes.`,
        );
      }
      targets = contacts.map((c: any) => ({ phone: c.phone, name: c.name ?? undefined }));
      this.logger.log(`Campanha "${dto.name}": ${targets.length} alvo(s) da lista "${lote.name}"`);
    }
    // dedup por telefone
    const seen = new Set<string>();
    targets = targets.filter((t) => (seen.has(t.phone) ? false : seen.add(t.phone)));

    // ── Telefone inelegível (2026-08-01, auditoria pré go-live) ───────────────
    // PRIMEIRO filtro de todos, de propósito: número estrangeiro/inválido não
    // deve nem consultar o TMS nem consumir cota do aquecimento (~10/dia).
    // Ver phone-eligibility.ts — o CSV real trouxe 33 estrangeiros e 27 fixos.
    const invalidList = targets.filter((t) => !canReceiveCampaign(t.phone));
    if (invalidList.length) {
      const invalidSet = new Set(invalidList.map((t) => t.phone));
      targets = targets.filter((t) => !invalidSet.has(t.phone));
      this.logger.warn(
        `Campanha "${dto.name}": ${invalidList.length} telefone(s) inelegível(is) — pulados. ` +
        invalidList.slice(0, 10).map((t) => `${t.phone} (${rejectionReason(t.phone)})`).join(', ') +
        (invalidList.length > 10 ? ` … +${invalidList.length - 10}` : ''),
      );
    }
    const skippedInvalid = invalidList.length;

    // quantos foram PULADOS por opt-out (transparência LGPD)
    let skippedOptOut = 0;
    if (dto.fromContacts) {
      skippedOptOut = await this.prisma.contact.count({ where: { tenantId, status: 'opted_out' } });
    } else if (targets.length) {
      skippedOptOut = await this.prisma.contact.count({
        where: { tenantId, status: 'opted_out', phone: { in: targets.map((t) => t.phone) } },
      });
      // remove da lista quem está opted_out (mesmo em envio manual)
      const optedOut = await this.prisma.contact.findMany({
        where: { tenantId, status: 'opted_out', phone: { in: targets.map((t) => t.phone) } },
        select: { phone: true },
      });
      const blocked = new Set(optedOut.map((o: any) => o.phone));
      targets = targets.filter((t) => !blocked.has(t.phone));
    }

    // ── Lista de bloqueio LGPD (2026-08-03) ──────────────────────────────────
    // Vem da tabela `opt_out_records`, que sobrevive à exclusão do contato.
    // Sem isto, limpar a base e reimportar a lista antiga ressuscitava quem
    // tinha pedido para sair — aconteceu em produção.
    let optOutBloqueados: { phone: string; name?: string | null }[] = [];
    if (targets.length) {
      const bloqueados = await this.optOutRegistry.blockedPhones(tenantId, targets.map((t) => t.phone));
      optOutBloqueados = targets.filter((t) => bloqueados.has((t.phone ?? '').replace(/\D/g, '')));
      targets = targets.filter((t) => !bloqueados.has((t.phone ?? '').replace(/\D/g, '')));
      if (optOutBloqueados.length) {
        skippedOptOut += optOutBloqueados.length;
        this.logger.log(`Campanha "${dto.name}": ${optOutBloqueados.length} na lista de bloqueio (opt-out) — pulados`);
      }
    }

    // ── Blocklist (2026-08-01): concorrentes marcados status='blocked' ────────
    // Diferente do opt-out (pedido do contato/LGPD), blocked é decisão nossa.
    // fromContacts já filtra (where status='active'); aqui cobre lista manual/CSV.
    let blockedList: { phone: string; name?: string | null }[] = [];
    if (targets.length) {
      const blockedRows = await this.prisma.contact.findMany({
        where: { tenantId, status: 'blocked', phone: { in: targets.map((t) => t.phone) } },
        select: { phone: true },
      });
      const blockedSet = new Set(blockedRows.map((b: any) => b.phone));
      blockedList = targets.filter((t) => blockedSet.has(t.phone));
      targets = targets.filter((t) => !blockedSet.has(t.phone));
    }
    const skippedBlocked = blockedList.length;
    if (skippedBlocked > 0) {
      this.logger.log(`Campanha "${dto.name}": ${skippedBlocked} número(s) na blocklist — pulados (bloqueado)`);
    }

    // ── Heurística de NOME de concorrente (2026-08-01) ────────────────────────
    // Números raspados de grupos vêm com o nome de exibição; se o nome bate com
    // um TMS/emissor conhecido (competitor-names.const), NÃO envia — entra como
    // skipped/'suspeito_concorrente' no relatório. Falso positivo? O Abel vê no
    // relatório e manda manualmente. Sem nome = passa (heurística, não trava).
    const suspectList = targets.filter((t) => looksLikeCompetitor(t.name));
    if (suspectList.length) {
      const suspectSet = new Set(suspectList.map((t) => t.phone));
      targets = targets.filter((t) => !suspectSet.has(t.phone));
      this.logger.warn(
        `Campanha "${dto.name}": ${suspectList.length} nome(s) parecem CONCORRENTE — pulados: ` +
        suspectList.map((t) => `${t.name} (${t.phone})`).join(', '),
      );
    }
    const skippedSuspect = suspectList.length;

    // ── Dedup ENTRE campanhas (2026-07-29, pré go-live de leads) ──────────────
    // O dedup acima só olha a lista DESTA campanha. Sem este bloco, o mesmo
    // telefone vindo em dois CSVs diferentes recebia a prospecção duas vezes —
    // com lista comprada/exportada isso é questão de tempo, não hipótese.
    // Quem já tem envio 'sent' em QUALQUER campanha do tenant entra como
    // skipped/ja_enviado (visível no relatório, mesmo padrão do tms_cliente).
    // Só 'sent' bloqueia: failed/skipped/queued não contam como "já recebeu".
    //
    // A janela vem de CAMPAIGN_DEDUP_DAYS e por padrão não existe — bloqueio
    // permanente, como sempre foi. Ver campaign-dedup.ts para o porquê do default.
    const janelaDedup = dedupSentAtFilter();
    let alreadySent = new Set<string>();
    if (targets.length) {
      const prior = await this.prisma.campaignTarget.findMany({
        where: {
          tenantId,
          status: 'sent',
          phone: { in: targets.map((t) => t.phone) },
          ...(janelaDedup ? { sentAt: janelaDedup } : {}),
        },
        select: { phone: true },
        distinct: ['phone'],
      });
      alreadySent = new Set(prior.map((p: any) => p.phone));
    }
    const dupBlocked = targets.filter((t) => alreadySent.has(t.phone));
    targets = targets.filter((t) => !alreadySent.has(t.phone));
    const skippedAlreadySent = dupBlocked.length;
    if (skippedAlreadySent > 0) {
      // A janela vai no log: "por que 200 alvos viraram 3" é a pergunta que o
      // operador faz, e sem a regra explícita ele culpa o disparo.
      this.logger.log(
        `Campanha "${dto.name}": ${skippedAlreadySent} lead(s) já receberam campanha anterior — ` +
        `pulados (ja_enviado, janela: ${dedupWindowLabel()})`,
      );
    }

    // ── Filtro TMS: consulta o lote no banco do HiperTMS (read-only) ──────────
    // Clientes já cadastrados no TMS não recebem campanha de prospecção.
    //
    // A consulta é VERIFICADA porque um Map vazio tem dois significados opostos: "ninguém
    // do lote é cliente" e "o banco do TMS não respondeu". Enquanto os dois se pareciam,
    // uma oscilação de rede fazia a peneira sumir em silêncio e a campanha ia inteira
    // para a base — inclusive para quem já paga pelo produto.
    //
    // Recusar a criação é a escolha certa aqui: campanha não é urgente, e "não disparou,
    // tente de novo" custa minutos. O outro lado é oferta fria na caixa do cliente
    // pagante, que não tem desfazer. TMS não configurado não entra neste caminho — ali
    // não há filtro a aplicar, e barrar travaria ambiente que roda sem conector.
    const tms = await this.tmsLookup.batchLookupVerificado(targets.map((t) => t.phone));
    if (tms.falhou) {
      this.logger.error(
        `Campanha "${dto.name}" recusada: filtro de cliente TMS indisponível (${tms.motivo})`,
      );
      throw new BadRequestException(
        'Não foi possível consultar a base do HiperTMS para excluir quem já é cliente. ' +
        'A campanha não foi criada — sem essa checagem, clientes pagantes receberiam ' +
        'prospecção fria. Tente novamente em alguns minutos.',
      );
    }
    const tmsMap = tms.clientes;
    const tmsBlocked = targets.filter((t) => tmsMap.has(TmsLookupService.normalize(t.phone)));
    const tmsAllowed = targets.filter((t) => !tmsMap.has(TmsLookupService.normalize(t.phone)));
    const skippedTms = tmsBlocked.length;

    // Marca os clientes TMS com a tag 'tms_cliente' no Nexa (só leitura do TMS — escrita só no Nexa)
    for (const t of tmsBlocked) {
      const info = tmsMap.get(TmsLookupService.normalize(t.phone));
      await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId, phone: t.phone } },
        update: { tags: { push: 'tms_cliente' } },
        create: {
          tenantId,
          phone: t.phone,
          name: t.name ?? info?.name ?? undefined,
          source: 'tms_import',
          tags: ['tms_cliente'],
        },
      }).catch(() => null); // não bloqueia se falhar
    }

    if (skippedTms > 0) {
      this.logger.log(`Campanha "${dto.name}": ${skippedTms} lead(s) já são clientes TMS — pulados e marcados`);
    }

    // DISP-016: campanha sem NENHUM destinatário não pode ser criada.
    // Antes ela nascia vazia, o worker marcava 'done' no primeiro tick e o
    // operador via só "Campanha criada! 0 contato(s)" — parecia que o disparo
    // tinha rodado e não enviado. Acontece ao escolher "todos os contatos" com a
    // base vazia, ou ao subir um CSV no campo de ANEXO achando que é a lista.
    // Só barra quando a entrada estava vazia: se há linhas 'skipped' (opt-out,
    // blocklist, cliente TMS, já enviado, telefone inválido) a campanha é criada
    // normalmente, porque o relatório com os motivos é justamente o que interessa.
    const totalRows =
      tmsAllowed.length + tmsBlocked.length + dupBlocked.length +
      blockedList.length + suspectList.length + invalidList.length;
    if (totalRows === 0) {
      throw new BadRequestException(
        'Nenhum destinatário para esta campanha. Selecione contatos, informe números avulsos, ' +
        'ou importe a lista em Contatos antes de criar. (O anexo de mídia não serve como lista de envio.)',
      );
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        type: campaignType,
        // F8: o lead herda este produto na conversa (ver tickLocked) e a Lia
        // busca só o conhecimento dele. Vazio = produto principal.
        productCode: dto.productCode || null,
        template: dto.template,
        link: dto.link || null,
        // 2026-07-29: mesma semântica do e-mail (email-campaign-sender:299-303).
        // false (default) = 1ª mensagem SEM link; a Lia entrega o signupUrl na
        // conversa quando o lead responde (sales-agent:107). Link em mensagem
        // fria de número não-oficial é o padrão clássico de ban do WhatsApp.
        sendLinkOnFirst: dto.sendLinkOnFirst ?? false,
        mediaUrl: dto.mediaUrl || null,
        mediaName: dto.mediaName || null,
        // Dono do disparo. A conversa que nascer daqui herda este vendedor quando o
        // CONTATO ainda não tem dono — a distribuição do lote vem primeiro (ver
        // `dispatchOneTarget`).
        ownerSellerId,
        // De qual lista esta campanha saiu. É o que liga o passo 4 ao 5 e permite
        // depois perguntar quanto uma lista comprada realmente rendeu.
        batchId: dto.fromBatchId || null,
        sendLimit: dto.sendLimit && dto.sendLimit > 0 ? dto.sendLimit : null,
        // agendada já entra como running; o worker só dispara a partir de scheduledAt
        scheduledAt,
        ...({ linha } as any),
        ...(scheduledAt ? { status: 'running', startedAt: new Date() } : {}),
        targets: {
          create: [
            // leads que podem receber a campanha
            ...tmsAllowed.map((t) => ({ tenantId, phone: t.phone, name: t.name })),
            // clientes TMS: criados como skipped para aparecer no relatório
            ...tmsBlocked.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: 'tms_cliente' })),
            // já receberam campanha anterior: skipped para aparecer no relatório
            ...dupBlocked.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: 'ja_enviado' })),
            // blocklist (concorrentes): skipped para aparecer no relatório
            ...blockedList.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: 'bloqueado' })),
            // nome bateu com concorrente conhecido: skipped para revisão
            ...suspectList.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: 'suspeito_concorrente' })),
            // telefone inelegível: motivo específico no relatório (estrangeiro, fixo, DDD…)
            ...invalidList.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: rejectionReason(t.phone) ?? 'telefone_invalido' })),
            // pediu para não receber mais (lista de bloqueio LGPD)
            ...optOutBloqueados.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: 'opted_out' })),
          ],
        },
      },
      include: { _count: { select: { targets: true } } },
    });
    // Variação de texto: `spin()` passa o template intacto quando não há
    // `{a|b}`, então uma campanha com texto plano sai byte a byte igual para
    // todo mundo — em silêncio. Avisa, mas não bloqueia: variação é heurística
    // de risco, não regra de negócio, e existe caso legítimo de texto fixo.
    const warnings: string[] = [];
    const avisoVariacao = lowVariationWarning(dto.template ?? '', tmsAllowed.length);
    if (avisoVariacao) {
      warnings.push(avisoVariacao);
      this.logger.warn(`Campanha "${dto.name}": ${avisoVariacao}`);
    }

    return { ...campaign, included: tmsAllowed.length, skippedOptOut, skippedTms, skippedAlreadySent, skippedBlocked, skippedSuspect, skippedInvalid, warnings };
  }

  /** `escopo` = vendedor logado; `undefined` (admin e demais) vê todas. */
  async listCampaigns(tenantId: string, archived = false, escopo?: string) {
    const camps = await this.prisma.campaign.findMany({
      where: comEscopo({ tenantId, archivedAt: archived ? { not: null } : null }, escopo),
      orderBy: { createdAt: 'desc' },
    });

    if (camps.length === 0) return [];

    // Uma única query agregada em vez de N queries (N+1 fix)
    const allCounts = await this.prisma.campaignTarget.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: camps.map((c: any) => c.id) } },
      _count: { _all: true },
    });

    const countMap = new Map<string, Record<string, number>>();
    for (const row of allCounts) {
      if (!countMap.has(row.campaignId)) countMap.set(row.campaignId, {});
      countMap.get(row.campaignId)![row.status] = row._count._all;
    }

    return camps.map((c: any) => ({ ...c, counts: countMap.get(c.id) ?? {} }));
  }

  /**
   * Detalhe de uma campanha: campanha + destinatários (status + engajamento) + contagens.
   *
   * DISP-003: `limit` liga a paginação da LISTA de destinatários (e `status`/`search`
   * filtram no banco, não no browser). Os agregados — `counts`, `engagement` e
   * `conversion` — são SEMPRE calculados sobre a campanha inteira, nunca sobre a
   * página: o funil não pode mudar conforme a página que o operador abriu.
   *
   * Sem `limit` o retorno continua idêntico ao anterior (a tela antiga que carrega
   * tudo de uma vez segue funcionando sem mudança).
   */
  async campaignDetail(
    tenantId: string,
    id: string,
    opts: { limit?: number; offset?: number; status?: string; search?: string; escopo?: string } = {},
  ) {
    // O escopo entra no WHERE, não numa checagem depois: assim a campanha de
    // outro vendedor responde "não encontrada" em vez de vazar pelo id na URL.
    const campaign = await this.prisma.campaign.findFirst({
      where: comEscopo({ id, tenantId }, opts.escopo),
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');

    // ── página de destinatários (filtro aplicado no banco) ────────────────────
    const where: any = { campaignId: id };
    if (opts.status) where.status = opts.status;
    const q = opts.search?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [targets, matching] = await Promise.all([
      this.prisma.campaignTarget.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        ...(opts.limit ? { take: opts.limit, skip: opts.offset ?? 0 } : {}),
      }),
      this.prisma.campaignTarget.count({ where }),
    ]);

    // ── contagens por status: campanha INTEIRA (ignora paginação e filtro) ────
    const countRows = await this.prisma.campaignTarget.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: { _all: true },
    });
    const counts: Record<string, number> = countRows.reduce(
      (a: Record<string, number>, r: any) => ({ ...a, [r.status]: r._count._all }),
      {} as Record<string, number>,
    );

    // ── engajamento DESTA campanha ───────────────────────────────────────────
    // Parte das mensagens carimbadas com `campaignId` (coluna indexada, C3) em vez
    // de partir dos alvos carregados — assim o agregado não depende da página.
    // Resposta só conta se veio DEPOIS do envio desta campanha (evita marcar
    // "respondeu" por conversa antiga do mesmo contato).
    const campMsgs = await this.prisma.aiMessage.findMany({
      where: { tenantId, campaignId: id, direction: 'outbound', intent: 'outbound_campaign' },
      select: { conversationId: true, ack: true, createdAt: true },
    });
    const convIds = [...new Set(campMsgs.map((m: any) => m.conversationId))];
    // uma query só traz phone (enriquecer as linhas) e outcome (conversão)
    const convs = convIds.length
      ? await this.prisma.aiConversation.findMany({
          where: { id: { in: convIds } },
          select: { id: true, phone: true, outcome: true },
        })
      : [];
    const phoneByConv = new Map<string, string>(convs.map((c: any) => [c.id, c.phone]));

    const engByPhone = new Map<string, { ack: number; replied: boolean }>();
    const sentAtByPhone = new Map<string, Date>();
    for (const m of campMsgs) {
      const phone = phoneByConv.get(m.conversationId);
      if (!phone) continue;
      const cur = engByPhone.get(phone) ?? { ack: 0, replied: false };
      cur.ack = Math.max(cur.ack, m.ack ?? 0);
      engByPhone.set(phone, cur);
      const prev = sentAtByPhone.get(phone);
      if (!prev || m.createdAt < prev) sentAtByPhone.set(phone, m.createdAt);
    }
    if (sentAtByPhone.size) {
      const inbound = await this.prisma.aiMessage.findMany({
        where: { conversationId: { in: convIds }, direction: 'inbound' },
        select: { conversationId: true, createdAt: true },
      });
      for (const m of inbound) {
        const phone = phoneByConv.get(m.conversationId);
        if (!phone) continue;
        const sentAt = sentAtByPhone.get(phone);
        if (sentAt && m.createdAt >= sentAt) {
          const cur = engByPhone.get(phone) ?? { ack: 0, replied: false };
          cur.replied = true;
          engByPhone.set(phone, cur);
        }
      }
    }

    // `repliedAt` no alvo é a segunda fonte de "respondeu", e cobre o caso que a
    // primeira não vê: resposta de e-mail vinda de OUTRO endereço. Aí a conversa é
    // nova, com outro `phone`, e o casamento por telefone acima não acha nada — o
    // alvo só sabe que foi respondido porque o Message-ID casou na volta
    // (ver CampaignReplyLinker).
    const enriched = targets.map((t: any) => {
      const e = engByPhone.get(t.phone);
      const respondeu = (e?.replied ?? false) || !!t.repliedAt;
      // DISP-009: `status` diz o que o WORKER fez; `ack` diz o que o WhatsApp
      // confirmou. Os dois podem divergir e nada avisava — um alvo com
      // `status:'sent'` e `ack:0` foi dado como enviado sem nenhum recibo de
      // volta. Acontece de verdade: com `error:'entrega_nao_confirmada'` o
      // DISP-021 marca 'sent' de propósito para não duplicar (ver
      // dispatchOneTarget), e o operador só sabia lendo o campo de erro.
      // `null` = não se aplica (alvo que nem chegou a ser enviado).
      const deliveryConfirmed = t.status === 'sent' ? (e?.ack ?? 0) >= 1 || respondeu : null;
      return { ...t, ack: e?.ack ?? 0, replied: respondeu, deliveryConfirmed };
    });

    // Quem RESPONDEU conta como entregue+lido (responder prova recebimento e
    // leitura) — evita o funil incoerente "3 responderam, 0 entregues" quando o
    // WAHA não manda os recibos de ack.
    //
    // O agregado parte de `engByPhone`, que é por conversa. Alvos com `repliedAt` e
    // sem conversa própria entram como linha extra — senão o painel diria
    // "0 responderam" com a linha do alvo marcada como respondida, incoerência que o
    // operador leria como bug do painel.
    //
    // Query própria, e não um loop sobre `targets`: `targets` é PAGINADO (DISP-003) e
    // o agregado não pode depender da página que está aberta.
    const alvosComResposta = await this.prisma.campaignTarget.findMany({
      where: { campaignId: id, tenantId, repliedAt: { not: null } },
      select: { phone: true },
    });
    for (const t of alvosComResposta as any[]) {
      const cur = engByPhone.get(t.phone);
      if (!cur?.replied) engByPhone.set(t.phone, { ack: cur?.ack ?? 0, replied: true });
    }

    const eng = [...engByPhone.values()];
    const engagement = {
      delivered: eng.filter((e) => e.ack >= 2 || e.replied).length,
      read: eng.filter((e) => e.ack >= 3 || e.replied).length,
      replied: eng.filter((e) => e.replied).length,
    };

    // CAMP-1: conversão — conversas originadas por ESTA campanha + outcome
    const byOutcome = convs.reduce(
      (a: Record<string, number>, c: any) => ({ ...a, [c.outcome ?? 'em_aberto']: (a[c.outcome ?? 'em_aberto'] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    const conversion = { conversations: convIds.length, byOutcome };

    // DISP-009: quantos alvos 'sent' da campanha INTEIRA nunca receberam recibo.
    // Agregado próprio (não derivado da página) pelo mesmo motivo do engajamento.
    // Número alto aqui costuma significar sessão do WAHA instável — o disparo
    // "funcionou" e a mensagem pode não ter chegado a ninguém.
    const confirmados = eng.filter((e) => e.ack >= 1 || e.replied).length;
    const deliveryUnconfirmed = Math.max(0, (counts.sent ?? 0) - confirmados);

    // `matching` = total que casa com o filtro atual (base da paginação na tela)
    return { campaign, targets: enriched, counts, engagement, conversion, matching, deliveryUnconfirmed };
  }

  // Edita uma campanha que ainda NÃO foi iniciada (status 'draft'). Só campos seguros.
  async updateCampaign(
    tenantId: string,
    id: string,
    dto: { name?: string; template?: string; subject?: string; link?: string; mediaUrl?: string; mediaName?: string; sendLimit?: number; scheduledAt?: string | null; linha?: string },
  ) {
    const c = await this.prisma.campaign.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, _count: { select: { targets: { where: { status: 'sent' } } } } },
    });
    if (!c) throw new NotFoundException('Campanha não encontrada');
    const sentCount = c._count?.targets ?? 0;
    // Allow full edit on draft; allow name-only on running/done; allow full edit on paused with 0 sent
    const isEditableInFull = c.status === 'draft' || (c.status === 'paused' && sentCount === 0);
    // DISP-019: reagendar segue uma regra própria e mais simples — se NADA saiu
    // ainda, mudar a hora é sempre seguro. Sem isto, uma campanha agendada que
    // já rodou o tick (status 'running'/'done' com 0 enviados, ex.: todos os
    // alvos pulados) ficava presa no horário original, sem como corrigir.
    const canReschedule = sentCount === 0;
    if (!isEditableInFull && (dto.template !== undefined || dto.link !== undefined || dto.mediaUrl !== undefined || dto.sendLimit !== undefined)) {
      throw new BadRequestException('Campanha já em andamento — só é possível renomear.');
    }
    if (dto.scheduledAt !== undefined && !canReschedule) {
      throw new BadRequestException('Campanha já tem envios — não é possível reagendar.');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(isEditableInFull && dto.template !== undefined ? { template: dto.template } : {}),
        ...(isEditableInFull && dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(isEditableInFull && dto.link !== undefined ? { link: dto.link || null } : {}),
        ...(isEditableInFull && dto.mediaUrl !== undefined ? { mediaUrl: dto.mediaUrl || null } : {}),
        ...(isEditableInFull && dto.mediaName !== undefined ? { mediaName: dto.mediaName || null } : {}),
        ...(isEditableInFull && dto.sendLimit !== undefined ? { sendLimit: dto.sendLimit && dto.sendLimit > 0 ? dto.sendLimit : null } : {}),
        ...(isEditableInFull && dto.linha !== undefined ? ({ linha: dto.linha || 'vendas' } as any) : {}),
        // DISP-019: reagendamento. Campanha agendada entra como 'running' e o
        // worker segura até a hora; ao tirar o agendamento (null) ela passa a
        // poder disparar assim que o operador iniciar.
        ...(canReschedule && dto.scheduledAt !== undefined
          ? { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null }
          : {}),
      },
    });
  }

  async setStatus(tenantId: string, id: string, status: 'running' | 'paused') {
    // A trava de mercado vale também aqui: campanha criada com o mercado ativo e
    // iniciada/retomada DEPOIS de ele ser suspenso dispararia mesmo assim — o
    // start é o momento do disparo, não a criação. Cobre WhatsApp e e-mail, que
    // compartilham esta rota. Pausar é sempre permitido.
    if (status === 'running') {
      const c = await this.prisma.campaign.findFirst({
        where: { id, tenantId },
        select: { productCode: true },
      });
      if (!c) throw new NotFoundException('Campanha não encontrada');
      await this.assertMercadoLiberado(c.productCode);
    }
    return this.prisma.campaign.updateMany({
      where: { id, tenantId },
      data: { status, ...(status === 'running' ? { startedAt: new Date() } : {}) },
    });
  }

  /** Busca o mercado e recusa o disparo quando a trava aponta bloqueio (ADR 037). */
  private async assertMercadoLiberado(productCode: string | null | undefined) {
    const market = productCode
      ? await this.prisma.product.findUnique({
          where: { code: productCode },
          select: { name: true, status: true },
        })
      : null;
    const bloqueio = motivoDeBloqueioDoDisparo(productCode, market);
    if (bloqueio) throw new BadRequestException(bloqueio);
  }

  /**
   * DISP-004 — cancela a campanha de verdade: zera a fila e a encerra.
   *
   * `pause` só impede o worker de PEGAR mais alvos; os `queued` continuam lá
   * para sempre, e qualquer `start` acidental meses depois dispara a lista
   * inteira. Não havia ação que zerasse a fila de propósito.
   *
   * Os alvos viram `skipped` com motivo `cancelado` em vez de serem apagados —
   * o relatório precisa mostrar quem NÃO recebeu e por quê, que é justamente a
   * pergunta que se faz depois de cancelar.
   *
   * `sending` entra junto: é um alvo já reivindicado pelo tick. Deixá-lo de
   * fora faria a recuperação de travados devolvê-lo para `queued` 5-10 min
   * depois, e a campanha "cancelada" mandaria mais uma mensagem.
   *
   * Já enviados não são tocados — não dá para cancelar o que já chegou.
   */
  async cancelCampaign(tenantId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    if (campaign.status === 'done') return { cancelled: 0, status: 'done' };

    const [zerados] = await this.prisma.$transaction([
      this.prisma.campaignTarget.updateMany({
        where: { campaignId: id, tenantId, status: { in: ['queued', 'sending'] } },
        data: { status: 'skipped', error: 'cancelado' },
      }),
      this.prisma.campaign.update({ where: { id }, data: { status: 'done' } }),
    ]);

    this.logger.log(
      `Campanha "${campaign.name}" cancelada: ${zerados.count} alvo(s) retirados da fila (status anterior: ${campaign.status})`,
    );
    return { cancelled: zerados.count, status: 'done' };
  }

  /**
   * Carimba na conversa o mercado da campanha que acabou de sair (ADR 037).
   *
   * Compartilhado com o disparo de e-mail via `MERCADO_DA_CONVERSA`, para os dois
   * canais decidirem igual — divergir aqui seria a Lia responder de um jeito no
   * WhatsApp e de outro no e-mail para o mesmo lead.
   *
   * Nunca lança: o e-mail/mensagem já saiu quando chegamos aqui, e falhar em
   * atualizar um campo de contexto não pode desfazer um envio.
   */
  private async marcarMercadoDaConversa(
    conversationId: string,
    atual: string | null | undefined,
    daCampanha: string | null | undefined,
  ): Promise<void> {
    if (!precisaTrocarMercado(atual, daCampanha)) return;
    await this.prisma.aiConversation
      .update({ where: { id: conversationId }, data: { productCode: daCampanha } })
      .catch((e: any) =>
        this.logger.warn(`Falha ao marcar mercado da conversa ${conversationId}: ${e?.message}`),
      );
  }

  /**
   * DISP-002: recoloca na fila os alvos que FALHARAM (erro de entrega).
   * Serve aos dois canais — cada worker pega de volta o que é seu (o de e-mail
   * filtra `channel:'email'`; o de WhatsApp, `channel:'whatsapp'` desde DISP-014).
   *
   * Só mexe em `failed`. `skipped` fica de fora de propósito: é exclusão
   * deliberada (opt-out, blocklist, cliente TMS, já enviado, telefone inválido) —
   * recolocar na fila reenviaria justamente para quem não pode receber.
   *
   * Campanha `done` volta a `running` para o worker consumir a fila de novo.
   * `paused` é decisão explícita do operador e é preservada — os alvos ficam
   * prontos e saem quando ele clicar em Iniciar.
   */
  async retryFailed(tenantId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, status: true, productCode: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');

    // Campanha `done` volta a `running` aqui embaixo — e isso é um START, então a
    // trava de mercado vale igual: sem ela, o retry ressuscitava disparo de mercado
    // suspenso por uma porta que o setStatus não vigia.
    if (campaign.status === 'done') {
      await this.assertMercadoLiberado((campaign as any).productCode);
    }

    const r = await this.prisma.campaignTarget.updateMany({
      where: { campaignId: id, tenantId, status: 'failed' },
      data: { status: 'queued', error: null, sentAt: null },
    });
    if (r.count === 0) return { requeued: 0, status: campaign.status };

    const resumed = campaign.status === 'done';
    if (resumed) {
      await this.prisma.campaign.update({ where: { id }, data: { status: 'running', startedAt: new Date() } });
    }
    this.logger.log(`Retry: ${r.count} alvo(s) de volta à fila (campanha "${campaign.name}")`);
    return { requeued: r.count, status: resumed ? 'running' : campaign.status };
  }

  /**
   * Recoloca na fila os alvos da campanha, INCLUSIVE os já enviados.
   *
   * Existe para TESTE, e por isso vive atrás de `CAMPAIGN_RESEND_ALL_ENABLED`,
   * desligado por padrão. Não é o "desativamos depois" ficando pendente numa lista:
   * o padrão já é desligado, então produção nasce protegida e ligar é uma escolha
   * consciente por ambiente.
   *
   * O motivo do interruptor: reenviar a MESMA mensagem para quem já recebeu é um dos
   * sinais mais fortes de spam que existe. Um clique aqui duplica a base inteira e
   * queima a reputação do domínio — que é o ativo mais caro de reconstruir. Para
   * falar de novo com a mesma base, o caminho é Clonar a campanha e mudar o texto:
   * segundo toque com mensagem diferente é cadência, com a mesma é spam.
   */
  async resendAll(tenantId: string, id: string) {
    if ((process.env.CAMPAIGN_RESEND_ALL_ENABLED ?? 'false').toLowerCase() !== 'true') {
      throw new ForbiddenException(
        'Reenvio total está desligado neste ambiente (CAMPAIGN_RESEND_ALL_ENABLED).',
      );
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, status: true, productCode: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');

    // Mesma regra do retryFailed: `done` volta a rodar aqui, e voltar a rodar é
    // start — a trava de mercado precisa valer.
    if (campaign.status === 'done') {
      await this.assertMercadoLiberado((campaign as any).productCode);
    }

    // "Todos" NÃO inclui as exclusões deliberadas. Voltam para a fila os enviados,
    // os que falharam e os pulados por `ja_enviado` (o dedup entre campanhas, que é
    // justamente o que atrapalha o teste). Ficam de fora opt-out, blocklist,
    // concorrente e cliente TMS.
    //
    // Isto não é excesso de zelo: o worker reavalia opt-out no disparo, mas NÃO
    // reavalia blocklist nem concorrente. Requeue cego mandaria e-mail comercial
    // para @bsoft.com.br — o único destinatário que nunca pode receber.
    const EXCLUSAO_DELIBERADA = ['bloqueado', 'suspeito_concorrente', 'opted_out', 'tms_cliente'];
    const r = await this.prisma.campaignTarget.updateMany({
      where: {
        campaignId: id,
        tenantId,
        // 'sending' fica de fora: é alvo EM VOO. O worker marca 'sending' e só depois
        // fala com o SMTP; devolver para 'queued' no meio disso desfaz a reserva
        // atômica e o próximo tick manda o mesmo e-mail de novo — dois envios, um
        // alvo. Foi o que aconteceu em 08/08/2026 (duas mensagens com 5s de
        // diferença para o mesmo destinatário). Quem está em voo vira 'sent' sozinho
        // em segundos; basta clicar de novo depois.
        status: { not: 'sending' },
        NOT: { status: 'skipped', error: { in: EXCLUSAO_DELIBERADA } },
      },
      data: { status: 'queued', error: null, sentAt: null },
    });

    // Só `done` volta a rodar. `paused` é decisão explícita do operador e é
    // preservada (mesma regra do retryFailed) — a tela avisa para clicar em Iniciar.
    const resumed = campaign.status === 'done';
    if (resumed) {
      await this.prisma.campaign.update({
        where: { id },
        data: { status: 'running', startedAt: new Date() },
      });
    }

    this.logger.warn(
      `REENVIO TOTAL: ${r.count} alvo(s) de volta à fila na campanha "${campaign.name}" — ` +
      'inclui quem já havia recebido. Ver CAMPAIGN_RESEND_ALL_ENABLED.',
    );
    return { requeued: r.count, status: resumed ? 'running' : campaign.status };
  }

  async removeTarget(tenantId: string, campaignId: string, targetId: string) {
    // Only allow removal from draft campaigns to avoid inconsistencies mid-send.
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, tenantId }, select: { status: true } });
    if (!campaign) throw new Error('Campanha não encontrada');
    if (campaign.status !== 'draft') throw new Error('Só é possível remover destinatários de campanhas em rascunho');
    const r = await this.prisma.campaignTarget.deleteMany({ where: { id: targetId, campaignId } });
    return { ok: r.count > 0 };
  }

  async removeCampaign(tenantId: string, id: string) {
    // alvos têm cascade; apaga a campanha (e o histórico de envios dela)
    const r = await this.prisma.campaign.deleteMany({ where: { id, tenantId } });
    return { ok: r.count > 0 };
  }

  /** Exclui várias campanhas de uma vez (com cascade nos alvos). */
  async bulkRemoveCampaigns(tenantId: string, ids: string[]) {
    if (!ids?.length) return { count: 0 };
    const r = await this.prisma.campaign.deleteMany({ where: { tenantId, id: { in: ids } } });
    return { count: r.count };
  }

  /** Arquiva (guarda) ou desarquiva campanhas — só esconde da lista padrão, não apaga. */
  async setArchived(tenantId: string, ids: string[], archived: boolean) {
    if (!ids?.length) return { count: 0 };
    const r = await this.prisma.campaign.updateMany({
      where: { tenantId, id: { in: ids } },
      data: { archivedAt: archived ? new Date() : null },
    });
    return { count: r.count };
  }

  // ---------- configurações de janela de envio (por tenant) ----------
  // Lê a janela do tenant; cai nos defaults (env) se não houver linha salva.
  async getSettings(tenantId: string) {
    const s = await this.prisma.senderSettings.findUnique({ where: { tenantId } });
    return {
      tenantId,
      waStartHour: s?.waStartHour ?? BUSINESS_START,
      waEndHour: s?.waEndHour ?? BUSINESS_END,
      emailStartHour: s?.emailStartHour ?? Number(process.env.SENDER_EMAIL_BUSINESS_START ?? 8),
      emailEndHour: s?.emailEndHour ?? Number(process.env.SENDER_EMAIL_BUSINESS_END ?? 18),
      // Somente LEITURA, e não é configuração de tenant: diz se o ambiente permite
      // reenvio total (ver resendAll). Vai junto daqui porque é o objeto que a tela
      // de Disparo já busca — evita uma rota nova só para um booleano, e a tela pode
      // esconder um botão que o servidor recusaria de qualquer forma.
      resendAllEnabled: (process.env.CAMPAIGN_RESEND_ALL_ENABLED ?? 'false').toLowerCase() === 'true',
    };
  }

  async updateSettings(
    tenantId: string,
    dto: { waStartHour: number; waEndHour: number; emailStartHour: number; emailEndHour: number },
  ) {
    const clamp = (n: number) => Math.max(0, Math.min(23, Math.round(Number(n) || 0)));
    const data = {
      waStartHour: clamp(dto.waStartHour),
      waEndHour: clamp(dto.waEndHour),
      emailStartHour: clamp(dto.emailStartHour),
      emailEndHour: clamp(dto.emailEndHour),
    };

    // A janela é lida como `hora >= início && hora < fim` (withinWaWindow, e o
    // mesmo no worker de e-mail). Com início >= fim isso é FALSO nas 24 horas do
    // dia: a campanha nunca sai, fica em 'queued' para sempre e ninguém recebe
    // aviso nenhum — nem erro, nem log, nem badge na tela. Medido em 13/08/2026:
    // `22 → 8` e `10 → 10` eram gravados com 200 OK.
    //
    // Salvar 22→8 achando que é "das 22h às 8h da manhã" é o erro natural de
    // quem quer disparo noturno. Essa janela virando a meia-noite não existe
    // neste modelo; recusar e dizer isso é o mínimo. Não tira capacidade
    // nenhuma — só nomeia uma que nunca funcionou.
    const janelas: [string, number, number][] = [
      ['WhatsApp', data.waStartHour, data.waEndHour],
      ['e-mail', data.emailStartHour, data.emailEndHour],
    ];
    for (const [canal, inicio, fim] of janelas) {
      if (inicio >= fim) {
        throw new BadRequestException(
          `Janela de ${canal} inválida: ${inicio}h → ${fim}h. ` +
          'O início precisa ser menor que o fim — nesta janela nenhuma campanha sairia. ' +
          'Janela que vira a meia-noite não é suportada.',
        );
      }
    }

    return this.prisma.senderSettings.upsert({ where: { tenantId }, update: data, create: { tenantId, ...data } });
  }

  // ---------- worker de disparo ----------
  // BUG-06 fix: getHours() retorna UTC em containers Linux → usar UTC-3 explicitamente
  private currentHourBR(): number {
    return (new Date().getUTCHours() - 3 + 24) % 24;
  }
  // janela do WhatsApp do tenant (este worker é o de WhatsApp)
  private async withinWaWindow(tenantId: string): Promise<boolean> {
    const s = await this.getSettings(tenantId);
    const h = this.currentHourBR();
    return h >= s.waStartHour && h < s.waEndHour;
  }

  @Interval(15000) // tenta a cada 15s; o delay real entre envios é controlado abaixo
  async tick(): Promise<void> {
    // Multi-instance guard: only one replica sends per tick. This complements the
    // existing Redis anti-ban state (BUG-001) by ensuring a single sender runs,
    // so the 30-90s delay is never violated by two replicas ticking together.
    const release = await this.lock.acquire('lock:sender:tick', 60);
    if (!release) return;
    try {
      await this.tickLocked();
    } finally {
      await release();
    }
  }

  private async tickLocked() {
    try {
      // Recuperação de travamento: alvos presos em 'sending' por mais de 5 min
      // indicam crash do worker no meio do envio — volta para 'queued' para reprocessar.
      // sentAt é null quando ainda não foi enviado (ficou preso em 'sending' sem enviar)
      // ou sentAt muito antigo (>5min) — ambos indicam travamento.
      await this.prisma.campaignTarget.updateMany({
        where: {
          status: 'sending',
          campaign: { channel: 'whatsapp' }, // DISP-014: não mexer em alvo de e-mail
          OR: [
            { sentAt: null },
            { sentAt: { lt: new Date(Date.now() - 5 * 60_000) } },
          ],
        },
        data: { status: 'queued' },
      });

      // fecha campanhas 'message' running que já não têm alvo na fila (terminaram)
      // (type:'status' não tem targets — não deve ser fechado aqui; o tick do status cuida disso)
      await this.prisma.campaign.updateMany({
        where: { channel: 'whatsapp', status: 'running', type: 'message', targets: { none: { status: 'queued' } } },
        data: { status: 'done' },
      });

      // ── Canal Status WhatsApp (ADR-026) ─────────────────────────────────────
      // Campanhas type:'status' não têm targets — um único broadcast p/ todos os
      // contatos salvos no WhatsApp. Executa uma por tick e retorna em seguida.
      const statusCampaign = await this.prisma.campaign.findFirst({
        where: {
          status: 'running',
          type: 'status',
          statusPostedAt: null,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (statusCampaign) {
        const inWindow = await this.withinWaWindow(statusCampaign.tenantId);
        this.logger.debug(`[status-tick] campanha="${statusCampaign.name}" hora_br=${this.currentHourBR()} inWindow=${inWindow}`);
        if (!inWindow) return;
        try {
          // Resolve relative mediaUrl (/uploads/...) to absolute URL for WAHA download.
          const mediaBase = (process.env.MEDIA_PUBLIC_BASE || process.env.NEXA_PUBLIC_URL || '').replace(/\/$/, '');
          const resolvedMediaUrl = statusCampaign.mediaUrl
            ? (statusCampaign.mediaUrl.startsWith('http')
                ? statusCampaign.mediaUrl
                : mediaBase + (statusCampaign.mediaUrl.startsWith('/') ? '' : '/') + statusCampaign.mediaUrl)
            : null;
          // Status é UM post só — o spin aqui não é anti-ban, é para as chaves não
          // vazarem literalmente caso o usuário reaproveite um template com variação.
          const statusText = spin(statusCampaign.template ?? '');
          const statusLinha = (statusCampaign as any).linha ?? undefined;
          const result = resolvedMediaUrl
            ? await this.waha.sendStatusImage(resolvedMediaUrl, statusText || undefined, statusLinha)
            : await this.waha.sendStatusText(statusText, undefined, undefined, statusLinha);
          if (result.sent) {
            await this.prisma.campaign.update({
              where: { id: statusCampaign.id },
              data: { statusPostId: result.postId ?? null, statusPostedAt: new Date(), status: 'done' },
            });
            this.logger.log(`Status WhatsApp publicado (campanha "${statusCampaign.name}", postId=${result.postId})`);
          } else {
            // WAHA recusou: pausa para não ficar em loop de erro
            await this.prisma.campaign.update({ where: { id: statusCampaign.id }, data: { status: 'paused' } });
            this.logger.error(`Falha ao publicar status (campanha "${statusCampaign.name}"): ${result.reason}`);
          }
        } catch (e: any) {
          this.logger.error(`tick status falhou: ${e?.message}`);
        }
        return; // não processa targets neste tick
      }

      // pega uma campanha rodando com alvo na fila — respeitando agendamento (scheduledAt no futuro = espera)
      // DISP-014: `channel: 'whatsapp'` é OBRIGATÓRIO. Sem ele este worker pegava
      // campanhas de e-mail (o worker de e-mail filtra por canal, este não filtrava)
      // e tentava mandar WhatsApp para o telefone sintético `email:<addr>` — o alvo
      // era consumido aqui e o e-mail real nunca saía.
      const campaign = await this.prisma.campaign.findFirst({
        where: {
          channel: 'whatsapp',
          status: 'running',
          targets: { some: { status: 'queued' } },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!campaign) return;

      // janela de envio do tenant (por canal WhatsApp) — fora do horário, espera
      if (!(await this.withinWaWindow(campaign.tenantId))) return;

      // respeita o limite de quantidade da campanha (sendLimit) — checado ANTES do delay
      if (campaign.sendLimit) {
        const enviados = await this.prisma.campaignTarget.count({ where: { campaignId: campaign.id, status: 'sent' } });
        if (enviados >= campaign.sendLimit) {
          await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'done' } });
          this.logger.log(`Campanha ${campaign.name}: limite de ${campaign.sendLimit} envios atingido`);
          return;
        }
      }

      // Lê estado anti-ban do Redis (compartilhado entre réplicas) com fallback local (BUG-001 fix)
      const antibanState = await this.readAntibanState();
      if (Date.now() - antibanState.lastSentAt < antibanState.nextDelayMs) return;

      const number = await this.ensureNumber(campaign.tenantId, (campaign as any).linha ?? 'principal');
      const dailyCap = this.effectiveDailyLimit(number);
      if (number.sentToday >= dailyCap) {
        this.logger.warn(`Limite diário atingido (${dailyCap}, warmup stage ${number.warmupStage}) — pausa hoje`);
        return;
      }
      if (number.sentThisHour >= number.hourlyLimit) {
        this.logger.warn(`Limite por hora atingido (${number.hourlyLimit}) — aguardando próxima hora`);
        return;
      }

      // Teto GLOBAL do número (NumberBudgetService): os dois limites acima contam
      // só o que este worker mandou. O mesmo chip também responde lead, manda
      // digest do Monitor, avisa vendedor e fecha conversa — nada disso passava
      // por contador nenhum, então "10/10 hoje" podia significar 60 envios reais.
      //
      // Quem cede é a campanha, sempre: prospecção fria é o tráfego descartável.
      // Alerta de cliente e resposta em conversa aberta nunca são bloqueados.
      // Teto da LINHA da campanha, não mais fixo em 'principal' — cada chip tem
      // o próprio orçamento (mesmo motivo do ensureNumber acima).
      const ceiling = await this.budget?.overCeiling((campaign as any).linha ?? 'principal');
      if (ceiling?.over) {
        this.logger.warn(`Campanha pausada — ${ceiling.reason}`);
        return;
      }

      // Freio por ENGAJAMENTO (ver sender-health.ts): os limites acima medem só o que
      // SAI. Este mede o que VOLTA — lista ruim queima o chip mesmo respeitando todos
      // os tetos, porque quem decide banir é o WhatsApp e o sinal dele é o silêncio
      // de quem recebe.
      if (await this.pauseIfUnhealthy(campaign.tenantId, number.id)) return;

      await this.dispatchOneTarget(campaign, number);
    } catch (e: any) {
      this.logger.error(`tick falhou: ${e?.message}`);
    }
  }

  /**
   * Processa UM alvo `queued` da campanha (achar → travar → mandar). Extraído
   * de `tickLocked()` (2026-08-05, prep pro Item 4 — fila BullMQ, ver
   * docs/infra/item4-fila-disparo-campanha-bullmq-2026-08.md): mesma lógica,
   * só isolada — `tick()` já checou janela/limite/antiban/saúde ANTES de
   * chamar isto, então aqui assume que "pode mandar agora" já foi decidido.
   * Sem mudança de comportamento — é o mesmo código de antes, só em outro lugar.
   */
  private async dispatchOneTarget(campaign: any, number: any): Promise<void> {
      // Linha por onde ESTA campanha fala. Resolvida uma vez: a busca da conversa, a
      // criação dela e o anexo precisam concordar — se divergirem, a thread nasce numa
      // linha e a mensagem sai por outra.
      const linhaDaCampanha: string = (campaign as any).linha ?? LINHA_PRINCIPAL;
      const target = await this.prisma.campaignTarget.findFirst({
        where: { campaignId: campaign.id, status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (!target) {
        await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'done' } });
        return;
      }

      // CLAIM ATÔMICO (idempotência): só prossegue quem conseguir marcar queued→sending.
      // Evita "mesma campanha enviada 2x" se dois ciclos do worker se sobrepuserem.
      const claim = await this.prisma.campaignTarget.updateMany({
        where: { id: target.id, status: 'queued' },
        data: { status: 'sending' },
      });
      if (claim.count === 0) return; // outro tick já pegou este alvo

      // pula opt-outs (LGPD) e blocklist (concorrentes) — defesa em profundidade:
      // quem for bloqueado DEPOIS da campanha criada ainda é barrado aqui.
      // Lista de bloqueio ANTES de tocar no contato: se a pessoa pediu para sair,
      // nem recriamos o cadastro dela a partir da campanha.
      if (await this.optOutRegistry.isBlocked(campaign.tenantId, { phone: target.phone })) {
        this.logger.log(`Alvo ${target.phone} está na lista de bloqueio (opt-out) — pulado`);
        await this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'skipped', error: 'opted_out' } });
        return;
      }

      const contact = await this.contacts.create(campaign.tenantId, { phone: target.phone, name: target.name ?? undefined, source: 'outbound' });
      if (contact.status === 'opted_out' || contact.status === 'blocked') {
        const reason = contact.status === 'opted_out' ? 'opted_out' : 'bloqueado';
        await this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'skipped', error: reason } });
        return;
      }

      // A empresa vem do CONTATO, não do alvo: o CSV pode ter trazido a coluna numa
      // importação anterior mesmo quando esta campanha veio de números avulsos.
      let text = this.render(campaign.template, target.name, (contact as any).company);
      // Link na 1ª mensagem só com opt-in explícito (sendLinkOnFirst) — antes era
      // incondicional. Default: mensagem fria sem link (anti-ban); o lead que
      // responder recebe o link da Lia na conversa (sales-agent, signupUrl).
      // Link MARCADO com a origem (ver campaign-link.ts): sem isto o clique entra no
      // rastreio do site como visita direta, e a campanha não recebe o crédito.
      if (campaign.link && campaign.sendLinkOnFirst) {
        text += `\n\n${marcarLinkDaCampanha(campaign.link, {
          canal: 'whatsapp',
          campanhaId: campaign.id,
          campanhaNome: campaign.name,
          contatoId: contact.id, // QUEM recebeu — é o que permite dizer depois quem clicou
        })}`;
      }
      // Public attachment link. mediaUrl is stored as a relative path (/uploads/filename)
      // since the controller was updated (BUG-010). Legacy campaigns may still carry an
      // absolute URL — we extract the /uploads/ segment in both cases.
      //
      // DISP-017: o anexo agora obedece o MESMO `sendLinkOnFirst` do link. Antes ia
      // sempre, incondicional — a 1ª mensagem fria saía com uma URL colada mesmo com
      // "não enviar link no primeiro contato" marcado. É o mesmo risco de ban (link em
      // disparo frio de número não-oficial) e quebrava a regra do negócio: primeiro
      // contato é só texto; material e link vão depois que o lead responde.
      const mediaBase = process.env.MEDIA_PUBLIC_BASE || process.env.NEXA_PUBLIC_URL;
      if (campaign.mediaUrl && mediaBase && campaign.sendLinkOnFirst) {
        const idx = campaign.mediaUrl.indexOf('/uploads/');
        const relativePath = idx >= 0 ? campaign.mediaUrl.slice(idx) : campaign.mediaUrl;
        const publicUrl = mediaBase.replace(/\/$/, '') + relativePath;
        text += `\n\n📎 ${campaign.mediaName || 'Material'}: ${publicUrl}`;
      }
      // declarada FORA do try: o catch precisa dela para agendar o follow-up no
      // caso de entrega não confirmada (DISP-021).
      let conv: { id: string; status?: string } | null = null;
      try {
        // UMA thread por contato E POR LINHA: acha a conversa mais recente do telefone
        // naquele número e reaproveita; reabre se estava fechada; só cria se não houver.
        // Evita threads duplicadas no inbox sem misturar o que é de números diferentes.
        //
        // O escopo não é decoração — sem ele, dois defeitos:
        //
        //  • `sourceChannel`/ticket: a busca pegava conversa de `portal` e a campanha
        //    escrevia a copy fria DENTRO do chamado do cliente, sem enviar nada pelo
        //    WhatsApp (ver a guarda em ConversationsService.addMessage). Filtra-se por
        //    `ticketCategory` E `ticketNumber` porque o número só é atribuído depois da
        //    categoria — sozinho, deixaria passar o chamado recém-aberto.
        //
        //  • `wahaLine`: a conversa carrega a linha por onde a resposta sai, e a coluna
        //    nunca é atualizada depois do nascimento. Reaproveitar a thread da linha
        //    principal fazia a campanha de `vendas` sair pelo número principal —
        //    silenciosamente, com a campanha reportando que rodou em vendas.
        //    `null` conta como principal: é o estado de toda conversa anterior à divisão.
        conv = await this.prisma.aiConversation.findFirst({
          where: {
            tenantId: campaign.tenantId,
            phone: target.phone,
            sourceChannel: 'whatsapp',
            ticketCategory: null,
            ticketNumber: null,
            ...(linhaDaCampanha === LINHA_PRINCIPAL
              ? { OR: [{ wahaLine: LINHA_PRINCIPAL }, { wahaLine: null }] }
              : { wahaLine: linhaDaCampanha }),
          } as any,
          orderBy: { startedAt: 'desc' },
        });
        if (!conv) {
          // F8: o lead herda o PRODUTO da campanha que o trouxe. É o que faz a
          // Lia buscar conhecimento de pneus para quem veio da lista de pneus,
          // em vez de responder sobre CT-e (a base é uma só, separada por
          // product_code — ver knowledge.service.ts:retrieve).
          conv = await this.conversations.create(campaign.tenantId, {
            contactId: contact.id,
            phone: target.phone,
            sourceChannel: 'whatsapp',
            productCode: (campaign as any).productCode ?? undefined,
            // Quem disparou é quem atende a resposta (11/08/2026) — MAS o dono do
            // contato vem primeiro (19/08/2026).
            //
            // A importação do lote distribui os leads entre os vendedores por rodízio
            // e grava em `Contact.ownerSellerId`. Ler só o dono da CAMPANHA apagava
            // essa distribuição inteira no primeiro disparo: uma campanha criada pelo
            // admin (sem dono) fazia toda resposta nascer órfã, e uma criada por um
            // vendedor puxava para ele os leads que o rodízio tinha dado aos outros.
            // O trabalho do passo 4 durava até o passo 5 e morria ali.
            assignedSellerId:
              (contact as any).ownerSellerId ?? (campaign as any).ownerSellerId ?? undefined,
            // A conversa nasce na linha da campanha e a resposta (inclusive
            // follow-up) sai por ela pra sempre — ver o invariante em
            // ConversationsService.addMessage.
            wahaLine: linhaDaCampanha,
          });
        } else if ((conv.status as string) === 'closed' || (conv.status as string) === 'opt_out') {
          // reabre; se vinha de opt-out, limpa o outcome (voltou a ficar ativa).
          // won/lost são preservados (não mexe).
          const wasOptOut = (conv.status as string) === 'opt_out';
          await this.prisma.aiConversation.update({
            where: { id: conv.id },
            data: {
              status: 'open' as any,
              endedAt: null,
              lastActivityAt: new Date(),
              ...(wasOptOut ? { outcome: null, outcomeAt: null } : {}),
            },
          });
        }
        // ADR 037: a conversa passa a ser do mercado desta campanha.
        //
        // O produto era gravado só na CRIAÇÃO. Com um número de WhatsApp só, o mesmo
        // lead recebe de mais de um mercado na MESMA thread — e a conversa ficava
        // presa no mercado do primeiro disparo. O lead recebia pneu e perguntava
        // "quanto custa?"; a Lia respondia o preço do TMS, com a marca do TMS.
        //
        // Só sobrescreve quando a campanha declara mercado: campanha sem produto não
        // pode APAGAR o contexto que a conversa já tinha.
        await this.marcarMercadoDaConversa(conv.id, (conv as any).productCode, (campaign as any).productCode);

        // DISP-001: requireDelivery faz o addMessage LANÇAR quando o WAHA recusa
        // (sessão caída, 5xx, timeout, fora do allowlist). Sem isto o fluxo seguia
        // direto para o `sent` abaixo e a campanha aparecia 100% enviada mesmo com
        // o WhatsApp fora do ar.
        await this.conversations.addMessage(campaign.tenantId, conv.id, {
          direction: 'outbound',
          content: text,
          intent: 'outbound_campaign',
          metadata: { campaignId: campaign.id },
          requireDelivery: true,
          sendOrigin: 'campaign',
        });

        // anexo NATIVO (PDF/Word) — só quando a API oficial do WhatsApp estiver habilitada.
        // WAHA grátis não envia arquivo; até habilitar, o material vai como link no texto (acima).
        // Para ligar: defina WHATSAPP_MEDIA_ENABLED=true no .env.
        // DISP-006: a falha do anexo era DESCARTADA — o alvo virava 'sent' do
        // mesmo jeito e o relatório não indicava que o material nunca chegou.
        // O texto já saiu quando chegamos aqui, então falhar o alvo inteiro
        // seria pior (viraria reenvio e o lead receberia a mensagem duas
        // vezes). O certo é registrar: continua 'sent', com o motivo no campo
        // de erro para aparecer no relatório.
        let anexoFalhou: string | null = null;
        if (campaign.mediaUrl && process.env.WHATSAPP_MEDIA_ENABLED === 'true') {
          // Build absolute URL for WAHA (internal reachable base, e.g. host.docker.internal).
          const wahaBase = process.env.WAHA_REACHABLE_BASE ?? 'http://host.docker.internal:3001';
          const idx2 = campaign.mediaUrl.indexOf('/uploads/');
          const relativePath2 = idx2 >= 0 ? campaign.mediaUrl.slice(idx2) : campaign.mediaUrl;
          const wahaUrl = campaign.mediaUrl.startsWith('http') && idx2 < 0
            ? campaign.mediaUrl
            : wahaBase.replace(/\/$/, '') + relativePath2;
          const rAnexo = await this.waha.sendFile(target.phone, wahaUrl, campaign.mediaName ?? 'arquivo', '', 'campaign', linhaDaCampanha);
          if (!rAnexo.sent) {
            anexoFalhou = rAnexo.reason ?? 'motivo desconhecido';
            this.logger.warn(
              `Anexo NÃO enviado p/ ${target.phone} (campanha ${campaign.name}): ${anexoFalhou} — ` +
                `a mensagem de texto saiu, o alvo fica 'sent' com o motivo no relatório`,
            );
          }
        }

        await this.prisma.$transaction([
          this.prisma.campaignTarget.update({
            where: { id: target.id },
            data: { status: 'sent', sentAt: new Date(), ...(anexoFalhou ? { error: `anexo_nao_enviado: ${anexoFalhou}` } : {}) },
          }),
          this.prisma.senderNumber.update({
            where: { id: number.id },
            data: { sentToday: { increment: 1 }, sentThisHour: { increment: 1 } },
          }),
        ]);
        // agenda follow-up (24h/72h) caso o lead não responda
        await this.followup.schedule(campaign.tenantId, { conversationId: conv.id, phone: target.phone, name: target.name });
        const newDelay = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
        await this.writeAntibanState(Date.now(), newDelay); // persiste no Redis (BUG-001 fix)
        this.logger.log(`Disparo p/ ${target.phone} (campanha ${campaign.name}) [${number.sentToday + 1}/${number.dailyLimit} hoje; próx em ${Math.round(newDelay / 1000)}s]`);
      } catch (e: any) {
        // REGRA 3 (REGRAS-SQUAD): todo caminho de erro loga o motivo original.
        const reason = String(e?.message ?? e).slice(0, 200);

        // DISP-021: entrega NÃO CONFIRMADA ≠ falha.
        // Timeout/rede/5xx do WAHA podem ter entregue a mensagem — só a resposta
        // se perdeu. Marcar 'failed' aqui coloca o alvo na fila do botão
        // "Reenviar falhas" e o lead recebe DUAS vezes (aconteceu com o Mateus em
        // 2026-08-03: chegou 11:35, o reenvio mandou de novo 11:45).
        // Em prospecção fria duplicata é pior que envio não confirmado: é spam,
        // queima o lead e aumenta risco de ban. Então: grava 'sent' com o motivo
        // no campo `error`, o operador vê que não houve confirmação, e o alvo
        // FICA FORA do reenvio. O recibo do WhatsApp (ack) confirma depois.
        const naoConfirmado = e?.definitive === false;
        if (naoConfirmado) {
          this.logger.warn(`Disparo p/ ${target.phone} SEM CONFIRMAÇÃO (campanha ${campaign.name}): ${reason} — tratando como enviado para não duplicar`);
          await this.prisma.$transaction([
            this.prisma.campaignTarget.update({
              where: { id: target.id },
              data: { status: 'sent', sentAt: new Date(), error: 'entrega_nao_confirmada' },
            }),
            this.prisma.senderNumber.update({
              where: { id: number.id },
              data: { sentToday: { increment: 1 }, sentThisHour: { increment: 1 } },
            }),
          ]);
          if (conv) {
            await this.followup.schedule(campaign.tenantId, { conversationId: conv.id, phone: target.phone, name: target.name });
          }
        } else {
          this.logger.warn(`Disparo p/ ${target.phone} FALHOU (campanha ${campaign.name}): ${reason}`);
          await this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'failed', error: reason } });
        }

        // DISP-001: preserva o ritmo anti-ban também na falha. Sem isto, um WAHA
        // fora do ar faria o worker varrer a fila inteira a 1 alvo/15s marcando
        // tudo como 'failed' — em vez de espaçar as tentativas como no sucesso.
        const retryDelay = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
        await this.writeAntibanState(Date.now(), retryDelay);
      }
  }

  // saudação por horário (Brasília) — business-rules §10
  // BUG-06 fix: usar hora UTC-3 (Brasília) — getHours() retorna UTC em containers Linux.
  static greeting(): string {
    const h = (new Date().getUTCHours() - 3 + 24) % 24;
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  // Delegam para `name-render.ts`. A implementação saiu daqui porque o
  // follow-up também precisa dela e não pode importar este serviço (ciclo:
  // SenderService injeta FollowUpService). Os estáticos ficam como fachada — o
  // disparo de e-mail e as specs chamam por aqui.
  static firstName = firstName;
  static tidyMissingName = tidyMissingName;

  /**
   * Primeiro nome de quem assina, para o `{{remetente}}` do template.
   *
   * Sai da MESMA fonte da assinatura do e-mail (`resolveSignature`), que é o ponto
   * inteiro: o corpo e o rodapé param de poder discordar. Só o primeiro nome —
   * "Aqui é o Mateus Gomes, do HiperTMS" soa a crachá, não a pessoa.
   *
   * Sem assinatura configurada volta vazio, e a limpeza de placeholder ausente
   * (`tidyMissingName`) recompõe a frase em vez de deixar vírgula órfã.
   */
  static primeiroNomeDoRemetente(): string {
    return firstName(resolveSignature().name);
  }

  // opt-out footer (LGPD §4/§8). Disabled by setting LGPD_OPT_OUT_FOOTER=false in .env.
  // Warning: disabling removes the legally-recommended opt-out notice for Brazilian law.
  static OPT_OUT_FOOTER = '\n\n_Responda SAIR para não receber mais mensagens._';

  /**
   * Substituição de `{{nome}}`/`{{saudacao}}` + spintax, como estático.
   *
   * Vira fachada pelo mesmo motivo de `firstName`/`tidyMissingName` logo acima: a
   * pré-visualização de modelo (ADR 037) precisa renderizar EXATAMENTE como o disparo
   * renderiza, e reimplementar lá faria a prévia divergir do envio — o problema que a
   * própria prévia existe para evitar.
   *
   * `optOutFooter` desligado no e-mail: lá o descadastro é link no rodapé do HTML, e
   * "Responda SAIR" num e-mail manda o lead responder algo que ninguém lê.
   */
  /**
   * `{{empresa}}` → nome da empresa do contato; sem empresa vira "sua empresa".
   *
   * O fallback é frase, não remoção: "aí na {{empresa}}" precisa continuar de pé
   * quando o CSV veio sem a coluna — e "aí na sua empresa" lê natural em todas as
   * construções que os planos usam ("na", "a", "da"). Remover como o {{nome}} faz
   * (tidyMissingName) quebraria a preposição no meio ("aí na , quanto tempo…").
   */
  static renderEmpresa(txt: string, empresa?: string | null): string {
    return txt.replace(/\{\{\s*empresa\s*\}\}/gi, empresa?.trim() || 'sua empresa');
  }

  static renderTemplate(
    template: string,
    name?: string | null,
    opts: { optOutFooter?: boolean; empresa?: string | null } = {},
  ): string {
    const first = SenderService.firstName(name);
    // `{{remetente}}` = quem assina, da MESMA fonte da assinatura do e-mail.
    //
    // O nome do remetente aparecia em dois lugares independentes: o operador digitava
    // no corpo e a assinatura vinha da configuração. Em 10/08/2026 saiu um e-mail
    // dizendo "Aqui é a Lia" e assinado "Mateus Gomes" — duas pessoas na mesma
    // mensagem, do ponto de vista do lead. Com o placeholder, trocar de vendedor
    // passa a ser um lugar só.
    const remetente = SenderService.primeiroNomeDoRemetente();
    let txt = template
      .replace(/\{\{\s*nome\s*\}\}/gi, first)
      .replace(/\{\{\s*remetente\s*\}\}/gi, remetente)
      .replace(/\{\{\s*saudacao\s*\}\}/gi, SenderService.greeting());
    txt = SenderService.renderEmpresa(txt, opts.empresa);
    txt = spin(txt);
    if (!first) txt = SenderService.tidyMissingName(txt);

    const footerEnabled = (opts.optOutFooter ?? true) && process.env.LGPD_OPT_OUT_FOOTER !== 'false';
    if (footerEnabled && !txt.includes('Responda SAIR')) txt += SenderService.OPT_OUT_FOOTER;
    return txt;
  }

  private render(template: string, name?: string | null, empresa?: string | null): string {
    // 2026-08-01: sem nome, `{{nome}}` some e a frase se recompõe sozinha.
    // Antes o fallback era a string "tudo bem", o que produzia aberrações como
    // "Bom dia tudo bem, tudo bem?" em 1.666 dos 3.097 leads (mais da metade da
    // base entra sem nome). Frase limpa > frase com apelido genérico.
    const first = SenderService.firstName(name);
    let txt = template
      .replace(/\{\{\s*nome\s*\}\}/gi, first)
      .replace(/\{\{\s*saudacao\s*\}\}/gi, SenderService.greeting());
    txt = SenderService.renderEmpresa(txt, empresa);
    // Spintax DEPOIS do {{...}}: quando o lead não tem nome o placeholder já saiu,
    // então nenhuma chave remanescente pode ser confundida com grupo de variação.
    // Sem `|` no template o texto passa intacto — campanhas antigas não mudam.
    txt = spin(txt);
    if (!first) txt = SenderService.tidyMissingName(txt);
    const footerEnabled = process.env.LGPD_OPT_OUT_FOOTER !== 'false';
    if (footerEnabled && !txt.includes('Responda SAIR')) txt += SenderService.OPT_OUT_FOOTER;
    return txt;
  }
}
