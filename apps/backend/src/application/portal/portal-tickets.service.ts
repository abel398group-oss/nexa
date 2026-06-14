import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Paginated, PaginationQueryDto } from '@/shared/dto/pagination.dto';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { PortalCustomer } from './portal-session.service';

// Chamados do CLIENTE. Todo acesso escopado por (tenantId, externalId) da sessao —
// o cliente nunca ve nem mexe em chamado de outro.
@Injectable()
export class PortalTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly agent: ConversationAgentService,
  ) {}

  private readonly listFields = {
    id: true,
    status: true,
    ticketCategory: true,
    ticketPriority: true,
    rootCause: true,
    sourceChannel: true,
    createdAt: true,
    lastActivityAt: true,
    resolvedAt: true,
    outcome: true,
  };

  async list(
    customer: PortalCustomer,
    q: PaginationQueryDto,
    filters: { status?: string; category?: string },
  ): Promise<Paginated<any>> {
    const where: any = { tenantId: customer.tenantId, externalId: customer.externalId };
    if (filters.status) where.status = filters.status;
    if (filters.category) where.ticketCategory = filters.category;
    if (q.search) where.rootCause = { contains: q.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
        select: this.listFields,
      }),
      this.prisma.aiConversation.count({ where }),
    ]);
    return { items, total };
  }

  async detail(customer: PortalCustomer, id: string) {
    const ticket = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId: customer.tenantId, externalId: customer.externalId },
      select: { ...this.listFields, autoCloseAt: true },
    });
    if (!ticket) throw new NotFoundException('Chamado nao encontrado');

    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, direction: true, content: true, intent: true, ack: true, createdAt: true },
    });
    return { ...ticket, messages };
  }

  // Abre um chamado: cria a conversa (canal 'portal', externalId da sessao) e joga a
  // 1a mensagem no MESMO pipeline da Lia (router->support->supervisor).
  async open(customer: PortalCustomer, dto: { message: string }) {
    const contact = await this.ensureContact(customer);
    const conv = await this.conversations.create(customer.tenantId, {
      contactId: contact.id,
      phone: contact.phone,
      sourceChannel: 'portal',
    });
    // marca a conversa como do cliente (externalId) e cliente ativo
    await this.prisma.aiConversation.update({
      where: { id: conv.id },
      data: { externalId: customer.externalId, customerStage: 'cliente_ativo' },
    });
    await this.conversations.addMessage(customer.tenantId, conv.id, {
      direction: 'inbound',
      content: dto.message,
    });
    await this.agent.handle(customer.tenantId, {
      message: dto.message,
      conversationId: conv.id,
      portalIdentity: { externalId: customer.externalId, name: customer.name },
    });
    return this.detail(customer, conv.id);
  }

  // Cliente responde num chamado existente -> mesmo pipeline.
  async reply(customer: PortalCustomer, id: string, message: string) {
    const owned = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId: customer.tenantId, externalId: customer.externalId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Chamado nao encontrado');

    await this.conversations.addMessage(customer.tenantId, id, {
      direction: 'inbound',
      content: message,
    });
    await this.agent.handle(customer.tenantId, {
      message,
      conversationId: id,
      portalIdentity: { externalId: customer.externalId, name: customer.name },
    });
    return this.detail(customer, id);
  }

  // Find-or-create do contato do portal por externalContactId (nao duplica entre sessoes).
  // Cliente do portal pode nao ter telefone -> usa phone namespaced 'portal:<externalId>'
  // (phone e obrigatorio no schema; valor nao-discavel, nunca vai pra WhatsApp por engano).
  private async ensureContact(customer: PortalCustomer) {
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId: customer.tenantId, externalContactId: customer.externalId },
    });
    if (existing) return existing;
    return this.prisma.contact.create({
      data: {
        tenantId: customer.tenantId,
        externalContactId: customer.externalId,
        name: customer.name ?? undefined,
        nameSource: 'tms',
        source: 'portal',
        phone: `portal:${customer.externalId}`,
      },
    });
  }
}
