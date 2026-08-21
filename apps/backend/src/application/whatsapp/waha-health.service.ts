import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { WahaClientService, LINHA_PRINCIPAL, linhasConfiguradas } from '@/shared/waha/waha-client.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';
import { parseAdminPhones } from '@/application/monitor/admin-phones.util';

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
  /**
   * Estado por LINHA (21/08/2026). O monitor nasceu olhando só a sessão
   * principal; a linha `vendas` podia cair e ficar caída para sempre — sem
   * auto-restart e sem alerta — enquanto o worker de campanha queimava a fila.
   * Agora cada linha declarada em WAHA_LINHAS tem o próprio downSince/cooldown.
   */
  private readonly downSince = new Map<string, number>();
  private readonly lastAlertAt = new Map<string, number>();
  private readonly ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min entre alertas de "ainda fora"
  private checking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly waha: WahaClientService,
    private readonly crypto: EmailCryptoService,
  ) {}

  private get configured() { return this.waha.configured; }

  /** Linhas que este monitor cobre: as declaradas E com env presente. */
  private linhasMonitoradas(): string[] {
    return linhasConfiguradas().filter((l) => this.waha.linhaEstaConfigurada(l));
  }

  /** Rótulo para log/alerta: a principal fica sem sufixo (compatível com o texto de sempre). */
  private rotulo(linha: string): string {
    return linha === LINHA_PRINCIPAL ? '' : ` (linha ${linha})`;
  }

  private sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

  /**
   * Prazos destes dois fetch. Este serviço era o ÚNICO lugar que falava com o
   * WAHA sem timeout — o WahaClientService já usa AbortSignal.timeout em todas
   * as chamadas dele desde sempre.
   *
   * O que isso custava: WAHA aceitando a conexão e nunca respondendo (travado,
   * não caído — o caso mais comum quando o container está sobrecarregado) fazia
   * o `fetch` esperar para sempre. Aí o `finally` que devolve `this.checking`
   * para false NUNCA rodava, e todo healthCheck seguinte voltava na primeira
   * linha, no `if (this.checking) return`.
   *
   * Resultado: o monitor da sessão do WhatsApp morria em silêncio até alguém
   * reiniciar o backend. Sem auto-restart, sem alerta "WhatsApp FORA DO AR" —
   * exatamente quando mais se precisa dele. E o GET /api/whatsapp/status do
   * painel ficava pendurado junto, em vez de dizer que não deu para consultar.
   */
  private static readonly STATUS_TIMEOUT_MS = 8_000;
  private static readonly START_TIMEOUT_MS = 15_000;

  /** Lê o status atual da sessão da LINHA no WAHA. Retorna o status ou um código de erro. */
  private async getStatus(linha: string = LINHA_PRINCIPAL): Promise<string> {
    const alvo = this.waha.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return 'NOT_CONFIGURED';
    try {
      const res = await fetch(`${alvo.baseUrl}/api/sessions/${alvo.session}`, {
        headers: { 'X-Api-Key': alvo.apiKey },
        signal: AbortSignal.timeout(WahaHealthService.STATUS_TIMEOUT_MS),
      });
      if (!res.ok) return `HTTP_${res.status}`;
      const data = (await res.json()) as any;
      return String(data?.status ?? 'UNKNOWN');
    } catch (e: any) {
      // Estourar o prazo é 'UNREACHABLE' do mesmo jeito que a conexão recusada:
      // dos dois lados a Lia não está atendendo, e é isso que o painel precisa
      // dizer. O motivo exato fica no log.
      this.logger.warn(`getStatus${this.rotulo(linha)} falhou: ${e?.message}`);
      return 'UNREACHABLE';
    }
  }

  /** Tenta religar a sessão da LINHA (auto-restart). */
  private async tryStart(linha: string = LINHA_PRINCIPAL): Promise<boolean> {
    const alvo = this.waha.resolveLinha(linha);
    if (!alvo.baseUrl || !alvo.apiKey) return false;
    try {
      const res = await fetch(`${alvo.baseUrl}/api/sessions/${alvo.session}/start`, {
        method: 'POST',
        headers: { 'X-Api-Key': alvo.apiKey, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(WahaHealthService.START_TIMEOUT_MS),
      });
      this.logger.log(`tryStart${this.rotulo(linha)}: HTTP ${res.status}`);
      return res.ok;
    } catch (e: any) {
      this.logger.warn(`tryStart${this.rotulo(linha)} falhou: ${e?.message}`);
      return false;
    }
  }

  @Interval(180000) // 3 min
  async healthCheck(): Promise<void> {
    if (!this.configured || this.checking) return;
    this.checking = true;
    try {
      // Sequencial de propósito: são no máximo 2-3 linhas, e paralelizar os polls
      // de recuperação (30s cada) multiplicaria fetches concorrentes num container
      // que pode estar justamente sobrecarregado.
      for (const linha of this.linhasMonitoradas()) {
        await this.checkLinha(linha);
      }
    } finally {
      this.checking = false;
    }
  }

  private async checkLinha(linha: string): Promise<void> {
    const rotulo = this.rotulo(linha);
    const status = await this.getStatus(linha);
    if (status === 'WORKING') {
      const caiuEm = this.downSince.get(linha);
      if (caiuEm) {
        const downMin = Math.round((Date.now() - caiuEm) / 60000);
        await this.alert(
          `✅ WhatsApp reconectado${rotulo}`,
          `A sessão do WhatsApp${rotulo} voltou a funcionar (estava fora há ~${downMin} min).`,
        );
        this.downSince.delete(linha);
      }
      return;
    }

    // não está WORKING
    if (!this.downSince.has(linha)) this.downSince.set(linha, Date.now());
    this.logger.warn(`Sessão WhatsApp${rotulo} fora do ar (status=${status}) — tentando religar...`);
    await this.tryStart(linha);

    // aguarda a sessão voltar (poll até ~30s) — o restart passa por STARTING antes de WORKING
    let status2 = status;
    for (let i = 0; i < 6; i++) {
      await this.sleep(5000);
      status2 = await this.getStatus(linha);
      if (status2 === 'WORKING') break;
    }

    if (status2 === 'WORKING') {
      await this.alert(
        `🔄 WhatsApp reconectado automaticamente${rotulo}`,
        `A sessão${rotulo} caiu (status anterior: ${status}) e foi religada automaticamente. Sem ação necessária.`,
      );
      this.downSince.delete(linha);
      return;
    }

    // ainda inicializando dentro da janela de 10 min → não alarma, espera o próximo ciclo
    const downMs = Date.now() - (this.downSince.get(linha) ?? Date.now());
    if (status2 === 'STARTING' && downMs < 10 * 60 * 1000) {
      this.logger.warn(`Sessão${rotulo} ainda STARTING (há ${Math.round(downMs / 1000)}s) — aguardando próximo ciclo.`);
      return;
    }

    // ainda fora (STOPPED/FAILED/SCAN_QR_CODE/UNREACHABLE ou STARTING travado) → alerta crítico com cooldown
    if (Date.now() - (this.lastAlertAt.get(linha) ?? 0) > this.ALERT_COOLDOWN_MS) {
      this.lastAlertAt.set(linha, Date.now());
      const impacto = linha === LINHA_PRINCIPAL
        ? 'A Lia NÃO está recebendo nem respondendo mensagens.'
        : `A linha "${linha}" NÃO está enviando — o disparo de campanha desta linha está segurado até ela voltar.`;
      await this.alert(
        `🔴 WhatsApp FORA DO AR${rotulo}`,
        `A sessão do WhatsApp${rotulo} está "${status2}" e o auto-restart não resolveu. ` +
          `${impacto} Verifique o WAHA (pode precisar reparear o QR).`,
      );
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

  /**
   * Status atual da sessão p/ o painel (GET /api/whatsapp/status).
   *
   * O corpo de sempre continua descrevendo a PRINCIPAL (o painel já consome esse
   * formato); `linhas` é ADITIVO e traz as demais — contrato retrocompatível.
   */
  async getHealth(): Promise<{
    configured: boolean;
    status: string;
    connected: boolean;
    downSince: string | null;
    downMinutes: number | null;
    checkedAt: string;
    linhas: { linha: string; status: string; connected: boolean; downSince: string | null }[];
  }> {
    const linhas = await Promise.all(
      this.linhasMonitoradas().map(async (linha) => {
        const st = await this.getStatus(linha);
        const caiuEm = this.downSince.get(linha);
        return {
          linha,
          status: st,
          connected: st === 'WORKING',
          downSince: caiuEm ? new Date(caiuEm).toISOString() : null,
        };
      }),
    );
    const principal = linhas.find((l) => l.linha === LINHA_PRINCIPAL);
    const caiuEm = this.downSince.get(LINHA_PRINCIPAL);
    return {
      configured: this.configured,
      status: principal?.status ?? 'NOT_CONFIGURED',
      connected: principal?.connected ?? false,
      downSince: principal?.downSince ?? null,
      downMinutes: caiuEm ? Math.round((Date.now() - caiuEm) / 60000) : null,
      checkedAt: new Date().toISOString(),
      linhas,
    };
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
        tenantIds = tenants.map((t: { id: string }) => t.id);
      }
      for (const tenantId of tenantIds) {
        await this.notifications.create(tenantId, { type: 'info', title, body, link: '/settings' });
      }
    } catch (e: any) {
      this.logger.warn(`notifyPanel falhou: ${e?.message}`);
    }
  }

  private async notifyWhatsapp(text: string): Promise<void> {
    // BUGFIX (2026-07-22): ALERT_ADMIN_PHONE pode ter VÁRIOS números por vírgula.
    // O `.replace(/\D/g,'')` na string inteira concatenava tudo num número
    // inválido de 26 dígitos e o alerta de WAHA no WhatsApp nunca saía (só o
    // e-mail). Agora usa parseAdminPhones e avisa cada admin.
    const phones = parseAdminPhones(process.env.ALERT_ADMIN_PHONE);
    if (!phones.length) return;
    for (const phone of phones) {
      // A sessão pode ter acabado de voltar a WORKING e ainda não estar pronta p/
      // enviar (WAHA responde 500). Tenta algumas vezes, espaçado, antes de desistir.
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const r = await this.waha.sendText(phone, text, { origin: 'admin' });
          if (r.sent) break;
          this.logger.warn(`alerta WhatsApp não enviado a ${phone} (tentativa ${attempt}/3): ${r.reason}`);
        } catch (e: any) {
          this.logger.warn(`notifyWhatsapp ${phone} falhou (tentativa ${attempt}/3): ${e?.message}`);
        }
        if (attempt < 3) await this.sleep(6000);
      }
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

    // Usa o canal salvo mesmo se desativado (prefere o ativo). Assim dá p/ ter
    // alerta por e-mail sem ligar a leitura automática de e-mails da Lia.
    const ch = await this.prisma.emailChannel
      .findFirst({ orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }] })
      .catch(() => null);
    if (ch?.smtpHost && ch.smtpUser && ch.smtpPass) {
      host = ch.smtpHost;
      user = ch.smtpUser;
      pass = this.crypto.decrypt(ch.smtpPass); // decripta AES-256-GCM
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
        // DISP-012: o health check roda em intervalo — um SMTP travado aqui
        // seguraria o ciclo inteiro de monitoramento da sessão do WhatsApp.
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
    } catch (e: any) {
      this.logger.warn(`notifyEmail falhou: ${e?.message}`);
    }
  }
}
