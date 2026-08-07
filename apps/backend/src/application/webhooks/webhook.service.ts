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
 * Durabilidade: o estado de cada entrega vive na tabela WebhookDelivery (Postgres),
 * não em memória. Um restart não perde nada — retryPending() reprocessa os pendentes.
 * O scheduler de retry é um @Interval protegido por lock Redis (uma instância por vez).
 * emit() despacha a 1ª tentativa em segundo plano (não bloqueia o caller); falhas caem
 * no fluxo de retry. Fila dedicada (BullMQ) só valeria a pena em volume muito maior.
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHmac } from 'crypto';
import { Redis } from 'ioredis';
import { createRedisClient } from '@/shared/redis/redis.factory';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';

const MAX_ATTEMPTS = 5;
// Backoff exponencial: [10s, 30s, 2min, 10min, 30min]
const BACKOFF_SECONDS = [10, 30, 120, 600, 1800];
const RETRY_LOCK_KEY = 'webhook:retry:lock';
const RETRY_LOCK_TTL_S = 55; // menor que o interval de 60s

@Injectable()
export class WebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WebhookService');
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EmailCryptoService,
  ) {}

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = createRedisClient(url, 'webhooks');
    }
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit();
  }

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
          payload: payload as any,
          status: 'pending',
        },
      });
      // Fire-and-forget: não bloqueia o caller (caminho quente) na entrega HTTP.
      // deliver() persiste sucesso/falha na WebhookDelivery e falhas são reprocessadas
      // por retryPending() — o registro no banco é a fila durável. O .catch() cobre um
      // erro inesperado (ex: falha de DB dentro do deliver) para não virar unhandled.
      void this.deliver(delivery.id, sub.url, this.crypto.decrypt(sub.secret), event, payload).catch(
        (e) => this.logger.warn(`Webhook emit deliver ${delivery.id} erro não tratado: ${e?.message}`),
      );
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

  /** Retry de deliveries pendentes com nextRetryAt passado. Roda a cada minuto.
   *  Lock Redis garante que apenas uma instância processe por vez (evita entrega duplicada). */
  @Interval(60_000)
  async retryPending(): Promise<void> {
    // Acquire distributed lock — só uma instância roda por vez.
    //
    // O try/catch não é decoração: este método é um @Interval, e uma rejeição do
    // Redis aqui não tem quem a capture — vira unhandled rejection e derruba o
    // processo inteiro. Com o Redis fora, o certo é rodar mesmo assim (fail-open,
    // mesma política do RedisLockService): uma réplica processando duas vezes é
    // menos grave que o backend morrer.
    let temLock = true;
    if (this.redis) {
      try {
        temLock = (await this.redis.set(RETRY_LOCK_KEY, '1', 'EX', RETRY_LOCK_TTL_S, 'NX')) === 'OK';
      } catch (err: any) {
        this.logger.warn(`Redis indisponível ao pegar o lock de retry — rodando sem lock: ${err?.message}`);
        temLock = true;
      }
    }
    if (!temLock) return; // outra instância já está processando

    try {
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
    } finally {
      // Idem: soltar o lock não pode ser o que mata o processo. O TTL cobre a
      // falha — a chave expira sozinha em RETRY_LOCK_TTL_S.
      if (this.redis) {
        await this.redis
          .del(RETRY_LOCK_KEY)
          .catch((err: any) =>
            this.logger.warn(`Falha ao soltar o lock de retry (expira em ${RETRY_LOCK_TTL_S}s): ${err?.message}`),
          );
      }
    }
  }
}
