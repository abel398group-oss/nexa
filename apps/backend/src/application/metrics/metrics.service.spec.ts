import { MetricsService } from './metrics.service';

function ticket(overrides: {
  id: string;
  status?: string;
  ticketCategory?: string | null;
  ticketPriority?: string | null;
  createdAt: Date;
  resolvedAt?: Date | null;
  escalatedInHistory?: boolean;
}) {
  return {
    id: overrides.id,
    status: overrides.status ?? 'open',
    ticketCategory: overrides.ticketCategory ?? null,
    ticketPriority: overrides.ticketPriority ?? null,
    createdAt: overrides.createdAt,
    resolvedAt: overrides.resolvedAt ?? null,
    stageHistory: overrides.escalatedInHistory ? [{ id: 'hist-1' }] : [],
  };
}

function mockPrisma(tickets: ReturnType<typeof ticket>[]) {
  return { aiConversation: { findMany: vi.fn().mockResolvedValue(tickets) } } as any;
}

const hours = (n: number) => n * 60 * 60 * 1000;

describe('MetricsService.supportOverview', () => {
  it('scopes the query to agentType=support for the given tenant', async () => {
    const prisma = mockPrisma([]);
    const svc = new MetricsService(prisma);

    await svc.supportOverview('tenant-1');

    expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', agentType: 'support' } }),
    );
  });

  it('returns zeroed metrics when there are no support tickets', async () => {
    const prisma = mockPrisma([]);
    const svc = new MetricsService(prisma);

    const result = await svc.supportOverview('tenant-1');

    expect(result.total).toBe(0);
    expect(result.resolvedWithoutEscalation).toEqual({ count: 0, pct: 0 });
    expect(result.escalated).toEqual({ count: 0, pct: 0 });
    expect(result.avgTimeToResolutionHours).toBeNull();
  });

  it('counts a ticket as resolved-without-escalation only when resolved AND never escalated', async () => {
    const t0 = new Date('2026-06-01T00:00:00.000Z');
    const tickets = [
      // Resolvido pela IA, nunca escalado → conta como "sem escalonamento"
      ticket({ id: 'a', resolvedAt: new Date(t0.getTime() + hours(2)), createdAt: t0 }),
      // Foi escalado (status atual) e depois um humano marcou resolvido → NÃO conta como "sem escalonamento"
      ticket({ id: 'b', status: 'escalated', resolvedAt: new Date(t0.getTime() + hours(5)), createdAt: t0 }),
      // Foi escalado no passado (stage history) mesmo já fechado → também não conta
      ticket({
        id: 'c',
        status: 'closed',
        resolvedAt: new Date(t0.getTime() + hours(3)),
        createdAt: t0,
        escalatedInHistory: true,
      }),
      // Ainda aberto, sem resolução
      ticket({ id: 'd', createdAt: t0 }),
    ];
    const prisma = mockPrisma(tickets);
    const svc = new MetricsService(prisma);

    const result = await svc.supportOverview('tenant-1');

    expect(result.total).toBe(4);
    expect(result.resolvedWithoutEscalation).toEqual({ count: 1, pct: 25 });
    expect(result.escalated).toEqual({ count: 2, pct: 50 });
  });

  it('computes the average time-to-resolution in hours across resolved tickets', async () => {
    const t0 = new Date('2026-06-01T00:00:00.000Z');
    const tickets = [
      ticket({ id: 'a', createdAt: t0, resolvedAt: new Date(t0.getTime() + hours(2)) }),
      ticket({ id: 'b', createdAt: t0, resolvedAt: new Date(t0.getTime() + hours(4)) }),
      ticket({ id: 'c', createdAt: t0 }), // não resolvido, não entra na média
    ];
    const prisma = mockPrisma(tickets);
    const svc = new MetricsService(prisma);

    const result = await svc.supportOverview('tenant-1');

    expect(result.avgTimeToResolutionHours).toBe(3);
  });

  it('groups volume by category and priority', async () => {
    const t0 = new Date('2026-06-01T00:00:00.000Z');
    const tickets = [
      ticket({ id: 'a', createdAt: t0, ticketCategory: 'cte', ticketPriority: 'high' }),
      ticket({ id: 'b', createdAt: t0, ticketCategory: 'cte', ticketPriority: 'medium' }),
      ticket({ id: 'c', createdAt: t0, ticketCategory: 'financeiro', ticketPriority: 'high' }),
      ticket({ id: 'd', createdAt: t0 }), // sem categoria/prioridade ainda
    ];
    const prisma = mockPrisma(tickets);
    const svc = new MetricsService(prisma);

    const result = await svc.supportOverview('tenant-1');

    expect(result.volumeByCategory).toEqual({ cte: 2, financeiro: 1, null: 1 });
    expect(result.volumeByPriority).toEqual({ high: 2, medium: 1, null: 1 });
  });

  it('computes the escalation rate per category', async () => {
    const t0 = new Date('2026-06-01T00:00:00.000Z');
    const tickets = [
      ticket({ id: 'a', createdAt: t0, ticketCategory: 'fiscal', status: 'escalated' }),
      ticket({ id: 'b', createdAt: t0, ticketCategory: 'fiscal' }),
      ticket({ id: 'c', createdAt: t0, ticketCategory: 'treinamento' }),
    ];
    const prisma = mockPrisma(tickets);
    const svc = new MetricsService(prisma);

    const result = await svc.supportOverview('tenant-1');

    expect(result.escalationRateByCategory.fiscal).toBe(50);
    expect(result.escalationRateByCategory.treinamento).toBe(0);
  });

  it('applies the from/to date range to the createdAt filter', async () => {
    const prisma = mockPrisma([]);
    const svc = new MetricsService(prisma);

    await svc.supportOverview('tenant-1', { from: '2026-06-01', to: '2026-06-10' });

    const call = prisma.aiConversation.findMany.mock.calls[0][0];
    expect(call.where.createdAt.gte).toEqual(new Date('2026-06-01'));
    expect(call.where.createdAt.lte).toEqual(new Date('2026-06-10T23:59:59.999'));
  });
});
