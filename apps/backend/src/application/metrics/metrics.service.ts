import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // Visão geral pro dashboard. Se sellerId vier, escopa à carteira do vendedor.
  async overview(tenantId: string, sellerId?: string) {
    if (sellerId) return this.sellerOverview(tenantId, sellerId);
    const [
      contactsTotal,
      contactsByLead,
      optedOut,
      convTotal,
      convByStatus,
      msgByDirection,
      aiMessages,
      tokenAgg,
      knowledgeTotal,
      billingByStatus,
      eventsByStatus,
      dlqTotal,
    ] = await Promise.all([
      this.prisma.contact.count({ where: { tenantId } }),
      this.prisma.contact.groupBy({ by: ['leadStatus'], where: { tenantId }, _count: true }),
      this.prisma.contact.count({ where: { tenantId, status: 'opted_out' } }),
      this.prisma.aiConversation.count({ where: { tenantId } }),
      this.prisma.aiConversation.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.aiMessage.groupBy({ by: ['direction'], where: { tenantId }, _count: true }),
      this.prisma.aiMessage.count({
        where: { tenantId, direction: 'outbound', metadata: { path: ['aiGenerated'], equals: true } },
      }),
      this.prisma.aiMessage.aggregate({
        where: { tenantId },
        _sum: { tokensIn: true, tokensOut: true, estimatedCostUsd: true },
      }),
      this.prisma.aiKnowledgeBase.count({ where: { tenantId } }),
      this.prisma.aiBillingRequest.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.domainEvent.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.eventDlq.count({ where: { tenantId } }),
    ]);

    const [complaintsTotal, complaintsByTopic] = await Promise.all([
      this.prisma.complaint.count({ where: { tenantId } }),
      this.prisma.complaint.groupBy({ by: ['topic'], where: { tenantId }, _count: true }),
    ]);

    const asMap = (rows: any[], key: string) =>
      rows.reduce((acc, r) => ({ ...acc, [r[key] ?? 'null']: r._count }), {} as Record<string, number>);

    const outboundTotal = msgByDirection.find((m) => m.direction === 'outbound')?._count ?? 0;
    const aiShare = outboundTotal > 0 ? Math.round((aiMessages / outboundTotal) * 100) : 0;

    return {
      contacts: {
        total: contactsTotal,
        optedOut,
        byLeadStatus: asMap(contactsByLead, 'leadStatus'),
      },
      conversations: {
        total: convTotal,
        byStatus: asMap(convByStatus, 'status'),
      },
      messages: {
        inbound: msgByDirection.find((m) => m.direction === 'inbound')?._count ?? 0,
        outbound: outboundTotal,
        aiGenerated: aiMessages,
        aiSharePct: aiShare, // % das respostas que a IA enviou sozinha
      },
      ai: {
        tokensIn: tokenAgg._sum.tokensIn ?? 0,
        tokensOut: tokenAgg._sum.tokensOut ?? 0,
        estimatedCostUsd: Number(tokenAgg._sum.estimatedCostUsd ?? 0),
      },
      knowledge: { total: knowledgeTotal },
      billing: { byStatus: asMap(billingByStatus, 'status') },
      events: { byStatus: asMap(eventsByStatus, 'status'), dlq: dlqTotal },
      complaints: { total: complaintsTotal, byTopic: asMap(complaintsByTopic, 'topic') },
    };
  }

  // KPIs por vendedor (desempenho de vendas).
  async sellersKpi(tenantId: string) {
    const sellers = await this.prisma.seller.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId, assignedSellerId: { not: null } },
      select: { assignedSellerId: true, outcome: true, status: true },
    });
    return sellers.map((s) => {
      const mine = convs.filter((c) => c.assignedSellerId === s.id);
      const ganhos = mine.filter((c) => c.outcome === 'won').length;
      const perdidos = mine.filter((c) => c.outcome === 'lost').length;
      const emAndamento = mine.filter((c) => !c.outcome).length;
      const fechados = ganhos + perdidos;
      return {
        id: s.id,
        name: s.name,
        active: s.active,
        leads: mine.length,
        emAndamento,
        ganhos,
        perdidos,
        taxaConversao: fechados > 0 ? Math.round((ganhos / fechados) * 100) : 0,
      };
    });
  }

  // Dashboard do VENDEDOR — só a carteira dele.
  private async sellerOverview(tenantId: string, sellerId: string) {
    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId, assignedSellerId: sellerId },
      select: { id: true, status: true, contactId: true },
    });
    const convIds = convs.map((c) => c.id);
    const asMap = (rows: any[], key: string) =>
      rows.reduce((acc, r) => ({ ...acc, [r[key] ?? 'null']: r._count }), {} as Record<string, number>);

    const [msgByDirection, aiMessages, complaintsTotal] = await Promise.all([
      convIds.length ? this.prisma.aiMessage.groupBy({ by: ['direction'], where: { conversationId: { in: convIds } }, _count: true }) : [],
      convIds.length ? this.prisma.aiMessage.count({ where: { conversationId: { in: convIds }, direction: 'outbound', metadata: { path: ['aiGenerated'], equals: true } } }) : 0,
      convIds.length ? this.prisma.complaint.count({ where: { conversationId: { in: convIds } } }) : 0,
    ]);
    const outbound = (msgByDirection as any[]).find((m) => m.direction === 'outbound')?._count ?? 0;
    const inbound = (msgByDirection as any[]).find((m) => m.direction === 'inbound')?._count ?? 0;

    return {
      contacts: { total: new Set(convs.map((c) => c.contactId)).size, optedOut: 0, byLeadStatus: {} },
      conversations: {
        total: convs.length,
        byStatus: convs.reduce((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {} as Record<string, number>),
      },
      messages: { inbound, outbound, aiGenerated: aiMessages, aiSharePct: outbound > 0 ? Math.round((aiMessages / outbound) * 100) : 0 },
      ai: { tokensIn: 0, tokensOut: 0, estimatedCostUsd: 0 },
      knowledge: { total: 0 },
      billing: { byStatus: {} },
      events: { byStatus: {}, dlq: 0 },
      complaints: { total: complaintsTotal, byTopic: {} },
      scope: 'vendedor',
    };
  }
}
