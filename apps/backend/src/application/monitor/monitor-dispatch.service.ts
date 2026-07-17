/**
 * MonitorDispatchService — fila de envio de alertas WhatsApp (A4).
 *
 * Por que existe: com muitos tenants configurados no mesmo horário, o envio
 * sequencial dentro do tick de 5min do ConsolidationService atrasa e não tem
 * retry. Aqui os envios viram JOBS numa fila em memória com:
 *   - rate-limit global (DISPATCH_MAX_PER_MINUTE, default 30/min)
 *   - retry com backoff (30s → 2min → 10min, DISPATCH_MAX_ATTEMPTS default 3)
 *   - jitter opcional (espalha horários populares tipo 8h/15h30)
 *   - log persistido em notificationLog (sucesso e falha final)
 *
 * Limitação consciente: fila em memória = single-replica (deploy atual é 1
 * container). Se o Nexa escalar horizontalmente, migrar para BullMQ (Redis já
 * está no stack) mantendo esta mesma interface pública (enqueue).
 */
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NOTIFICATION_CHANNEL, NotificationChannel } from './notification-channel.interface';

export interface DispatchJob {
  tenantId: string;
  /** Telefone normalizado (com DDI). */
  to: string;
  message: string;
  /** Origem para log/debug (ex: 'sector:fiscal', 'legacy'). */
  origin?: string;
  attempt?: number;
  /** Não despachar antes deste timestamp (jitter/backoff). */
  notBefore?: number;
}

const BACKOFF_MS = [30_000, 120_000, 600_000]; // 30s, 2min, 10min

@Injectable()
export class MonitorDispatchService implements OnModuleDestroy {
  private readonly logger = new Logger('MonitorDispatch');

  private readonly queue: DispatchJob[] = [];
  private readonly timer: NodeJS.Timeout;
  private sentInWindow = 0;
  private windowStart = Date.now();
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {
    // Processa a fila a cada 2s — granularidade suficiente para o rate-limit por minuto.
    this.timer = setInterval(() => void this.drain(), 2_000);
    this.timer.unref?.(); // não segura o processo vivo (testes/shutdown)
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private get maxPerMinute(): number {
    return Number(process.env.DISPATCH_MAX_PER_MINUTE ?? 30);
  }

  private get maxAttempts(): number {
    return Number(process.env.DISPATCH_MAX_ATTEMPTS ?? 3);
  }

  /**
   * Enfileira um envio. jitterMs > 0 espalha o disparo em até jitterMs.
   *
   * T9: se o CALLER já mandar um `job.notBefore` explícito (ex.: "hold" de um
   * CRITICAL fora da janela de envio, reagendado pra próxima abertura —
   * ver `MonitorService.sendAlertsToAdmins`), ele é respeitado tal como está —
   * NUNCA sobrescrito pelo jitter. Sem `notBefore` explícito, mantém o
   * comportamento pré-T9 (jitter a partir de agora).
   */
  enqueue(job: DispatchJob, jitterMs = 0): void {
    const hasExplicitNotBefore = job.notBefore !== undefined;
    const delay = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
    const notBefore = hasExplicitNotBefore ? job.notBefore! : Date.now() + delay;
    this.queue.push({ ...job, attempt: job.attempt ?? 0, notBefore });
    this.logger.debug(
      `enqueued to=${job.to} tenant=${job.tenantId} origin=${job.origin ?? '-'} ` +
        (hasExplicitNotBefore
          ? `notBefore=${new Date(notBefore).toISOString()} (hold)`
          : `delay=${delay}ms`) +
        ` fila=${this.queue.length}`,
    );
  }

  /** Tamanho atual da fila — exposto para health/monitoramento (MON-007). */
  get pending(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.draining || this.queue.length === 0) return;
    this.draining = true;
    try {
      const now = Date.now();
      // Janela deslizante de 1 min para o rate-limit
      if (now - this.windowStart >= 60_000) {
        this.windowStart = now;
        this.sentInWindow = 0;
      }

      while (this.queue.length > 0 && this.sentInWindow < this.maxPerMinute) {
        const idx = this.queue.findIndex((j) => (j.notBefore ?? 0) <= Date.now());
        if (idx === -1) break; // todos aguardando backoff/jitter
        const job = this.queue.splice(idx, 1)[0];
        this.sentInWindow++;
        await this.process(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async process(job: DispatchJob): Promise<void> {
    let success = false;
    let error: string | undefined;
    try {
      const result = await this.channel.sendTo(job.tenantId, job.to, job.message);
      success = result.sent;
      if (!success) error = result.reason;
    } catch (e: any) {
      error = e?.message?.slice(0, 500);
    }

    if (success) {
      await this.log(job, true);
      return;
    }

    const attempt = (job.attempt ?? 0) + 1;
    if (attempt < this.maxAttempts) {
      const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      this.logger.warn(
        `envio falhou (to=${job.to} tenant=${job.tenantId} tentativa=${attempt}/${this.maxAttempts}): ${error} — retry em ${backoff / 1000}s`,
      );
      this.queue.push({ ...job, attempt, notBefore: Date.now() + backoff });
      return;
    }

    // Falha definitiva: loga no banco e avisa no log com destaque.
    this.logger.error(
      `envio DESISTIDO após ${this.maxAttempts} tentativas (to=${job.to} tenant=${job.tenantId} origin=${job.origin ?? '-'}): ${error}`,
    );
    await this.log(job, false, error);
  }

  private async log(job: DispatchJob, success: boolean, error?: string): Promise<void> {
    await this.prisma.notificationLog
      .create({
        data: {
          tenantId: job.tenantId,
          channel: 'whatsapp',
          content: job.message,
          success,
          error: error ?? null,
        },
      })
      .catch((e: any) => this.logger.warn(`Log de notificação falhou: ${e?.message}`));
  }
}
