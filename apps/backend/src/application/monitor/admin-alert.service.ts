/**
 * AdminAlertService — canal ÚNICO de aviso pro admin da plataforma, nos DOIS
 * meios: WhatsApp (ALERT_ADMIN_PHONE) + e-mail (ALERT_ADMIN_EMAIL).
 *
 * Extraído (2026-07-21) pra o termômetro de escala e outros monitores de falha
 * mandarem pros dois canais sem reimplementar SMTP. A lógica de e-mail espelha
 * a do WahaHealthService (proven em produção) — este serviço ganhou testes que
 * o waha-health nunca teve; a migração do waha-health pra cá pode vir depois,
 * com rede de segurança.
 *
 * Best-effort: nenhum canal ausente/falho derruba o chamador — só loga.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';
import { parseAdminPhones } from './admin-phones.util';

@Injectable()
export class AdminAlertService {
  private readonly logger = new Logger('AdminAlert');

  constructor(
    private readonly prisma: PrismaService,
    private readonly waha: WahaClientService,
    private readonly crypto: EmailCryptoService,
  ) {}

  /**
   * Avisa o admin no WhatsApp E no e-mail (o que estiver configurado). `body` é
   * texto puro (sirve pros dois). Retorna quais canais saíram — útil pra log/teste.
   */
  /**
   * `opts.icon` troca o emoji da versão WhatsApp. Default ⚠️ porque quase todo
   * chamador aqui é monitor de falha; o resumo diário de visitas do site passa 📊 —
   * marcar informação de rotina com sinal de alerta ensina o leitor a não distinguir
   * mais os dois, e aí o alerta que importa passa batido.
   */
  async notifyAdmin(
    subject: string,
    body: string,
    opts: { icon?: string } = {},
  ): Promise<{ whatsapp: boolean; email: boolean }> {
    const [whatsapp, email] = await Promise.all([
      this.notifyWhatsapp(`${opts.icon ?? '⚠️'} *${subject}*\n\n${body}`),
      this.notifyEmail(subject, body),
    ]);
    return { whatsapp, email };
  }

  private async notifyWhatsapp(text: string): Promise<boolean> {
    const phones = parseAdminPhones(process.env.ALERT_ADMIN_PHONE);
    if (!phones.length) return false;
    // Avisa TODOS os admins listados (ex.: Abel + Uelder), não só o primeiro.
    let anySent = false;
    for (const phone of phones) {
      try {
        const r = await this.waha.sendText(phone, text, { origin: 'admin' });
        if (r.sent) anySent = true;
        else this.logger.warn(`admin WhatsApp não enviado (${phone}): ${r.reason}`);
      } catch (e: any) {
        this.logger.warn(`notifyWhatsapp (admin ${phone}) falhou: ${e?.message}`);
      }
    }
    return anySent;
  }

  private async notifyEmail(subject: string, body: string): Promise<boolean> {
    const to = process.env.ALERT_ADMIN_EMAIL;
    if (!to) return false;

    // SMTP: canal de e-mail salvo no banco (mesma conta da Lia) OU fallback .env
    // — espelha WahaHealthService.notifyEmail.
    let host: string | undefined;
    let user: string | undefined;
    let pass: string | undefined;
    let port = 465;
    let secure = true;
    let fromName = 'Nexa Monitor';

    const ch = await this.prisma.emailChannel
      .findFirst({ orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }] })
      .catch(() => null);
    if (ch?.smtpHost && ch.smtpUser && ch.smtpPass) {
      host = ch.smtpHost;
      user = ch.smtpUser;
      pass = this.crypto.decrypt(ch.smtpPass);
      port = ch.smtpPort;
      secure = ch.smtpSecure;
      fromName = ch.fromName ?? fromName;
    } else {
      host = process.env.EMAIL_SMTP_HOST;
      user = process.env.EMAIL_SMTP_USER;
      pass = process.env.EMAIL_SMTP_PASS;
      port = Number(process.env.EMAIL_SMTP_PORT ?? 465);
      secure = (process.env.EMAIL_SMTP_SECURE ?? 'true') !== 'false';
      fromName = process.env.EMAIL_FROM_NAME ?? fromName;
    }
    if (!host || !user || !pass) return false;

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        // DISP-012: alerta é caminho de incidente — não pode pendurar o worker
        // esperando um SMTP morto (sem isto o nodemailer só desiste no timeout do SO).
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      await transporter.sendMail({
        from: `"${fromName}" <${user}>`,
        to,
        subject: `[Nexa] ${subject}`,
        text: body,
      });
      return true;
    } catch (e: any) {
      this.logger.warn(`notifyEmail (admin) falhou: ${e?.message}`);
      return false;
    }
  }
}
