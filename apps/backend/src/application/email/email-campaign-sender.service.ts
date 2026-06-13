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

  /** Renderiza o template com {{nome}} e {{saudacao}}. */
  private render(template: string, name?: string | null): string {
    const first = (name ?? '').split(' ')[0] || 'tudo bem';
    const h = (new Date().getUTCHours() - 3 + 24) % 24;
    const saudacao = h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
    return template
      .replace(/\{\{\s*nome\s*\}\}/gi, first)
      .replace(/\{\{\s*saudacao\s*\}\}/gi, saudacao);
  }

  // ── CRUD: cria campanha de e-mail ────────────────────────────────

  async createEmailCampaign(
    tenantId: string,
    dto: {
      name: string;
      subject: string;
      template: string;
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
        .filter((c) => c.email)
        .map((c) => ({ email: c.email!, name: c.name ?? undefined }));
    }

    // Dedup por e-mail
    const seen = new Set<string>();
    targets = targets.filter((t) => {
      const k = t.email.toLowerCase();
      return seen.has(k) ? false : seen.add(k);
    });

    // Remove opted_out
    const optedEmails = await this.prisma.contact.findMany({
      where: { tenantId, status: 'opted_out', email: { in: targets.map((t) => t.email) } },
      select: { email: true },
    });
    const blocked = new Set(optedEmails.map((o) => o.email!.toLowerCase()));
    const skippedOptOut = targets.filter((t) => blocked.has(t.email.toLowerCase())).length;
    targets = targets.filter((t) => !blocked.has(t.email.toLowerCase()));

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        channel: 'email',
        subject: dto.subject,
        template: dto.template,
        link: dto.link?.trim() || null,
        sendLinkOnFirst: dto.sendLinkOnFirst ?? false,
        sendLimit: dto.sendLimit && dto.sendLimit > 0 ? dto.sendLimit : null,
        // agendada já entra como running; o worker só dispara a partir de scheduledAt
        scheduledAt,
        ...(scheduledAt ? { status: 'running', startedAt: new Date() } : {}),
        targets: {
          create: targets.map((t) => ({
            tenantId,
            phone: emailToPhone(t.email), // synthetic phone para compatibilidade
            email: t.email,
            name: t.name,
          })),
        },
      },
      include: { _count: { select: { targets: true } } },
    });

    return { ...campaign, included: targets.length, skippedOptOut };
  }

  // ── Worker: tick a cada 15s ──────────────────────────────────────

  @Interval(15_000)
  async tick() {
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
      const subject = campaign.subject ?? `Sobre o HiperTMS — ${this.render('{{saudacao}}', target.name)}`;

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
