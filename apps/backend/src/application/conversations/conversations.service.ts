import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // Inbox: lista conversas do tenant
  async findAll(tenantId: string, q: PaginationQueryDto): Promise<Paginated<any>> {
    const where: any = { tenantId };
    if (q.search) where.phone = { contains: q.search };
    const [items, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        orderBy: { startedAt: 'desc' },
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
    dto: { direction: 'inbound' | 'outbound'; content: string; intent?: string },
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
      },
    });
    // tempo real: empurra para a sala da conversa (WebSocket)
    this.events.emit('message.created', { conversationId: conv.id, message });
    return message;
  }
}
