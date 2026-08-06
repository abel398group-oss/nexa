import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsService } from './conversations.service';

// ─── C1: setResolved gera csatToken no fechamento manual ─────────────────────

function makeDeps() {
  const prisma = {
    aiConversation: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
    },
    aiMessage: { create: vi.fn().mockResolvedValue({ id: 'msg-1' }), findMany: vi.fn().mockResolvedValue([]) },
    conversationStageHistory: { create: vi.fn().mockResolvedValue({}) },
    user: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
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

// ─── findOrCreateWebChat — reaproveita chamado aberto pelo formulário (portal) ─
// Regressão: a busca só olhava sourceChannel 'web_chat', então um cliente que
// abria chamado pelo formulário (sourceChannel 'portal') e depois abria o chat
// ao vivo ganhava uma SEGUNDA conversa em vez de continuar na mesma.

describe('ConversationsService — findOrCreateWebChat reaproveita portal e web_chat', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('busca inclui tanto web_chat quanto portal no sourceChannel', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv-portal-1' });

    await svc.findOrCreateWebChat('t1', 'ext-1', 'Cliente Teste');

    const query = deps.prisma.aiConversation.findFirst.mock.calls[0][0];
    expect(query.where.sourceChannel).toEqual({ in: ['web_chat', 'portal'] });
  });

  it('chamado aberto pelo formulário (sourceChannel portal) é reaproveitado, não duplicado', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv-portal-1' });

    const result = await svc.findOrCreateWebChat('t1', 'ext-1', 'Cliente Teste');

    expect(result).toEqual({ conversationId: 'conv-portal-1', isNew: false });
    expect(deps.prisma.aiConversation.create).not.toHaveBeenCalled();
  });
});

// ─── F12: atribuição de analista + nota interna ──────────────────────────────

describe('ConversationsService — F12 assignAnalyst', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findFirst.mockResolvedValue(existingConv);
  });

  it('assume o chamado: valida o analista do tenant e grava assignedAnalystId + assignedAnalystAt', async () => {
    deps.prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    deps.prisma.aiConversation.update.mockResolvedValue({
      assignedAnalystId: 'user-1',
      assignedAnalyst: { id: 'user-1', name: 'Ana' },
    });

    const r = await svc.assignAnalyst('t1', 'conv-1', 'user-1');

    expect(deps.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1', OR: [{ tenantId: 't1' }, { tenantId: null }] } }),
    );
    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.assignedAnalystId).toBe('user-1');
    expect(updateCall.data.assignedAnalystAt).toBeInstanceOf(Date);
    expect(r.assignedAnalyst).toEqual({ id: 'user-1', name: 'Ana' });
  });

  it('devolve pra fila geral (userId=null): não valida usuário, limpa assignedAnalystAt', async () => {
    await svc.assignAnalyst('t1', 'conv-1', null);

    expect(deps.prisma.user.findFirst).not.toHaveBeenCalled();
    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.assignedAnalystId).toBeNull();
    expect(updateCall.data.assignedAnalystAt).toBeNull();
  });

  it('analista de outro tenant (não encontrado): lança NotFoundException, não atribui', async () => {
    deps.prisma.user.findFirst.mockResolvedValue(null);

    await expect(svc.assignAnalyst('t1', 'conv-1', 'user-outro-tenant')).rejects.toThrow();
    expect(deps.prisma.aiConversation.update).not.toHaveBeenCalled();
  });
});

describe('ConversationsService — F12 getMessages filtra nota interna por padrão', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findFirst.mockResolvedValue(existingConv);
  });

  it('sem opts: filtra isInternal=false — é o default seguro (widget/portal/IA)', async () => {
    await svc.getMessages('t1', 'conv-1');

    expect(deps.prisma.aiMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: 'conv-1', isInternal: false } }),
    );
  });

  it('includeInternal=true: NÃO filtra — só a rota HTTP do Inbox usa isto', async () => {
    await svc.getMessages('t1', 'conv-1', { includeInternal: true });

    expect(deps.prisma.aiMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: 'conv-1' } }),
    );
  });
});

describe('ConversationsService — F12 addMessage com isInternal', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('nota interna em conversa de WhatsApp NUNCA chama o WAHA (regra crítica)', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      sourceChannel: 'whatsapp',
      correlationId: 'corr-1',
      humanTakeoverAt: null,
    });

    await svc.addMessage('t1', 'conv-1', {
      direction: 'outbound',
      content: 'nota confidencial pro time',
      byHuman: true,
      isInternal: true,
    });

    expect(deps.waha.sendText).not.toHaveBeenCalled();
  });

  it('nota interna NÃO ativa o takeover ADR 035 (não é resposta ao cliente)', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      sourceChannel: 'whatsapp',
      correlationId: 'corr-1',
      humanTakeoverAt: null,
    });

    await svc.addMessage('t1', 'conv-1', {
      direction: 'outbound',
      content: 'nota confidencial',
      byHuman: true,
      isInternal: true,
    });

    const takeoverUpdate = deps.prisma.aiConversation.update.mock.calls.find(
      (c: any[]) => c[0]?.data?.humanTakeoverAt instanceof Date,
    );
    expect(takeoverUpdate).toBeUndefined();
  });

  it('grava isInternal=true na linha da mensagem', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      sourceChannel: 'web_chat',
      correlationId: 'corr-1',
    });

    await svc.addMessage('t1', 'conv-1', { direction: 'outbound', content: 'nota', isInternal: true });

    const createCall = deps.prisma.aiMessage.create.mock.calls[0][0];
    expect(createCall.data.isInternal).toBe(true);
  });

  it('resposta normal ao cliente: isInternal=false gravado, WAHA chamado normalmente', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({
      ...existingConv,
      sourceChannel: 'whatsapp',
      correlationId: 'corr-1',
      humanTakeoverAt: new Date(),
    });

    await svc.addMessage('t1', 'conv-1', { direction: 'outbound', content: 'oi, tudo certo!' });

    const createCall = deps.prisma.aiMessage.create.mock.calls[0][0];
    expect(createCall.data.isInternal).toBe(false);
    expect(deps.waha.sendText).toHaveBeenCalled();
  });
});
