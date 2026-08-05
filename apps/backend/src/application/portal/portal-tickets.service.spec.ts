import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PortalTicketsService } from './portal-tickets.service';

function makePrisma() {
  return {
    aiConversation: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    aiMessage: { findMany: vi.fn() },
    conversationStageHistory: { create: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
  } as any;
}
// P1: mocks dos novos colaboradores (notificação interna + evento de e-mail)
function makeNotifications() {
  return { create: vi.fn().mockResolvedValue(undefined) } as any;
}
function makeEvents() {
  return { emit: vi.fn() } as any;
}
// §4 (auditoria de suporte, 2026-08-05): lock mockado — por padrão "adquire na
// hora" (sem disputa), que é o caminho comum nos testes que não são sobre a
// concorrência em si.
function makeLock() {
  return { acquire: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)) } as any;
}
const customer = { externalId: 'ext1', tenantId: 't1', name: 'Ana' };

describe('PortalTicketsService — isolamento do cliente', () => {
  let prisma: any;
  let svc: PortalTicketsService;
  beforeEach(() => {
    prisma = makePrisma();
    svc = new PortalTicketsService(prisma, {} as any, {} as any, makeNotifications(), makeEvents(), makeLock());
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
    svc = new PortalTicketsService(prisma, conversations, agent, makeNotifications(), makeEvents(), makeLock());
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
      .mockResolvedValueOnce(closedTicket)   // reply(): ownership check
      .mockResolvedValueOnce(closedTicket)   // §4: releitura dentro da trava
      .mockResolvedValueOnce(null)           // §4: nenhum follow-up concorrente já criado
      .mockResolvedValueOnce({ id: 'c2', status: 'open' }); // detail() no final
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
      .mockResolvedValueOnce(closedTicket)   // reply(): ownership check
      .mockResolvedValueOnce(closedTicket)   // §4: releitura dentro da trava
      .mockResolvedValueOnce(null)           // §4: nenhum follow-up concorrente já criado
      .mockResolvedValueOnce({ id: 'c3-followup', status: 'open' }); // detail() no final
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

  // §4 (auditoria de suporte, 2026-08-05): duas respostas quase simultâneas ao
  // mesmo chamado fechado não podem criar dois follow-ups separados.
  describe('§4 — concorrência: reopen/follow-up travado por chamado', () => {
    it('reusa follow-up já criado por uma chamada concorrente (não cria um segundo)', async () => {
      const closedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const closedTicket = { id: 'c4', status: 'closed', endedAt: closedAt, lastActivityAt: null, contactId: 'ct1', phone: '5511', ticketCategory: 'cte' };
      const alreadyCreatedFollowUp = { id: 'c4-followup-existente' };
      prisma.aiConversation.findFirst
        .mockResolvedValueOnce(closedTicket)             // reply(): ownership check
        .mockResolvedValueOnce(closedTicket)              // releitura dentro da trava: original ainda 'closed'
        .mockResolvedValueOnce(alreadyCreatedFollowUp)    // MAS já existe follow-up de uma chamada concorrente
        .mockResolvedValueOnce({ id: 'c4-followup-existente', status: 'open' }); // detail() no final
      prisma.aiMessage.findMany.mockResolvedValue([]);

      await svc.reply(customer, 'c4', 'resposta quase simultânea');

      // NÃO cria um segundo follow-up
      expect(conversations.create).not.toHaveBeenCalled();
      // processa a mensagem no follow-up que já existia
      expect(conversations.addMessage).toHaveBeenCalledWith('t1', 'c4-followup-existente', expect.anything());
      expect(agent.handle).toHaveBeenCalledWith('t1', expect.objectContaining({ conversationId: 'c4-followup-existente' }));
    });

    it('usa o chamado já reaberto por uma chamada concorrente (não reabre de novo)', async () => {
      const closedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const closedTicket = { id: 'c5', status: 'closed', endedAt: closedAt, lastActivityAt: null, contactId: 'ct1', phone: '5511', ticketCategory: 'cte' };
      const alreadyReopened = { id: 'c5', status: 'open' };
      prisma.aiConversation.findFirst
        .mockResolvedValueOnce(closedTicket)   // reply(): ownership check (ainda lê 'closed')
        .mockResolvedValueOnce(alreadyReopened) // releitura dentro da trava: JÁ foi reaberto por outra chamada
        .mockResolvedValueOnce({ id: 'c5', status: 'open' }); // detail() no final
      prisma.aiMessage.findMany.mockResolvedValue([]);

      await svc.reply(customer, 'c5', 'segunda resposta');

      // não reabre de novo (não escreve status/outcome/etc de reabertura)
      expect(prisma.aiConversation.update).not.toHaveBeenCalled();
      expect(prisma.conversationStageHistory.create).not.toHaveBeenCalled();
      expect(conversations.addMessage).toHaveBeenCalledWith('t1', 'c5', expect.anything());
    });

    it('sem lock disponível (ex.: Redis fora do ar): processa normalmente, sem travar o cliente', async () => {
      const lockedOutSvc = new PortalTicketsService(
        prisma, conversations, agent, makeNotifications(), makeEvents(),
        { acquire: vi.fn().mockResolvedValue(null) } as any, // nunca consegue o lock
      );
      const closedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const closedTicket = { id: 'c6', status: 'closed', endedAt: closedAt, lastActivityAt: null, contactId: 'ct1', phone: '5511', ticketCategory: 'cte' };
      prisma.aiConversation.findFirst
        .mockResolvedValueOnce(closedTicket)   // reply(): ownership check
        .mockResolvedValueOnce({ id: 'c6', status: 'open' }); // detail() no final
      prisma.aiConversation.update.mockResolvedValue({});
      prisma.aiMessage.findMany.mockResolvedValue([]);

      await lockedOutSvc.reply(customer, 'c6', 'mensagem');

      // mesmo sem lock, reabre normalmente (fallback = comportamento pré-fix)
      expect(prisma.aiConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c6' }, data: expect.objectContaining({ status: 'open' }) }),
      );
    }, 5000);
  });
});

// ─── P1: Abrir chamado → fila humana (Lia NÃO responde) ──────────────────────

describe('PortalTicketsService — P1 open direto para humano', () => {
  let prisma: any;
  let svc: PortalTicketsService;
  let conversations: any;
  let agent: any;
  let notifications: any;
  let events: any;

  beforeEach(() => {
    prisma = makePrisma();
    conversations = { addMessage: vi.fn().mockResolvedValue(undefined), create: vi.fn().mockResolvedValue({ id: 'c1' }) };
    agent = { handle: vi.fn().mockResolvedValue({}) };
    notifications = makeNotifications();
    events = makeEvents();
    svc = new PortalTicketsService(prisma, conversations, agent, notifications, events, makeLock());

    // contato existente (ensureContact)
    prisma.contact = { findFirst: vi.fn().mockResolvedValue({ id: 'ct1', phone: 'portal:ext1' }), create: vi.fn(), update: vi.fn() };
    // assignTicketNumber: 1ª findUnique (elegibilidade) → 2ª findUnique (numero p/ mensagem)
    prisma.aiConversation.findUnique
      .mockResolvedValueOnce({ ticketNumber: null, ticketCategory: 'outro' })
      .mockResolvedValueOnce({ ticketNumber: 7 });
    prisma.$queryRaw.mockResolvedValue([{ last_number: 7 }]);
    // detail() no final
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', status: 'escalated', ticketNumber: 7 });
    prisma.aiMessage.findMany.mockResolvedValue([]);
  });

  it('NAO chama o pipeline da Lia (agent.handle)', async () => {
    await svc.open(customer, { message: 'preciso de ajuda', category: 'fiscal' });
    expect(agent.handle).not.toHaveBeenCalled();
  });

  // §5 (auditoria de suporte, 2026-08-05): ensureContact é best-effort — nunca
  // pode derrubar o fluxo do cliente — mas antes engolia QUALQUER erro em
  // silêncio, não só o conflito de unique esperado.
  describe('§5 — ensureContact loga falha que não é o conflito esperado', () => {
    it('conflito de unique (P2002): segue em silêncio, sem logar (comportamento esperado)', async () => {
      prisma.contact.update.mockRejectedValue({ code: 'P2002', message: 'unique violation' });
      const warnSpy = vi.spyOn((svc as any).logger, 'warn');

      await expect(
        svc.open(customer, { message: 'ajuda', category: 'fiscal', phone: '11999998888' }),
      ).resolves.toBeDefined();

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('ensureContact'));
    });

    it('erro de banco real (não-P2002): NÃO lança (best-effort), mas loga o motivo', async () => {
      prisma.contact.update.mockRejectedValue(new Error('connection reset'));
      const warnSpy = vi.spyOn((svc as any).logger, 'warn');

      // não deve lançar — é best-effort, o chamado tem que abrir mesmo assim
      await expect(
        svc.open(customer, { message: 'ajuda', category: 'fiscal', phone: '11999998888' }),
      ).resolves.toBeDefined();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ensureContact'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('connection reset'));
    });
  });

  it('chamado nasce escalated com categoria (ou default outro) e prioridade normal', async () => {
    await svc.open(customer, { message: 'ajuda', subject: 'Erro no CT-e' });
    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'escalated', ticketCategory: 'outro', ticketPriority: 'normal', subject: 'Erro no CT-e' }),
      }),
    );
    expect(prisma.conversationStageHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ toStatus: 'escalated', reason: 'aberto_pelo_cliente' }) }),
    );
  });

  it('gera ticketNumber e envia confirmacao outbound com #numero', async () => {
    await svc.open(customer, { message: 'ajuda', category: 'fiscal' });
    expect(prisma.$queryRaw).toHaveBeenCalled(); // contador atômico
    const outbound = conversations.addMessage.mock.calls.find((c: any[]) => c[2]?.direction === 'outbound');
    expect(outbound).toBeDefined();
    expect(outbound[2].content).toContain('#7');
  });

  it('notifica o Inbox e emite support.escalated (origin portal) para o e-mail', async () => {
    await svc.open(customer, { message: 'ajuda', category: 'fiscal' });
    expect(notifications.create).toHaveBeenCalledWith('t1', expect.objectContaining({ type: 'escalation', link: '/inbox/c1' }));
    expect(events.emit).toHaveBeenCalledWith('support.escalated', expect.objectContaining({ tenantId: 't1', conversationId: 'c1', origin: 'portal' }));
  });
});

// ─── N2: CSAT — submissão via token público ───────────────────────────────────

describe('PortalTicketsService — N2 submitCsat', () => {
  let prisma: any;
  let svc: PortalTicketsService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new PortalTicketsService(prisma, {} as any, {} as any, makeNotifications(), makeEvents(), makeLock());
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

// ─── C2: TicketCounter atômico ────────────────────────────────────────────────

describe('PortalTicketsService — C2 assignTicketNumber (TicketCounter atômico)', () => {
  let prisma: any;
  let svc: PortalTicketsService;

  function makePrismaC2() {
    return {
      aiConversation: {
        findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
        findUnique: vi.fn(), update: vi.fn(), create: vi.fn(),
      },
      aiMessage: { findMany: vi.fn() },
      conversationStageHistory: { create: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
    } as any;
  }

  beforeEach(() => {
    prisma = makePrismaC2();
    svc = new PortalTicketsService(prisma, {} as any, {} as any, makeNotifications(), makeEvents(), makeLock());
  });

  it('chama $queryRaw (INSERT ON CONFLICT) e persiste o numero retornado', async () => {
    prisma.aiConversation.findUnique.mockResolvedValue({ ticketNumber: null, ticketCategory: 'fiscal' });
    prisma.$queryRaw.mockResolvedValue([{ last_number: 7 }]);

    await svc.assignTicketNumber('t1', 'c1');

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ticketNumber: 7 }) }),
    );
  });

  it('converte BigInt do Prisma para Number antes de gravar', async () => {
    prisma.aiConversation.findUnique.mockResolvedValue({ ticketNumber: null, ticketCategory: 'fiscal' });
    // Prisma retorna BigInt em $queryRaw — Number() deve normalizar
    prisma.$queryRaw.mockResolvedValue([{ last_number: BigInt(42) }]);

    await svc.assignTicketNumber('t1', 'c1');

    const updateCall = prisma.aiConversation.update.mock.calls[0][0];
    expect(typeof updateCall.data.ticketNumber).toBe('number');
    expect(updateCall.data.ticketNumber).toBe(42);
  });

  it('nao chama $queryRaw se chamado ja tem ticketNumber', async () => {
    prisma.aiConversation.findUnique.mockResolvedValue({ ticketNumber: 7, ticketCategory: 'cte' });

    await svc.assignTicketNumber('t1', 'c2');

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.aiConversation.update).not.toHaveBeenCalled();
  });

  it('nao chama $queryRaw se ticketCategory ainda nao foi definido', async () => {
    prisma.aiConversation.findUnique.mockResolvedValue({ ticketNumber: null, ticketCategory: null });

    await svc.assignTicketNumber('t1', 'c3');

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
