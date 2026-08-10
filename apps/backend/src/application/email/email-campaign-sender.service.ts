/**
 * EmailCampaignSenderService — ADR 021
 *
 * Worker de disparo de campanhas por e-mail.
 * Análogo ao SenderService (WhatsApp), mas com regras anti-spam específicas para e-mail:
 *
 * REGRAS ANTI-SPAM (deliverability)
 * ─────────────────────────────────
 * 1. Delay entre envios: 90–180s aleatório (e-mail detecta bursts de envio sequencial)
 * 2. Limite diário: 50/dia por padrão (configurável); domínio novo começa em 20
 * 3. Horário comercial: 8h–18h (Brasília UTC-3), dias úteis — rejeição e marcação de
 *    spam são maiores à noite e no fim de semana
 * 4. Corpo enxuto, sem imagem e sem webfont — ver email-template.ts
 * 5. Link de descadastro obrigatório em todos os e-mails (LGPD + filtros anti-spam)
 * 6. Personalização {{nome}} reduz score de spam (menos genérico = menos spam)
 * 7. Assunto e corpo passam pela peneira de conteúdo (ver email-spam-check.ts):
 *    encurtador de link BLOQUEIA a criação, o resto vira aviso na resposta
 * 8. Reply-To configurado (filtros confiam mais em e-mail com reply-to válido)
 * 9. Nunca envia para opted_out (LGPD), bloqueado, ou endereço com hard bounce
 * 10. Preaquecimento do domínio: começa baixo e aumenta gradualmente (SENDER_EMAIL_WARMUP_STAGE)
 *
 * O limite diário e o intervalo entre envios são contados a partir do BANCO, não de
 * campos do processo: um restart do backend zerava o contador em memória e o
 * preaquecimento de 20/dia virava 40 ou 60, dependendo de quantos deploys tivessem
 * saído naquele dia — exatamente o oposto do que preaquecer significa.
 *
 * Variáveis de ambiente:
 *   SENDER_EMAIL_DELAY_MIN_MS   (padrão: 90000  — 90s)
 *   SENDER_EMAIL_DELAY_MAX_MS   (padrão: 180000 — 3min)
 *   SENDER_EMAIL_DAILY_LIMIT    (padrão: 50)
 *   SENDER_EMAIL_BUSINESS_START (padrão: 8)
 *   SENDER_EMAIL_BUSINESS_END   (padrão: 18)
 *   SENDER_EMAIL_WARMUP_STAGE   (padrão: 0 — começa conservador)
 *   SENDER_EMAIL_WEEKEND        (padrão: false — não dispara sábado/domingo)
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailReplyService } from './email-reply.service';
import { emailToPhone } from './email.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { looksLikeCompetitor, isCompetitorEmail } from '@/application/sender/competitor-names.const';
// DISP-007: helpers estáticos de template (nome/saudação) — mesma regra dos dois
// canais, sem duplicar. Import só de estáticos: não entra no grafo de DI.
import { SenderService } from '@/application/sender/sender.service';
import { spin } from '@/application/sender/spintax';
import { dedupSentAtFilter, dedupWindowLabel, podeIgnorarDedup } from '@/application/sender/campaign-dedup';
import { precisaTrocarMercado } from '@/application/sender/conversation-market';
import { marcarLinkDaCampanha } from '@/application/sender/campaign-link';
import { normalizarMessageId } from './campaign-reply-linker';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { normalizeEmail, isSendableEmail } from './email-address';
import { avisosDeSpam, encurtadoresEncontrados } from './email-spam-check';

// ── Config anti-spam ────────────────────────────────────────────
const DELAY_MIN_MS = Number(process.env.SENDER_EMAIL_DELAY_MIN_MS ?? 90_000);
const DELAY_MAX_MS = Number(process.env.SENDER_EMAIL_DELAY_MAX_MS ?? 180_000);
const BUSINESS_START = Number(process.env.SENDER_EMAIL_BUSINESS_START ?? 8);
const BUSINESS_END = Number(process.env.SENDER_EMAIL_BUSINESS_END ?? 18);

// Preaquecimento: quantos envios por dia por estágio (0=novo domínio, 3=aquecido)
const WARMUP_STAGES = [20, 35, 50, 75];

/** Brasília é UTC-3 fixo — o horário de verão acabou no Brasil em 2019. */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hora do dia (0–23) em Brasília. */
export function horaBrasilia(agora: Date = new Date()): number {
  return new Date(agora.getTime() - BRT_OFFSET_MS).getUTCHours();
}

/** Dia da semana em Brasília: 0 = domingo … 6 = sábado. */
export function diaDaSemanaBrasilia(agora: Date = new Date()): number {
  return new Date(agora.getTime() - BRT_OFFSET_MS).getUTCDay();
}

/**
 * Instante da meia-noite de HOJE em Brasília, como Date UTC.
 *
 * É o corte do contador diário. Precisa ser o dia de Brasília, e não o dia UTC,
 * porque a janela de envio é definida em horário de Brasília — usar UTC cortaria
 * o dia às 21h, no meio de uma janela que ainda pode estar aberta se alguém
 * ampliar SENDER_EMAIL_BUSINESS_END.
 */
export function inicioDoDiaBrasilia(agora: Date = new Date()): Date {
  const brt = new Date(agora.getTime() - BRT_OFFSET_MS);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + BRT_OFFSET_MS);
}

@Injectable()
export class EmailCampaignSenderService {
  private readonly logger = new Logger('EmailCampaignSender');
  /**
   * Intervalo sorteado para o PRÓXIMO envio. Só isto continua em memória: é uma
   * variação aleatória, não uma contagem — perdê-la num restart custa, no pior
   * caso, um envio no piso de 90s em vez de um valor maior.
   */
  private nextDelayMs = DELAY_MIN_MS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailReply: EmailReplyService,
    private readonly lock: RedisLockService,
    private readonly conversations: ConversationsService,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────

  /**
   * Acha ou cria a conversa do destinatário e grava o e-mail enviado nela.
   *
   * Espelha o que o disparo de WhatsApp faz. A conversa reaproveitada é a mesma que
   * o poller de IMAP usa quando o lead responde (`email:<endereço>` como phone,
   * canal `email`) — é isso que faz a resposta cair no MESMO fio e o engajamento da
   * campanha contar.
   *
   * Nunca lança para o chamador: falhar em registrar não pode desfazer um e-mail
   * que já saiu, nem impedir o alvo de ser marcado como enviado.
   */
  private async registrarNaConversa(
    campaign: { id: string; tenantId: string; productCode?: string | null },
    email: string,
    contactId: string,
    corpo: string,
  ): Promise<void> {
    const phone = emailToPhone(email);

    const aberta = await this.prisma.aiConversation.findFirst({
      where: {
        tenantId: campaign.tenantId,
        phone,
        status: { in: ['open', 'waiting_customer', 'waiting_internal', 'escalated'] as any },
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, productCode: true },
    });

    const conv =
      aberta ??
      (await this.conversations.create(campaign.tenantId, {
        contactId,
        phone,
        sourceChannel: 'email',
        // ADR 037: o lead herda o mercado da campanha que o trouxe. O disparo de
        // WhatsApp já fazia isso na criação; o de e-mail não passava nada, então a
        // Lia respondia todo lead de e-mail com o conhecimento do produto padrão.
        productCode: campaign.productCode ?? undefined,
      }));

    // E na conversa REAPROVEITADA, o mercado passa a ser o desta campanha — é o caso
    // do lead que recebe de mais de um mercado. Ver conversation-market.ts.
    if (aberta && precisaTrocarMercado(aberta.productCode, campaign.productCode)) {
      await this.prisma.aiConversation
        .update({ where: { id: conv.id }, data: { productCode: campaign.productCode } })
        .catch((e: any) => this.logger.warn(`Falha ao marcar mercado da conversa: ${e?.message}`));
    }

    await this.conversations.addMessage(campaign.tenantId, conv.id, {
      direction: 'outbound',
      content: corpo,
      intent: 'outbound_campaign',
      metadata: { campaignId: campaign.id, channel: 'email' },
      alreadyDelivered: true,
    });
  }

  /**
   * Fim de semana: fora do ar por padrão.
   *
   * Prospecção fria que chega no sábado é lida na segunda junto com o resto da
   * caixa, ou não é lida — e tem taxa de reclamação mais alta que a mesma mensagem
   * em dia útil. Como a reclamação de spam é a métrica que o Google mais pesa
   * (teto formal de 0,10%), o disparo simplesmente espera. `SENDER_EMAIL_WEEKEND=true`
   * libera, para quem tiver público que responde no fim de semana.
   */
  private weekendLiberado(): boolean {
    return (process.env.SENDER_EMAIL_WEEKEND ?? 'false').toLowerCase() === 'true';
  }

  // janela de e-mail do tenant (cai no default env se não houver config salva)
  private async withinEmailWindow(tenantId: string): Promise<boolean> {
    const agora = new Date();

    const dia = diaDaSemanaBrasilia(agora);
    if ((dia === 0 || dia === 6) && !this.weekendLiberado()) return false;

    const s = await this.prisma.senderSettings.findUnique({ where: { tenantId } });
    const start = s?.emailStartHour ?? BUSINESS_START;
    const end = s?.emailEndHour ?? BUSINESS_END;
    const h = horaBrasilia(agora);
    return h >= start && h < end;
  }

  private dailyLimit(): number {
    const stage = Number(process.env.SENDER_EMAIL_WARMUP_STAGE ?? 0);
    const configured = Number(process.env.SENDER_EMAIL_DAILY_LIMIT ?? 50);
    const warmup = WARMUP_STAGES[Math.min(stage, WARMUP_STAGES.length - 1)];
    return Math.min(configured, warmup);
  }

  /**
   * Quantos e-mails de campanha já saíram hoje (dia de Brasília), lido do banco.
   *
   * Contar em memória era o defeito: `sentTodayCount` morria a cada deploy e o
   * preaquecimento perdia o sentido. Vem do banco também porque o contador tem de
   * ser único entre réplicas — o lock do Redis serializa o tick, não o estado de
   * cada processo.
   */
  private async enviadosHoje(): Promise<number> {
    return this.prisma.campaignTarget.count({
      where: {
        status: 'sent',
        sentAt: { gte: inicioDoDiaBrasilia() },
        campaign: { channel: 'email' },
      },
    });
  }

  /**
   * Este endereço já respondeu alguma campanha nossa?
   *
   * É o que separa o PRIMEIRO CONTATO do resto, e o layout do e-mail sai daí (ver
   * email-template.ts): faixa colorida, botão e rodapé com endereço são os
   * marcadores que o Gmail usa para separar e-mail em massa de e-mail pessoal.
   * Em prospecção fria isso significa a aba Promoções, que na prática é o mesmo
   * que não ter chegado. Depois que a pessoa respondeu, ela já sabe quem somos e a
   * marca passa a ajudar em vez de levantar suspeita.
   *
   * O sinal é `repliedAt`, gravado pelo CampaignReplyLinker — resposta de verdade,
   * não abertura. Abertura é medida por pixel de rastreio, que não usamos (imagem
   * em e-mail é bloqueada por padrão e pesa no score de spam).
   */
  private async jaRespondeuAlgumaVez(tenantId: string, email: string): Promise<boolean> {
    const n = await this.prisma.campaignTarget
      .count({ where: { tenantId, email, repliedAt: { not: null } } })
      .catch(() => 0); // falhar aqui cai no layout frio, que é o lado seguro
    return n > 0;
  }

  /** Nome de exibição do mercado, para o fallback de assunto. Sem mercado → HiperTMS. */
  private async nomeDoMercado(productCode: string | null): Promise<string> {
    if (!productCode) return 'HiperTMS';
    const m = await this.prisma.product
      .findUnique({ where: { code: productCode }, select: { name: true, displayName: true } as any })
      .catch(() => null);
    return (m as any)?.displayName || (m as any)?.name || 'HiperTMS';
  }

  /** Instante do último e-mail de campanha que saiu — base do intervalo anti-spam. */
  private async ultimoEnvio(): Promise<number> {
    const alvo = await this.prisma.campaignTarget.findFirst({
      where: { status: 'sent', sentAt: { not: null }, campaign: { channel: 'email' } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return alvo?.sentAt ? new Date(alvo.sentAt).getTime() : 0;
  }

  /**
   * Renderiza o template com {{nome}} e {{saudacao}}.
   *
   * DISP-007: reusa os helpers já validados do canal WhatsApp. O fallback antigo
   * era a string "tudo bem", que produzia aberrações como "Bom dia tudo bem, tudo
   * bem?" — o WhatsApp corrigiu isso (mais da metade da base entra sem nome) e o
   * e-mail tinha ficado para trás. Sem nome, `{{nome}}` some e a frase se recompõe.
   */
  private render(template: string, name?: string | null): string {
    const first = SenderService.firstName(name);
    let txt = template
      .replace(/\{\{\s*nome\s*\}\}/gi, first)
      .replace(/\{\{\s*saudacao\s*\}\}/gi, SenderService.greeting());
    // Spintax (ver spintax.ts): corpo idêntico repetido também pesa no score de
    // spam do provedor destinatário, não só no WhatsApp. Roda depois do {{...}}
    // pelo mesmo motivo do canal WhatsApp.
    txt = spin(txt);
    return first ? txt : SenderService.tidyMissingName(txt);
  }

  // ── CRUD: cria campanha de e-mail ────────────────────────────────

  async createEmailCampaign(
    tenantId: string,
    dto: {
      name: string;
      subject: string;
      template: string;
      productCode?: string; // F8: de qual produto/parceiro esta campanha fala
      emails?: { email: string; name?: string }[]; // lista manual
      fromContacts?: boolean;                        // usa contatos com e-mail cadastrado
      /** TESTE: ignora o "já enviado" nesta campanha (ver podeIgnorarDedup). */
      ignoreDedup?: boolean;
      link?: string;
      sendLinkOnFirst?: boolean; // false (padrão) = só envia link após resposta do lead
      sendLimit?: number;
      scheduledAt?: string; // agendamento: só começa a enviar a partir desse horário
    },
  ) {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    // Trava de mercado NA API, não só no seletor (ADR 037). O seletor do vendedor
    // já esconde mercado em rascunho, mas quem chama o endpoint direto passava por
    // cima da trava de liberação inteira — conhecimento não aprovado, identidade
    // vazia, e o disparo saindo mesmo assim. Código desconhecido também barra:
    // um typo aqui desligaria silenciosamente o conhecimento e a marca do mercado.
    if (dto.productCode) {
      const market = await this.prisma.product.findUnique({ where: { code: dto.productCode } });
      if (!market) {
        throw new BadRequestException(`Mercado "${dto.productCode}" não existe.`);
      }
      if (market.status !== 'active') {
        throw new BadRequestException(
          `Mercado "${market.name}" não está liberado para disparo (status: ${market.status}). ` +
          'Libere-o na tela de Mercados antes de criar a campanha.',
        );
      }
    }

    // Encurtador de link é o único bloqueio: o Gmail não classifica como promoção,
    // ele descarta por associação com phishing. Deixar criar seria criar uma
    // campanha que nunca chega. Ver email-spam-check.ts.
    const encurtadores = encurtadoresEncontrados(dto.subject, dto.template, dto.link ?? '');
    if (encurtadores.length) {
      throw new BadRequestException(
        `Link encurtado não pode ser usado em e-mail (${encurtadores.join(', ')}) — ` +
        'o Gmail bloqueia por associação com phishing. Use a URL completa do domínio.',
      );
    }

    // O resto sobe o score de spam sem condenar o e-mail: volta como aviso para a
    // tela, porque quem escreveu tem contexto que o código não tem.
    const avisos = avisosDeSpam(dto.subject, dto.template);
    if (avisos.length) {
      this.logger.warn(`Campanha "${dto.name}" — avisos de conteúdo: ${avisos.join(' | ')}`);
    }

    // Endereço SEMPRE normalizado na entrada (ver email-address.ts): é o que faz o
    // opt-out e o dedup encontrarem a pessoa quando a planilha traz "Joao@X.com" e
    // o banco tem "joao@x.com".
    let targets = (dto.emails ?? []).map((t) => ({ ...t, email: normalizeEmail(t.email) }));

    if (dto.fromContacts) {
      // MESMO `where` da pré-visualização (audienciaWhere) — a tela mostra quem vai
      // receber e o envio tem que concordar com ela. Alterar aqui sem alterar lá faz
      // a tela mentir, e o operador confia no número que viu.
      const contacts = await this.prisma.contact.findMany({
        where: EmailCampaignSenderService.audienciaWhere(tenantId) as any,
        select: { email: true, name: true },
      });
      targets = contacts
        .filter((c: any) => c.email)
        .map((c: any) => ({ email: normalizeEmail(c.email), name: c.name ?? undefined }));
    }

    // Endereço quebrado vira hard bounce, e hard bounce derruba a reputação do
    // domínio inteiro — a peneira é aqui, antes de entrar na fila.
    const invalidList = targets.filter((t) => !isSendableEmail(t.email));
    if (invalidList.length) {
      const invalidSet = new Set(invalidList.map((t) => t.email));
      targets = targets.filter((t) => !invalidSet.has(t.email));
      this.logger.warn(
        `Campanha "${dto.name}": ${invalidList.length} endereço(s) inválido(s) — pulados: ` +
        invalidList.map((t) => t.email || '(vazio)').join(', '),
      );
    }

    // Dedup por e-mail (já normalizado acima)
    const seen = new Set<string>();
    targets = targets.filter((t) => (seen.has(t.email) ? false : seen.add(t.email)));

    // Remove opted_out, bloqueados (blocklist de concorrentes, 2026-08-01) e
    // endereços com devolução PERMANENTE. Paridade com o WhatsApp nos dois
    // primeiros: opted_out é pedido do contato (LGPD), blocked é decisão nossa.
    //
    // O terceiro é exclusivo do e-mail e é o que protege a reputação do domínio:
    // insistir num endereço morto é o caminho mais rápido para passar dos 2% de
    // rejeição que os provedores toleram — e aí TODOS os e-mails vão para o spam,
    // não só os desta campanha. Ver EmailBounceService.
    const excluded = await this.prisma.contact.findMany({
      where: {
        tenantId,
        email: { in: targets.map((t) => t.email) },
        OR: [{ status: { in: ['opted_out', 'blocked'] } }, { emailBouncedAt: { not: null } }],
      },
      select: { email: true, status: true, emailBouncedAt: true },
    });
    const setDe = (fn: (o: any) => boolean) =>
      new Set(excluded.filter(fn).map((o: any) => normalizeEmail(o.email)));

    const optedSet = setDe((o) => o.status === 'opted_out');
    const blockedSet = setDe((o) => o.status === 'blocked');
    const bouncedSet = setDe((o) => !!o.emailBouncedAt && o.status !== 'opted_out' && o.status !== 'blocked');

    const skippedOptOut = targets.filter((t) => optedSet.has(t.email)).length;
    const blockedList = targets.filter((t) => blockedSet.has(t.email));
    const bouncedList = targets.filter((t) => bouncedSet.has(t.email));
    if (bouncedList.length) {
      this.logger.log(
        `Campanha "${dto.name}": ${bouncedList.length} endereço(s) com devolução permanente — ` +
        'pulados (email_invalido). Insistir neles derruba a entrega do domínio inteiro.',
      );
    }
    targets = targets.filter(
      (t) => !optedSet.has(t.email) && !blockedSet.has(t.email) && !bouncedSet.has(t.email),
    );

    // Concorrente por NOME (heurística) ou por DOMÍNIO do e-mail (certeza) —
    // @bsoft.com.br não tem como ser lead. Ver competitor-names.const.ts.
    const suspectList = targets.filter((t) => looksLikeCompetitor(t.name) || isCompetitorEmail(t.email));
    if (suspectList.length) {
      const suspectSet = new Set(suspectList.map((t) => t.email.toLowerCase()));
      targets = targets.filter((t) => !suspectSet.has(t.email.toLowerCase()));
      this.logger.warn(
        `Campanha "${dto.name}": ${suspectList.length} e-mail(s) parecem CONCORRENTE — pulados: ` +
        suspectList.map((t) => `${t.name ?? ''} <${t.email}>`).join(', '),
      );
    }

    // Dedup ENTRE campanhas (paridade com WhatsApp): quem já recebeu e-mail
    // 'sent' em qualquer campanha anterior do tenant não recebe de novo.
    // Janela opcional via CAMPAIGN_DEDUP_DAYS — ver campaign-dedup.ts.
    const janelaDedup = dedupSentAtFilter();
    // Ferramenta de teste: ignora o passado só nesta campanha. Ver podeIgnorarDedup.
    const ignorarDedup = podeIgnorarDedup(dto.ignoreDedup);
    if (ignorarDedup) {
      this.logger.warn(
        `Campanha "${dto.name}": DEDUP IGNORADO a pedido — endereços que já receberam vão receber de novo.`,
      );
    }
    let alreadySent = new Set<string>();
    if (targets.length && !ignorarDedup) {
      const prior = await this.prisma.campaignTarget.findMany({
        where: {
          tenantId,
          status: 'sent',
          email: { in: targets.map((t) => t.email) },
          ...(janelaDedup ? { sentAt: janelaDedup } : {}),
        },
        select: { email: true },
        distinct: ['email'],
      });
      alreadySent = new Set(prior.map((p: any) => normalizeEmail(p.email)));
    }
    const dupList = targets.filter((t) => alreadySent.has(t.email));
    targets = targets.filter((t) => !alreadySent.has(t.email));
    if (dupList.length) {
      // Este log é a resposta para "criei a campanha e não saiu nada": sem ele, o
      // operador vê 200 alvos virarem 0 enviados e conclui que o disparo travou.
      this.logger.log(
        `Campanha "${dto.name}": ${dupList.length} e-mail(s) já receberam campanha anterior — ` +
        `pulados (ja_enviado, janela: ${dedupWindowLabel()})`,
      );
    }

    const skippedRows = [
      ...blockedList.map((t) => ({ status: 'skipped', error: 'bloqueado', t })),
      ...bouncedList.map((t) => ({ status: 'skipped', error: 'email_invalido', t })),
      ...invalidList.map((t) => ({ status: 'skipped', error: 'endereco_invalido', t })),
      ...suspectList.map((t) => ({ status: 'skipped', error: 'suspeito_concorrente', t })),
      ...dupList.map((t) => ({ status: 'skipped', error: 'ja_enviado', t })),
    ];

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        channel: 'email',
        productCode: dto.productCode || null,
        subject: dto.subject,
        template: dto.template,
        link: dto.link?.trim() || null,
        sendLinkOnFirst: dto.sendLinkOnFirst ?? false,
        sendLimit: dto.sendLimit && dto.sendLimit > 0 ? dto.sendLimit : null,
        // agendada já entra como running; o worker só dispara a partir de scheduledAt
        scheduledAt,
        ...(scheduledAt ? { status: 'running', startedAt: new Date() } : {}),
        targets: {
          create: [
            ...targets.map((t) => ({
              tenantId,
              phone: emailToPhone(t.email), // synthetic phone para compatibilidade
              email: t.email,
              name: t.name,
            })),
            // pulados aparecem no relatório com o motivo (paridade com WhatsApp)
            ...skippedRows.map(({ status, error, t }) => ({
              tenantId,
              phone: emailToPhone(t.email),
              email: t.email,
              name: t.name,
              status,
              error,
            })),
          ],
        },
      },
      include: { _count: { select: { targets: true } } },
    });

    return {
      ...campaign,
      included: targets.length,
      skippedOptOut,
      skippedBlocked: blockedList.length,
      skippedBounced: bouncedList.length,
      skippedInvalid: invalidList.length,
      skippedSuspect: suspectList.length,
      skippedAlreadySent: dupList.length,
      // `warnings` e não `avisos`: é o mesmo campo que a campanha de WhatsApp já
      // devolve, e a tela de Disparo mostra cada item num toast de 15s. Nome
      // diferente aqui significaria escrever de novo, no front, o que já existe.
      //
      // Eles vão para a TELA porque um `logger.warn` que ninguém lê é o mesmo que
      // não ter verificação nenhuma — que era exatamente o estado anterior.
      warnings: avisos,
    };
  }

  // ── Worker: tick a cada 15s ──────────────────────────────────────

  /**
   * Quem receberia a campanha se ela fosse criada agora com "Contatos com e-mail".
   *
   * O botão dizia só "disparado para todos os contatos ativos com e-mail" e o
   * operador assinava em branco — sem ver quem é, nem quantos. A pré-visualização
   * usa DE PROPÓSITO o mesmo `where` do disparo (createEmailCampaign), porque um
   * preview que diverge do envio é pior que preview nenhum: ele dá confiança errada.
   * Se um dia o critério mudar, os dois têm que mudar juntos — o teste prende isso.
   *
   * O que este número NÃO prevê: as exclusões que só acontecem na criação (dedup
   * `ja_enviado`, blocklist, concorrente, cliente TMS). A tela diz isso em texto.
   *
   * `emailBouncedAt: null` entra aqui, e não só na criação, porque endereço com
   * devolução permanente não é "quem receberia" — é quem nunca mais recebe. Um
   * preview que o contasse inflaria o número que o operador usa para decidir.
   */
  static audienciaWhere(tenantId: string) {
    return {
      tenantId,
      status: 'active',
      email: { not: null },
      emailBouncedAt: null,
      NOT: { email: '' },
    } as const;
  }

  async previewAudienciaEmail(
    tenantId: string,
    opts: { search?: string; limit?: number; offset?: number } = {},
  ) {
    const busca = opts.search?.trim();
    const where: any = { ...EmailCampaignSenderService.audienciaWhere(tenantId) };
    if (busca) {
      where.OR = [
        { name: { contains: busca, mode: 'insensitive' } },
        { email: { contains: busca, mode: 'insensitive' } },
        { company: { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [items, total, totalSemBusca] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        select: { id: true, name: true, email: true, company: true, createdAt: true },
        orderBy: { createdAt: 'desc' }, // os que entraram por último aparecem primeiro
        take: Math.min(opts.limit ?? 50, 200),
        skip: opts.offset ?? 0,
      }),
      this.prisma.contact.count({ where }),
      // Total REAL do disparo: a busca filtra a lista na tela, não o envio.
      busca ? this.prisma.contact.count({ where: EmailCampaignSenderService.audienciaWhere(tenantId) as any }) : undefined,
    ]);

    return { items, total, totalAudiencia: totalSemBusca ?? total };
  }

  @Interval(15_000)
  async tick(): Promise<void> {
    // Multi-instance guard: only one replica runs the tick at a time.
    const release = await this.lock.acquire('lock:email-campaign:tick', 60);
    if (!release) return;
    try {
      await this.tickLocked();
    } finally {
      await release();
    }
  }

  private async tickLocked() {
    try {
      // Recupera targets presos em 'sending' (crash do worker)
      await this.prisma.campaignTarget.updateMany({
        where: {
          status: 'sending',
          campaign: { channel: 'email' },
          OR: [
            { sentAt: null },
            { sentAt: { lt: new Date(Date.now() - 10 * 60_000) } },
          ],
        },
        data: { status: 'queued' },
      });

      // Fecha campanhas de e-mail concluídas
      await this.prisma.campaign.updateMany({
        where: { channel: 'email', status: 'running', targets: { none: { status: 'queued' } } },
        data: { status: 'done' },
      });

      const enviadosHoje = await this.enviadosHoje();
      if (enviadosHoje >= this.dailyLimit()) {
        this.logger.warn(
          `Limite diário de e-mails atingido (${enviadosHoje}/${this.dailyLimit()}) — pausa até amanhã`,
        );
        return;
      }
      if (Date.now() - (await this.ultimoEnvio()) < this.nextDelayMs) return;

      // Pega campanha rodando — respeitando agendamento (scheduledAt no futuro = espera)
      const campaign = await this.prisma.campaign.findFirst({
        where: {
          channel: 'email',
          status: 'running',
          targets: { some: { status: 'queued' } },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!campaign) return;

      // janela de envio de e-mail do tenant — fora do horário, espera
      if (!(await this.withinEmailWindow(campaign.tenantId))) return;

      // Respeita sendLimit
      if (campaign.sendLimit) {
        const enviados = await this.prisma.campaignTarget.count({
          where: { campaignId: campaign.id, status: 'sent' },
        });
        if (enviados >= campaign.sendLimit) {
          await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'done' } });
          return;
        }
      }

      // Pega próximo alvo
      const target = await this.prisma.campaignTarget.findFirst({
        where: { campaignId: campaign.id, status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (!target || !target.email) {
        await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'done' } });
        return;
      }

      // CLAIM ATÔMICO (idempotência)
      const claim = await this.prisma.campaignTarget.updateMany({
        where: { id: target.id, status: 'queued' },
        data: { status: 'sending' },
      });
      if (claim.count === 0) return;

      // Última checagem antes de sair: opt-out e devolução permanente podem ter
      // acontecido DEPOIS da criação da campanha — a fila pode levar dias para
      // esvaziar a 20 e-mails/dia. `insensitive` porque alvo antigo (anterior à
      // normalização) pode ter caixa mista gravada. Ver email-address.ts.
      const email = normalizeEmail(target.email);
      const contact = await this.prisma.contact.findFirst({
        where: { tenantId: campaign.tenantId, email: { equals: email, mode: 'insensitive' } },
      });
      const impedimento =
        contact?.status === 'opted_out' ? 'opted_out'
        : contact?.status === 'blocked' ? 'bloqueado'
        : contact?.emailBouncedAt ? 'email_invalido'
        : null;
      if (impedimento) {
        this.logger.log(`Email disparo pulado → ${email} (motivo: ${impedimento})`);
        await this.prisma.campaignTarget.update({
          where: { id: target.id },
          data: { status: 'skipped', error: impedimento },
        });
        return;
      }

      // Upsert contato (garante que existe para gerar opt-out token)
      const upsertedContact = await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId: campaign.tenantId, phone: emailToPhone(email) } },
        update: { email },
        create: {
          tenantId: campaign.tenantId,
          phone: emailToPhone(email),
          email,
          name: target.name ?? undefined,
          source: 'email_campaign',
          tags: [],
        },
      });

      // Primeiro contato ou não — é o que decide o LAYOUT do e-mail.
      const conhecido = await this.jaRespondeuAlgumaVez(campaign.tenantId, email);
      const layout = conhecido ? 'marca' : 'simples';

      let body = this.render(campaign.template, target.name);

      // Link MARCADO com a origem: sem isto o clique chega no site como visita
      // direta e "a campanha trouxe gente?" não tem resposta. Clique de e-mail
      // quase nunca traz referrer (o Gmail abre por proxy). Ver campaign-link.ts.
      const linkComOrigem = campaign.link
        ? marcarLinkDaCampanha(campaign.link, {
            canal: 'email',
            campanhaId: campaign.id,
            campanhaNome: campaign.name,
            // QUEM recebeu: é o que permite dizer depois "o Carlos clicou".
            contatoId: upsertedContact.id,
          })
        : null;

      // Onde o link entra depende do layout, e a diferença não é estética.
      //
      // `marca` (quem já respondeu): vira BOTÃO. É o formato que converte clique, e
      // aqui ele é aceitável porque a pessoa já sabe quem somos.
      //
      // `simples` (contato frio): só entra como texto, e só se `sendLinkOnFirst`
      // estiver ligado. O padrão continua sendo NÃO mandar link no primeiro toque —
      // e-mail frio sem link tem score de spam menor e mais resposta. Botão em
      // primeiro contato é o pior dos dois mundos: parece massa e ainda pede clique
      // de quem não sabe quem está pedindo.
      let ctaUrl: string | undefined;
      if (linkComOrigem && layout === 'marca') {
        ctaUrl = linkComOrigem;
      } else if (linkComOrigem && campaign.sendLinkOnFirst) {
        body += `\n\n🔗 ${linkComOrigem}`;
      }
      // O assunto também passa pelo render: `{{nome}}` nele já era esperado por quem
      // escreve a campanha (e antes saía literal), e o spintax importa AINDA MAIS aqui —
      // assunto repetido é o campo que os provedores mais usam para agrupar em massa.
      //
      // Fallback sem assunto: o nome do MERCADO, não "HiperTMS" fixo — campanha de
      // pneus com assunto de TMS é a incoerência que termina em "Reportar spam".
      // Caminho raro (modelo de mensagem exige assunto), então a consulta só roda nele.
      const subject = campaign.subject
        ? this.render(campaign.subject, target.name)
        : `Sobre o ${await this.nomeDoMercado(campaign.productCode)} — ${this.render('{{saudacao}}', target.name)}`;

      try {
        const result = await this.emailReply.send({
          to: email,
          subject,
          body,
          tenantId: campaign.tenantId,
          contactId: upsertedContact.id,
          // A marca do mercado no e-mail (wordmark, cor, From, assinatura) —
          // ver email-market-identity.ts. Sem isto a prévia mostrava a marca do
          // mercado e o envio real saía HiperTMS.
          productCode: campaign.productCode,
          // Marca o link da ASSINATURA com a campanha e o contato. Em e-mail frio o
          // corpo sai sem link, então a assinatura é o único link — e é nele que a
          // pessoa clica. Sem isto o clique entra como visita direta e o lead fica
          // anônimo, o que aconteceu num teste real em 10/08/2026.
          tracking: {
            canal: 'email',
            campanhaId: campaign.id,
            campanhaNome: campaign.name,
            contatoId: upsertedContact.id,
          },
          // Discreto no primeiro contato, com a marca depois que a pessoa respondeu.
          layout,
          ctaUrl,
          ctaLabel: 'Ver como funciona',
          // Sem leadScore em campanha outbound — sem convite WhatsApp automático
          // (evita parecer agressivo no primeiro contato por e-mail)
        });

        if (result.sent) {
          // Registra o e-mail enviado na CONVERSA do destinatário.
          //
              // O disparo de WhatsApp já fazia isso (sender.service.ts) e o de e-mail
          // não — chamava o SMTP direto. Duas consequências, as duas observadas em
          // 08/08/2026: o engajamento da campanha (Entregue/Lido/Respondeu) ficava
          // ZERADO para sempre, porque é calculado a partir de mensagens com
          // `intent: 'outbound_campaign'`; e o e-mail enviado não existia em conversa
          // nenhuma, então quando o lead respondia o analista abria a conversa e via
          // a resposta sem saber o que tinha sido perguntado.
          //
          // `alreadyDelivered` porque o envio já aconteceu acima, com assunto e
          // template próprios da campanha — deixar o despacho do addMessage rodar
          // mandaria o mesmo e-mail duas vezes.
          await this.registrarNaConversa(campaign, email, upsertedContact.id, body).catch((e: any) =>
            this.logger.warn(`Falha ao registrar e-mail da campanha na conversa (${email}): ${e?.message}`),
          );

          // O Message-ID vai junto: é o que permite reconhecer a resposta quando o
          // lead responde de OUTRO endereço (ver CampaignReplyLinker). Sem ele, essa
          // resposta virava conversa nova e o alvo ficava "sem resposta" para sempre.
          //
          // Gravado na forma CANÔNICA (sem `<>`): o nodemailer devolve com os sinais e
          // o linker compara sem eles. Guardar cru faria o casamento nunca acontecer —
          // recurso inteiro virando no-op silencioso.
          await this.prisma.campaignTarget.update({
            where: { id: target.id },
            data: {
              status: 'sent',
              sentAt: new Date(),
              messageId: normalizarMessageId(result.messageId),
            },
          });
          // Delay aleatório 90–180s (anti-spam). O `sentAt` que acabou de ser gravado
          // é a base do próximo intervalo — por isso não há mais contador em memória.
          this.nextDelayMs = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
          this.logger.log(
            `Email disparo → ${email} (campanha "${campaign.name}") ` +
            `[${enviadosHoje + 1}/${this.dailyLimit()} hoje · próx em ${Math.round(this.nextDelayMs / 1000)}s]`,
          );
        } else {
          await this.prisma.campaignTarget.update({
            where: { id: target.id },
            data: { status: 'failed', error: result.reason ?? 'smtp_error' },
          });
        }
      } catch (err: any) {
        await this.prisma.campaignTarget.update({
          where: { id: target.id },
          data: { status: 'failed', error: String(err?.message).slice(0, 200) },
        });
      }
    } catch (err: any) {
      this.logger.error(`EmailCampaignSender tick falhou: ${err?.message}`);
    }
  }
}
