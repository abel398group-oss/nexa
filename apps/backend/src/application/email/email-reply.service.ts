/**
 * EmailReplyService — ADR 021 D5
 *
 * Envia respostas da Lia por e-mail via Mailgun HTTP API.
 * Formato: plain text + assinatura + link de opt-out.
 *
 * Configuração (.env):
 *   MAILGUN_API_KEY   — chave da API Mailgun (obrigatório para envio)
 *   MAILGUN_DOMAIN    — domínio Mailgun (ex: mg.hipervias.com.br)
 *   MAILGUN_FROM      — endereço remetente (ex: Lia <lia@mg.hipervias.com.br>)
 *   APP_BASE_URL      — URL base do backend (ex: https://api.hipervias.com.br)
 */
import { Injectable, Logger } from '@nestjs/common';
import { EmailOptOutService } from './email-optout.service';

const SIGNATURE = 'Lia · Assistente HiperTMS | hipervias.com.br';

// Stripe markdown simples (a Lia pode ter gerado texto com negrito etc.)
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;        // rascunho da Lia (plain text)
  replyTo?: string;
  tenantId: string;
  contactId: string;
  leadScore?: number;  // ≥40 → convite WhatsApp (ADR 021 D6)
}

@Injectable()
export class EmailReplyService {
  private readonly logger = new Logger('EmailReplyService');

  constructor(private readonly optout: EmailOptOutService) {}

  async send(opts: SendEmailOptions): Promise<{ sent: boolean; reason?: string }> {
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const from = process.env.MAILGUN_FROM ?? `Lia HiperTMS <lia@${domain ?? 'hipervias.com.br'}>`;
    const baseUrl = process.env.APP_BASE_URL ?? 'https://api.hipervias.com.br';

    if (!apiKey || !domain) {
      this.logger.warn('MAILGUN_API_KEY ou MAILGUN_DOMAIN não configurados — e-mail não enviado (dev mode)');
      this.logger.debug(`[dev] Para: ${opts.to} | Assunto: ${opts.subject}\n${opts.body}`);
      return { sent: false, reason: 'mailgun_not_configured' };
    }

    // Gera token de opt-out (TTL 30 dias, uso único)
    const optOutToken = await this.optout.generateToken(opts.tenantId, opts.contactId, opts.to);
    const optOutUrl = `${baseUrl}/api/email/optout?token=${optOutToken}`;

    // Convite WhatsApp para leads qualificados (score ≥ 40 — ADR 021 D6)
    const waLink = process.env.WHATSAPP_INVITE_LINK ?? 'https://wa.me/5511994327713';
    const waInvite =
      opts.leadScore !== undefined && opts.leadScore >= 40
        ? `\n\nPara agilizar seu atendimento, você também pode nos chamar no WhatsApp: ${waLink}`
        : '';

    const bodyText =
      `${stripMarkdown(opts.body)}${waInvite}\n\n` +
      `--\n${SIGNATURE}\n\n` +
      `Para não receber mais mensagens: ${optOutUrl}`;

    const form = new URLSearchParams();
    form.append('from', from);
    form.append('to', opts.to);
    form.append('subject', opts.subject);
    form.append('text', bodyText);
    if (opts.replyTo) form.append('h:Reply-To', opts.replyTo);

    try {
      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        this.logger.error(`Mailgun erro ${response.status}: ${errText}`);
        return { sent: false, reason: `mailgun_${response.status}` };
      }

      this.logger.log(`E-mail enviado para ${opts.to} (tenant=${opts.tenantId})`);
      return { sent: true };
    } catch (err: any) {
      this.logger.error(`Erro ao enviar e-mail: ${err?.message}`);
      return { sent: false, reason: 'network_error' };
    }
  }
}
