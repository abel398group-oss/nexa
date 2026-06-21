/**
 * WebhookService — disparo outbound com HMAC-SHA256 e retry.
 *
 * Fluxo:
 *   1. Um módulo de feature chama emit(tenantId, event, payload).
 *   2. WebhookService busca as WebhookSubscription ativas que assinaram o evento.
 *   3. Para cada subscription: cria um WebhookDelivery e tenta a entrega (fetch HTTP).
 *   4. Em caso de falha, agenda retry com backoff exponencial (até MAX_ATTEMPTS).
 *
 * Segurança:
 *   - Cada delivery inclui o header X-Nexa-Signature: sha256=<hmac> calculado com o
 *     secret da subscription (descriptografado no momento do envio).
 *   - O receptor valida o HMAC antes de processar o payload.
 *   - O secret é armazenado criptografado (EmailCryptoService / AES-256-GCM).
 *
 * Observação: o retry corre em memória (@Interval). Para produção com múltiplas
 * instâncias, substituir por BullMQ/Redis queue (registrar como TODO).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHmac } from 'crypto';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';

const MAX_ATTEMPTS = 5;
// Backoff exponencial: [10s, 30s, 2min, 10min, 30min]
const BACKOFF_SECONDS = [10, 30, 120, 600, 1800];

@Injectable()
export class WebhookService {
  private readonly logger = new Logger('WebhookService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EmailCryptoService,
  ) {}

  /** Dispara um evento para todas as subscriptions ativas do tenant que o assinaram. */
  async emit(tenantId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const subs = await this.prisma.webhookSubscription.findMany({
      where: {
        tenantId,
        active: true,
        events: { has: event },
      },
    });

    for (const sub of subs) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          subscriptionId: sub.id,
          event,
          payload,
          status: 'pending',
        },
      });
      await this.deliver(delivery.id, sub.url, this.crypto.decrypt(sub.secret), event, payload);
    }
  }

  /** Executa a entrega HTTP para um delivery específico. */
  private async deliver(
    deliveryId: string,
    url: string,
    secret: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexa-Signature': sig,
          'X-Nexa-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      if (res.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: 'delivered', responseStatus: res.status, deliveredAt: new Date(), attempts: { increment: 1 } },
        });
        return;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (e: any) {
      const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
      const attempts = (delivery?.attempts ?? 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      const nextRetryAt = status === 'pending'
        ? new Date(Date.now() + (BACKOFF_SECONDS[attempts - 1] ?? 1800) * 1000)
        : null;

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status, attempts, error: e?.message?.slice(0, 500), nextRetryAt },
      });

      this.logger.warn(`Webhook delivery ${deliveryId} falhou (tentativa ${attempts}/${MAX_ATTEMPTS}): ${e?.message}`);
    }
  }

  /** Retry de deliveries pendentes com nextRetryAt passado. Roda a cada minuto. */
  @Interval(60_000)
  async retryPending(): Promise<void> {
    const now = new Date();
    const pending = await this.prisma.webhookDelivery.findMany({
      where: { status: 'pending', nextRetryAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
      include: { subscription: true },
      take: 50,
    });

    for (const d of pending) {
      await this.deliver(
        d.id,
        d.subscription.url,
        this.crypto.decrypt(d.subscription.secret),
        d.event,
        d.payload as Record<string, unknown>,
      );
    }
  }
}
