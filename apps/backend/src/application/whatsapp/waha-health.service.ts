import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';

/**
 * WahaHealthService — monitora a sessão do WhatsApp (WAHA).
 *
 * - Health-check a cada 3 min: consulta o status da sessão.
 * - Auto-religa (POST /sessions/{s}/start) quando a sessão NÃO está WORKING.
 * - Alerta em 3 canais (painel / e-mail / WhatsApp do admin) com cooldown anti-spam.
 * - Avisa quando a sessão volta (recuperação).
 *
 * Variáveis de ambiente:
 *   WAHA_API_URL, WAHA_API_KEY, WAHA_SESSION  — já usadas pelo resto do WAHA
 *   ALERT_ADMIN_PHONE   — número (ex: 5511999999999) p/ alerta no WhatsApp
 *   ALERT_ADMIN_EMAIL   — e-mail do admin p/ alerta por e-mail
 *   ALERT_TENANT_ID     — (opcional) tenant que recebe a notificação no painel;
 *                         se vazio, notifica todos os tenants ativos
 *   EMAIL_SMTP_HOST/PORT/SECURE/USER/PASS/FROM_NAME — SMTP p/ o e-mail de alerta
 */
@Injectable()
export class WahaHealthService {
  private readonly logger = new Logger('WahaHealth');
  private downSince: number | null = null;
  private lastAlertAt = 0;
  private readonly ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min entre alertas de "ainda fora"
  private checking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly waha: WahaClientService,
  ) {}

  private get baseUrl() { return process.env.WAHA_API_URL ?? ''; }
  private get session() { return process.env.WAHA_SESSION ?? 'default'; }
  private get apiKey() { return process.env.WAHA_API_KEY ?? ''; }
  private get configured() { return !!this.baseUrl && !!this.apiKey; }

  private sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

  /** Lê o status atual da sessão no WAHA. Retorna o status ou um código de erro. */
  private async getStatus(): Promise<string> {
    if (!this.configured) return 'NOT_CONFIGURED';
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions/${this.session}`, {
        headers: { 'X-Api-Key': this.apiKey },
      });
      if (!res.ok) return `HTTP_${res.status}`;
      const data = (await res.json()) as any;
      return String(data?.status ?? 'UNKNOWN');
    } catch (e: any) {
      this.logger.warn(`getStatus falhou: ${e?.message}`);
      return 'UNREACHABLE';
    }
  }

  /** Tenta religar a sessão (auto-restart). */
  private async tryStart(): Promise<boolean> {
    if (!this.configured) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/sessions/${this.session}/start`, {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: '{}',
      });
      this.logger.log(`tryStart: HTTP ${res.status}`);
      return res.ok;
    } catch (e: any) {
      this.logger.warn(`tryStart falhou: ${e?.message}`);
      return false;
    }
  }

  @Interval(180000) // 3 min
  async healthCheck(): Promise<void> {
    if (!this.configured || this.checking) return;
    this.checking = true;
    try {
      const status = await this.getStatus();
      if (status === 'WORKING') {
        if (this.downSince) {
          const downMin = Math.round((Date.now() - this.downSince) / 60000);
          await this.alert(
            '✅ WhatsApp reconectado',
            `A sessão do WhatsApp voltou a funcionar (estava fora há ~${downMin} min).`,
          );
          this.downSince = null;
        }
        return;
      }

      // não está WORKING
      if (!this.downSince) this.downSince = Date.now();
      this.logger.warn(`Sessão WhatsApp fora do ar (status=${status}) — tentando religar...`);
      await this.tryStart();

      // aguarda a sessão voltar (poll até ~30s) — o restart passa por STARTING antes de WORKING
      let status2 = status;
      for (let i = 0; i < 6; i++) {
        await this.sleep(5000);
        status2 = await this.getStatus();
        if (status2 === 'WORKING') break;
      }

      if (status2 === 'WORKING') {
        await this.alert(
          '🔄 WhatsApp reconectado automaticamente',
          `A sessão caiu (status anterior: ${status}) e foi religada automaticamente. Sem ação necessária.`,
        );
        this.downSince = null;
        return;
      }

      // ainda inicializando dentro da janela de 10 min → não alarma, espera o próximo ciclo
      const downMs = Date.now() - this.downSince;
      if (status2 === 'STARTING' && downMs < 10 * 60 * 1000) {
        this.logger.warn(`Sessão ainda STARTING (há ${Math.round(downMs / 1000)}s) — aguardando próximo ciclo.`);
        return;
      }

      // ainda fora (STOPPED/FAILED/SCAN_QR_CODE/UNREACHABLE ou STARTING travado) → alerta crítico com cooldown
      if (Date.now() - this.lastAlertAt > this.ALERT_COOLDOWN_MS) {
        this.lastAlertAt = Date.now();
        await this.alert(
          '🔴 WhatsApp FORA DO AR',
          `A sessão do WhatsApp está "${status2}" e o auto-restart não resolveu. ` +
            `A Lia NÃO está recebendo nem respondendo mensagens. ` +
            `Verifique o WAHA (pode precisar reparear o QR).`,
        );
      }
    } finally {
      this.checking = false;
    }
  }

  /** Reage ao evento session.status do WAHA (webhook) — delega ao health-check. */
  async handleStatusEvent(rawBody: any): Promise<void> {
    const p = rawBody?.payload ?? rawBody?.body?.payload ?? rawBody ?? {};
    const status = String(p?.status ?? p?.state ?? '').toUpperCase();
    this.logger.log(`[session.status] ${status || '(sem status)'}`);
    // Qualquer mudança dispara uma verificação. O flag `checking` coalesce chamadas
    // concorrentes (STOPPED/STARTING/WORKING do mesmo ciclo) — evita alerta/notif. duplicados.
    await this.healthCheck();
  }

  /** Dispara o alerta nos canais configurados (best-effort, nunca derruba o fluxo). */
  private async alert(title: string, body: string): Promise<void> {
    await Promise.allSettled([
      this.notifyPanel(title, body),
      this.notifyEmail(title, body),
      this.notifyWhatsapp(`${title}\n\n${body}`),
    ]);
  }

  private async notifyPanel(title: string, body: string): Promise<void> {
    try {
      const fixed = process.env.ALERT_TENANT_ID;
      let tenantIds: string[];
      if (fixed) {
        tenantIds = [fixed];
      } else {
        const tenants = await this.prisma.tenant.findMany({
          where: { status: 'active' },
          select: { id: true },
        });
        tenantIds = tenants.map((t) => t.id);
      }
      for (const tenantId of tenantIds) {
        await this.notifications.create(tenantId, { type: 'info', title, body, link: '/settings' });
      }
    } catch (e: any) {
      this.logger.warn(`notifyPanel falhou: ${e?.message}`);
    }
  }

  private async notifyWhatsapp(text: string): Promise<void> {
    const phone = (process.env.ALERT_ADMIN_PHONE ?? '').replace(/\D/g, '');
    if (!phone) return;
    // A sessão pode ter acabado de voltar a WORKING e ainda não estar pronta p/ enviar
    // (WAHA responde 500). Tenta algumas vezes, espaçado, antes de desistir.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await this.waha.sendText(phone, text);
        if (r.sent) return;
        this.logger.warn(`alerta WhatsApp não enviado (tentativa ${attempt}/3): ${r.reason}`);
      } catch (e: any) {
        this.logger.warn(`notifyWhatsapp falhou (tentativa ${attempt}/3): ${e?.message}`);
      }
      if (attempt < 3) await this.sleep(6000);
    }
  }

  private async notifyEmail(subject: string, body: string): Promise<void> {
    const to = process.env.ALERT_ADMIN_EMAIL;
    if (!to) return;

    // Resolve SMTP: canal de e-mail ATIVO no banco (mesma conta da Lia) OU fallback .env.
    let host: string | undefined;
    let user: string | undefined;
    let pass: string | undefined;
    let port = 465;
    let secure = true;
    let fromName = 'Nexa Monitor';

    const ch = await this.prisma.emailChannel
      .findFirst({ where: { isActive: true } })
      .catch(() => null);
    if (ch?.smtpHost && ch.smtpUser && ch.smtpPass) {
      host = ch.smtpHost;
      user = ch.smtpUser;
      pass = ch.smtpPass;
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
    if (!host || !user || !pass) return;

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
      });
      await transporter.sendMail({
        from: `"${fromName}" <${user}>`,
        to,
        subject: `[Nexa] ${subject}`,
        text: body,
      });
    } catch (e: any) {
      this.logger.warn(`notifyEmail falhou: ${e?.message}`);
    }
  }
}
