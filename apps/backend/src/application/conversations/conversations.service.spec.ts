import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsService } from './conversations.service';

// ─── C1: setResolved gera csatToken no fechamento manual ─────────────────────

function makeDeps() {
  const prisma = {
    aiConversation: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    conversationStageHistory: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  } as any;

  const events = { emit: vi.fn() } as any;
  const waha = { sendText: vi.fn() } as any;

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
