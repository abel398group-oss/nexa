import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { Paginated, PaginationQueryDto } from '@/shared/dto/pagination.dto';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { PortalCustomer } from './portal-session.service';

// Janela de reabertura: chamado fechado há menos que este valor é reaberto;
// acima → cria follow-up vinculado. Configurável via env REOPEN_WINDOW_DAYS (default 7).
const REOPEN_WINDOW_DAYS = () => Number(process.env.REOPEN_WINDOW_DAYS ?? 7);

// Chamados do CLIENTE. Todo acesso escopado por (tenantId, externalId) da sessao —
// o cliente nunca ve nem mexe em chamado de outro.
@Injectable()
export class PortalTicketsService {
  private readonly logger = new Logger('PortalTickets');

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly agent: ConversationAgentService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  private readonly listFields = {
    id: true,
    status: true,
    ticketCategory: true,
    ticketPriority: true,
    rootCause: true,
    subject: true,       // N3
    ticketNumber: true,  // N3
    sourceChannel: true,
    createdAt: true,
    lastActivityAt: true,
    resolvedAt: true,
    outcome: true,
    csatScore: true,   // N2
    csatComment: true, // N2
    csatToken: true,   // C1: exposto ao TMS para o bloco de avaliação do widget
  };

  async list(
    customer: PortalCustomer,
    q: PaginationQueryDto,
    filters: { status?: string; category?: string },
  ): Promise<Paginated<any>> {
    const where: any = { tenantId: customer.tenantId, externalId: customer.externalId };
    if (filters.status) where.status = filters.status;
    if (filters.category) where.ticketCategory = filters.category;
    if (q.search) where.OR = [
      { rootCause: { contains: q.search, mode: 'insensitive' } },
      { subject:   { contains: q.search, mode: 'insensitive' } },
    ];

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

  // Scope empresa: todos os chamados do tenant (só gestores).
  async listByTenant(
    customer: PortalCustomer,
    q: PaginationQueryDto,
    filters: { status?: string; category?: string },
  ): Promise<Paginated<any>> {
    const where: any = { tenantId: customer.tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.category) where.ticketCategory = filters.category;
    if (q.search) where.OR = [
      { rootCause: { contains: q.search, mode: 'insensitive' } },
      { subject:   { contains: q.search, mode: 'insensitive' } },
    ];

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

  // P1 (fluxo humano): "Abrir chamado" é intenção EXPLÍCITA de falar com a equipe.
  // A Lia NÃO responde aqui — o chamado nasce escalado (fila humana), recebe número,
  // notifica o Inbox e dispara e-mail ao suporte (listener de 'support.escalated').
  // O chat do widget continua sendo o canal da Lia; quando ELA não resolve, ela mesma
  // escala com o histórico (conversation-agent).
  // dto: assunto (subject), area (ticketCategory), mensagem e telefone de contato.
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
      agentType: 'support',
    });
    // Identidade + assunto/área + fila humana desde o nascimento.
    // N3: subject na coluna subject (rootCause é exclusivo do DiagnosticAgent).
    // Categoria default 'outro' garante que o ticketNumber seja atribuído.
    await this.prisma.aiConversation.update({
      where: { id: conv.id },
      data: {
        externalId: customer.externalId,
        customerStage: 'cliente_ativo',
        status: 'escalated',
        ...(dto.subject?.trim() ? { subject: dto.subject.trim() } : {}),
        ticketCategory: dto.category?.trim() || 'outro',
        ticketPriority: 'normal',
      } as any,
    });
    await this.prisma.conversationStageHistory.create({
      data: { conversationId: conv.id, fromStatus: 'open', toStatus: 'escalated', reason: 'aberto_pelo_cliente' },
    });
    await this.conversations.addMessage(customer.tenantId, conv.id, {
      direction: 'inbound',
      content: dto.message,
    });
    await this.assignTicketNumber(customer.tenantId, conv.id);
    const created = await this.prisma.aiConversation.findUnique({
      where: { id: conv.id },
      select: { ticketNumber: true } as any,
    });
    const numero = (created as any)?.ticketNumber ? `#${(created as any).ticketNumber}` : '';
    // Confirmação no próprio thread — o cliente sabe que um humano vai responder.
    await this.conversations.addMessage(customer.tenantId, conv.id, {
      direction: 'outbound',
      content: `Chamado ${numero} registrado! Nossa equipe de suporte vai te responder por aqui. 🙋`.replace('  ', ' '),
    });
    await this.notifications.create(customer.tenantId, {
      type: 'escalation',
      title: `🆕 Chamado ${numero} aberto pelo cliente${customer.name ? ` — ${customer.name}` : ''}`,
      body: dto.subject?.trim() || dto.message.slice(0, 80),
      link: `/inbox/${conv.id}`,
    });
    // P2: e-mail ao suporte (SupportEscalationListener no módulo de e-mail).
    this.events.emit('support.escalated', {
      tenantId: customer.tenantId,
      conversationId: conv.id,
      origin: 'portal',
    });
    this.logger.log(`P1: chamado ${numero || conv.id} aberto direto para a fila humana`);
    return this.detail(customer, conv.id);
  }

  // Cliente responde num chamado existente -> mesmo pipeline.
  // N1: se o chamado está `closed`, reabre (< REOPEN_WINDOW_DAYS) ou cria follow-up (≥ janela).
  async reply(customer: PortalCustomer, id: string, message: string) {
    const owned = await this.prisma.aiConversation.findFirst({
      where: { id, tenantId: customer.tenantId, externalId: customer.externalId },
      select: { id: true, status: true, endedAt: true, lastActivityAt: true, contactId: true, phone: true, ticketCategory: true },
    });
    if (!owned) throw new NotFoundException('Chamado nao encontrado');

    // N1: chamado fechado → decide entre reabrir e criar follow-up antes de processar.
    let conversationId = owned.id;
    if ((owned.status as string) === 'closed') {
      conversationId = await this.reopenOrFollowUp(customer, owned);
    } else if ((owned.status as string) !== 'open' && (owned.status as string) !== 'escalated') {
      this.logger.warn(`N1: reply em chamado ${owned.id} com status=${owned.status} — processando normalmente`);
    }

    await this.conversations.addMessage(customer.tenantId, conversationId, {
      direction: 'inbound',
      content: message,
    });
    await this.agent.handle(customer.tenantId, {
      message,
      conversationId,
      portalIdentity: { externalId: customer.externalId, name: customer.name },
    });
    return this.detail(customer, conversationId);
  }

  // N1: lógica de reabertura vs. follow-up para chamados fechados.
  // < REOPEN_WINDOW_DAYS → reabre, limpa campos de resolução, registra no histórico.
  // ≥ REOPEN_WINDOW_DAYS → cria novo chamado vinculado via followUpOfId.
  // Devolve o conversationId a ser usado no processamento da mensagem.
  private async reopenOrFollowUp(
    customer: PortalCustomer,
    conv: { id: string; endedAt: Date | null; lastActivityAt: Date | null; contactId: string; phone: string; ticketCategory: string | null },
  ): Promise<string> {
    const windowDays = REOPEN_WINDOW_DAYS();
    const closedAt = conv.endedAt ?? conv.lastActivityAt ?? new Date(0);
    const daysSinceClosed = (Date.now() - new Date(closedAt).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceClosed < windowDays) {
      // Reabre: limpa todos os campos de resolução para que o chamado volte ao estado limpo.
      await this.prisma.aiConversation.update({
        where: { id: conv.id },
        data: {
          status: 'open' as any,
          outcome: null,
          outcomeAt: null,
          resolvedAt: null,
          autoCloseAt: null,
          endedAt: null,
          lastActivityAt: new Date(),
        },
      });
      await this.prisma.conversationStageHistory.create({
        data: { conversationId: conv.id, fromStatus: 'closed', toStatus: 'open', reason: 'reaberto_cliente' },
      });
      this.logger.log(`N1: chamado ${conv.id} reaberto por cliente (${Math.floor(daysSinceClosed)}d < ${windowDays}d)`);
      return conv.id;
    }

    // ≥ windowDays: cria follow-up vinculado ao chamado original.
    const newConv = await this.conversations.create(customer.tenantId, {
      contactId: conv.contactId,
      phone: conv.phone,
      sourceChannel: 'portal',
      agentType: 'support',
    });
    await this.prisma.aiConversation.update({
      where: { id: newConv.id },
      data: {
        externalId: customer.externalId,
        customerStage: 'cliente_ativo' as any,
        followUpOfId: conv.id,
        ...(conv.ticketCategory ? { ticketCategory: conv.ticketCategory } : {}),
      } as any,
    });
    this.logger.log(`N1: chamado ${conv.id} fechado há ${Math.floor(daysSinceClosed)}d (≥${windowDays}d) → follow-up ${newConv.id}`);
    return newConv.id;
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

  // C2: Atribui ticketNumber sequencial por tenant via contador atômico (TicketCounter).
  // INSERT ... ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING last_number
  // é atômico no PostgreSQL — sem race condition independente de concorrência ou réplicas.
  // Só atribui quando ticketCategory está definido (chamado já classificado como ticket).
  async assignTicketNumber(tenantId: string, conversationId: string): Promise<void> {
    // Verifica se já tem número (evita re-atribuição idempotente)
    const existing = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: { ticketNumber: true, ticketCategory: true },
    });
    if (!existing || existing.ticketNumber !== null || !existing.ticketCategory) return;

    // C2: operação atômica — o banco retorna o próximo número já reservado
    const rows = await this.prisma.$queryRaw<{ last_number: number }[]>`
      INSERT INTO ticket_counters (tenant_id, last_number, updated_at)
      VALUES (${tenantId}, 1, now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET last_number = ticket_counters.last_number + 1,
            updated_at  = now()
      RETURNING last_number
    `;
    const next = Number(rows[0].last_number);

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { ticketNumber: next } as any,
    });
    this.logger.log(`C2: ticketNumber=${next} atribuído a conv=${conversationId}`);
  }

  // N2: Registra nota CSAT via token público (1x por chamado).
  // Token gerado pelo support-agent ao fechar o chamado com confirmação positiva.
  async submitCsat(token: string, score: number, comment?: string): Promise<{ ok: boolean }> {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error('Nota inválida: informe um número de 1 a 5');
    }
    const ticket = await this.prisma.aiConversation.findFirst({
      where: { csatToken: token },
      select: { id: true, csatScore: true },
    });
    if (!ticket) {
      throw new Error('Token CSAT inválido ou expirado');
    }
    if (ticket.csatScore !== null && ticket.csatScore !== undefined) {
      throw new Error('Nota CSAT já registrada para este chamado');
    }
    await this.prisma.aiConversation.update({
      where: { id: ticket.id },
      data: { csatScore: score, ...(comment?.trim() ? { csatComment: comment.trim() } : {}) } as any,
    });
    this.logger.log(`N2 [CSAT] chamado=${ticket.id} score=${score}`);
    return { ok: true };
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
