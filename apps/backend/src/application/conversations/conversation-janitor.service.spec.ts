import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  const ticketSync = { markPending: vi.fn().mockResolvedValue(undefined) } as any;

  return { prisma, waha, notifications, ticketSync };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new ConversationJanitorService(
    deps.prisma, deps.waha, deps.notifications,
    { acquire: async () => async () => {} } as any,
    deps.ticketSync,
  );
}

// Expõe o método privado para teste (cast para any)
function callAlertSla(svc: ConversationJanitorService) {
  return (svc as any).alertSlaEscalated();
}

function callNotifyClose(svc: ConversationJanitorService, phones: string[], message: string) {
  return (svc as any).notifyClose(phones, message);
}

// As chaves do SLA eram só PT (urgente/alta/normal/baixa), mas quem grava
// ticketPriority é o classificador, em EN (critical/high/medium/low) — nenhuma
// batia, e TODO ticket caía no default de 8h: um chamado crítico era tratado
// igual a um de prioridade baixa. Estes casos cobrem o vocabulário real.
// Relógio fixo: quarta-feira, 17:00 BRT (20:00 UTC). Sem isto os casos ficam
// dependentes da hora em que a suíte roda — o SLA agora conta horário útil, e
// "9 horas atrás" às 6h da manhã tem menos horas úteis do que às 17h.
const QUARTA_17H_BRT = new Date('2026-08-05T20:00:00Z');

describe('ConversationJanitorService — SLA com as prioridades que o classificador grava', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationJanitorService;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000 - 1000);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(QUARTA_17H_BRT);
    deps = makeDeps(); svc = makeService(deps);
  });
  afterEach(() => vi.useRealTimers());

  it('critical (1h): alerta com 2h parado — nao espera as 8h do default', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c1', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(2), ticketPriority: 'critical', slaAlertedAt: null },
    ]);
    await callAlertSla(svc);
    expect(deps.notifications.create).toHaveBeenCalled();
  });

  it('high (4h): alerta com 5h parado', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c2', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(5), ticketPriority: 'high', slaAlertedAt: null },
    ]);
    await callAlertSla(svc);
    expect(deps.notifications.create).toHaveBeenCalled();
  });

  it('high (4h): NAO alerta com 2h parado', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c3', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(2), ticketPriority: 'high', slaAlertedAt: null },
    ]);
    await callAlertSla(svc);
    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('low (24h): NAO alerta com 10h parado', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c4', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(10), ticketPriority: 'low', slaAlertedAt: null },
    ]);
    await callAlertSla(svc);
    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('medium (8h): alerta com 9h parado', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'c5', phone: '5511', tenantId: 't1', lastActivityAt: hoursAgo(9), ticketPriority: 'medium', slaAlertedAt: null },
    ]);
    await callAlertSla(svc);
    expect(deps.notifications.create).toHaveBeenCalled();
  });

  // O caso que gerava o alerta impossível: o relógio corria a noite e o fim de
  // semana, e o time chegava na segunda com violação que nunca teve como atender.
  it('fim de semana NAO conta: critico aberto sabado nao alerta no domingo', async () => {
    vi.setSystemTime(new Date('2026-08-09T15:00:00Z')); // domingo, 12:00 BRT
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      {
        id: 'c6', phone: '5511', tenantId: 't1',
        lastActivityAt: new Date('2026-08-08T13:00:00Z'), // sábado 10:00 BRT
        ticketPriority: 'critical', slaAlertedAt: null,
      },
    ]);
    await callAlertSla(svc);
    expect(deps.notifications.create).not.toHaveBeenCalled();
  });

  it('mesmo critico do fim de semana alerta na segunda, depois de 1h util', async () => {
    vi.setSystemTime(new Date('2026-08-10T12:30:00Z')); // segunda, 09:30 BRT
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      {
        id: 'c7', phone: '5511', tenantId: 't1',
        lastActivityAt: new Date('2026-08-08T13:00:00Z'), // sábado 10:00 BRT
        ticketPriority: 'critical', slaAlertedAt: null,
      },
    ]);
    await callAlertSla(svc);
    expect(deps.notifications.create).toHaveBeenCalled();
  });
});

describe('ConversationJanitorService — N4 SLA por prioridade', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationJanitorService;

  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000 - 1000);

  beforeEach(() => {
    // mesmo relógio fixo do bloco acima — o SLA conta horário útil
    vi.useFakeTimers();
    vi.setSystemTime(QUARTA_17H_BRT);
    deps = makeDeps();
    svc = makeService(deps);
  });
  afterEach(() => vi.useRealTimers());

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

// ─── C1: closeResolvedSupport gera csatToken por ticket ──────────────────────
describe('ConversationJanitorService — C1 csatToken gerado no closeResolvedSupport', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationJanitorService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('chama update individual por ticket (nao updateMany) com csatToken unico', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'conv-1', status: 'open', phone: '5511111' },
      { id: 'conv-2', status: 'open', phone: '5522222' },
    ]);
    // $transaction recebe array de promises — simular execucao
    deps.prisma.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));
    deps.prisma.aiConversation.update.mockResolvedValue({});
    deps.prisma.conversationStageHistory.createMany.mockResolvedValue({ count: 2 });

    await (svc as any).closeResolvedSupport();

    // Deve chamar update (nao updateMany) para cada ticket
    expect(deps.prisma.aiConversation.update).toHaveBeenCalledTimes(2);

    const call1 = deps.prisma.aiConversation.update.mock.calls[0][0];
    const call2 = deps.prisma.aiConversation.update.mock.calls[1][0];

    // Cada chamado recebe csatToken string unico
    expect(typeof call1.data.csatToken).toBe('string');
    expect(typeof call2.data.csatToken).toBe('string');
    expect(call1.data.csatToken).not.toBe(call2.data.csatToken);

    // Status e outcome corretos
    expect(call1.data.status).toBe('closed');
    expect(call1.data.outcome).toBe('resolved');
  });

  it('nenhum ticket autoCloseAt vencido: nao chama update', async () => {
    deps.prisma.aiConversation.findMany.mockResolvedValue([]);

    await (svc as any).closeResolvedSupport();

    expect(deps.prisma.aiConversation.update).not.toHaveBeenCalled();
    expect(deps.prisma.$transaction).not.toHaveBeenCalled();
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
