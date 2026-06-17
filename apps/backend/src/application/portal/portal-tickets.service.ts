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
  // dto: assunto (rootCause/titulo), area (ticketCategory), mensagem e telefone de
  // contato (pra o suporte humano ligar — vem do cadastro ou preenchido pelo cliente).
  async open(
    customer: PortalCustomer,
    dto: { subject?: string; category?: string; message: string; phone?: string },
  ) {
    const real = dto.phone?.trim() ? dto.phone.replace(/\D/g, '') : '';
    const contact = await this.ensureContact(customer, real);
    const conv = await this.conversations.create(customer.tenantId, {
      contactId: contact.id,
      phone: real || contact.phone, // telefone de contato p/ o suporte humano
      sourceChannel: 'portal',
    });
    // marca a conversa como do cliente (externalId), cliente ativo, + assunto/area
    await this.prisma.aiConversation.update({
      where: { id: conv.id },
      data: {
        externalId: customer.externalId,
        customerStage: 'cliente_ativo',
        ...(dto.subject?.trim() ? { rootCause: dto.subject.trim() } : {}),
        ...(dto.category?.trim() ? { ticketCategory: dto.category.trim() } : {}),
      },
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
  // Se o cliente informar um telefone real e o contato ainda estiver com o sintetico,
  // persiste o real (best-effort) pra prefill futuro e pro suporte humano ligar.
  private async ensureContact(customer: PortalCustomer, realPhone = '') {
    const existing = await this.prisma.contact.findFirst({
      where: { tenantId: customer.tenantId, externalContactId: customer.externalId },
    });
    if (existing) {
      if (realPhone && existing.phone.startsWith('portal:')) {
        await this.prisma.contact
          .update({ where: { id: existing.id }, data: { phone: realPhone } })
          .catch(() => {}); // ignora conflito de unique (telefone ja usado por outro contato)
      }
      return existing;
    }
    // Se informou telefone real, verifica se ja existe um contato com esse phone no tenant
    // (evita unique constraint em (tenant_id, phone) quando o mesmo telefone aparece em
    // sessoes diferentes — ex: cliente abre novo chamado gerando novo externalId).
    if (realPhone) {
      const byPhone = await this.prisma.contact.findFirst({
        where: { tenantId: customer.tenantId, phone: realPhone },
      });
      if (byPhone) {
        // Associa o externalContactId desta sessao ao contato existente (best-effort)
        await this.prisma.contact
          .update({ where: { id: byPhone.id }, data: { externalContactId: customer.externalId } })
          .catch(() => {}); // ignora se externalContactId ja estiver em uso por outro
        return byPhone;
      }
    }
    return this.prisma.contact.create({
      data: {
        tenantId: customer.tenantId,
        externalContactId: customer.externalId,
        name: customer.name ?? undefined,
        nameSource: 'tms',
        source: 'portal',
        phone: realPhone || `portal:${customer.externalId}`,
      },
    });
  }

  // Telefone de contato do cliente (pro prefill do form) — null se so houver o sintetico.
  async contactPhone(customer: PortalCustomer): Promise<string | null> {
    const c = await this.prisma.contact.findFirst({
      where: { tenantId: customer.tenantId, externalContactId: customer.externalId },
      select: { phone: true },
    });
    return c && !c.phone.startsWith('portal:') ? c.phone : null;
  }
}
