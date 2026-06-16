import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EventsService } from '@/application/events/events.service';
import { getActionRule } from './action-policy';

type ActionType =
  | 'create_payment'
  | 'get_payment_status'
  | 'consult_plan'
  | 'update_context'
  | 'escalate'
  | 'cancel_payment'
  | 'refund'
  | 'cancel_subscription'
  | 'delete_customer'
  | 'alter_contract';

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // IA solicita uma ação → backend valida (Action Policy) e decide executar ou bloquear.
  async request(
    tenantId: string,
    dto: {
      actionType: ActionType;
      correlationId: string;
      conversationId: string;
      idempotencyKey: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const rule = getActionRule(dto.actionType);
    if (!rule) throw new BadRequestException(`Ação desconhecida: ${dto.actionType}`);

    // idempotência: se já existe, retorna a mesma (não duplica)
    const existing = await this.prisma.aiAction.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    // cria registro da ação solicitada
    const action = await this.prisma.aiAction.create({
      data: {
        tenantId,
        correlationId: dto.correlationId,
        conversationId: dto.conversationId,
        actionType: dto.actionType as any,
        idempotencyKey: dto.idempotencyKey,
        payload: (dto.payload ?? {}) as any,
        status: 'requested',
        requestedByAi: true,
      },
    });

    // ação irreversível → NÃO executa; fica aguardando humano
    if (rule.requiresHuman) {
      return this.prisma.aiAction.update({
        where: { id: action.id },
        data: {
          status: 'blocked',
          error: { code: 'REQUIRES_HUMAN', message: 'Ação exige aprovação humana' } as any,
        },
      });
    }

    // ação permitida → "executa" (Sprint 4: stub) e publica evento de domínio
    const executed = await this.prisma.aiAction.update({
      where: { id: action.id },
      data: { status: 'executed', executedByBackend: true, executedAt: new Date() },
    });

    await this.events.publish({
      eventType: `action.${dto.actionType}`,
      payload: { actionId: executed.id, ...(dto.payload ?? {}) },
      tenantId,
      correlationId: dto.correlationId,
      producer: 'actions',
      idempotencyKey: `evt-${executed.id}`,
    });

    return executed;
  }

  async findOne(tenantId: string, id: string) {
    const action = await this.prisma.aiAction.findFirst({ where: { id, tenantId } });
    if (!action) throw new NotFoundException('Ação não encontrada');
    return action;
  }
}
