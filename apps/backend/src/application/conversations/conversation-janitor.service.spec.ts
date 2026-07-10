import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationJanitorService } from './conversation-janitor.service';

// ─── N4: Janitor — SLA por prioridade + dedup DB + notifyClose ───────────────

function makeDeps() {
  const prisma = {
    aiConversation: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    conversationStageHistory: { createMany: vi.fn().mockResolvedValue({}) },
    processedMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    contact: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockResolvedValue([]),
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as any;

  const waha = { sendText: vi.fn().mockResolvedValue(undefined) } as any;
  const notifications = { create: vi.fn().mockResolvedValue({}) } as any;

  return { prisma, waha, notifications };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new ConversationJanitorService(deps.prisma, deps.waha, deps.notifications);
}

// Expõe o método privado para teste (cast para any)
function callAlertSla(svc: ConversationJanitorService) {
  return (svc as any).alertSlaEscalated();
}

function callNotifyClose(svc: ConversationJanitorService, phones: string[], message: string) {
  return (svc as any).notifyClose(phones, message);
}

describe('ConversationJanitorService — N4 SLA por prioridade', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationJanitorService;

  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000 - 1000);

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('urgente (1h): alerta ticket com lastActivityAt há 2h', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c1', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(2), ticketPriority: 'urgente', slaAlertedAt: null },
    ]);

    await callAlertSla(svc);

    expect(deps.notifications.create).toHaveBeenCalledWith('t1', expect.objectContaining({ type: 'info' }));
    expect(deps.prisma.aiConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slaAlertedAt: expect.any(Date) }) }),
    );
  });

  it('normal (8h): NAO alerta ticket com lastActivityAt há 2h', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c2', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(2), ticketPriority: 'normal', slaAlertedAt: null },
    ]);

    await callAlertSla(svc);

    // ticket ficou 2h, SLA normal é 8h → não deve alertar
    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('baixa (24h): NAO alerta ticket com lastActivityAt há 8h', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c3', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(8), ticketPriority: 'baixa', slaAlertedAt: null },
    ]);

    await callAlertSla(svc);

    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('alta (4h): alerta ticket com lastActivityAt há 5h', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c4', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(5), ticketPriority: 'alta', slaAlertedAt: null },
    ]);

    await callAlertSla(svc);

    expect(deps.notifications.create).toHaveBeenCalled();
  });

  it('sem prioridade (null): usa fallback normal (8h)', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c5', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(10), ticketPriority: null, slaAlertedAt: null },
    ]);

    await callAlertSla(svc);

    // 10h > 8h (normal fallback) → deve alertar
    expect(deps.notifications.create).toHaveBeenCalled();
  });
});

describe('ConversationJanitorService — N4 dedup persistente (slaAlertedAt)', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationJanitorService;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000 - 1000);

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('nao re-alerta ticket com slaAlertedAt < 24h (dedup DB)', async () => {
    // O banco já filtra via slaAlertedAt na query — simula retorno vazio (filtrado pelo where)
    deps.prisma.aiConversation.findMany.mockResolvedValue([]);

    await callAlertSla(svc);

    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('re-alerta ticket cujo slaAlertedAt tem >24h (dedup expirado)', async () => {
    // Simula o banco retornando o ticket (filtro slaAlertedAt > 24h passou)
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c6', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(10), ticketPriority: 'alta', slaAlertedAt: hoursAgo(25) },
    ]);

    await callAlertSla(svc);

    expect(deps.notifications.create).toHaveBeenCalled();
    // slaAlertedAt deve ser atualizado
    expect(deps.prisma.aiConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['c6'] } }) }),
    );
  });
});

describe('ConversationJanitorService — N4 notifyClose pula portal: e email:', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationJanitorService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('nao chama WAHA para phone com prefixo portal:', () => {
    callNotifyClose(svc, ['portal:ext123', '5511999999999'], 'encerrado');

    expect(deps.waha.sendText).toHaveBeenCalledTimes(1);
    expect(deps.waha.sendText).toHaveBeenCalledWith('5511999999999', expect.any(String));
  });

  it('nao chama WAHA para phone com prefixo email:', () => {
    callNotifyClose(svc, ['email:foo@bar.com', '5511999999999'], 'encerrado');

    expect(deps.waha.sendText).toHaveBeenCalledTimes(1);
    expect(deps.waha.sendText).toHaveBeenCalledWith('5511999999999', expect.any(String));
  });

  it('nao chama WAHA quando todos os phones sao sinteticos', () => {
    callNotifyClose(svc, ['portal:abc', 'email:x@y.com'], 'encerrado');

    expect(deps.waha.sendText).not.toHaveBeenCalled();
  });

  it('chama WAHA para phone real normalmente', () => {
    callNotifyClose(svc, ['5511988887777'], 'encerrado');

    expect(deps.waha.sendText).toHaveBeenCalledWith('5511988887777', 'encerrado');
  });
});
