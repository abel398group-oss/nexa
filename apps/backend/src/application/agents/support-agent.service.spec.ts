import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupportAgentService } from './support-agent.service';

// ─── N2: Confirmação de resolução + CSAT ──────────────────────────────────────
// Testa os 3 sentimentos (positivo / negativo / neutro) e o roteamento do
// support-agent quando a conversa está no estado "aguardando confirmação"
// (resolvedAt != null, autoCloseAt != null, outcome == null).

function makeDeps() {
  const prisma = {
    aiConversation: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    conversationStageHistory: { create: vi.fn().mockResolvedValue({}) },
    // C2: mock do $queryRaw para assignTicketNumberIfNeeded (não acionado nos cenários de confirmação/CSAT)
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
  } as any;

  const notifications = { create: vi.fn().mockResolvedValue({}) } as any;

  // Dependências que não são chamadas nos cenários de confirmação
  const noop = () => ({}) as any;
  const conversations = { getMessages: vi.fn().mockResolvedValue([]) } as any;
  const ai = {} as any;
  const classifier = { classify: vi.fn().mockResolvedValue({ category: 'suporte', priority: 'normal', requiresHuman: false }) } as any;
  const diagnostic = { diagnose: vi.fn().mockResolvedValue({ needsMoreInfo: false, questionsToAsk: [], rootCause: null }) } as any;
  const resolution = {
    resolve: vi.fn().mockResolvedValue({ draft: 'resp', usedKnowledge: [], allowedFacts: '', confidence: 'high', resolved: false }),
    // Busca de KB disparada em paralelo com classificação/diagnóstico (fora do caminho crítico).
    prefetchKnowledge: vi.fn().mockResolvedValue([]),
  } as any;
  const escalation = { decide: vi.fn().mockResolvedValue({ escalate: false, reason: '' }) } as any;
  const intelligence = { analyze: vi.fn().mockResolvedValue({}) } as any;
  const ticketSync = { markPending: vi.fn().mockResolvedValue(undefined) } as any;

  return { prisma, notifications, conversations, ai, classifier, diagnostic, resolution, escalation, intelligence, ticketSync };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new SupportAgentService(
    deps.conversations,
    deps.ai,
    deps.classifier,
    deps.diagnostic,
    deps.resolution,
    deps.escalation,
    deps.intelligence,
    deps.prisma,
    deps.notifications,
    deps.ticketSync,
  );
}

// Estado de "aguardando confirmação"
const pendingConvState = {
  resolvedAt: new Date(),
  autoCloseAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  status: 'open',
  outcome: null,
  csatToken: null,
  csatScore: null,
};

// Estado de ticket fechado aguardando avaliação CSAT
const closedWithCsatToken = {
  resolvedAt: new Date(),
  autoCloseAt: null,
  status: 'closed',
  outcome: 'resolved',
  csatToken: 'abc123tokenxyz',
  csatScore: null,
};

describe('SupportAgentService — N2 confirmação de resolução', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: SupportAgentService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findUnique.mockResolvedValue(pendingConvState);
  });

  // ── Fluxo 1: resposta positiva ─────────────────────────────────────────────
  it('positivo ("sim"): fecha chamado com outcome=resolved e retorna mensagem de encerramento', async () => {
    const reply = await svc.ask('t1', { question: 'sim', conversationId: 'c1' });

    expect(deps.prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'closed', outcome: 'resolved' }),
      }),
    );
    expect(deps.prisma.conversationStageHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'confirmado_cliente', toStatus: 'closed' }),
      }),
    );
    expect(reply.draft).toContain('encerrado');
    expect(reply.needsHuman).toBe(false);
  });

  it('positivo: token CSAT unico e gerado e gravado no update', async () => {
    await svc.ask('t1', { question: 'resolveu', conversationId: 'c1' });

    const updateCall = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(typeof updateCall.data.csatToken).toBe('string');
    expect(updateCall.data.csatToken.length).toBeGreaterThan(10);
  });

  // ── Fluxo 2: resposta negativa ─────────────────────────────────────────────
  it('negativo ("não"): reescala, limpa resolvedAt/autoCloseAt e dispara notificação', async () => {
    const reply = await svc.ask('t1', { question: 'não', conversationId: 'c1' });

    expect(deps.prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'escalated', resolvedAt: null, autoCloseAt: null }),
      }),
    );
    expect(deps.prisma.conversationStageHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'nao_resolvido_confirmacao', toStatus: 'escalated' }),
      }),
    );
    expect(deps.notifications.create).toHaveBeenCalled();
    expect(reply.needsHuman).toBe(true);
  });

  // ── Fluxo 3: resposta neutra (silêncio / mensagem ambígua) ────────────────
  it('neutro: nao fecha nem reescala, retorna mensagem de aguardo', async () => {
    const reply = await svc.ask('t1', { question: 'talvez', conversationId: 'c1' });

    expect(deps.prisma.aiConversation.update).not.toHaveBeenCalled();
    expect(deps.notifications.create).not.toHaveBeenCalled();
    expect(reply.needsHuman).toBe(false);
    expect(reply.draft).toMatch(/aviar|avisar|mais|encerrado automaticamente/i);
  });

  // ── Não-interferência: conversa sem pendência passa pelo pipeline normal ───
  it('conversa sem pendencia (sem resolvedAt): segue pipeline normal (classifica)', async () => {
    deps.prisma.aiConversation.findUnique.mockResolvedValue({
      resolvedAt: null, autoCloseAt: null, status: 'open', outcome: null, csatToken: null, csatScore: null,
    });

    await svc.ask('t1', { question: 'nao consigo emitir CT-e', conversationId: 'c1' });

    expect(deps.classifier.classify).toHaveBeenCalled();
  });
});

// ─── C1: CSAT intake via WhatsApp ─────────────────────────────────────────────
describe('SupportAgentService — C1 CSAT intake via WhatsApp (ticket fechado)', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: SupportAgentService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findUnique.mockResolvedValue(closedWithCsatToken);
  });

  it('mensagem "4": salva csatScore=4 e retorna agradecimento positivo', async () => {
    const reply = await svc.ask('t1', { question: '4', conversationId: 'c1' });

    expect(deps.prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ csatScore: 4 }),
      }),
    );
    expect(reply.draft).toMatch(/obrigado/i);
    expect(reply.needsHuman).toBe(false);
  });

  it('mensagem "2": salva csatScore=2 e retorna mensagem de melhoria', async () => {
    const reply = await svc.ask('t1', { question: '2', conversationId: 'c1' });

    expect(deps.prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ csatScore: 2 }) }),
    );
    expect(reply.draft).toMatch(/feedback|melhorar/i);
  });

  it('mensagem "1": salva csatScore=1 (limite inferior)', async () => {
    await svc.ask('t1', { question: '1', conversationId: 'c1' });

    const call = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(call.data.csatScore).toBe(1);
  });

  it('mensagem "5": salva csatScore=5 (limite superior)', async () => {
    await svc.ask('t1', { question: '5', conversationId: 'c1' });

    const call = deps.prisma.aiConversation.update.mock.calls[0][0];
    expect(call.data.csatScore).toBe(5);
  });

  it('mensagem "6": fora do range 1-5 — nao salva CSAT', async () => {
    // ticket fechado mas score já preenchido → não deve salvar novamente
    deps.prisma.aiConversation.findUnique.mockResolvedValue({ ...closedWithCsatToken, csatScore: null });

    await svc.ask('t1', { question: '6', conversationId: 'c1' });

    // Não é CSAT válido → segue o pipeline normal (que PODE gravar ticketCategory
    // via persistTicketFields). O que NÃO pode acontecer é gravar csatScore.
    const csatCalls = deps.prisma.aiConversation.update.mock.calls
      .filter((c: any[]) => c[0]?.data && 'csatScore' in c[0].data);
    expect(csatCalls).toHaveLength(0);
    expect(deps.classifier.classify).toHaveBeenCalled();
  });

  it('ticket fechado mas csatScore ja preenchido: nao atualiza (evita duplicata)', async () => {
    deps.prisma.aiConversation.findUnique.mockResolvedValue({ ...closedWithCsatToken, csatScore: 5 });

    await svc.ask('t1', { question: '3', conversationId: 'c1' });

    // Score já preenchido → ignora o "3" e segue pipeline (classifica).
    // O pipeline pode gravar ticketCategory; só não pode regravar csatScore.
    const csatCalls = deps.prisma.aiConversation.update.mock.calls
      .filter((c: any[]) => c[0]?.data && 'csatScore' in c[0].data);
    expect(csatCalls).toHaveLength(0);
    expect(deps.classifier.classify).toHaveBeenCalled();
  });

  it('ticket fechado sem csatToken: nao captura como CSAT', async () => {
    deps.prisma.aiConversation.findUnique.mockResolvedValue({ ...closedWithCsatToken, csatToken: null });

    await svc.ask('t1', { question: '4', conversationId: 'c1' });

    // Sem csatToken → não é intake de CSAT; segue pipeline (pode gravar
    // ticketCategory), mas nunca csatScore.
    const csatCalls = deps.prisma.aiConversation.update.mock.calls
      .filter((c: any[]) => c[0]?.data && 'csatScore' in c[0].data);
    expect(csatCalls).toHaveLength(0);
    expect(deps.classifier.classify).toHaveBeenCalled();
  });
});

// ─── F10: propagação de tmsCustomer.page (tela do TMS de origem do chat) ─────
describe('SupportAgentService — F10 propagação de page', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: SupportAgentService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findUnique.mockResolvedValue({
      resolvedAt: null, autoCloseAt: null, status: 'open', outcome: null, csatToken: null, csatScore: null,
    });
  });

  it('repassa page ao DiagnosticAgent e ao ResolutionAgent quando presente no tmsCustomer', async () => {
    await svc.ask('t1', {
      question: 'nao consigo emitir CT-e',
      conversationId: 'c1',
      tmsCustomer: { externalId: 'ext1', name: 'João', isAdmin: false, page: '/fiscal/cte' },
    });

    expect(deps.diagnostic.diagnose).toHaveBeenCalledWith(
      expect.objectContaining({ tmsCustomer: expect.objectContaining({ page: '/fiscal/cte' }) }),
    );
    expect(deps.resolution.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ tmsCustomer: expect.objectContaining({ page: '/fiscal/cte' }) }),
    );
  });

  it('sem tmsCustomer: nao quebra e page nao aparece', async () => {
    await svc.ask('t1', { question: 'nao consigo emitir CT-e', conversationId: 'c1' });

    expect(deps.diagnostic.diagnose).toHaveBeenCalledWith(
      expect.objectContaining({ tmsCustomer: null }),
    );
    expect(deps.resolution.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ tmsCustomer: null }),
    );
  });
});

// ─── F10: resumo executivo (EscalationAgent.summary) na notificação + ticket ──
describe('SupportAgentService — F10 resumo executivo de escalonamento', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: SupportAgentService;

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findUnique.mockResolvedValue({
      resolvedAt: null, autoCloseAt: null, status: 'open', outcome: null, csatToken: null, csatScore: null,
    });
  });

  it('usa o summary do EscalationAgent como corpo da notificação e grava no ticket', async () => {
    const summary = '[Problema Relatado] X\n[Ações Tentadas] Y\n[Causa do Transbordo] Z';
    deps.escalation.decide.mockReturnValue({ escalate: true, reason: 'unresolved_no_kb_match', message: '', summary });

    await svc.ask('t1', { question: 'nao consigo emitir CT-e', conversationId: 'c1' });

    expect(deps.notifications.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ type: 'escalation', body: summary }),
    );
    expect(deps.prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ escalationSummary: summary }) }),
    );
  });

  it('sem summary (fallback): corpo da notificação volta ao formato categoria/prioridade/motivo', async () => {
    deps.escalation.decide.mockReturnValue({ escalate: true, reason: 'priority_critical', message: '', summary: null });

    await svc.ask('t1', { question: 'sistema parado', conversationId: 'c1' });

    expect(deps.notifications.create).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ body: expect.stringContaining('Motivo: priority_critical') }),
    );
    const escalationSummaryUpdates = deps.prisma.aiConversation.update.mock.calls
      .filter((c: any[]) => c[0]?.data && 'escalationSummary' in c[0].data);
    expect(escalationSummaryUpdates).toHaveLength(0);
  });
});

// ─── Incidente do CT-e 519 (2026-08-07) ───────────────────────────────────────
// O pipeline tinha a resposta certa (código na tabela do connector + artigo de KB)
// e o cliente recebeu só um aviso de transbordo. Dois pontos do fluxo trocavam a
// solução por um texto genérico; estes testes trancam os dois.
describe('SupportAgentService — a solução nunca é descartada', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: SupportAgentService;

  const SOLUCAO =
    'A rejeição 519 é CFOP inválido para a UF. Verifique o endereço do remetente em Cadastros e reemita o CT-e.';

  beforeEach(() => {
    deps = makeDeps();
    svc = makeService(deps);
    deps.prisma.aiConversation.findUnique.mockResolvedValue({
      resolvedAt: null, autoCloseAt: null, status: 'open', outcome: null, csatToken: null, csatScore: null,
    });
    deps.diagnostic.diagnose.mockResolvedValue({
      needsMoreInfo: false, questionsToAsk: [],
      rootCause: 'CFOP inválido para a operação',
      suggestedAction: 'Verificar UF de origem e destino no embarque',
      confidence: 'high', tmsUnstable: false, diagnosticData: {}, playbook: null,
    });
    deps.resolution.resolve.mockResolvedValue({
      draft: SOLUCAO, usedKnowledge: [], allowedFacts: 'KB 519', confidence: 'high', resolved: true, action: null,
    });
  });

  it('caso resolvido que escala mesmo assim entrega a solução E o aviso de transbordo', async () => {
    // Exatamente o cenário do print: resolvido, mas o classificador pediu humano.
    deps.escalation.decide.mockReturnValue({
      escalate: true,
      reason: 'classifier_requires_human',
      message: 'Esta solicitação precisa de análise especializada. Estou te conectando com nossa equipe.',
      summary: '[Problema Relatado] CT-e 519',
    });

    const r = await svc.ask('t1', { question: 'Meu CT-e foi rejeitado, código 519. O que eu faço?', conversationId: 'c1' });

    expect(r.draft).toContain(SOLUCAO);
    expect(r.draft).toMatch(/análise especializada/i);
    expect(r.needsHuman).toBe(true);
    // texto gerado no meio → NÃO pode pular a Supervisora
    expect(r.scripted).toBe(false);
  });

  it('escalação sem resolução continua mandando só o aviso (e pula a Supervisora)', async () => {
    deps.resolution.resolve.mockResolvedValue({
      draft: '', usedKnowledge: [], allowedFacts: '', confidence: 'low', resolved: false, action: null,
    });
    deps.escalation.decide.mockReturnValue({
      escalate: true, reason: 'priority_critical',
      message: 'Identifiquei que sua operação está parada. Estou escalando para atendimento urgente agora.',
      summary: null,
    });

    const r = await svc.ask('t1', { question: 'sistema parado', conversationId: 'c1' });

    expect(r.draft).toMatch(/operação está parada/i);
    expect(r.scripted).toBe(true); // literal do catálogo
  });

  it('caso resolvido sem escalar ACRESCENTA a pergunta de confirmação — não substitui a resposta', async () => {
    deps.escalation.decide.mockReturnValue({ escalate: false, reason: 'ia_resolve', message: '', summary: null });

    const r = await svc.ask('t1', { question: 'Meu CT-e foi rejeitado, código 519. O que eu faço?', conversationId: 'c1' });

    expect(r.draft).toContain(SOLUCAO);
    expect(r.draft).toMatch(/Isso resolveu seu problema\?/);
    expect(r.needsHuman).toBe(false);
  });

  it('saudação é roteirizada (pula a Supervisora) e não se repete em conversa em andamento', async () => {
    const nova = await svc.ask('t1', { question: 'oi', conversationId: 'c1' });
    expect(nova.scripted).toBe(true);
    expect(nova.draft).toMatch(/Estou aqui para ajudar/);

    deps.conversations.getMessages.mockResolvedValue([
      { direction: 'inbound', content: 'oi' },
      { direction: 'outbound', content: 'Olá!' },
    ]);
    const emAndamento = await svc.ask('t1', { question: 'oi', conversationId: 'c1' });
    expect(emAndamento.scripted).toBe(true);
    expect(emAndamento.draft).not.toMatch(/Olá/);
  });

  it('a busca de KB é disparada antes do diagnóstico e repassada ao ResolutionAgent', async () => {
    const kb = [{ id: 'kb1', title: '519', content: '…', score: 0.9 }];
    deps.resolution.prefetchKnowledge.mockResolvedValue(kb);
    deps.escalation.decide.mockReturnValue({ escalate: false, reason: 'ia_resolve', message: '', summary: null });

    await svc.ask('t1', { question: 'CT-e rejeitado 519', conversationId: 'c1' });

    expect(deps.resolution.prefetchKnowledge).toHaveBeenCalledWith('t1', 'CT-e rejeitado 519');
    expect(deps.resolution.resolve).toHaveBeenCalledWith(expect.objectContaining({ knowledge: kb }));
  });
});
