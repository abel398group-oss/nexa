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
        include: {
          assignedSeller: { select: { name: true } },
        },
      }).then(async (convs) => {
        // Enriquece com dados do contato (nome, tags) via phone+tenantId
        if (!convs.length) return convs;
        const phones = [...new Set(convs.map((c) => c.phone))];
        const contacts = await this.prisma.contact.findMany({
          where: { tenantId, phone: { in: phones } },
          select: { id: true, phone: true, name: true, nameSource: true, tags: true },
        });
        const contactMap = new Map(contacts.map((c) => [c.phone, c]));

        // Atribuição de campanha: a campanha mais recente que tocou cada conversa
        const convIds = convs.map((c) => c.id);
        const campMsgs = await this.prisma.aiMessage.findMany({
          where: { conversationId: { in: convIds }, direction: 'outbound', intent: 'outbound_campaign' },
          select: { conversationId: true, metadata: true },
          orderBy: { createdAt: 'desc' },
        });
        const campIdByConv = new Map<string, string>();
        for (const m of campMsgs) {
          if (campIdByConv.has(m.conversationId)) continue; // mantém só a mais recente
          const cid = (m.metadata as any)?.campaignId;
          if (cid) campIdByConv.set(m.conversationId, cid);
        }
        const campIds = [...new Set(campIdByConv.values())];
        const camps = campIds.length
          ? await this.prisma.campaign.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true } })
          : [];
        const campNameById = new Map(camps.map((c) => [c.id, c.name]));

        return convs.map((c) => {
          const cid = campIdByConv.get(c.id);
          return {
            ...c,
            contact: contactMap.get(c.phone) ?? null,
            campaign: cid ? { id: cid, name: campNameById.get(cid) ?? '—' } : null,
          };
        });
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

  // Fecha uma conversa com motivo (outcome). Grava histórico de stage.
  // Regras de fechamento:
  //   opt_out     → imediato (LGPD)
  //   won/lost    → imediato (venda concluída ou perdida)
  //   no_response → janitor após 7 dias (somente leads, não clientes ativos)
  async closeConversation(
    tenantId: string,
    id: string,
    outcome: 'won' | 'lost' | 'no_response' | 'opt_out',
    reason?: string,
  ) {
    const conv = await this.findOne(tenantId, id);
    const toStatus = outcome === 'opt_out' ? 'opt_out' : 'closed';
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        data: { status: toStatus as any, outcome, outcomeAt: now, endedAt: now },
      }),
      // Ajuste 4: grava histórico de mudança de status/outcome
      this.prisma.conversationStageHistory.create({
        data: {
          conversationId: id,
          fromStatus: conv.status as string,
          toStatus,
          fromOutcome: conv.outcome ?? null,
          toOutcome: outcome,
          reason: reason ?? outcome,
          changedAt: now,
        },
      }),
    ]);

    return { id, status: toStatus, outcome };
  }

  // Atalho para quando o vendedor marca won/lost no Inbox — fecha junto
  async setOutcome(tenantId: string, id: string, outcome: 'won' | 'lost' | null) {
    const conv = await this.findOne(tenantId, id);
    if (outcome === 'won' || outcome === 'lost') {
      return this.closeConversation(tenantId, id, outcome, outcome);
    }
    // null = desfaz o outcome (reabre a conversa — Ajuste 2)
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        data: { outcome: null, outcomeAt: null, status: 'open' as any, endedAt: null },
      }),
      this.prisma.conversationStageHistory.create({
        data: {
          conversationId: id,
          fromStatus: conv.status as string,
          toStatus: 'open',
          fromOutcome: conv.outcome ?? null,
          toOutcome: null,
          reason: 'reaberta_manual',
          changedAt: now,
        },
      }),
    ]);
    return { id, status: 'open', outcome: null };
  }

  // Reatribui a conversa a um vendedor (ou null pra desatribuir). Valida o seller do tenant.
  async assign(tenantId: string, id: string, sellerId: string | null) {
    await this.findOne(tenantId, id); // valida escopo do tenant
    if (sellerId) {
      const seller = await this.prisma.seller.findFirst({
        where: { id: sellerId, tenantId },
        select: { id: true },
      });
      if (!seller) throw new NotFoundException('Vendedor não encontrado');
    }
    const updated = await this.prisma.aiConversation.update({
      where: { id },
      data: { assignedSellerId: sellerId, assignedAt: sellerId ? new Date() : null },
      include: { assignedSeller: { select: { name: true } } },
    });
    return { id, assignedSellerId: updated.assignedSellerId, assignedSeller: updated.assignedSeller };
  }

  // Suporte: marca o chamado como resolvido (fecha) ou reabre. Grava histórico.
  async setResolved(tenantId: string, id: string, resolved: boolean) {
    const conv = await this.findOne(tenantId, id);
    const now = new Date();
    const toStatus = resolved ? 'closed' : 'open';
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id },
        data: resolved
          ? { status: 'closed' as any, outcome: 'resolved', outcomeAt: now, resolvedAt: now, endedAt: now }
          : { status: 'open' as any, outcome: null, outcomeAt: null, resolvedAt: null, endedAt: null },
      }),
      this.prisma.conversationStageHistory.create({
        data: {
          conversationId: id,
          fromStatus: conv.status as string,
          toStatus,
          fromOutcome: conv.outcome ?? null,
          toOutcome: resolved ? 'resolved' : null,
          reason: resolved ? 'resolvido_manual' : 'reaberto_manual',
          changedAt: now,
        },
      }),
    ]);
    return { id, status: toStatus, outcome: resolved ? 'resolved' : null };
  }

  // Atualiza last_activity_at — chamado sempre que uma mensagem é gravada
  async touchActivity(conversationId: string) {
    return this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { lastActivityAt: new Date() },
    }).catch(() => null); // não bloqueia se a conversa já foi fechada
  }

  async getMessages(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.aiMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Histórico de mudanças de status/outcome (para a timeline da conversa)
  async getTimeline(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.conversationStageHistory.findMany({
      where: { conversationId: id },
      orderBy: { changedAt: 'asc' },
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
    // atualiza timestamp de última atividade (base da regra de auto-fechamento em 7 dias)
    await this.touchActivity(conv.id);

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
