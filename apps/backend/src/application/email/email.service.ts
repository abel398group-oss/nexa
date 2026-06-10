/**
 * EmailService — ADR 021
 *
 * Processa e-mails inbound do Mailgun, normaliza para o pipeline da Lia
 * e envia respostas por e-mail.
 *
 * Análogo ao WhatsappService, mas com:
 *  - Contato identificado por e-mail (não telefone)
 *  - Synthetic phone = "email:<endereço>" para o pipeline existente
 *  - Validação SPF/DKIM via headers do Mailgun (D8)
 *  - Rate-limit por remetente (máx 10/hora) — D8
 *  - Resposta via EmailReplyService (não WAHA)
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { EmailReplyService } from './email-reply.service';

// E-mail normalizado extraído do webhook Mailgun
export interface NormalizedEmail {
  from: string;           // endereço remetente ex: "João <joao@empresa.com>"
  fromAddress: string;    // só o endereço: "joao@empresa.com"
  subject: string;
  bodyText: string;       // texto puro (sem HTML)
  spfOk: boolean;
  dkimOk: boolean;
}

// Converte "Nome <email@ex.com>" → "email@ex.com"
function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

// Prefixo que usamos para o campo `phone` de contatos/conversas de e-mail
// Permite identificar conversas de e-mail sem mudar o schema existente
export const EMAIL_PHONE_PREFIX = 'email:';
export function emailToPhone(email: string): string {
  return `${EMAIL_PHONE_PREFIX}${email}`;
}

// Rate-limit: no máximo 10 e-mails por hora por remetente (ADR 021 D8)
const RATE_LIMIT_COUNT = Number(process.env.EMAIL_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hora

interface RateBucket {
  count: number;
  windowStart: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');
  private rateBuckets = new Map<string, RateBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly agent: ConversationAgentService,
    private readonly notifications: NotificationsService,
    private readonly emailReply: EmailReplyService,
  ) {}

  /** Normaliza o payload Mailgun (form-encoded) para uma estrutura limpa. */
  normalize(body: Record<string, string>): NormalizedEmail {
    const from = body['from'] ?? body['From'] ?? '';
    const subject = body['subject'] ?? body['Subject'] ?? '(sem assunto)';
    // Mailgun envia "stripped-text" (texto sem assinatura) ou "body-plain"
    const bodyText = (body['stripped-text'] ?? body['body-plain'] ?? '').trim();

    // Validação SPF/DKIM — headers injetados pelo Mailgun antes de chamar o webhook
    const spfHeader = (body['X-Mailgun-Spf'] ?? '').toLowerCase();
    const dkimHeader = (body['X-Mailgun-Dkim-Check-Result'] ?? '').toLowerCase();
    const spfOk = spfHeader === 'pass' || spfHeader === '';   // empty = dev/sem config
    const dkimOk = dkimHeader === 'yes' || dkimHeader === '';

    return {
      from,
      fromAddress: extractEmail(from),
      subject,
      bodyText,
      spfOk,
      dkimOk,
    };
  }

  /** Verifica e incrementa o rate-limit por remetente. */
  private checkRateLimit(email: string): boolean {
    const now = Date.now();
    const bucket = this.rateBuckets.get(email);
    if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
      this.rateBuckets.set(email, { count: 1, windowStart: now });
      return true; // OK
    }
    if (bucket.count >= RATE_LIMIT_COUNT) {
      return false; // Excedido
    }
    bucket.count++;
    return true;
  }

  /** Pipeline completo: recebe e-mail → classifica → responde. */
  async process(rawBody: Record<string, string>, tenantId = 'default') {
    const n = this.normalize(rawBody);

    // Validação SPF/DKIM (D8 — rejeitar se explicitamente FAIL)
    const spfFail = (rawBody['X-Mailgun-Spf'] ?? '').toLowerCase() === 'fail';
    const dkimFail = (rawBody['X-Mailgun-Dkim-Check-Result'] ?? '').toLowerCase() === 'no';
    if (spfFail || dkimFail) {
      this.logger.warn(`E-mail rejeitado por falha SPF/DKIM: ${n.fromAddress} spf=${rawBody['X-Mailgun-Spf']} dkim=${rawBody['X-Mailgun-Dkim-Check-Result']}`);
      return { ignored: true, reason: 'spf_dkim_fail' };
    }

    if (!n.fromAddress || !n.fromAddress.includes('@')) {
      return { ignored: true, reason: 'invalid_from' };
    }
    if (!n.bodyText) {
      return { ignored: true, reason: 'empty_body' };
    }

    // Rate-limit por remetente (D8)
    if (!this.checkRateLimit(n.fromAddress)) {
      this.logger.warn(`Rate-limit atingido para ${n.fromAddress} — e-mail ignorado`);
      return { ignored: true, reason: 'rate_limit' };
    }

    // 1) Upsert contato por e-mail (chave: tenantId + email)
    // Usa synthetic phone = "email:<addr>" para compatibilidade com o pipeline
    const syntheticPhone = emailToPhone(n.fromAddress);
    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: syntheticPhone } },
      update: { email: n.fromAddress, source: 'email' },
      create: {
        tenantId,
        phone: syntheticPhone,
        email: n.fromAddress,
        source: 'email',
        nameSource: 'pushname',
        tags: [],
      },
    });

    // 2) Contato opted_out → NÃO responde (LGPD)
    if (contact.status === 'opted_out') {
      this.logger.warn(`Contato opted_out enviou e-mail (${n.fromAddress}) — IA NÃO responde`);
      return { ignored: true, reason: 'opted_out' };
    }

    // 3) Acha ou cria conversa aberta
    let conv = await this.prisma.aiConversation.findFirst({
      where: {
        tenantId,
        phone: syntheticPhone,
        status: { in: ['open', 'waiting_customer', 'waiting_internal', 'escalated', 'closed'] as any },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!conv) {
      conv = await this.conversations.create(tenantId, {
        contactId: contact.id,
        phone: syntheticPhone,
        sourceChannel: 'email',
      });
    } else if ((conv.status as string) === 'closed') {
      this.logger.log(`Conversa de e-mail ${conv.id} reaberta — ${n.fromAddress}`);
      await this.prisma.aiConversation.update({
        where: { id: conv.id },
        data: { status: 'open' as any, endedAt: null, lastActivityAt: new Date() },
      });
      conv = { ...conv, status: 'open' as any, endedAt: null };
    }

    // 4) Grava mensagem inbound
    await this.conversations.addMessage(tenantId, conv.id, {
      direction: 'inbound',
      content: n.bodyText,
      metadata: { channel: 'email', subject: n.subject, from: n.from },
    });

    // 5) Processa com a Lia (mesmo pipeline do WhatsApp)
    const agentResult = await this.agent.handle(tenantId, {
      message: n.bodyText,
      conversationId: conv.id,
    });

    // 6) Envia resposta por e-mail
    // O ConversationAgentService salva a mensagem outbound no banco;
    // aqui enviamos fisicamente o e-mail (o autoSent=true já gravou no histórico).
    const draft = agentResult.draft;
    if (draft) {
      const reSubject = n.subject.startsWith('Re:') ? n.subject : `Re: ${n.subject}`;
      const replyTo = process.env.MAILGUN_REPLY_TO; // endereço de resposta da empresa

      await this.emailReply.send({
        to: n.fromAddress,
        subject: reSubject,
        body: draft,
        replyTo,
        tenantId,
        contactId: contact.id,
        leadScore: agentResult.route?.leadScore,
      });
    }

    return {
      ok: true,
      email: n.fromAddress,
      conversationId: conv.id,
      agent: agentResult.route?.agent,
      replied: !!draft,
    };
  }
}
