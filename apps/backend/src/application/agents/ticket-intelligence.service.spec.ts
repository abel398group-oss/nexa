import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketIntelligenceService } from './ticket-intelligence.service';

// §3 (auditoria de suporte, 2026-08-05): duas correções na mesma função
// (detectRecurrence) — a comparação de rootCause virou case-insensitive, e o
// dedup de notificação parou de usar o título (que embute a contagem viva e
// nunca repete) e passou a usar o trecho da causa-raiz gravado no corpo.

function makeDeps() {
  const prisma = {
    aiConversation: { count: vi.fn().mockResolvedValue(0) },
    notification: { findFirst: vi.fn().mockResolvedValue(null) },
  } as any;
  const notifications = { create: vi.fn().mockResolvedValue({}) } as any;
  const knowledge = {} as any;
  const ai = {} as any;
  const lock = { acquire: vi.fn() } as any;
  return { prisma, notifications, knowledge, ai, lock };
}

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'conv-1',
    tenantId: 't1',
    status: 'closed',
    ticketCategory: 'fiscal',
    ticketPriority: 'high',
    rootCause: 'Certificado digital vencido',
    outcome: null,
    resolvedAt: null,
    stageHistory: [],
    ...overrides,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new TicketIntelligenceService(deps.prisma, deps.notifications, deps.knowledge, deps.ai, deps.lock);
}

describe('TicketIntelligenceService — §3 detectRecurrence', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: TicketIntelligenceService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('conta recorrência com comparação case-insensitive e valor aparado', async () => {
    deps.prisma.aiConversation.count.mockResolvedValue(2); // +1 (atual) = 3 = threshold default

    await svc.analyze(makeTicket({ rootCause: '  Certificado Vencido  ' }));

    const query = deps.prisma.aiConversation.count.mock.calls[0][0];
    expect(query.where.rootCause).toEqual({ equals: 'Certificado Vencido', mode: 'insensitive' });
  });

  it('não cria notificação quando a contagem fica abaixo do limiar', async () => {
    deps.prisma.aiConversation.count.mockResolvedValue(1); // +1 = 2 < 3

    await svc.analyze(makeTicket());

    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('dedup busca pelo trecho da causa-raiz no corpo, não pelo título com contagem', async () => {
    deps.prisma.aiConversation.count.mockResolvedValue(2);

    await svc.analyze(makeTicket({ rootCause: 'Certificado digital vencido' }));

    const query = deps.prisma.notification.findFirst.mock.calls[0][0];
    expect(query.where.body).toEqual({ contains: 'Certificado digital vencido', mode: 'insensitive' });
    expect(query.where.title).toBeUndefined();
  });

  it('não duplica quando já existe notificação recente para a mesma causa (dedup real)', async () => {
    deps.prisma.aiConversation.count.mockResolvedValue(2);
    deps.prisma.notification.findFirst.mockResolvedValue({ id: 'notif-existing' });

    await svc.analyze(makeTicket());

    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('cria notificação com o snippet da causa no corpo quando o limiar é atingido', async () => {
    deps.prisma.aiConversation.count.mockResolvedValue(2);

    await svc.analyze(makeTicket({ rootCause: 'Certificado digital vencido', ticketCategory: 'fiscal' }));

    expect(deps.notifications.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        type: 'recurrence',
        body: expect.stringContaining('Certificado digital vencido'),
      }),
    );
  });
});
