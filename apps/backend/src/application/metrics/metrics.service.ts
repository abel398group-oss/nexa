import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // Visão geral pro dashboard. Se sellerId vier, escopa à carteira do vendedor.
  // range opcional (from/to ISO) filtra métricas por data de criação.
  async overview(tenantId: string, sellerId?: string, range?: { from?: string; to?: string }) {
    if (sellerId) return this.sellerOverview(tenantId, sellerId);
    // filtro de período (createdAt) — aplicado só nas métricas de atividade
    const dw: any =
      range?.from || range?.to
        ? {
            createdAt: {
              ...(range.from ? { gte: new Date(range.from) } : {}),
              ...(range.to ? { lte: new Date(`${range.to}T23:59:59.999`) } : {}),
            },
          }
        : {};
    const [
      contactsTotal,
      contactsByLead,
      optedOut,
      convTotal,
      convByStatus,
      convByOutcome,
      msgByDirection,
      aiMessages,
      tokenAgg,
      knowledgeTotal,
      eventsByStatus,
      dlqTotal,
    ] = await Promise.all([
      this.prisma.contact.count({ where: { tenantId, ...dw } }),
      this.prisma.contact.groupBy({ by: ['leadStatus'], where: { tenantId, ...dw }, _count: true }),
      this.prisma.contact.count({ where: { tenantId, status: 'opted_out', ...dw } }),
      this.prisma.aiConversation.count({ where: { tenantId, ...dw } }),
      this.prisma.aiConversation.groupBy({ by: ['status'], where: { tenantId, ...dw }, _count: true }),
      this.prisma.aiConversation.groupBy({ by: ['outcome'], where: { tenantId, outcome: { not: null }, ...dw }, _count: true }),
      this.prisma.aiMessage.groupBy({ by: ['direction'], where: { tenantId, ...dw }, _count: true }),
      this.prisma.aiMessage.count({
        where: { tenantId, direction: 'outbound', metadata: { path: ['aiGenerated'], equals: true }, ...dw },
      }),
      this.prisma.aiMessage.aggregate({
        where: { tenantId, ...dw },
        _sum: { tokensIn: true, tokensOut: true, estimatedCostUsd: true },
      }),
      this.prisma.aiKnowledgeBase.count({ where: { tenantId } }),
      this.prisma.domainEvent.groupBy({ by: ['status'], where: { tenantId, ...dw }, _count: true }),
      this.prisma.eventDlq.count({ where: { tenantId } }),
    ]);

    const [complaintsTotal, complaintsByTopic] = await Promise.all([
      this.prisma.complaint.count({ where: { tenantId, ...dw } }),
      this.prisma.complaint.groupBy({ by: ['topic'], where: { tenantId, ...dw }, _count: true }),
    ]);

    // ── Engajamento de campanhas (CAMP-2) ───────────────────────────────────
    const [campaignsTotal, sentTotal, ackRows] = await Promise.all([
      this.prisma.campaign.count({ where: { tenantId, ...dw } }),
      this.prisma.campaignTarget.count({ where: { tenantId, status: 'sent', ...dw } }),
      this.prisma.aiMessage.groupBy({
        by: ['ack'],
        where: { tenantId, direction: 'outbound', intent: 'outbound_campaign', ...dw },
        _count: true,
      }),
    ]);
    const ackAtLeast = (min: number) =>
      ackRows.filter((r: any) => (r.ack ?? 0) >= min).reduce((a: number, r: any) => a + (r._count as number), 0);
    const campMsgTotal = ackRows.reduce((a: number, r: any) => a + (r._count as number), 0);
    const delivered = ackAtLeast(2);
    const read = ackAtLeast(3);
    // respostas: conversas que receberam campanha E responderam (inbound)
    const campConvRows = await this.prisma.aiMessage.findMany({
      where: { tenantId, direction: 'outbound', intent: 'outbound_campaign', ...dw },
      select: { conversationId: true },
      distinct: ['conversationId'],
    });
    const campConvIds = campConvRows.map((r: any) => r.conversationId);
    const repliedRows = campConvIds.length
      ? await this.prisma.aiMessage.groupBy({
          by: ['conversationId'],
          where: { conversationId: { in: campConvIds }, direction: 'inbound' },
          _count: true,
        })
      : [];
    const replied = repliedRows.length;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

    const asMap = (rows: any[], key: string) =>
      rows.reduce((acc, r) => ({ ...acc, [r[key] ?? 'null']: r._count }), {} as Record<string, number>);

    const outboundTotal = msgByDirection.find((m: any) => m.direction === 'outbound')?._count ?? 0;
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
        byOutcome: asMap(convByOutcome, 'outcome'),
      },
      messages: {
        inbound: msgByDirection.find((m: any) => m.direction === 'inbound')?._count ?? 0,
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
      events: { byStatus: asMap(eventsByStatus, 'status'), dlq: dlqTotal },
      complaints: { total: complaintsTotal, byTopic: asMap(complaintsByTopic, 'topic') },
      campaigns: {
        total: campaignsTotal,
        sent: sentTotal,
        delivered,
        read,
        replied,
        deliveredPct: pct(delivered, campMsgTotal),
        readPct: pct(read, campMsgTotal),
        repliedPct: pct(replied, campConvIds.length),
      },
    };
  }

  // Série temporal por dia (Q5): mensagens in/out e novas conversas por dia no
  // período. Buckets preenchidos em JS (sem SQL bruto) — robusto e portável.
  async timeseries(tenantId: string, sellerId?: string, range?: { from?: string; to?: string }) {
    const toDate = range?.to ? new Date(`${range.to}T23:59:59.999`) : new Date();
    const fromDate = range?.from
      ? new Date(`${range.from}T00:00:00.000`)
      : new Date(new Date(new Date().setHours(0, 0, 0, 0)).getTime() - 13 * 86_400_000);

    const window = { gte: fromDate, lte: toDate };
    let convWhere: any = { tenantId, createdAt: window };
    let msgWhere: any = { tenantId, createdAt: window };

    // escopo do vendedor: só a carteira dele
    if (sellerId) {
      const convIds = (
        await this.prisma.aiConversation.findMany({
          where: { tenantId, assignedSellerId: sellerId },
          select: { id: true },
        })
      ).map((c: any) => c.id);
      convWhere = { tenantId, assignedSellerId: sellerId, createdAt: window };
      msgWhere = { conversationId: { in: convIds.length ? convIds : ['__none__'] }, createdAt: window };
    }

    const [msgs, convs] = await Promise.all([
      this.prisma.aiMessage.findMany({ where: msgWhere, select: { createdAt: true, direction: true } }),
      this.prisma.aiConversation.findMany({ where: convWhere, select: { createdAt: true } }),
    ]);

    // lista de dias (chave YYYY-MM-DD local) do período
    const days: string[] = [];
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      days.push(this.isoDay(d));
    }
    const buckets = new Map(days.map((k) => [k, { day: k, inbound: 0, outbound: 0, conversations: 0 }]));

    for (const m of msgs) {
      const b = buckets.get(this.isoDay(m.createdAt));
      if (b) b[m.direction === 'inbound' ? 'inbound' : 'outbound']++;
    }
    for (const c of convs) {
      const b = buckets.get(this.isoDay(c.createdAt));
      if (b) b.conversations++;
    }

    return { from: this.isoDay(fromDate), to: this.isoDay(toDate), series: days.map((k) => buckets.get(k)!) };
  }

  // YYYY-MM-DD no fuso local (chave de bucket diária).
  private isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // KPIs por vendedor (desempenho de vendas).
  async sellersKpi(tenantId: string) {
    const sellers = await this.prisma.seller.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId, assignedSellerId: { not: null } },
      select: { assignedSellerId: true, outcome: true, status: true },
    });
    return sellers.map((s: any) => {
      const mine = convs.filter((c: any) => c.assignedSellerId === s.id);
      const ganhos = mine.filter((c: any) => c.outcome === 'won').length;
      const perdidos = mine.filter((c: any) => c.outcome === 'lost').length;
      const emAndamento = mine.filter((c: any) => !c.outcome).length;
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
    const convIds = convs.map((c: any) => c.id);
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
      contacts: { total: new Set(convs.map((c: any) => c.contactId)).size, optedOut: 0, byLeadStatus: {} },
      conversations: {
        total: convs.length,
        byStatus: convs.reduce((a: Record<string, number>, c: any) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {} as Record<string, number>),
      },
      messages: { inbound, outbound, aiGenerated: aiMessages, aiSharePct: outbound > 0 ? Math.round((aiMessages / outbound) * 100) : 0 },
      ai: { tokensIn: 0, tokensOut: 0, estimatedCostUsd: 0 },
      knowledge: { total: 0 },
      events: { byStatus: {}, dlq: 0 },
      complaints: { total: complaintsTotal, byTopic: {} },
      scope: 'vendedor',
    };
  }
}
