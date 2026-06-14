import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { PortalCustomer } from './portal-session.service';

export interface PortalTicketQuery {
  limit?: number;
  offset?: number;
  status?: string;
  category?: string;
}

// Campos seguros p/ o cliente (nada de custo/tokens/metadata interna).
const TICKET_SELECT = {
  id: true,
  status: true,
  ticketCategory: true,
  ticketPriority: true,
  sourceChannel: true,
  outcome: true,
  resolvedAt: true,
  lastActivityAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PortalTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista os chamados DO cliente (escopo por tenantId + externalId da sessao).
  async list(customer: PortalCustomer, q: PortalTicketQuery) {
    const where: any = { tenantId: customer.tenantId, externalId: customer.externalId };
    if (q.status) where.status = q.status;
    if (q.category) where.ticketCategory = q.category;

    const [items, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        take: q.limit ?? 50,
        skip: q.offset ?? 0,
        orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
        select: TICKET_SELECT,
      }),
      this.prisma.aiConversation.count({ where }),
    ]);
    return { items, total };
  }

  // Detalhe + mensagens. Valida posse (404 se nao for do cliente da sessao).
  async getOne(customer: PortalCustomer, id: string) {
    const ticket = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId: customer.tenantId, externalId: customer.externalId },
      select: TICKET_SELECT,
    });
    if (!ticket) throw new NotFoundException('Chamado nao encontrado');

    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, direction: true, content: true, ack: true, createdAt: true },
    });
    return { ...ticket, messages };
  }
}
