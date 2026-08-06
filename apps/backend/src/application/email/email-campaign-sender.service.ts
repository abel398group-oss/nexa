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
 * 3. Horário comercial: 8h–18h (Brasília UTC-3) — rejeição/marcação de spam é maior à noite
 * 4. Plain text APENAS — e-mails HTML com imagens têm score de spam mais alto
 * 5. Link de descadastro obrigatório em todos os e-mails (LGPD + filtros anti-spam)
 * 6. Personalização {{nome}} reduz score de spam (menos genérico = menos spam)
 * 7. Subject: não pode ter MAIÚSCULAS excessivas, pontuação excessiva ou palavras proibidas
 * 8. Reply-To configurado (filtros confiam mais em e-mail com reply-to válido)
 * 9. Nunca envia para opted_out (LGPD)
 * 10. Preaquecimento do domínio: começa baixo e aumenta gradualmente (SENDER_EMAIL_WARMUP_STAGE)
 *
 * Variáveis de ambiente:
 *   SENDER_EMAIL_DELAY_MIN_MS   (padrão: 90000  — 90s)
 *   SENDER_EMAIL_DELAY_MAX_MS   (padrão: 180000 — 3min)
 *   SENDER_EMAIL_DAILY_LIMIT    (padrão: 50)
 *   SENDER_EMAIL_BUSINESS_START (padrão: 8)
 *   SENDER_EMAIL_BUSINESS_END   (padrão: 18)
 *   SENDER_EMAIL_WARMUP_STAGE   (padrão: 0 — começa conservador)
 */
import { Injectable, Logger } from '@nestjs/common';
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

// ── Config anti-spam ────────────────────────────────────────────
const DELAY_MIN_MS = Number(process.env.SENDER_EMAIL_DELAY_MIN_MS ?? 90_000);
const DELAY_MAX_MS = Number(process.env.SENDER_EMAIL_DELAY_MAX_MS ?? 180_000);
const BUSINESS_START = Number(process.env.SENDER_EMAIL_BUSINESS_START ?? 8);
const BUSINESS_END = Number(process.env.SENDER_EMAIL_BUSINESS_END ?? 18);

// Preaquecimento: quantos envios por dia por estágio (0=novo domínio, 3=aquecido)
const WARMUP_STAGES = [20, 35, 50, 75];

// Palavras que aumentam o score de spam no assunto — bloqueia se encontrar
const SPAM_SUBJECT_WORDS = [
  'grátis', 'gratuito', 'promoção', 'oferta', 'ganhe', 'lucre',
  '100%', 'urgente', 'clique aqui', 'compre agora', '!!!',
];

@Injectable()
export class EmailCampaignSenderService {
  private readonly logger = new Logger('EmailCampaignSender');
  private lastSentAt = 0;
  private nextDelayMs = DELAY_MIN_MS;
  private sentTodayCount = 0;
  private todayStamp = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailReply: EmailReplyService,
    private readonly lock: RedisLockService,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────

  private today(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // janela de e-mail do tenant (cai no default env se não houver config salva)
  private async withinEmailWindow(tenantId: string): Promise<boolean> {
    const s = await this.prisma.senderSettings.findUnique({ where: { tenantId } });
    const start = s?.emailStartHour ?? BUSINESS_START;
    const end = s?.emailEndHour ?? BUSINESS_END;
    const h = (new Date().getUTCHours() - 3 + 24) % 24; // UTC-3 Brasília
    return h >= start && h < end;
  }

  private dailyLimit(): number {
    const stage = Number(process.env.SENDER_EMAIL_WARMUP_STAGE ?? 0);
    const configured = Number(process.env.SENDER_EMAIL_DAILY_LIMIT ?? 50);
    const warmup = WARMUP_STAGES[Math.min(stage, WARMUP_STAGES.length - 1)];
    return Math.min(configured, warmup);
  }

  /** Valida se o assunto é aceitável (sem palavras de spam óbvias). */
  private isSubjectSafe(subject: string): boolean {
    const lower = subject.toLowerCase();
    return !SPAM_SUBJECT_WORDS.some((w) => lower.includes(w));
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
      link?: string;
      sendLinkOnFirst?: boolean; // false (padrão) = só envia link após resposta do lead
      sendLimit?: number;
      scheduledAt?: string; // agendamento: só começa a enviar a partir desse horário
    },
  ) {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    // Aviso de assunto perigoso (não bloqueia, apenas loga)
    if (!this.isSubjectSafe(dto.subject)) {
      this.logger.warn(`Assunto pode aumentar score de spam: "${dto.subject}"`);
    }

    let targets = dto.emails ?? [];

    if (dto.fromContacts) {
      const contacts = await this.prisma.contact.findMany({
        where: { tenantId, status: 'active', email: { not: null } },
        select: { email: true, name: true },
      });
      targets = contacts
        .filter((c: any) => c.email)
        .map((c: any) => ({ email: c.email!, name: c.name ?? undefined }));
    }

    // Dedup por e-mail
    const seen = new Set<string>();
    targets = targets.filter((t) => {
      const k = t.email.toLowerCase();
      return seen.has(k) ? false : seen.add(k);
    });

    // Remove opted_out E bloqueados (blocklist de concorrentes, 2026-08-01) —
    // mesma paridade do canal WhatsApp: opted_out é pedido do contato (LGPD),
    // blocked é decisão nossa. Ambos ficam fora, com motivo distinto no relatório.
    const excluded = await this.prisma.contact.findMany({
      where: { tenantId, status: { in: ['opted_out', 'blocked'] }, email: { in: targets.map((t) => t.email) } },
      select: { email: true, status: true },
    });
    const optedSet = new Set(excluded.filter((o: any) => o.status === 'opted_out').map((o: any) => o.email!.toLowerCase()));
    const blockedSet = new Set(excluded.filter((o: any) => o.status === 'blocked').map((o: any) => o.email!.toLowerCase()));
    const skippedOptOut = targets.filter((t) => optedSet.has(t.email.toLowerCase())).length;
    const blockedList = targets.filter((t) => blockedSet.has(t.email.toLowerCase()));
    targets = targets.filter((t) => {
      const k = t.email.toLowerCase();
      return !optedSet.has(k) && !blockedSet.has(k);
    });

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
    let alreadySent = new Set<string>();
    if (targets.length) {
      const prior = await this.prisma.campaignTarget.findMany({
        where: { tenantId, status: 'sent', email: { in: targets.map((t) => t.email) } },
        select: { email: true },
        distinct: ['email'],
      });
      alreadySent = new Set(prior.map((p: any) => (p.email ?? '').toLowerCase()));
    }
    const dupList = targets.filter((t) => alreadySent.has(t.email.toLowerCase()));
    targets = targets.filter((t) => !alreadySent.has(t.email.toLowerCase()));

    const skippedRows = [
      ...blockedList.map((t) => ({ status: 'skipped', error: 'bloqueado', t })),
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
      skippedSuspect: suspectList.length,
      skippedAlreadySent: dupList.length,
    };
  }

  // ── Worker: tick a cada 15s ──────────────────────────────────────

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
      // Reset do contador diário na virada do dia
      const today = this.today();
      if (this.todayStamp !== today) {
        this.sentTodayCount = 0;
        this.todayStamp = today;
      }

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

      if (this.sentTodayCount >= this.dailyLimit()) {
        this.logger.warn(`Limite diário de e-mails atingido (${this.dailyLimit()}) — pausa hoje`);
        return;
      }
      if (Date.now() - this.lastSentAt < this.nextDelayMs) return;

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

      // Verifica opt-out em tempo real
      const contact = await this.prisma.contact.findFirst({
        where: { tenantId: campaign.tenantId, email: target.email },
      });
      if (contact?.status === 'opted_out') {
        await this.prisma.campaignTarget.update({
          where: { id: target.id },
          data: { status: 'skipped', error: 'opted_out' },
        });
        return;
      }

      // Upsert contato (garante que existe para gerar opt-out token)
      const upsertedContact = await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId: campaign.tenantId, phone: emailToPhone(target.email) } },
        update: { email: target.email },
        create: {
          tenantId: campaign.tenantId,
          phone: emailToPhone(target.email),
          email: target.email,
          name: target.name ?? undefined,
          source: 'email_campaign',
          tags: [],
        },
      });

      let body = this.render(campaign.template, target.name);
      // Injeta link apenas se sendLinkOnFirst=true.
      // Padrão (false): 1º e-mail sem link → lead responde → Lia envia na conversa.
      // Emails frios sem link têm score de spam menor e maior taxa de resposta.
      if (campaign.link && campaign.sendLinkOnFirst) {
        body += `\n\n🔗 ${campaign.link}`;
      }
      // O assunto também passa pelo render: `{{nome}}` nele já era esperado por quem
      // escreve a campanha (e antes saía literal), e o spintax importa AINDA MAIS aqui —
      // assunto repetido é o campo que os provedores mais usam para agrupar em massa.
      const subject = campaign.subject
        ? this.render(campaign.subject, target.name)
        : `Sobre o HiperTMS — ${this.render('{{saudacao}}', target.name)}`;

      try {
        const result = await this.emailReply.send({
          to: target.email,
          subject,
          body,
          tenantId: campaign.tenantId,
          contactId: upsertedContact.id,
          // Sem leadScore em campanha outbound — sem convite WhatsApp automático
          // (evita parecer agressivo no primeiro contato por e-mail)
        });

        if (result.sent) {
          await this.prisma.campaignTarget.update({
            where: { id: target.id },
            data: { status: 'sent', sentAt: new Date() },
          });
          this.sentTodayCount++;
          this.lastSentAt = Date.now();
          // Delay aleatório 90–180s (anti-spam)
          this.nextDelayMs = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
          this.logger.log(
            `Email disparo → ${target.email} (campanha "${campaign.name}") ` +
            `[${this.sentTodayCount}/${this.dailyLimit()} hoje · próx em ${Math.round(this.nextDelayMs / 1000)}s]`,
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
