/**
 * ProactiveExecutorService — unit tests
 *
 * Covers the dispatcher and rule handlers:
 *   • L1 stale_open  → notify + RESOLVED
 *   • L1 sla_breach  → escalation notification + RESOLVED
 *   • L2 lead_no_reply + autonomy ON  → AUTO_EXECUTED
 *   • L2 lead_no_reply + autonomy OFF → notify + RESOLVED
 *   • L1 campaign_followup → notify + RESOLVED
 *   • L3 ticket.auto_close + autonomy ON  → closes conversation + AUTO_EXECUTED
 *   • L3 ticket.auto_close + autonomy OFF → DISMISSED
 *   • digest → sends count notification + RESOLVED
 *   • unknown ruleId → logged and skipped (no throw)
 *   • executeAll processes only OPEN events
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProactiveExecutorService } from './proactive-executor.service';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'ev1',
    tenantId: 't1',
    ruleId: 'conversation.stale_open',
    subjectId: 'conv1',
    level: 'L1',
    severity: 'OVERDUE',
    metadata: { idleMin: 180 },
    ...overrides,
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  pendingConversationEvent: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  aiMessage: {
    findFirst: vi.fn(),
  },
  aiConversation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
};

const mockAutonomy     = { isEnabled: vi.fn() };
const mockNotifications = { create: vi.fn() };
// SLA estourado avisa o CLIENTE, não só o time (handleSlaBreach → ackCustomerWaiting).
const mockConversations = { addMessage: vi.fn() };

function makeService() {
  return new ProactiveExecutorService(
    mockPrisma as any,
    mockAutonomy as any,
    mockNotifications as any,
    mockConversations as any,
  );
}

// ── shared defaults ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([]);
  mockPrisma.pendingConversationEvent.update.mockResolvedValue({});
  mockPrisma.aiConversation.findMany.mockResolvedValue([]);
  mockPrisma.aiConversation.updateMany.mockResolvedValue({});
  mockPrisma.aiConversation.count.mockResolvedValue(0);

  mockAutonomy.isEnabled.mockReturnValue(false); // OFF by default
  mockNotifications.create.mockResolvedValue(undefined);
  mockConversations.addMessage.mockResolvedValue(undefined);
  mockPrisma.aiMessage.findFirst.mockResolvedValue(null); // ainda nao avisou o cliente
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ProactiveExecutorService.executeAll()', () => {
  it('queries only OPEN events with cap of 200', async () => {
    const svc = makeService();
    await svc.executeAll();

    expect(mockPrisma.pendingConversationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'OPEN' }),
        take: 200,
      }),
    );
  });

  it('does nothing when there are no OPEN events', async () => {
    const svc = makeService();
    await svc.executeAll();

    expect(mockNotifications.create).not.toHaveBeenCalled();
    expect(mockPrisma.pendingConversationEvent.update).not.toHaveBeenCalled();
  });

  it('does not throw if one event errors — processes the rest', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ id: 'ev1' }),
      makeEvent({ id: 'ev2' }),
    ]);
    // First notification throws
    mockNotifications.create
      .mockRejectedValueOnce(new Error('notification failed'))
      .mockResolvedValueOnce(undefined);

    const svc = makeService();
    await expect(svc.executeAll()).resolves.not.toThrow();
    // Second event should still be processed
    expect(mockNotifications.create).toHaveBeenCalledTimes(2);
  });
});

describe('stale_open handler (L1)', () => {
  it('sends notification and marks event as RESOLVED', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.stale_open', level: 'L1', metadata: { idleMin: 180 } }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    expect(mockNotifications.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ link: '/inbox/conv1' }),
    );
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED', resolvedAt: expect.any(Date) } }),
    );
  });

  it('notification title includes idle time in hours', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.stale_open', metadata: { idleMin: 120 } }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    const notifTitle: string = mockNotifications.create.mock.calls[0][1].title;
    expect(notifTitle).toContain('2h');
  });
});

describe('sla_breach handler', () => {
  it('sends escalation notification and marks RESOLVED', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.sla_breach', severity: 'CRITICAL' }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    expect(mockNotifications.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ type: 'escalation' }),
    );
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED', resolvedAt: expect.any(Date) } }),
    );
  });

  // Antes só existia o alerta interno: quem foi escalado às 18h de sexta ficava sem
  // resposta nenhuma até segunda, sem saber se alguém tinha visto.
  it('avisa o CLIENTE que a mensagem está com a equipe', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.sla_breach', severity: 'CRITICAL' }),
    ]);

    await makeService().executeAll();

    expect(mockConversations.addMessage).toHaveBeenCalledWith(
      't1',
      'conv1',
      expect.objectContaining({ direction: 'outbound', intent: 'sla_ack' }),
    );
    const enviado = mockConversations.addMessage.mock.calls[0][2].content as string;
    // Não pode prometer prazo: o backend não sabe quando um humano vai pegar, e
    // promessa não cumprida é a segunda quebra de confiança.
    expect(enviado).not.toMatch(/\d+\s*(min|hora|h\b|dia)/i);
  });

  it('não repete o aviso enquanto ninguém atende', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.sla_breach', severity: 'CRITICAL' }),
    ]);
    mockPrisma.aiMessage.findFirst.mockResolvedValue({ id: 'msg-ja-avisou' });

    await makeService().executeAll();

    // A regra redispara a cada ciclo; sem esta trava o cliente receberia
    // "já estamos vendo" de 15 em 15 minutos, o que irrita mais que o silêncio.
    expect(mockConversations.addMessage).not.toHaveBeenCalled();
    expect(mockNotifications.create).toHaveBeenCalled(); // o time continua sendo alertado
  });

  it('falha ao avisar o cliente não impede o evento de ser resolvido', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.sla_breach', severity: 'CRITICAL' }),
    ]);
    mockConversations.addMessage.mockRejectedValue(new Error('WAHA fora'));

    await makeService().executeAll();

    // Sem isso a fila de eventos entope e o time para de receber alerta de SLA.
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED', resolvedAt: expect.any(Date) } }),
    );
  });
});

describe('lead_no_reply handler', () => {
  it('L1 fallback: notifies and marks RESOLVED when autonomy is OFF', async () => {
    mockAutonomy.isEnabled.mockReturnValue(false);
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.lead_no_reply', level: 'L1', metadata: { idleMin: 90 } }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    expect(mockNotifications.create).toHaveBeenCalled();
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED', resolvedAt: expect.any(Date) } }),
    );
  });

  it('L2 + autonomy ON: auto-executes and marks AUTO_EXECUTED', async () => {
    mockAutonomy.isEnabled.mockReturnValue(true);
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.lead_no_reply', level: 'L2', metadata: { idleMin: 90 } }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    expect(mockPrisma.aiConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conv1', tenantId: 't1' } }),
    );
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AUTO_EXECUTED', resolvedAt: expect.any(Date) } }),
    );
  });
});

describe('campaign.followup_due handler', () => {
  it('notifies and marks RESOLVED', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'campaign.followup_due', metadata: { campaignId: 'camp1', phone: '5511999' } }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    expect(mockNotifications.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ link: '/campaigns' }),
    );
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED', resolvedAt: expect.any(Date) } }),
    );
  });
});

describe('ticket.auto_close handler', () => {
  it('autonomy OFF → DISMISSED without touching the conversation', async () => {
    mockAutonomy.isEnabled.mockReturnValue(false);
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'ticket.auto_close', level: 'L3' }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    expect(mockPrisma.aiConversation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DISMISSED', resolvedAt: expect.any(Date) } }),
    );
  });

  it('autonomy ON → closes conversation and marks AUTO_EXECUTED', async () => {
    mockAutonomy.isEnabled.mockReturnValue(true);
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'ticket.auto_close', level: 'L3' }),
    ]);

    const svc = makeService();
    await svc.executeAll();

    expect(mockPrisma.aiConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'closed', outcome: 'resolved' }),
      }),
    );
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AUTO_EXECUTED', resolvedAt: expect.any(Date) } }),
    );
  });
});

describe('conversation.digest handler', () => {
  it('notifies when there are open conversations', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.digest', metadata: {} }),
    ]);
    mockPrisma.aiConversation.count.mockResolvedValue(5);

    const svc = makeService();
    await svc.executeAll();

    const notifTitle: string = mockNotifications.create.mock.calls[0][1].title;
    expect(notifTitle).toContain('5');
  });

  it('does NOT notify when count is 0', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'conversation.digest', metadata: {} }),
    ]);
    mockPrisma.aiConversation.count.mockResolvedValue(0);

    const svc = makeService();
    await svc.executeAll();

    expect(mockNotifications.create).not.toHaveBeenCalled();
    // Even with 0 count, event should be resolved
    expect(mockPrisma.pendingConversationEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RESOLVED', resolvedAt: expect.any(Date) } }),
    );
  });
});

describe('unknown ruleId', () => {
  it('skips gracefully without throwing', async () => {
    mockPrisma.pendingConversationEvent.findMany.mockResolvedValue([
      makeEvent({ ruleId: 'unknown.rule.xyz' }),
    ]);

    const svc = makeService();
    await expect(svc.executeAll()).resolves.not.toThrow();
    expect(mockPrisma.pendingConversationEvent.update).not.toHaveBeenCalled();
  });
});
