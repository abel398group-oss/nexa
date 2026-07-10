import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PortalTicketsService } from './portal-tickets.service';

function makePrisma() {
  return {
    aiConversation: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    aiMessage: { findMany: vi.fn() },
    conversationStageHistory: { create: vi.fn() },
  } as any;
}
const customer = { externalId: 'ext1', tenantId: 't1', name: 'Ana' };

describe('PortalTicketsService — isolamento do cliente', () => {
  let prisma: any;
  let svc: PortalTicketsService;
  beforeEach(() => {
    prisma = makePrisma();
    svc = new PortalTicketsService(prisma, {} as any, {} as any);
  });

  it('list: escopa SEMPRE por tenantId + externalId', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([]);
    prisma.aiConversation.count.mockResolvedValue(0);
    await svc.list(customer, { limit: 50, offset: 0 } as any, {});
    expect(prisma.aiConversation.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      externalId: 'ext1',
    });
  });

  it('list: aplica filtros status/category', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([]);
    prisma.aiConversation.count.mockResolvedValue(0);
    await svc.list(customer, { limit: 50, offset: 0 } as any, { status: 'open', category: 'cte' });
    const where = prisma.aiConversation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'open', ticketCategory: 'cte' });
  });

  it('detail: 404 quando o chamado nao e do cliente', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);
    await expect(svc.detail(customer, 'alheio')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.aiConversation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'alheio', tenantId: 't1', externalId: 'ext1',
    });
  });

  it('detail: retorna chamado + mensagens quando e do cliente', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', status: 'open' });
    prisma.aiMessage.findMany.mockResolvedValue([{ id: 'm1', direction: 'inbound', content: 'oi' }]);
    const out = await svc.detail(customer, 'c1');
    expect(out.id).toBe('c1');
    expect(out.messages).toHaveLength(1);
  });

  it('reply: 404 quando o chamado nao e do cliente (ownership)', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);
    await expect(svc.reply(customer, 'alheio', 'msg')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── N1: Reabertura de chamado fechado ────────────────────────────────────────

describe('PortalTicketsService — N1 reopen / follow-up', () => {
  let prisma: any;
  let svc: PortalTicketsService;
  let conversations: any;
  let agent: any;

  beforeEach(() => {
    prisma = makePrisma();
    conversations = { addMessage: vi.fn().mockResolvedValue(undefined), create: vi.fn() };
    agent = { handle: vi.fn().mockResolvedValue({}) };
    svc = new PortalTicketsService(prisma, conversations, agent);
  });

  // Cenário 1: chamado aberto → fluxo normal, sem reopen
  it('reply em chamado open: nao aciona logica de reopen', async () => {
    const openTicket = { id: 'c1', status: 'open', endedAt: null, lastActivityAt: null, contactId: 'ct1', phone: '5511', ticketCategory: null };
    prisma.aiConversation.findFirst
      .mockResolvedValueOnce(openTicket)   // ownership check
      .mockResolvedValueOnce({ id: 'c1', status: 'open' })  // detail
      .mockResolvedValueOnce(null);        // detail messages guard
    prisma.aiMessage.findMany.mockResolvedValue([]);

    await svc.reply(customer, 'c1', 'mensagem');

    expect(prisma.aiConversation.update).not.toHaveBeenCalled();
    expect(prisma.conversationStageHistory.create).not.toHaveBeenCalled();
    expect(conversations.addMessage).toHaveBeenCalledWith('t1', 'c1', expect.objectContaining({ direction: 'inbound' }));
  });

  // Cenário 2: chamado fechado < 7 dias → reabre, limpa campos, processa no mesmo
  it('reply em chamado closed < 7d: reabre e processa no mesmo chamado', async () => {
    const closedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 dias atrás
    const closedTicket = { id: 'c2', status: 'closed', endedAt: closedAt, lastActivityAt: null, contactId: 'ct1', phone: '5511', ticketCategory: 'cte' };
    prisma.aiConversation.findFirst
      .mockResolvedValueOnce(closedTicket)
      .mockResolvedValueOnce({ id: 'c2', status: 'open' })
      .mockResolvedValueOnce(null);
    prisma.aiConversation.update.mockResolvedValue({});
    prisma.conversationStageHistory.create.mockResolvedValue({});
    prisma.aiMessage.findMany.mockResolvedValue([]);

    await svc.reply(customer, 'c2', 'tenho duvida');

    // deve ter reaberto o chamado
    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c2' },
        data: expect.objectContaining({ status: 'open', outcome: null, resolvedAt: null }),
      }),
    );
    // deve ter gravado no histórico com reason correto
    expect(prisma.conversationStageHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conversationId: 'c2', fromStatus: 'closed', toStatus: 'open', reason: 'reaberto_cliente' }),
      }),
    );
    // mensagem e agent processados no MESMO id
    expect(conversations.addMessage).toHaveBeenCalledWith('t1', 'c2', expect.anything());
    expect(agent.handle).toHaveBeenCalledWith('t1', expect.objectContaining({ conversationId: 'c2' }));
  });

  // Cenário 3: chamado fechado ≥ 7 dias → cria follow-up com followUpOfId
  it('reply em chamado closed >= 7d: cria follow-up com followUpOfId', async () => {
    const closedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 dias atrás
    const closedTicket = { id: 'c3', status: 'closed', endedAt: closedAt, lastActivityAt: null, contactId: 'ct1', phone: '5511', ticketCategory: 'cte' };
    const newConv = { id: 'c3-followup' };
    prisma.aiConversation.findFirst
      .mockResolvedValueOnce(closedTicket)
      .mockResolvedValueOnce({ id: 'c3-followup', status: 'open' })
      .mockResolvedValueOnce(null);
    conversations.create.mockResolvedValue(newConv);
    prisma.aiConversation.update.mockResolvedValue({});
    prisma.aiMessage.findMany.mockResolvedValue([]);

    await svc.reply(customer, 'c3', 'nova duvida');

    // deve ter criado uma nova conversa
    expect(conversations.create).toHaveBeenCalledWith('t1', expect.objectContaining({ sourceChannel: 'portal', agentType: 'support' }));
    // deve ter setado followUpOfId apontando para o chamado original
    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c3-followup' },
        data: expect.objectContaining({ followUpOfId: 'c3', externalId: 'ext1' }),
      }),
    );
    // agent processa no novo chamado (follow-up), NÃO no original
    expect(agent.handle).toHaveBeenCalledWith('t1', expect.objectContaining({ conversationId: 'c3-followup' }));
  });
});

// ─── N2: CSAT — submissão via token público ───────────────────────────────────

describe('PortalTicketsService — N2 submitCsat', () => {
  let prisma: any;
  let svc: PortalTicketsService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new PortalTicketsService(prisma, {} as any, {} as any);
  });

  it('aceita nota valida (1-5) e persiste csatScore', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', csatScore: null });
    prisma.aiConversation.update.mockResolvedValue({});

    const result = await svc.submitCsat('tok-abc', 4);

    expect(result).toEqual({ ok: true });
    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ csatScore: 4 }),
      }),
    );
  });

  it('aceita nota com comentario e persiste csatComment', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', csatScore: null });
    prisma.aiConversation.update.mockResolvedValue({});

    await svc.submitCsat('tok-abc', 5, 'Atendimento excelente!');

    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ csatScore: 5, csatComment: 'Atendimento excelente!' }),
      }),
    );
  });

  it('rejeita token invalido (chamado nao encontrado)', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);

    await expect(svc.submitCsat('token-inexistente', 3)).rejects.toThrow('Token CSAT inválido');
  });

  it('rejeita dupla submissao (csatScore ja preenchido)', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', csatScore: 4 }); // já avaliado

    await expect(svc.submitCsat('tok-abc', 5)).rejects.toThrow('já registrada');
  });

  it('rejeita nota fora do intervalo 1-5', async () => {
    await expect(svc.submitCsat('tok-abc', 6)).rejects.toThrow('Nota inválida');
    await expect(svc.submitCsat('tok-abc', 0)).rejects.toThrow('Nota inválida');
  });
});
