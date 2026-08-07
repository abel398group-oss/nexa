import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

// ─── C1: setResolved gera csatToken no fechamento manual ─────────────────────

function makeDeps() {
  const prisma = {
    aiConversation: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
    aiMessage: {
      create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    conversationStageHistory: { create: vi.fn().mockResolvedValue({}) },
    user: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  } as any;

  const events = { emit: vi.fn() } as any;
  const waha = { sendText: vi.fn().mockResolvedValue({ sent: true }) } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;

  return { prisma, events, waha, audit };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new ConversationsService(deps.prisma, deps.events, deps.waha, deps.audit);
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

// ─── Item 1.4: trava de concorrência no "Assumir Chamado" ────────────────────
// Antes era update cego: dois analistas clicando junto recebiam 200 os dois e o
// último gravado vencia em silêncio. Agora quem assume manda `expectedAnalystId`
// e a gravação é condicional.
describe('ConversationsService — 1.4 assignAnalyst com trava de concorrência', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findFirst.mockResolvedValue(existingConv);
    deps.prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
  });

  it('assumir chamado livre: grava condicionalmente (updateMany), não update cego', async () => {
    deps.prisma.aiConversation.updateMany.mockResolvedValue({ count: 1 });
    deps.prisma.aiConversation.findFirst
      .mockResolvedValueOnce(existingConv) // findOne (validação de tenant)
      .mockResolvedValueOnce({ assignedAnalystId: 'user-1', assignedAnalyst: { id: 'user-1', name: 'Ana' } });

    const r = await svc.assignAnalyst('t1', 'conv-1', 'user-1', { expectedAnalystId: null });

    const call = deps.prisma.aiConversation.updateMany.mock.calls[0][0];
    // a precondição precisa estar no WHERE — é ela que torna a operação atômica
    expect(call.where).toMatchObject({ id: 'conv-1', tenantId: 't1', assignedAnalystId: null });
    expect(call.data.assignedAnalystId).toBe('user-1');
    expect(deps.prisma.aiConversation.update).not.toHaveBeenCalled();
    expect(r.assignedAnalyst).toEqual({ id: 'user-1', name: 'Ana' });
  });

  it('corrida perdida (0 linhas casadas): lança conflito com o nome do dono real', async () => {
    deps.prisma.aiConversation.updateMany.mockResolvedValue({ count: 0 });
    deps.prisma.aiConversation.findFirst
      .mockResolvedValueOnce(existingConv)
      .mockResolvedValueOnce({ assignedAnalyst: { id: 'user-2', name: 'Bruno' } });

    await expect(
      svc.assignAnalyst('t1', 'conv-1', 'user-1', { expectedAnalystId: null }),
    ).rejects.toThrow(/Bruno/);
  });

  it('corrida perdida sem nome do dono: mensagem genérica, não quebra', async () => {
    deps.prisma.aiConversation.updateMany.mockResolvedValue({ count: 0 });
    deps.prisma.aiConversation.findFirst
      .mockResolvedValueOnce(existingConv)
      .mockResolvedValueOnce(null);

    await expect(
      svc.assignAnalyst('t1', 'conv-1', 'user-1', { expectedAnalystId: null }),
    ).rejects.toThrow(/outro analista/);
  });

  it('transferência deliberada (sem expectedAnalystId): segue no update direto', async () => {
    deps.prisma.aiConversation.update.mockResolvedValue({
      assignedAnalystId: 'user-1',
      assignedAnalyst: { id: 'user-1', name: 'Ana' },
    });

    await svc.assignAnalyst('t1', 'conv-1', 'user-1');

    expect(deps.prisma.aiConversation.update).toHaveBeenCalled();
    expect(deps.prisma.aiConversation.updateMany).not.toHaveBeenCalled();
  });

  it('roubar chamado de outro analista: precondição com o dono esperado, não null', async () => {
    deps.prisma.aiConversation.updateMany.mockResolvedValue({ count: 1 });
    deps.prisma.aiConversation.findFirst
      .mockResolvedValueOnce(existingConv)
      .mockResolvedValueOnce({ assignedAnalystId: 'user-1', assignedAnalyst: { id: 'user-1', name: 'Ana' } });

    await svc.assignAnalyst('t1', 'conv-1', 'user-1', { expectedAnalystId: 'user-2' });

    expect(deps.prisma.aiConversation.updateMany.mock.calls[0][0].where).toMatchObject({
      assignedAnalystId: 'user-2',
    });
  });
});

// ─── Item 2.1: platform admin (tenantId null) elegível no seletor ────────────
describe('ConversationsService — 2.1 listAnalysts inclui platform admin', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('busca usuários do tenant E da plataforma — mesmo critério do assignAnalyst', async () => {
    await svc.listAnalysts('t1');

    const where = deps.prisma.user.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    // Sem o `tenantId: null` no OR, um platform admin que assume um chamado fica
    // fora da lista e o <Select> do painel renderiza "Sem dono" mentindo.
    expect(where.OR).toEqual([{ tenantId: 't1' }, { tenantId: null }]);
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

// ─── F13: link de issue de dev move o chamado pra waiting_internal ───────────

describe('ConversationsService — F13 setLinkedIssue', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('vincula URL em chamado aberto: grava o link E move status pra waiting_internal', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ ...existingConv, status: 'open' });

    const r = await svc.setLinkedIssue('t1', 'conv-1', 'https://jira.example.com/BUG-123');

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.linkedIssueUrl).toBe('https://jira.example.com/BUG-123');
    expect(updateCall.data.status).toBe('waiting_internal');
    expect(deps.prisma.conversationStageHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reason: 'issue_dev_vinculada', toStatus: 'waiting_internal' }) }),
    );
    expect(r.status).toBe('waiting_internal');
  });

  it('vincula URL em chamado FECHADO: grava o link mas NÃO ressuscita o status', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ ...existingConv, status: 'closed' });

    const r = await svc.setLinkedIssue('t1', 'conv-1', 'https://github.com/org/repo/issues/42');

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.linkedIssueUrl).toBe('https://github.com/org/repo/issues/42');
    expect(updateCall.data.status).toBeUndefined();
    expect(deps.prisma.conversationStageHistory.create).not.toHaveBeenCalled();
    expect(r.status).toBe('closed');
  });

  it('já está waiting_internal: não gera transição/histórico duplicado', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ ...existingConv, status: 'waiting_internal' });

    await svc.setLinkedIssue('t1', 'conv-1', 'https://trello.com/c/abc123');

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.status).toBeUndefined();
    expect(deps.prisma.conversationStageHistory.create).not.toHaveBeenCalled();
  });

  it('remove o link (url=null): limpa o campo, NÃO mexe no status', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ ...existingConv, status: 'waiting_internal' });

    const r = await svc.setLinkedIssue('t1', 'conv-1', null);

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(updateCall.data.linkedIssueUrl).toBeNull();
    expect(updateCall.data.status).toBeUndefined();
    expect(r.status).toBe('waiting_internal');
  });

  it('URL inválida (sem http/https): rejeita antes de gravar', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue({ ...existingConv, status: 'open' });

    await expect(svc.setLinkedIssue('t1', 'conv-1', 'javascript:alert(1)')).rejects.toThrow();
    expect(deps.prisma.aiConversation.update).not.toHaveBeenCalled();
  });
});

// ─── Etapa 2A: escopo de carteira nas leituras por id ────────────────────────
// findAll já restringia o vendedor, mas ler por id (mensagens/timeline/detalhe)
// só validava o tenant — saber o id bastava pra ler a conversa de um colega.
describe('ConversationsService — 2A findOneScoped (escopo de vendedor)', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('sem sellerId (admin/operacional): não filtra por carteira', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue(existingConv);

    await svc.findOneScoped('t1', 'conv-1');

    const where = deps.prisma.aiConversation.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: 'conv-1', tenantId: 't1' });
    expect(where.assignedSellerId).toBeUndefined();
  });

  it('com sellerId (vendedor): exige a conversa na carteira dele', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue(existingConv);

    await svc.findOneScoped('t1', 'conv-1', 'seller-9');

    expect(deps.prisma.aiConversation.findFirst.mock.calls[0][0].where).toEqual({
      id: 'conv-1',
      tenantId: 't1',
      assignedSellerId: 'seller-9',
    });
  });

  it('conversa fora da carteira: 404 (não confirma que o id existe)', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue(null);

    await expect(svc.findOneScoped('t1', 'conv-de-outro', 'seller-9')).rejects.toThrow(NotFoundException);
  });

  it('getMessages repassa o escopo — não devolve mensagem fora da carteira', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue(null);

    await expect(
      svc.getMessages('t1', 'conv-de-outro', { includeInternal: false, sellerId: 'seller-9' }),
    ).rejects.toThrow(NotFoundException);
    expect(deps.prisma.aiMessage.findMany).not.toHaveBeenCalled();
  });

  it('getTimeline repassa o escopo', async () => {
    deps.prisma.aiConversation.findFirst.mockResolvedValue(null);

    await expect(svc.getTimeline('t1', 'conv-de-outro', 'seller-9')).rejects.toThrow(NotFoundException);
  });
});

// ─── Etapa 2A (item 2.3): editar/excluir nota interna ────────────────────────
describe('ConversationsService — 2A nota interna: editar e excluir', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: ConversationsService;

  const nota = {
    id: 'msg-1',
    tenantId: 't1',
    conversationId: 'conv-1',
    content: 'texto original',
    isInternal: true,
    authorUserId: 'user-autor',
  };

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
  });

  it('autor edita a própria nota: grava e audita guardando o texto anterior', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue(nota);
    deps.prisma.aiMessage.update.mockResolvedValue({ ...nota, content: 'texto novo' });

    const r = await svc.updateInternalNote('t1', 'msg-1', 'texto novo', {
      userId: 'user-autor',
      role: 'operacional',
    });

    expect(r.content).toBe('texto novo');
    // sem o texto anterior no audit não há como reconstruir o que foi dito
    expect(deps.audit.log.mock.calls[0][0].metadata.previousContent).toBe('texto original');
  });

  it('outro operacional NÃO edita nota alheia', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue(nota);

    await expect(
      svc.updateInternalNote('t1', 'msg-1', 'x', { userId: 'user-outro', role: 'operacional' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.prisma.aiMessage.update).not.toHaveBeenCalled();
  });

  it('admin edita nota de qualquer um', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue(nota);
    deps.prisma.aiMessage.update.mockResolvedValue({ ...nota, content: 'corrigido' });

    await svc.updateInternalNote('t1', 'msg-1', 'corrigido', { userId: 'admin-1', role: 'admin' });

    expect(deps.prisma.aiMessage.update).toHaveBeenCalled();
  });

  it('mensagem JÁ ENVIADA ao cliente não pode ser editada nem apagada', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue({ ...nota, isInternal: false });

    await expect(
      svc.updateInternalNote('t1', 'msg-1', 'x', { userId: 'user-autor', role: 'admin' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      svc.deleteInternalNote('t1', 'msg-1', { userId: 'user-autor', role: 'admin' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.prisma.aiMessage.delete).not.toHaveBeenCalled();
  });

  it('nota antiga sem autor (pré-migration): só admin mexe', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue({ ...nota, authorUserId: null });

    await expect(
      svc.updateInternalNote('t1', 'msg-1', 'x', { userId: 'user-autor', role: 'operacional' }),
    ).rejects.toThrow(ForbiddenException);

    deps.prisma.aiMessage.update.mockResolvedValue({ ...nota, content: 'x' });
    await svc.updateInternalNote('t1', 'msg-1', 'x', { userId: 'admin-1', role: 'admin' });
    expect(deps.prisma.aiMessage.update).toHaveBeenCalled();
  });

  it('mensagem de outro tenant: 404, não vaza existência', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue(null);

    await expect(
      svc.deleteInternalNote('t1', 'msg-de-outro-tenant', { userId: 'admin-1', role: 'admin' }),
    ).rejects.toThrow(NotFoundException);
    // o escopo do tenant precisa estar no WHERE, não só numa checagem depois
    expect(deps.prisma.aiMessage.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: 't1' });
  });

  it('exclusão é definitiva e guarda o conteúdo no audit (LGPD)', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue(nota);

    const r = await svc.deleteInternalNote('t1', 'msg-1', { userId: 'user-autor', role: 'operacional' });

    expect(r).toEqual({ id: 'msg-1', deleted: true });
    expect(deps.prisma.aiMessage.delete).toHaveBeenCalledWith({ where: { id: 'msg-1' } });
    expect(deps.audit.log.mock.calls[0][0].metadata.deletedContent).toBe('texto original');
  });

  it('emite evento PRÓPRIO, nunca message.updated (que é o ack do WhatsApp)', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue(nota);
    deps.prisma.aiMessage.update.mockResolvedValue({ ...nota, content: 'novo' });

    await svc.updateInternalNote('t1', 'msg-1', 'novo', { userId: 'user-autor', role: 'admin' });

    const eventos = deps.events.emit.mock.calls.map((c: any[]) => c[0]);
    expect(eventos).toContain('internal_note.updated');
    // reusar 'message.updated' faria o handler de ack emitir lixo pra sala do CLIENTE
    expect(eventos).not.toContain('message.updated');
  });
});
