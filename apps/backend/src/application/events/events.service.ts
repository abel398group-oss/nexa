import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/infra/prisma/prisma.service';

const MAX_RETRIES = 3;
const BACKOFF_MS = [2000, 8000, 30000]; // retry 1/2/3

@Injectable()
export class EventsService {
  private readonly logger = new Logger('EventsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  // OUTBOX: grava o evento (mesma transação do caller idealmente). Envelope ADR 007.
  async publish(params: {
    eventType: string;
    payload: Record<string, unknown>;
    tenantId: string;
    correlationId: string;
    producer?: string;
    priority?: 'alta' | 'media' | 'baixa';
    subjectId?: string;
    idempotencyKey?: string;
  }) {
    return this.prisma.domainEvent.create({
      data: {
        eventType: params.eventType,
        payload: params.payload as any,
        tenantId: params.tenantId,
        correlationId: params.correlationId,
        producer: params.producer ?? 'backend',
        priority: (params.priority as any) ?? 'media',
        subjectId: params.subjectId,
        idempotencyKey: params.idempotencyKey ?? uuidv4(),
        status: 'created',
      },
    });
  }

  // WORKER: a cada 5s pega eventos 'created', despacha e marca 'processed'.
  // Falha → retry com backoff; após MAX_RETRIES → DLQ.
  // P1 fix: claim atômico via updateMany (WHERE status='created') antes de processar.
  // Evita que múltiplos pods processem o mesmo evento simultaneamente (TOCTOU).
  @Interval(5000)
  async processOutbox() {
    // CLAIM ATÔMICO: tenta marcar até 20 eventos 'created' → 'processing' de uma vez.
    // Apenas o pod que ganhou a corrida (afetou N > 0 registros) prossegue.
    // Outros pods que chegaram ao mesmo tempo encontram status != 'created' e pulam.
    const claimResult = await this.prisma.domainEvent.updateMany({
      where: { status: 'created' },
      data: { status: 'processing' },
    });
    if (claimResult.count === 0) return;

    // Busca exatamente os eventos que este pod acabou de marcar
    const pending = await this.prisma.domainEvent.findMany({
      where: { status: 'processing' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const ev of pending) {
      try {
        // despacha: consumidores reagem a 'domain.<eventType>'
        await this.emitter.emitAsync(`domain.${ev.eventType}`, ev);

        await this.prisma.domainEvent.update({
          where: { id: ev.id },
          data: { status: 'processed', processedAt: new Date() },
        });
      } catch (err: any) {
        await this.handleFailure(ev, err);
      }
    }
  }

  private async handleFailure(ev: any, err: Error) {
    this.logger.warn(`Evento ${ev.eventType} falhou: ${err.message}`);
    // reusa subjectId? Não — controla retry pelo event_dlq se exceder.
    const dlqExisting = await this.prisma.eventDlq.findFirst({
      where: { originalEventId: ev.id },
    });
    const retryCount = (dlqExisting?.retryCount ?? 0) + 1;

    if (retryCount >= MAX_RETRIES) {
      // move para DLQ definitivo
      await this.prisma.eventDlq.upsert({
        where: { id: dlqExisting?.id ?? uuidv4() },
        update: { retryCount, status: 'pending', error: err.message },
        create: {
          tenantId: ev.tenantId,
          correlationId: ev.correlationId,
          originalEventId: ev.id,
          eventType: ev.eventType,
          payload: ev.payload,
          error: err.message,
          retryCount,
          status: 'pending',
        },
      });
      await this.prisma.domainEvent.update({
        where: { id: ev.id },
        data: { status: 'failed' },
      });
      this.logger.error(`Evento ${ev.id} → DLQ após ${retryCount} tentativas`);
    } else {
      // registra a falha parcial e reagenda (volta para 'created')
      await this.prisma.eventDlq.upsert({
        where: { id: dlqExisting?.id ?? uuidv4() },
        update: { retryCount, error: err.message },
        create: {
          tenantId: ev.tenantId,
          correlationId: ev.correlationId,
          originalEventId: ev.id,
          eventType: ev.eventType,
          payload: ev.payload,
          error: err.message,
          retryCount,
          status: 'pending',
        },
      });
      setTimeout(() => {
        this.prisma.domainEvent
          .update({ where: { id: ev.id }, data: { status: 'created' } })
          .catch(() => undefined);
      }, BACKOFF_MS[retryCount - 1] ?? 30000);
    }
  }
}
