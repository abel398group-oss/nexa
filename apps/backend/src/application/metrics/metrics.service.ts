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

    // ── Tempo médio até 1ª resposta da IA (minutos) ──────────────────────────
    // Para cada conversa do período, pega a 1ª mensagem inbound e a 1ª outbound
    // DEPOIS dela. A diferença é o tempo de resposta. Calculado em JS para
    // compatibilidade sem SQL bruto (igual ao time-to-resolution do suporte).
    let avgTimeToFirstResponseMinutes: number | null = null;
    try {
      const convIds = (
        await this.prisma.aiConversation.findMany({
          where: { tenantId, ...dw },
          select: { id: true },
          take: 500, // limita p/ não estourar memória em tenants grandes
        })
      ).map((c: any) => c.id);

      if (convIds.length > 0) {
        const msgs = await this.prisma.aiMessage.findMany({
          where: { conversationId: { in: convIds } },
          select: { conversationId: true, direction: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        });

        // agrupa por conversa
        const byConv = new Map<string, { inbound?: Date; outbound?: Date }>();
        for (const m of msgs) {
          const entry = byConv.get(m.conversationId) ?? {};
          if (m.direction === 'inbound' && !entry.inbound) entry.inbound = m.createdAt;
          if (m.direction === 'outbound' && entry.inbound && !entry.outbound) entry.outbound = m.createdAt;
          byConv.set(m.conversationId, entry);
        }

        const deltas: number[] = [];
        for (const { inbound, outbound } of byConv.values()) {
          if (inbound && outbound && outbound > inbound) {
            deltas.push((outbound.getTime() - inbound.getTime()) / 60_000);
          }
        }
        if (deltas.length > 0) {
          avgTimeToFirstResponseMinutes = Math.round(
            (deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10,
          ) / 10;
        }
      }
    } catch { /* fail-open: não bloqueia o dashboard */ }

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
      performance: {
        avgTimeToFirstResponseMinutes,
      },
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

  // ── Métricas do módulo de SUPORTE (ADR 015/016) ──────────────────────────
  // % resolvido sem escalonamento, tempo médio de resolução, volume por
  // categoria/prioridade e taxa de escalonamento por categoria.
  //
  // "Escalonado" considera tanto o status atual ('escalated') quanto o
  // histórico de stage (conversationStageHistory toStatus='escalated'),
  // porque um chamado escalado pode ser fechado depois por um humano
  // (setResolved também grava resolvedAt) — sem isso, "resolvido sem
  // escalonamento" ficaria inflado.
  async supportOverview(tenantId: string, range?: { from?: string; to?: string }) {
    const dw: any =
      range?.from || range?.to
        ? {
            createdAt: {
              ...(range.from ? { gte: new Date(range.from) } : {}),
              ...(range.to ? { lte: new Date(`${range.to}T23:59:59.999`) } : {}),
            },
          }
        : {};

    const tickets = await this.prisma.aiConversation.findMany({
      where: { tenantId, agentType: 'support' as any, ...dw },
      select: {
        id: true,
        status: true,
        ticketCategory: true,
        ticketPriority: true,
        createdAt: true,
        resolvedAt: true,
        stageHistory: { where: { toStatus: 'escalated' }, select: { id: true }, take: 1 },
      },
    });

    const total = tickets.length;
    const wasEscalated = (t: (typeof tickets)[number]) =>
      (t.status as string) === 'escalated' || t.stageHistory.length > 0;

    const escalatedTickets = tickets.filter(wasEscalated);
    const resolvedWithoutEscalation = tickets.filter((t) => t.resolvedAt && !wasEscalated(t));
    const resolvedTickets = tickets.filter((t) => t.resolvedAt);

    const avgTimeToResolutionHours =
      resolvedTickets.length > 0
        ? Math.round(
            (resolvedTickets.reduce((sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) /
              resolvedTickets.length /
              (60 * 60 * 1000)) *
              10,
          ) / 10
        : null;

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    const countBy = (key: 'ticketCategory' | 'ticketPriority') =>
      tickets.reduce((acc: Record<string, number>, t) => {
        const k = t[key] ?? 'null';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});

    const byCategory = countBy('ticketCategory');
    const escalationRateByCategory = Object.fromEntries(
      Object.keys(byCategory).map((cat) => {
        const inCat = tickets.filter((t) => (t.ticketCategory ?? 'null') === cat);
        const escalatedInCat = inCat.filter(wasEscalated).length;
        return [cat, pct(escalatedInCat, inCat.length)];
      }),
    );

    return {
      total,
      resolvedWithoutEscalation: {
        count: resolvedWithoutEscalation.length,
        pct: pct(resolvedWithoutEscalation.length, total),
      },
      escalated: { count: escalatedTickets.length, pct: pct(escalatedTickets.length, total) },
      avgTimeToResolutionHours,
      volumeByCategory: byCategory,
      volumeByPriority: countBy('ticketPriority'),
      escalationRateByCategory,
    };
  }

  // YYYY-MM-DD no fuso local (chave de bucket diária).
  private isoDay(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Efetividade de uma campanha individual (A2).
  // Retorna: enviados, entregues (ack≥2), lidos (ack≥3), respondidos, convertidos (won), opt-outs.
  async campaignMetrics(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, name: true, channel: true, status: true, createdAt: true, startedAt: true },
    });
    if (!campaign) return null;

    const [targets, ackRows] = await Promise.all([
      this.prisma.campaignTarget.groupBy({
        by: ['status'],
        where: { campaignId, tenantId },
        _count: { _all: true },
      }),
      this.prisma.aiMessage.groupBy({
        by: ['ack'],
        where: { tenantId, direction: 'outbound', intent: 'outbound_campaign',
          metadata: { path: ['campaignId'], equals: campaignId } },
        _count: { _all: true },
      }),
    ]);

    const targetMap = targets.reduce((a, r) => ({ ...a, [r.status]: r._count._all }), {} as Record<string, number>);
    const sent      = (targetMap['sent']    ?? 0) + (targetMap['failed'] ?? 0) + (targetMap['sending'] ?? 0);
    const failed    = targetMap['failed']   ?? 0;
    const pct       = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    const ackAtLeast = (min: number) =>
      ackRows.filter(r => (r.ack ?? 0) >= min).reduce((a, r) => a + r._count._all, 0);
    const msgTotal  = ackRows.reduce((a, r) => a + r._count._all, 0);
    const delivered = ackAtLeast(2);
    const read      = ackAtLeast(3);

    // Conversas que receberam esta campanha
    const campConvRows = await this.prisma.aiMessage.findMany({
      where: { tenantId, direction: 'outbound', intent: 'outbound_campaign',
        metadata: { path: ['campaignId'], equals: campaignId } },
      select: { conversationId: true },
      distinct: ['conversationId'],
    });
    const convIds = campConvRows.map(r => r.conversationId);

    // Respondidos: conversas com campanha que tiveram inbound posterior
    const repliedRows = convIds.length
      ? await this.prisma.aiMessage.groupBy({
          by: ['conversationId'],
          where: { conversationId: { in: convIds }, direction: 'inbound' },
          _count: { _all: true },
        })
      : [];

    // Convertidos: conversas marcadas como won
    const convertedCount = convIds.length
      ? await this.prisma.aiConversation.count({ where: { id: { in: convIds }, outcome: 'won' } })
      : 0;

    // Opt-outs gerados por esta campanha (conversa da campanha com opt_out)
    const optOutCount = convIds.length
      ? await this.prisma.aiConversation.count({ where: { id: { in: convIds }, status: 'opt_out' as any } })
      : 0;

    const replied = repliedRows.length;

    return {
      campaign,
      targets: {
        total: Object.values(targetMap).reduce((a, b) => a + b, 0),
        sent,
        failed,
        byStatus: targetMap,
      },
      messages: {
        total: msgTotal,
        delivered,
        read,
        deliveredPct: pct(delivered, msgTotal),
        readPct: pct(read, msgTotal),
      },
      engagement: {
        replied,
        repliedPct: pct(replied, convIds.length),
        converted: convertedCount,
        convertedPct: pct(convertedCount, convIds.length),
        optOut: optOutCount,
        optOutPct: pct(optOutCount, convIds.length),
      },
    };
  }

  // Taxa IA vs Humano (A1): percentual de resoluções sem escalonamento + série dos últimos N dias.
  async resolutionMetrics(tenantId: string, days = 7) {
    const from = new Date(Date.now() - (days - 1) * 86_400_000);
    from.setHours(0, 0, 0, 0);

    const convs = await this.prisma.aiConversation.findMany({
      where: { tenantId, createdAt: { gte: from } },
      select: {
        id: true,
        status: true,
        outcome: true,
        createdAt: true,
        resolvedAt: true,
        stageHistory: { where: { toStatus: 'escalated' }, select: { id: true }, take: 1 },
      },
    });

    const wasEscalated = (c: (typeof convs)[number]) =>
      (c.status as string) === 'escalated' || c.stageHistory.length > 0;
    const total        = convs.length;
    const resolved     = convs.filter(c => c.resolvedAt).length;
    const escalated    = convs.filter(wasEscalated).length;
    const resolvedByAI = convs.filter(c => c.resolvedAt && !wasEscalated(c)).length;
    const pct          = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    // Série diária
    const days_ = Array.from({ length: days }, (_, i) => {
      const d = new Date(from); d.setDate(d.getDate() + i); return this.isoDay(d);
    });
    const buckets = new Map(days_.map(k => [k, { day: k, total: 0, resolvedByAI: 0, escalated: 0 }]));
    for (const c of convs) {
      const b = buckets.get(this.isoDay(c.createdAt));
      if (!b) continue;
      b.total++;
      if (wasEscalated(c)) b.escalated++;
      else if (c.resolvedAt) b.resolvedByAI++;
    }

    return {
      period: { days, from: this.isoDay(from), to: this.isoDay(new Date()) },
      totals: {
        conversations: total,
        resolved,
        resolvedByAI,
        escalated,
        resolvedByAIPct: pct(resolvedByAI, resolved),
        escalatedPct: pct(escalated, total),
      },
      series: days_.map(k => buckets.get(k)!),
    };
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
