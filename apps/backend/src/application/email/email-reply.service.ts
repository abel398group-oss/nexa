/**
 * EmailReplyService — ADR 021 D5
 *
 * Envia respostas da Lia por SMTP (Hostgator / qualquer servidor cPanel).
 *
 * Configuração via EmailChannel no banco (por tenant) ou .env como fallback:
 *   EMAIL_SMTP_HOST   mail.hipertms.com.br
 *   EMAIL_SMTP_PORT   465
 *   EMAIL_SMTP_USER   lia@hipertms.com.br
 *   EMAIL_SMTP_PASS   <senha>
 *   EMAIL_FROM_NAME   Lia HiperTMS
 *   EMAIL_REPLY_TO    contato@hipertms.com.br
 *   APP_BASE_URL      https://api.hipervias.com.br
 */
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailOptOutService } from './email-optout.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';

const SIGNATURE = 'Lia · Assistente HiperTMS | hipertms.com.br';

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
  body: string;
  tenantId: string;
  contactId: string;
  leadScore?: number;
  inReplyToSubject?: string; // assunto original para o Re:
}

// Configuração SMTP resolvida (banco ou .env)
interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

@Injectable()
export class EmailReplyService {
  private readonly logger = new Logger('EmailReplyService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly optout: EmailOptOutService,
    private readonly crypto: EmailCryptoService,
  ) {}

  /** Resolve configuração SMTP: banco (por tenant) ou fallback .env. */
  private async resolveConfig(tenantId: string): Promise<SmtpConfig | null> {
    // Tenta buscar configuração do tenant no banco
    const ch = await this.prisma.emailChannel.findUnique({
      where: { tenantId },
    }).catch(() => null);

    if (ch?.isActive && ch.smtpUser && ch.smtpPass) {
      return {
        host: ch.smtpHost,
        port: ch.smtpPort,
        secure: ch.smtpSecure,
        user: ch.smtpUser,
        pass: this.crypto.decrypt(ch.smtpPass), // decripta AES-256-GCM
        fromEmail: ch.fromEmail,
        fromName: ch.fromName,
        replyTo: ch.replyTo ?? undefined,
      };
    }

    // Fallback: variáveis de ambiente
    const host = process.env.EMAIL_SMTP_HOST;
    const user = process.env.EMAIL_SMTP_USER;
    const pass = process.env.EMAIL_SMTP_PASS;
    if (!host || !user || !pass) return null;

    return {
      host,
      port: Number(process.env.EMAIL_SMTP_PORT ?? 465),
      secure: (process.env.EMAIL_SMTP_SECURE ?? 'true') !== 'false',
      user,
      pass,
      fromEmail: user,
      fromName: process.env.EMAIL_FROM_NAME ?? 'Lia HiperTMS',
      replyTo: process.env.EMAIL_REPLY_TO,
    };
  }

  async send(opts: SendEmailOptions): Promise<{ sent: boolean; reason?: string }> {
    const config = await this.resolveConfig(opts.tenantId);

    if (!config) {
      this.logger.warn(
        'Configuração SMTP não encontrada (banco nem .env) — e-mail não enviado (dev mode)',
      );
      this.logger.debug(`[dev] Para: ${opts.to} | ${opts.subject}\n${opts.body}`);
      return { sent: false, reason: 'smtp_not_configured' };
    }

    // Gera token de opt-out (TTL 30 dias)
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
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

    const subject =
      opts.inReplyToSubject
        ? (opts.inReplyToSubject.startsWith('Re:') ? opts.inReplyToSubject : `Re: ${opts.inReplyToSubject}`)
        : opts.subject;

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure, // true = SSL/TLS (porta 465)
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false }, // Hostgator usa certificado cPanel, pode não ter CA raiz
    });

    try {
      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: opts.to,
        subject,
        text: bodyText,
        replyTo: config.replyTo,
      });

      this.logger.log(`E-mail enviado via SMTP para ${opts.to} (tenant=${opts.tenantId})`);
      return { sent: true };
    } catch (err: any) {
      this.logger.error(`Erro SMTP ao enviar para ${opts.to}: ${err?.message}`);
      return { sent: false, reason: `smtp_error: ${err?.message}` };
    }
  }

  /**
   * Envia e-mail operacional (alerta do Monitor Proativo) sem opt-out link e sem rastreamento de contato.
   * Usado para notificações admin-para-admin, não para marketing.
   *
   * Quando `html` é fornecido, o e-mail é enviado como multipart (text/plain fallback + text/html).
   * Clientes que não suportam HTML recebem o `text` simples; os demais veem o template rico.
   */
  async sendAlertEmail(
    to: string,
    subject: string,
    text: string,
    tenantId: string,
    html?: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const config = await this.resolveConfig(tenantId);
    if (!config) {
      this.logger.warn(`sendAlertEmail: SMTP não configurado para tenant ${tenantId} — e-mail não enviado`);
      return { sent: false, reason: 'smtp_not_configured' };
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false },
    });

    try {
      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to,
        subject,
        text: `${text}\n\n--\n${SIGNATURE}`,
        ...(html ? { html } : {}),
        replyTo: config.replyTo,
      });
      this.logger.log(`sendAlertEmail: enviado para ${to} (tenant=${tenantId})`);
      return { sent: true };
    } catch (err: any) {
      this.logger.error(`sendAlertEmail: erro SMTP para ${to}: ${err?.message}`);
      return { sent: false, reason: `smtp_error: ${err?.message}` };
    }
  }
}
