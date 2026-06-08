import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';
import { WahaClientService } from '@/shared/waha/waha-client.service';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger('Conversations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly waha: WahaClientService,
  ) {}

  // Inbox: lista conversas do tenant
  async findAll(tenantId: string, q: PaginationQueryDto, sellerId?: string): Promise<Paginated<any>> {
    const where: any = { tenantId };
    if (sellerId) where.assignedSellerId = sellerId; // carteira do vendedor
    if (q.search) where.phone = { contains: q.search };
    const [items, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        orderBy: { startedAt: 'desc' },
        include: { assignedSeller: { select: { name: true } } },
      }),
      this.prisma.aiConversation.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(tenantId: string, id: string) {
    const conv = await this.prisma.aiConversation.findFirst({ where: { id, tenantId } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    return conv;
  }

  // marca resultado da venda (won/lost) — alimenta os KPIs dos vendedores
  async setOutcome(tenantId: string, id: string, outcome: 'won' | 'lost' | null) {
    await this.findOne(tenantId, id);
    return this.prisma.aiConversation.update({
      where: { id },
      data: { outcome, outcomeAt: outcome ? new Date() : null },
    });
  }

  async getMessages(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Cria conversa (correlationId nasce aqui — rastreio ponta a ponta)
  async create(
    tenantId: string,
    dto: { contactId: string; phone: string; productCode?: string; sourceChannel?: string },
  ) {
    return this.prisma.aiConversation.create({
      data: {
        tenantId,
        correlationId: uuidv4(),
        contactId: dto.contactId,
        phone: dto.phone,
        productCode: dto.productCode,
        sourceChannel: (dto.sourceChannel as any) ?? 'whatsapp',
        agentType: 'router',
        customerStage: 'lead',
      },
    });
  }

  // Grava mensagem na conversa (herda correlationId da conversa)
  async addMessage(
    tenantId: string,
    conversationId: string,
    dto: {
      direction: 'inbound' | 'outbound';
      content: string;
      intent?: string;
      metadata?: Record<string, unknown>;
      tokensIn?: number;
      tokensOut?: number;
      estimatedCostUsd?: number;
    },
  ) {
    const conv = await this.findOne(tenantId, conversationId);
    const message = await this.prisma.aiMessage.create({
      data: {
        conversationId: conv.id,
        tenantId,
        correlationId: conv.correlationId,
        direction: dto.direction,
        content: dto.content,
        intent: dto.intent,
        metadata: (dto.metadata ?? {}) as any,
        tokensIn: dto.tokensIn,
        tokensOut: dto.tokensOut,
        estimatedCostUsd: dto.estimatedCostUsd,
      },
    });
    // tempo real: empurra para a sala da conversa (WebSocket)
    this.events.emit('message.created', { conversationId: conv.id, message });

    // saída → entrega no WhatsApp via WAHA (allowlist protege números de teste)
    if (dto.direction === 'outbound') {
      const r = await this.waha.sendText(conv.phone, dto.content);
      if (r.sent) {
        this.logger.log(`WhatsApp enviado p/ ${conv.phone}${r.externalId ? ` (${r.externalId})` : ''}`);
        if (r.externalId) {
          // guarda o id do WhatsApp + marca ENVIADO (✓) p/ casar os recibos depois
          await this.prisma.aiMessage.update({ where: { id: message.id }, data: { externalId: r.externalId, ack: 1 } });
          (message as any).externalId = r.externalId;
          (message as any).ack = 1;
        }
      } else {
        this.logger.warn(`WhatsApp NÃO enviado p/ ${conv.phone}: ${r.reason}`);
      }
    }
    return message;
  }
}
