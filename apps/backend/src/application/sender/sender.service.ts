import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';

// Config anti-ban (env com defaults)
const BUSINESS_START = Number(process.env.SENDER_BUSINESS_START ?? 7); // 7h
const BUSINESS_END = Number(process.env.SENDER_BUSINESS_END ?? 19); // 19h
// delay entre envios: aleatório 30-90s (anti-ban) — varia a cada envio
const DELAY_MIN_MS = Number(process.env.SENDER_DELAY_MIN_MS ?? 30000);
const DELAY_MAX_MS = Number(process.env.SENDER_DELAY_MAX_MS ?? 90000);
// limite diário efetivo por fase de aquecimento (G7) — número novo começa baixo e cresce
const WARMUP_DAILY = [10, 15, 20, 30];

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
  private redis: Redis | null = null;

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, { lazyConnect: true });
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
  ) {}

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

  async ensureNumber(tenantId: string) {
    let n = await this.prisma.senderNumber.findFirst({ where: { tenantId, active: true } });
    if (!n) {
      n = await this.prisma.senderNumber.create({
        data: { tenantId, phone: process.env.WAHA_SENDER_PHONE ?? '5512997880659', sessionName: process.env.WAHA_SESSION ?? 'default' },
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

  async listNumbers(tenantId: string) {
    const numbers = await this.prisma.senderNumber.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    // enriquece com o limite diário EFETIVO (já considerando a fase de aquecimento)
    return numbers.map((n: any) => ({
      ...n,
      effectiveDailyLimit: this.effectiveDailyLimit({ dailyLimit: n.dailyLimit, warmupStage: n.warmupStage }),
    }));
  }

  // ---------- campanhas ----------
  async createCampaign(
    tenantId: string,
    dto: {
      name: string; template: string; type?: string;
      phones?: { phone: string; name?: string }[]; fromContacts?: boolean;
      link?: string; mediaUrl?: string; mediaName?: string; sendLimit?: number; scheduledAt?: string;
    },
  ) {
    const campaignType = dto.type === 'status' ? 'status' : 'message';
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    // ── Campanha de Status WhatsApp: sem targets, cria direto e retorna ────────
    if (campaignType === 'status') {
      const camp = await this.prisma.campaign.create({
        data: {
          tenantId,
          name: dto.name,
          type: 'status',
          template: dto.template,
          mediaUrl: dto.mediaUrl || null,
          mediaName: dto.mediaName || null,
          scheduledAt,
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
    }
    // dedup por telefone
    const seen = new Set<string>();
    targets = targets.filter((t) => (seen.has(t.phone) ? false : seen.add(t.phone)));

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

    // ── Filtro TMS: consulta o lote no banco do HiperTMS (read-only) ──────────
    // Clientes já cadastrados no TMS não recebem campanha de prospecção.
    // Se TMS_DB_URL não estiver configurado, tmsMap fica vazio e nenhum lead é bloqueado.
    const tmsMap = await this.tmsLookup.batchLookup(targets.map((t) => t.phone));
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

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        type: campaignType,
        template: dto.template,
        link: dto.link || null,
        mediaUrl: dto.mediaUrl || null,
        mediaName: dto.mediaName || null,
        sendLimit: dto.sendLimit && dto.sendLimit > 0 ? dto.sendLimit : null,
        // agendada já entra como running; o worker só dispara a partir de scheduledAt
        scheduledAt,
        ...(scheduledAt ? { status: 'running', startedAt: new Date() } : {}),
        targets: {
          create: [
            // leads que podem receber a campanha
            ...tmsAllowed.map((t) => ({ tenantId, phone: t.phone, name: t.name })),
            // clientes TMS: criados como skipped para aparecer no relatório
            ...tmsBlocked.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: 'tms_cliente' })),
          ],
        },
      },
      include: { _count: { select: { targets: true } } },
    });
    return { ...campaign, included: tmsAllowed.length, skippedOptOut, skippedTms };
  }

  async listCampaigns(tenantId: string, archived = false) {
    const camps = await this.prisma.campaign.findMany({
      where: { tenantId, archivedAt: archived ? { not: null } : null },
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

  // Detalhe de uma campanha: campanha + destinatários (status de envio + engajamento) + contagens.
  async campaignDetail(tenantId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, tenantId } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    const targets = await this.prisma.campaignTarget.findMany({
      where: { campaignId: id },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });

    // Engajamento DESTA campanha: só conta quem foi REALMENTE enviado nesta campanha,
    // ack das mensagens carimbadas com este campaignId, e resposta só APÓS o envio dela.
    // (evita marcar "respondeu/lido" por conversas antigas — ex.: campanha agendada/não enviada)
    const sentPhones = [...new Set(targets.filter((t: any) => t.status === 'sent' && t.sentAt).map((t: any) => t.phone).filter(Boolean))];
    const engByPhone = new Map<string, { ack: number; replied: boolean }>();
    if (sentPhones.length) {
      const convs = await this.prisma.aiConversation.findMany({
        where: { tenantId, phone: { in: sentPhones } },
        select: { id: true, phone: true },
      });
      const convIds = convs.map((c: any) => c.id);
      const phoneByConv = new Map<string, string>(convs.map((c: any) => [c.id, c.phone]));
      if (convIds.length) {
        // mensagens DESTA campanha (carimbadas com campaignId): ack + horário de envio por telefone
        const outMsgs = await this.prisma.aiMessage.findMany({
          where: {
            conversationId: { in: convIds },
            direction: 'outbound',
            intent: 'outbound_campaign',
            metadata: { path: ['campaignId'], equals: id },
          },
          select: { conversationId: true, ack: true, createdAt: true },
        });
        const sentAtByPhone = new Map<string, Date>();
        for (const m of outMsgs) {
          const phone = phoneByConv.get(m.conversationId);
          if (!phone) continue;
          const cur = engByPhone.get(phone) ?? { ack: 0, replied: false };
          cur.ack = Math.max(cur.ack, m.ack ?? 0);
          engByPhone.set(phone, cur);
          const prev = sentAtByPhone.get(phone);
          if (!prev || m.createdAt < prev) sentAtByPhone.set(phone, m.createdAt);
        }
        // resposta: inbound só conta se veio DEPOIS do envio desta campanha
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
      }
    }

    const enriched = targets.map((t: any) => {
      const e = engByPhone.get(t.phone);
      return { ...t, ack: e?.ack ?? 0, replied: e?.replied ?? false };
    });

    const counts = enriched.reduce(
      (a: Record<string, number>, t: any) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    // resumo de engajamento. Quem RESPONDEU conta como entregue+lido (responder prova
    // recebimento e leitura) — evita o funil incoerente "3 responderam, 0 entregues"
    // quando o WAHA não manda os recibos de ack.
    const engagement = {
      delivered: enriched.filter((t: any) => t.ack >= 2 || t.replied).length,
      read: enriched.filter((t: any) => t.ack >= 3 || t.replied).length,
      replied: enriched.filter((t: any) => t.replied).length,
    };

    // CAMP-1: conversão — conversas originadas por ESTA campanha (msg carimbada com campaignId) + outcome
    const campMsgs = await this.prisma.aiMessage.findMany({
      where: { tenantId, intent: 'outbound_campaign', metadata: { path: ['campaignId'], equals: id } },
      select: { conversationId: true },
      distinct: ['conversationId'],
    });
    const convIds = campMsgs.map((m: any) => m.conversationId);
    const convs = convIds.length
      ? await this.prisma.aiConversation.findMany({ where: { id: { in: convIds } }, select: { outcome: true } })
      : [];
    const byOutcome = convs.reduce(
      (a: Record<string, number>, c: any) => ({ ...a, [c.outcome ?? 'em_aberto']: (a[c.outcome ?? 'em_aberto'] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    const conversion = { conversations: convIds.length, byOutcome };

    return { campaign, targets: enriched, counts, engagement, conversion };
  }

  // Edita uma campanha que ainda NÃO foi iniciada (status 'draft'). Só campos seguros.
  async updateCampaign(
    tenantId: string,
    id: string,
    dto: { name?: string; template?: string; subject?: string; link?: string; sendLimit?: number },
  ) {
    const c = await this.prisma.campaign.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!c) throw new NotFoundException('Campanha não encontrada');
    if (c.status !== 'draft') {
      throw new BadRequestException('Só dá pra editar uma campanha que ainda não foi iniciada.');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.template !== undefined ? { template: dto.template } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.link !== undefined ? { link: dto.link || null } : {}),
        ...(dto.sendLimit !== undefined ? { sendLimit: dto.sendLimit && dto.sendLimit > 0 ? dto.sendLimit : null } : {}),
      },
    });
  }

  async setStatus(tenantId: string, id: string, status: 'running' | 'paused') {
    return this.prisma.campaign.updateMany({
      where: { id, tenantId },
      data: { status, ...(status === 'running' ? { startedAt: new Date() } : {}) },
    });
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
  async tick() {
    try {
      // Recuperação de travamento: alvos presos em 'sending' por mais de 5 min
      // indicam crash do worker no meio do envio — volta para 'queued' para reprocessar.
      // sentAt é null quando ainda não foi enviado (ficou preso em 'sending' sem enviar)
      // ou sentAt muito antigo (>5min) — ambos indicam travamento.
      await this.prisma.campaignTarget.updateMany({
        where: {
          status: 'sending',
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
        where: { status: 'running', type: 'message', targets: { none: { status: 'queued' } } },
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
        if (!(await this.withinWaWindow(statusCampaign.tenantId))) return;
        try {
          const result = statusCampaign.mediaUrl
            ? await this.waha.sendStatusImage(statusCampaign.mediaUrl, statusCampaign.template || undefined)
            : await this.waha.sendStatusText(statusCampaign.template);
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
      const campaign = await this.prisma.campaign.findFirst({
        where: {
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

      const number = await this.ensureNumber(campaign.tenantId);
      const dailyCap = this.effectiveDailyLimit(number);
      if (number.sentToday >= dailyCap) {
        this.logger.warn(`Limite diário atingido (${dailyCap}, warmup stage ${number.warmupStage}) — pausa hoje`);
        return;
      }
      if (number.sentThisHour >= number.hourlyLimit) {
        this.logger.warn(`Limite por hora atingido (${number.hourlyLimit}) — aguardando próxima hora`);
        return;
      }

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

      // pula opt-outs (LGPD)
      const contact = await this.contacts.create(campaign.tenantId, { phone: target.phone, name: target.name ?? undefined, source: 'outbound' });
      if (contact.status === 'opted_out') {
        await this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'skipped', error: 'opted_out' } });
        return;
      }

      let text = this.render(campaign.template, target.name);
      if (campaign.link) text += `\n\n${campaign.link}`; // anexa o link no texto
      // anexo como LINK público (WAHA grátis não envia arquivo; link funciona).
      // Base pública: MEDIA_PUBLIC_BASE (domínio fixo) ou, na falta, NEXA_PUBLIC_URL
      // (o túnel atual — atualizado pelo .bat a cada subida, então o link fica válido).
      const mediaBase = process.env.MEDIA_PUBLIC_BASE || process.env.NEXA_PUBLIC_URL;
      if (campaign.mediaUrl && mediaBase) {
        const idx = campaign.mediaUrl.indexOf('/uploads/');
        if (idx >= 0) {
          const publicUrl = mediaBase.replace(/\/$/, '') + campaign.mediaUrl.slice(idx);
          text += `\n\n📎 ${campaign.mediaName || 'Material'}: ${publicUrl}`;
        }
      }
      try {
        // UMA thread por contato (igual ao recebimento): acha a conversa mais recente
        // do telefone (qualquer status) e reaproveita; reabre se estava fechada; só cria
        // se o contato nunca teve conversa. Evita threads duplicadas no inbox.
        let conv = await this.prisma.aiConversation.findFirst({
          where: { tenantId: campaign.tenantId, phone: target.phone },
          orderBy: { startedAt: 'desc' },
        });
        if (!conv) {
          conv = await this.conversations.create(campaign.tenantId, { contactId: contact.id, phone: target.phone, sourceChannel: 'whatsapp' });
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
        await this.conversations.addMessage(campaign.tenantId, conv.id, { direction: 'outbound', content: text, intent: 'outbound_campaign', metadata: { campaignId: campaign.id } });

        // anexo NATIVO (PDF/Word) — só quando a API oficial do WhatsApp estiver habilitada.
        // WAHA grátis não envia arquivo; até habilitar, o material vai como link no texto (acima).
        // Para ligar: defina WHATSAPP_MEDIA_ENABLED=true no .env.
        if (campaign.mediaUrl && process.env.WHATSAPP_MEDIA_ENABLED === 'true') {
          await this.waha.sendFile(target.phone, campaign.mediaUrl, campaign.mediaName ?? 'arquivo', '');
        }

        await this.prisma.$transaction([
          this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'sent', sentAt: new Date() } }),
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
        await this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'failed', error: String(e?.message).slice(0, 200) } });
      }
    } catch (e: any) {
      this.logger.error(`tick falhou: ${e?.message}`);
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

  // rodapé de opt-out (LGPD) — business-rules §4/§8
  static OPT_OUT_FOOTER = '\n\n_Responda SAIR para não receber mais mensagens._';

  private render(template: string, name?: string | null): string {
    const first = (name ?? '').split(' ')[0] || 'tudo bem';
    let txt = template
      .replace(/\{\{\s*nome\s*\}\}/gi, first)
      .replace(/\{\{\s*saudacao\s*\}\}/gi, SenderService.greeting());
    // BUG-09 fix: verificação anterior /sair/i causava falso positivo em frases como
    // "Saia na frente da concorrência" — o footer não era adicionado, violando LGPD.
    // Agora verifica o texto exato do rodapé.
    if (!txt.includes('Responda SAIR')) txt += SenderService.OPT_OUT_FOOTER;
    return txt;
  }
}
