import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsService } from './conversations.service';

// ─── C1: setResolved gera csatToken no fechamento manual ─────────────────────

function makeDeps() {
  const prisma = {
    aiConversation: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    aiMessage: { create: vi.fn().mockResolvedValue({ id: 'msg-1' }) },
    conversationStageHistory: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  } as any;

  const events = { emit: vi.fn() } as any;
  const waha = { sendText: vi.fn().mockResolvedValue({ sent: true }) } as any;

  return { prisma, events, waha };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new ConversationsService(deps.prisma, deps.events, deps.waha);
}

const existingConv = {
  id: 'conv-1',
  tenantId: 't1',
  status: 'open',
  outcome: null,
};

describe('ConversationsService — C1 setResolved gera csatToken', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findFirst.mockResolvedValue(existingConv);
  });

  it('resolved=true: grava csatToken string unico no update', async () => {
    await svc.setResolved('t1', 'conv-1', true);

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.csatToken).toBeDefined();
    expect(typeof updateCall.data.csatToken).toBe('string');
    expect(updateCall.data.csatToken.length).toBeGreaterThan(10);
    expect(updateCall.data.status).toBe('closed');
    expect(updateCall.data.outcome).toBe('resolved');
  });

  it('resolved=true: csatToken diferente a cada chamada (unicidade)', async () => {
    await svc.setResolved('t1', 'conv-1', true);
    await svc.setResolved('t1', 'conv-1', true);

    const token1 = deps.prisma.aiConversation.update.mock.calls[0][0].data.csatToken;
    const token2 = deps.prisma.aiConversation.update.mock.calls[1][0].data.csatToken;
    expect(token1).not.toBe(token2);
  });

  it('resolved=false (reabertura): NAO inclui csatToken no update', async () => {
    await svc.setResolved('t1', 'conv-1', false);

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.csatToken).toBeUndefined();
    expect(updateCall.data.status).toBe('open');
  });

  it('retorna status e outcome corretos', async () => {
    const result = await svc.setResolved('t1', 'conv-1', true);
    expect(result).toEqual({ id: 'conv-1', status: 'closed', outcome: 'resolved' });
  });
});

// ─── ADR 035: takeover humano por conversa ───────────────────────────────────

describe('ConversationsService — ADR 035 takeover humano', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('addMessage byHuman + outbound ativa o takeover (uma vez)', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      sourceChannel: 'web_chat', // pula o envio WAHA — foco no takeover
      correlationId: 'corr-1',
      humanTakeoverAt: null,
    });

    await svc.addMessage('t1', 'conv-1', { direction: 'outbound', content: 'oi, sou humano', byHuman: true });

    const takeoverUpdate = deps.prisma.aiConversation.update.mock.calls.find(
      (c: any[]) => c[0]?.data?.humanTakeoverAt instanceof Date,
    );
    expect(takeoverUpdate).toBeDefined();
  });

  it('addMessage byHuman com takeover JÁ ativo não seta de novo', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      sourceChannel: 'web_chat',
      correlationId: 'corr-1',
      humanTakeoverAt: new Date('2026-07-20T10:00:00Z'),
    });

    await svc.addMessage('t1', 'conv-1', { direction: 'outbound', content: 'segunda msg', byHuman: true });

    const takeoverUpdate = deps.prisma.aiConversation.update.mock.calls.find(
      (c: any[]) => c[0]?.data?.humanTakeoverAt instanceof Date,
    );
    expect(takeoverUpdate).toBeUndefined();
  });

  it('addMessage da Lia (sem byHuman) NUNCA ativa takeover', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      sourceChannel: 'web_chat',
      correlationId: 'corr-1',
      humanTakeoverAt: null,
    });

    await svc.addMessage('t1', 'conv-1', {
      direction: 'outbound',
      content: 'resposta da Lia',
      metadata: { aiGenerated: true },
    });

    const takeoverUpdate = deps.prisma.aiConversation.update.mock.calls.find(
      (c: any[]) => c[0]?.data?.humanTakeoverAt instanceof Date,
    );
    expect(takeoverUpdate).toBeUndefined();
  });

  it('returnToAi limpa humanTakeoverAt e reabre conversa escalada (com histórico)', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      status: 'escalated',
    });

    const r = await svc.returnToAi('t1', 'conv-1');

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.humanTakeoverAt).toBeNull();
    expect(updateCall.data.status).toBe('open');
    expect(deps.prisma.conversationStageHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'devolvido_para_lia' }) }),
    );
    expect(r.status).toBe('open');
  });

  it('returnToAi em conversa não-escalada: só limpa o flag, status intacto', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ ...existingConv, status: 'open' });

    const r = await svc.returnToAi('t1', 'conv-1');

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.humanTakeoverAt).toBeNull();
    expect(updateCall.data.status).toBeUndefined();
    expect(deps.prisma.conversationStageHistory.create).not.toHaveBeenCalled();
    expect(r.status).toBe('open');
  });

  it('closeConversation limpa o takeover junto (D3 — fechou, Lia volta)', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ ...existingConv, status: 'open' });

    await svc.closeConversation('t1', 'conv-1', 'won');

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.humanTakeoverAt).toBeNull();
    expect(updateCall.data.status).toBe('closed');
  });
});
