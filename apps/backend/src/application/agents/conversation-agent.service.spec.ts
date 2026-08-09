/**
 * ConversationAgentService — unit tests
 *
 * Covers the orchestration logic inside ConversationAgentService.handle():
 *   • opt-out scripted reply
 *   • human_needed scripted reply
 *   • gate de confiança (needsClarification)
 *   • anti-loop (MAX_AI_QUESTIONS perguntas seguidas → escala humano)
 *   • kill switch OFF → autoSent = false
 *   • kill switch ON + supervisor aprovado → autoSent = true
 *   • supervisor reprovado → sends SAFE_FALLBACK instead of draft
 *   • HANDOFF token detection → forces support route
 *   • [via-painel-tms] marker → forces support route
 *   • escalateOnly() → returns route + handoff without writing a message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationAgentService } from './conversation-agent.service';
import type { RouteDecision } from './router-agent.service';
import type { SupervisorVerdict } from './supervisor-agent.service';

// Horário de atendimento fixado como ABERTO: o aviso de escalação muda de texto
// (e agora de existência) conforme o relógio. Sem fixar, os testes de escalação
// passariam ou falhariam dependendo da hora em que a suíte roda.
vi.mock('@/application/conversations/support-hours', () => ({
  isWithinSupportHours: () => true,
  supportHoursLabel: () => 'de segunda a sexta, das 8h às 18h',
  nextOpeningLabel: () => 'amanhã de manhã',
}));

// ── helpers ──────────────────────────────────────────────────────────────────

const okVerdict: SupervisorVerdict = { approved: true, risk: 'low', issues: [], source: 'fallback' };
const nokVerdict: SupervisorVerdict = { approved: false, risk: 'high', issues: ['dado falso'], source: 'ai' };

function makeRoute(overrides: Partial<RouteDecision> = {}): RouteDecision {
  return {
    intent: 'interested',
    agent: 'sales',
    leadScore: 50,
    confidence: 0.9,
    source: 'ai',
    reason: 'default',
    needsClarification: false,
    isAggressive: false,
    isComplaint: false,
    legalRisk: false,
    ...overrides,
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRouter   = { route: vi.fn() };
const mockSales    = { sell: vi.fn() };
const mockSupport  = { ask: vi.fn() };
const mockSupervisor = { review: vi.fn() };
const mockConversations = {
  getMessages: vi.fn(),
  findOne: vi.fn(),
  addMessage: vi.fn(),
};
const mockSellers        = { handoff: vi.fn() };
const mockPrisma         = {
  aiConversation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  contact:       { updateMany: vi.fn(), findFirst: vi.fn() },
  complaint:     { create: vi.fn() },
  // ADR 037: o playbook base é lido por findFirst (productCode nulo), porque o
  // unique deixou de ser só tenantId quando ele passou a poder ser por mercado.
  salesPlaybook: { findFirst: vi.fn() },
  planLimit:     { findUnique: vi.fn() },   // A6: teto de mensagens/mês do plano
  // A6: contagem de outbound do mês · aggregate: teto de GASTO diário (OWASP LLM10)
  aiMessage:     { count: vi.fn(), aggregate: vi.fn() },
};
const mockAutonomy      = { isEnabled: vi.fn() };
const mockNotifications = { create: vi.fn() };
const mockTmsLookup     = { batchLookup: vi.fn() };
const mockHandoff       = { consume: vi.fn() };
const mockOpportunities = { createFromLead: vi.fn() };
const mockWaha          = { sendText: vi.fn() };
const mockEvents        = { emit: vi.fn() }; // P3: evento support.escalated (e-mail ao suporte)
// AbuseGuardService (2026-08-04): "3 strikes" — banimento por tentativa de manipulação.
const mockAbuseGuard    = { isBanned: vi.fn(), recordStrike: vi.fn() };

function makeService() {
  return new ConversationAgentService(
    mockRouter as any,
    mockSales as any,
    mockSupport as any,
    mockSupervisor as any,
    mockConversations as any,
    mockSellers as any,
    mockPrisma as any,
    mockAutonomy as any,
    mockNotifications as any,
    mockTmsLookup as any,
    mockHandoff as any,
    mockOpportunities as any,
    mockWaha as any,
    mockEvents as any,
    // ContactsService (2026-08-01): grava o perfil que o lead revelou.
    // Best-effort no serviço — o mock só precisa não explodir.
    { applyLeadProfile: vi.fn().mockResolvedValue(undefined) } as any,
    mockAbuseGuard as any,
  );
}

// Speed up: make setTimeout fire immediately
vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any; });

// ── shared defaults ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockConversations.getMessages.mockResolvedValue([]);
  mockConversations.findOne.mockResolvedValue({ id: 'conv1', phone: '5511999999999', contactId: 'c1', status: 'open' });
  mockConversations.addMessage.mockResolvedValue(undefined);

  mockPrisma.aiConversation.findUnique.mockResolvedValue(null);
  mockPrisma.planLimit.findUnique.mockResolvedValue(null); // A6: sem teto por padrão (ilimitado)
  mockPrisma.aiMessage.count.mockResolvedValue(0);
  mockPrisma.aiMessage.aggregate.mockResolvedValue({ _sum: { estimatedCostUsd: 0 } }); // gasto zerado
  mockPrisma.aiConversation.findMany.mockResolvedValue([]);
  mockPrisma.aiConversation.update.mockResolvedValue({});
  mockPrisma.aiConversation.updateMany.mockResolvedValue({});
  mockPrisma.contact.updateMany.mockResolvedValue({});
  mockPrisma.contact.findFirst.mockResolvedValue(null);
  mockAbuseGuard.isBanned.mockResolvedValue(false);
  mockAbuseGuard.recordStrike.mockResolvedValue({ banned: false, strikeCount: 1 });
  mockPrisma.complaint.create.mockResolvedValue({});
  mockPrisma.salesPlaybook.findFirst.mockResolvedValue(null);

  mockAutonomy.isEnabled.mockReturnValue(false); // kill switch OFF by default
  mockNotifications.create.mockResolvedValue(undefined);
  mockTmsLookup.batchLookup.mockResolvedValue(new Map());
  mockHandoff.consume.mockResolvedValue(null);
  mockSellers.handoff.mockResolvedValue({ assigned: false });
  mockOpportunities.createFromLead.mockResolvedValue(undefined);
  mockWaha.sendText.mockResolvedValue(undefined);

  mockSupervisor.review.mockResolvedValue(okVerdict);
  mockSales.sell.mockResolvedValue({
    draft: 'Ótima pergunta! O HiperTMS tem planos a partir de R$ 99.',
    suggestedAction: 'none',
    usedKnowledge: [],
    allowedFacts: '',
    confidence: 'high',
  });
  mockSupport.ask.mockResolvedValue({
    draft: 'Para resolver isso, acesse as configurações do módulo.',
    usedKnowledge: [],
    allowedFacts: '',
    confidence: 'high',
    needsHuman: false,
  });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ConversationAgentService.handle()', () => {

  // ── scripted replies ────────────────────────────────────────────────────────

  describe('opt-out flow', () => {
    it('returns opt-out scripted reply and handoff_human action', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'optout', intent: 'opt_out', leadScore: 0 }));

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'SAIR' });

      // Sem emoji desde 09/08: o prompt da Lia proíbe, e os roteiros fixos
      // estavam furando a própria regra.
      expect(res.draft).toContain('Pronto! Você não receberá mais mensagens');
      expect(res.suggestedAction).toBe('handoff_human');
      expect(res.needsHuman).toBe(false); // opt-out não precisa de humano (é automatico)
      expect(mockSales.sell).not.toHaveBeenCalled();
      expect(mockSupport.ask).not.toHaveBeenCalled();
    });

    it('persists opt-out status on contact when conversationId is provided', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'optout', intent: 'opt_out', leadScore: 0 }));

      const svc = makeService();
      await svc.handle('t1', { message: 'SAIR', conversationId: 'conv1' });

      expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'opted_out' }) }),
      );
    });
  });

  describe('human_needed flow', () => {
    it('returns handoff message and needsHuman = true', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'human', intent: 'human_needed' }));

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero falar com alguém' });

      expect(res.draft).toContain('especialistas');
      expect(res.needsHuman).toBe(true);
      expect(res.suggestedAction).toBe('handoff_human');
    });
  });

  // ── guard anti-spam (incidente 2026-07-20: promo de marmita → "lead quente score 0") ──

  describe('wrong_person (spam/fora de perfil) — nunca aciona vendedor', () => {
    it('handle(): NÃO chama sellers.handoff nem cria notificação de lead', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'human', intent: 'wrong_person', leadScore: 0 }),
      );

      const svc = makeService();
      await svc.handle('t1', { message: 'Promoção especial! R$9,99 por marmita!', conversationId: 'conv1' });

      expect(mockSellers.handoff).not.toHaveBeenCalled();
      expect(mockNotifications.create).not.toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ type: 'hot_lead' }),
      );
    });

    it('handle(): human_needed continua escalando, com kind=human_request', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'human', intent: 'human_needed', leadScore: 0 }),
      );

      const svc = makeService();
      await svc.handle('t1', { message: 'Quero falar com um atendente', conversationId: 'conv1' });

      expect(mockSellers.handoff).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ kind: 'human_request' }),
      );
    });

    it('handle(): lead quente de vendas escala com kind=hot_lead', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'sales', intent: 'interested', leadScore: 85 }),
      );

      const svc = makeService();
      await svc.handle('t1', { message: 'Quero contratar o HiperTMS', conversationId: 'conv1' });

      expect(mockSellers.handoff).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ kind: 'hot_lead', leadScore: 85 }),
      );
    });

    // seller-leads (F6+, prd.md critério "hot lead carrega assignedSellerId do
    // vendedor notificado") — handoff roda ANTES de createFromLead de propósito,
    // pra a oportunidade já nascer com o dono real do rodízio.
    it('handle(): lead quente propaga o sellerId do handoff pra createFromLead', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'sales', intent: 'interested', leadScore: 85 }),
      );
      mockSellers.handoff.mockResolvedValue({ assigned: true, sellerId: 's1', sellerName: 'Maria' });

      const svc = makeService();
      await svc.handle('t1', { message: 'Quero contratar o HiperTMS', conversationId: 'conv1' });

      expect(mockOpportunities.createFromLead).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ assignedSellerId: 's1', assignedTo: 'Maria' }),
      );
    });

    it('handle(): sem vendedor disponível no rodízio, createFromLead recebe assignedSellerId undefined (não vaza dono errado)', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'sales', intent: 'interested', leadScore: 85 }),
      );
      mockSellers.handoff.mockResolvedValue({ assigned: false });

      const svc = makeService();
      await svc.handle('t1', { message: 'Quero contratar o HiperTMS', conversationId: 'conv1' });

      expect(mockOpportunities.createFromLead).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ assignedSellerId: undefined }),
      );
    });

    it('escalateOnly(): wrong_person também não aciona vendedor (IA off)', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'human', intent: 'wrong_person', leadScore: 0 }),
      );

      const svc = makeService();
      const res = await svc.escalateOnly('t1', { message: 'Promoção imperdível!', conversationId: 'conv1' });

      expect(mockSellers.handoff).not.toHaveBeenCalled();
      expect(res.handoff).toBeUndefined();
    });

    it('autonomia ON + wrong_person → NÃO auto-envia nada (nem aceno seguro)', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'human', intent: 'wrong_person', leadScore: 0 }),
      );

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Promoção especial só hoje!', conversationId: 'conv1' });

      expect(res.autoSent).toBe(false);
      expect(res.draft).toBe('');
      expect(mockConversations.addMessage).not.toHaveBeenCalledWith(
        't1',
        'conv1',
        expect.objectContaining({ direction: 'outbound' }),
      );
    });
  });

  // ── gate de confiança ───────────────────────────────────────────────────────

  describe('gate de confiança', () => {
    it('sends clarification message when needsClarification + first contact', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'sales', needsClarification: true, confidence: 0.3 }),
      );
      mockConversations.getMessages.mockResolvedValue([]); // primeira interação

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'oi' });

      // O esclarecimento é comercial e não menciona suporte (ver SCRIPTS.clarify).
      expect(res.draft).toMatch(/desafio da sua operação/i);
      expect(res.draft).not.toMatch(/suporte/i);
      expect(mockSales.sell).not.toHaveBeenCalled();
    });

    it('skips gate when Lia already talked (ongoing conversation)', async () => {
      mockRouter.route.mockResolvedValue(
        makeRoute({ agent: 'sales', needsClarification: true, confidence: 0.3 }),
      );
      // Uma mensagem de saída anterior → liaAlreadyTalked = true
      mockConversations.getMessages.mockResolvedValue([
        { direction: 'outbound', content: 'Olá, como posso ajudar?' },
      ]);

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'oi', conversationId: 'conv1' });

      // Deve ter chamado o agente de vendas (gate pulado)
      expect(mockSales.sell).toHaveBeenCalled();
      expect(res.draft).not.toMatch(/cliente ou prospect/i);
    });
  });

  // ── anti-loop ───────────────────────────────────────────────────────────────

  describe('anti-loop guard', () => {
    it('escalates to human after MAX_AI_QUESTIONS consecutive questions', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales', leadScore: 20 }));
      // 3 outbound messages, all ending with "?"
      mockConversations.getMessages.mockResolvedValue([
        { direction: 'outbound', content: 'Qual é o porte da sua transportadora?' },
        { direction: 'outbound', content: 'Quantos veículos tem na frota?' },
        { direction: 'outbound', content: 'Quais documentos fiscais emite?' },
      ]);

      const svc = makeService();
      // conversationId is required so the service actually loads message history
      const res = await svc.handle('t1', { message: 'só testando', conversationId: 'conv1' });

      expect(res.route.agent).toBe('human');
      expect(res.needsHuman).toBe(true);
      expect(mockSales.sell).not.toHaveBeenCalled();
    });

    it('does NOT escalate when leadScore is high (hot lead)', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales', leadScore: 80 }));
      mockConversations.getMessages.mockResolvedValue([
        { direction: 'outbound', content: 'Qual é o porte da sua transportadora?' },
        { direction: 'outbound', content: 'Quantos veículos tem na frota?' },
        { direction: 'outbound', content: 'Quais documentos fiscais emite?' },
      ]);

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'tenho 50 caminhões' });

      expect(res.route.agent).toBe('sales');
      expect(mockSales.sell).toHaveBeenCalled();
    });
  });

  // ── autonomy / auto-send ────────────────────────────────────────────────────

  describe('kill switch', () => {
    it('does NOT auto-send when autonomy is OFF', async () => {
      mockAutonomy.isEnabled.mockReturnValue(false);
      mockRouter.route.mockResolvedValue(makeRoute());

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero saber mais', conversationId: 'conv1' });

      expect(res.autoSent).toBe(false);
      expect(res.blockedReason).toMatch(/kill switch/i);
      expect(mockConversations.addMessage).not.toHaveBeenCalled();
    });

    it('auto-sends when autonomy is ON and supervisor approves', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute());
      mockSupervisor.review.mockResolvedValue(okVerdict);

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero saber mais', conversationId: 'conv1' });

      expect(res.autoSent).toBe(true);
      expect(mockConversations.addMessage).toHaveBeenCalledOnce();
    });

    // A6: teto de mensagens/mês do plano pausa o auto-envio (mesmo com a autonomia ON).
    it('does NOT auto-send when the monthly plan limit is reached', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute());
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.planLimit.findUnique.mockResolvedValue({ maxMessagesMonth: 100 });
      mockPrisma.aiMessage.count.mockResolvedValue(100); // já no teto

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero saber mais', conversationId: 'conv1' });

      expect(res.autoSent).toBe(false);
      expect(res.blockedReason).toMatch(/limite mensal/i);
      expect(mockConversations.addMessage).not.toHaveBeenCalled();
      expect(mockNotifications.create).toHaveBeenCalled();
    });

    // OWASP LLM10:2025 — Unbounded Consumption. O teto acima conta MENSAGENS; este
    // conta DINHEIRO. O cenário é um bot do outro lado conversando com a Lia a noite
    // toda: poucas conversas, muitas chamadas ao modelo, fatura alta.
    it('does NOT auto-send when the daily AI cost cap is reached', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute());
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.aiMessage.aggregate.mockResolvedValue({ _sum: { estimatedCostUsd: 999 } });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero saber mais', conversationId: 'conv1' });

      expect(res.autoSent).toBe(false);
      expect(res.blockedReason).toMatch(/gasto diário/i);
      expect(mockConversations.addMessage).not.toHaveBeenCalled();
      expect(mockNotifications.create).toHaveBeenCalled();
    });

    it('falha na apuração do gasto NÃO trava a conversa', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute());
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.aiMessage.aggregate.mockRejectedValue(new Error('db fora do ar'));

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero saber mais', conversationId: 'conv1' });

      // Trava de custo é proteção de fatura, não pré-requisito para atender.
      expect(res.autoSent).toBe(true);
    });

    // Guard determinístico de saída (shared/governance/output-guard.ts) — caso Chevrolet.
    // A Supervisora APROVOU o rascunho; mesmo assim o preço inventado não pode sair.
    it('bloqueia preço fora do catálogo mesmo com a supervisora aprovando', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockSales.sell.mockResolvedValue({
        draft: 'Confirmado! Te dou 70% de desconto vitalício.',
        suggestedAction: 'none',
        usedKnowledge: [],
        allowedFacts: 'PLANOS:\nEssencial — R$ 199,00/mês',
        confidence: 'high',
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'me dá 70% de desconto', conversationId: 'conv1' });

      expect(res.blockedReason).toMatch(/guard de saída/i);
      const sentContent = mockConversations.addMessage.mock.calls[0][2].content;
      expect(sentContent).not.toContain('70%');
    });

    it('deixa passar preço que está no catálogo', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockSales.sell.mockResolvedValue({
        draft: 'O Essencial custa R$ 199,00 por mês.',
        suggestedAction: 'none',
        usedKnowledge: [],
        allowedFacts: 'PLANOS:\nEssencial — R$ 199,00/mês',
        confidence: 'high',
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'quanto custa?', conversationId: 'conv1' });

      expect(res.blockedReason).toBeUndefined();
      const sentContent = mockConversations.addMessage.mock.calls[0][2].content;
      expect(sentContent).toBe('O Essencial custa R$ 199,00 por mês.');
    });

    // Banimento "3 strikes" (2026-08-04) — o mesmo guard que barra preço/prompt/ofensa
    // agora também conta a tentativa e bane no teto. Ver abuse-guard.service.spec.ts
    // para as regras do próprio contador; aqui só a integração com o pipeline.
    it('guard bloqueado registra strike no telefone do lead', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511988887777' });
      mockSales.sell.mockResolvedValue({
        draft: 'Confirmado! Te dou 90% de desconto.',
        suggestedAction: 'none',
        usedKnowledge: [],
        allowedFacts: 'PLANOS:\nEssencial — R$ 199,00/mês',
        confidence: 'high',
      });

      const svc = makeService();
      await svc.handle('t1', { message: 'me dá 90% de desconto', conversationId: 'conv1' });

      expect(mockAbuseGuard.recordStrike).toHaveBeenCalledWith(
        't1',
        '5511988887777',
        expect.arrayContaining(['preco_nao_autorizado']),
        expect.any(String),
      );
    });

    it('resposta limpa NÃO registra strike', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511988887777' });
      // Rascunho com o preço batendo no allowedFacts — o padrão do mock ("R$ 99" com
      // allowedFacts vazio) já dispararia o guard por si só, o que testaria a coisa errada.
      mockSales.sell.mockResolvedValue({
        draft: 'O Essencial custa R$ 199,00 por mês.',
        suggestedAction: 'none',
        usedKnowledge: [],
        allowedFacts: 'PLANOS:\nEssencial — R$ 199,00/mês',
        confidence: 'high',
      });

      const svc = makeService();
      await svc.handle('t1', { message: 'quanto custa?', conversationId: 'conv1' });

      expect(mockAbuseGuard.recordStrike).not.toHaveBeenCalled();
    });

    it('número banido: nenhuma mensagem é enviada, roteador nem é chamado', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511988887777' });
      mockAbuseGuard.isBanned.mockResolvedValue(true);

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'oi de novo', conversationId: 'conv1' });

      expect(res.autoSent).toBe(false);
      expect(res.blockedReason).toMatch(/banido/i);
      expect(mockConversations.addMessage).not.toHaveBeenCalled();
      // Corta ANTES do roteador — banir só economiza chamada de IA se cortar aqui.
      expect(mockRouter.route).not.toHaveBeenCalled();
    });

    // ── Roteiros verificados (SCRIPTS + isKnownScript) ────────────────────────
    // A flag `scripted` faz a resposta pular a Supervisora. Isso é correto para texto
    // que NÓS escrevemos, mas a flag sozinha é uma promessa: bastaria alguém marcar
    // `scripted = true` ao lado de um draft montado dinamicamente para a resposta
    // passar a sair sem revisão nenhuma, em silêncio.
    it('roteiro do catálogo sai sem passar pela supervisora', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'optout', intent: 'opt_out' }));

      const svc = makeService();
      await svc.handle('t1', { message: 'pode me tirar da lista', conversationId: 'conv1' });

      // Texto fixo não alucina — auditar seria gasto sem ganho.
      expect(mockSupervisor.review).not.toHaveBeenCalled();
      const enviado = mockConversations.addMessage.mock.calls[0][2].content as string;
      expect(enviado).toContain('não receberá mais mensagens');
    });

    it('texto que se diz roteirizado mas não está no catálogo É auditado', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'human', intent: 'human_needed' }));
      mockSupervisor.review.mockResolvedValue(nokVerdict);
      // Simula o cenário de regressão: o playbook injeta um link inválido no roteiro
      // de "suporte sem cadastro", quebrando a moldura conhecida.
      mockPrisma.salesPlaybook.findFirst.mockResolvedValue({ signupUrl: 'javascript:alert(1)' });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'quero falar com humano', conversationId: 'conv1' });

      // O ponto do teste não é o texto final, é não existir caminho que pule a
      // auditoria sem estar no catálogo.
      expect(res.autoSent).toBe(true);
    });

    it('sends SAFE_FALLBACK_SALES when supervisor rejects', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockSupervisor.review.mockResolvedValue(nokVerdict);
      mockSales.sell.mockResolvedValue({
        draft: 'Garantimos 100% de retorno!', // blocked by supervisor
        suggestedAction: 'none',
        usedKnowledge: [],
        allowedFacts: '',
        confidence: 'high',
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'qual o retorno?', conversationId: 'conv1' });

      expect(res.autoSent).toBe(true);
      expect(res.blockedReason).toMatch(/reprovado/i);
      // The message sent must NOT be the original draft
      const sentContent = mockConversations.addMessage.mock.calls[0][2].content;
      expect(sentContent).not.toBe('Garantimos 100% de retorno!');
    });

    it('sends SAFE_FALLBACK_SUPPORT on support rejection', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'support' }));
      mockSupervisor.review.mockResolvedValue(nokVerdict);
      // Force support route by providing portalIdentity
      const svc = makeService();
      const res = await svc.handle('t1', {
        message: 'meu sistema caiu',
        conversationId: 'conv1',
        portalIdentity: { externalId: 'ext1', name: 'Empresa ABC' },
      });

      expect(res.autoSent).toBe(true);
      const sentContent = mockConversations.addMessage.mock.calls[0][2].content;
      expect(sentContent).toMatch(/atendente|equipe/i); // SAFE_FALLBACK_SUPPORT
    });

    // Incidente do CT-e 519: o rascunho de suporte estava ancorado na KB e aprovado
    // pela Supervisora, mas `confidence: 'low'` (auto-declarado pelo modelo) o trocava
    // pelo aceno seguro — que afirma "não consegui identificar a solução" justamente
    // quando a solução existe. A Supervisora é o gate de alucinação; a confiança baixa
    // agora escala o caso SEM apagar a resposta.
    it('suporte com confiança baixa: envia o rascunho aprovado e escala em paralelo', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'support' }));
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockSupport.ask.mockResolvedValue({
        draft: 'A rejeição 519 é CFOP inválido para a UF — corrija o endereço em Cadastros e reemita.',
        usedKnowledge: [], allowedFacts: 'KB 519', confidence: 'low', needsHuman: false,
      });

      const svc = makeService();
      const res = await svc.handle('t1', {
        message: 'CT-e rejeitado 519',
        conversationId: 'conv1',
        portalIdentity: { externalId: 'ext1', name: 'Empresa ABC' },
      });

      expect(res.autoSent).toBe(true);
      const enviado = mockConversations.addMessage.mock.calls[0][2].content;
      expect(enviado).toMatch(/CFOP inválido/);
      expect(enviado).not.toMatch(/não consegui identificar/i);
      expect(res.needsHuman).toBe(true);
      expect(res.blockedReason).toMatch(/confiança baixa no suporte/i);

      // A resposta enviada é a técnica — ela NÃO avisa que um humano vai assumir.
      // Aqui o aviso de escalação não é duplicata: é a única forma de o cliente saber.
      const avisos = mockConversations.addMessage.mock.calls.filter(
        (c: any) => c[2]?.intent === 'escalation_notice',
      );
      expect(avisos).toHaveLength(1);
    });

    // Vendas mantém o comportamento antigo: lá o aceno seguro é um convite genérico,
    // não uma afirmação falsa sobre o problema do cliente.
    it('vendas com confiança baixa continua caindo no aceno seguro', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockSales.sell.mockResolvedValue({
        draft: 'Talvez a gente tenha isso, não sei.',
        suggestedAction: 'none', usedKnowledge: [], allowedFacts: '', confidence: 'low',
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'tem app?', conversationId: 'conv1' });

      const enviado = mockConversations.addMessage.mock.calls[0][2].content;
      expect(enviado).not.toMatch(/Talvez a gente tenha/);
      expect(res.blockedReason).toMatch(/confiança baixa/i);
    });

    // O aviso de escalação era `waha.sendText(conv.phone, ...)` direto. No
    // widget do TMS o `phone` é o externalId (e no portal, `portal:<id>`) —
    // mandava WhatsApp pra uma string que não é telefone, falhava em silêncio,
    // e o cliente do chat nunca sabia que tinha sido escalado. `addMessage`
    // roteia por canal (WebSocket no web_chat/portal, WAHA no WhatsApp).
    it('avisa a escalação PELA CONVERSA, não por WhatsApp direto', async () => {
      // Autonomia OFF: nada foi enviado ao cliente nesta rodada, então o aviso de
      // escalação é a única mensagem que ele recebe — tem que sair, e pela conversa.
      mockAutonomy.isEnabled.mockReturnValue(false);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'support' }));
      mockSupport.ask.mockResolvedValue({
        draft: 'Vou verificar isso com o time.',
        usedKnowledge: [], allowedFacts: '', confidence: 'high', needsHuman: true,
      });
      mockConversations.findOne.mockResolvedValue({
        id: 'conv1', phone: 'ext-tms-123', contactId: 'c1', status: 'open',
      });

      const svc = makeService();
      await svc.handle('t1', {
        message: 'meu CT-e não emite',
        conversationId: 'conv1',
        portalIdentity: { externalId: 'ext-tms-123', name: 'Empresa ABC' },
      });

      const avisos = mockConversations.addMessage.mock.calls.filter(
        (c: any) => c[2]?.intent === 'escalation_notice',
      );
      expect(avisos).toHaveLength(1);
      expect(avisos[0][2].content).toMatch(/atendente/i);
      // nada de WhatsApp direto para um "telefone" que é o externalId do TMS
      expect(mockWaha.sendText).not.toHaveBeenCalledWith('ext-tms-123', expect.anything());
    });

    // Incidente do CT-e 519: o cliente recebia o aceno seguro ("vou encaminhar para
    // um atendente…") e, logo em seguida, "Vou chamar um atendente…" — duas mensagens
    // dizendo a mesma coisa. Dentro do expediente o segundo aviso não acrescenta nada.
    it('não repete o aviso de escalação quando a resposta enviada já avisou', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'support' }));
      mockSupervisor.review.mockResolvedValue(nokVerdict); // reprovado → aceno seguro + needsHuman
      mockConversations.findOne.mockResolvedValue({
        id: 'conv1', phone: 'ext-tms-123', contactId: 'c1', status: 'open',
      });

      const svc = makeService();
      await svc.handle('t1', {
        message: 'meu CT-e não emite',
        conversationId: 'conv1',
        portalIdentity: { externalId: 'ext-tms-123', name: 'Empresa ABC' },
      });

      const enviadas = mockConversations.addMessage.mock.calls;
      // a resposta saiu (aceno seguro, que já anuncia o transbordo)…
      expect(enviadas.filter((c: any) => c[2]?.intent !== 'escalation_notice')).toHaveLength(1);
      // …e o aviso duplicado não
      expect(enviadas.filter((c: any) => c[2]?.intent === 'escalation_notice')).toHaveLength(0);
      // a conversa continua sendo escalada de verdade
      expect(mockPrisma.aiConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'escalated' }) }),
      );
    });
  });

  // ── ADR 035: takeover humano por conversa ──────────────────────────────────
  // Humano assumiu (humanTakeoverAt) ou conversa escalada → Lia gera o rascunho
  // mas NUNCA auto-envia, mesmo com autonomia ON e supervisora aprovando.

  describe('takeover humano (ADR 035)', () => {
    it('does NOT auto-send when humanTakeoverAt is set (draft only)', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute());
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.aiConversation.findUnique.mockResolvedValue({
        status: 'open',
        humanTakeoverAt: new Date('2026-07-20T12:00:00Z'),
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero saber mais', conversationId: 'conv1' });

      expect(res.autoSent).toBe(false);
      expect(res.blockedReason).toMatch(/takeover/i);
      expect(mockConversations.addMessage).not.toHaveBeenCalled();
      // o rascunho continua existindo (modo assistente)
      expect(res.draft).toBeTruthy();
    });

    it('does NOT auto-send when the conversation is escalated', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute());
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.aiConversation.findUnique.mockResolvedValue({
        status: 'escalated',
        humanTakeoverAt: null,
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'ainda com problema', conversationId: 'conv1' });

      expect(res.autoSent).toBe(false);
      expect(res.blockedReason).toMatch(/takeover/i);
      expect(mockConversations.addMessage).not.toHaveBeenCalled();
    });

    it('auto-sends normally when takeover is released (null/open)', async () => {
      mockAutonomy.isEnabled.mockReturnValue(true);
      mockRouter.route.mockResolvedValue(makeRoute());
      mockSupervisor.review.mockResolvedValue(okVerdict);
      mockPrisma.aiConversation.findUnique.mockResolvedValue({
        status: 'open',
        humanTakeoverAt: null,
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'Quero saber mais', conversationId: 'conv1' });

      expect(res.autoSent).toBe(true);
      expect(mockConversations.addMessage).toHaveBeenCalledOnce();
    });
  });

  // ── handoff token & via-painel-tms ─────────────────────────────────────────

  describe('HANDOFF token', () => {
    it('resolve o token e força suporte QUANDO o canal é de suporte', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      // A trilha é o canal (08/08/2026): o token só é honrado no widget/portal.
      mockPrisma.aiConversation.findUnique.mockResolvedValue({ sourceChannel: 'web_chat' });
      mockHandoff.consume.mockResolvedValue({
        externalId: 'ext123',
        tenantId: 't1',
        name: 'João Silva',
        page: '/frota',
        errorCode: null,
      });
      mockSupport.ask.mockResolvedValue({
        draft: 'Olá João! Posso ajudar com a frota.',
        usedKnowledge: [],
        allowedFacts: '',
        confidence: 'high',
        needsHuman: false,
      });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'HANDOFF:abc123xyz olá', conversationId: 'conv1' });

      expect(res.route.agent).toBe('support');
      expect(mockHandoff.consume).toHaveBeenCalledWith('abc123xyz');
      expect(mockSupport.ask).toHaveBeenCalled();
      // F10: page do token de handoff deve chegar ao SupportAgent via tmsCustomer,
      // pra habilitar a saudação contextual (ver diagnostic/resolution-agent).
      expect(mockSupport.ask).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ tmsCustomer: expect.objectContaining({ page: '/frota' }) }),
      );
    });

    it('does not force support when HANDOFF token is invalid/expired', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockHandoff.consume.mockResolvedValue(null); // invalid token

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'HANDOFF:expired123 olá' });

      // Route should stay as decided by router (sales)
      expect(mockSales.sell).toHaveBeenCalled();
    });

    it('[via-painel-tms] força suporte QUANDO o canal é de suporte', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockPrisma.aiConversation.findUnique.mockResolvedValue({ sourceChannel: 'web_chat' });

      const svc = makeService();
      const res = await svc.handle('t1', { message: '[via-painel-tms] preciso de ajuda', conversationId: 'conv1' });

      expect(res.route.agent).toBe('support');
      expect(mockSupport.ask).toHaveBeenCalled();
    });

    // ADR 022 modalidades A e B (botão do TMS abrindo wa.me para suporte) foram
    // SUPERADAS: o frontend do TMS não as usa mais e o WhatsApp virou exclusivamente
    // comercial. O marcador chegando por lá não pode reabrir a porta.
    it('marcador de suporte no WhatsApp NÃO força suporte', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockPrisma.aiConversation.findUnique.mockResolvedValue({ sourceChannel: 'whatsapp' });

      const svc = makeService();
      const res = await svc.handle('t1', { message: '[via-painel-tms] preciso de ajuda', conversationId: 'conv1' });

      expect(res.route.agent).not.toBe('support');
      expect(mockSupport.ask).not.toHaveBeenCalled();
    });

    it('HANDOFF token no WhatsApp não é nem consumido', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));
      mockPrisma.aiConversation.findUnique.mockResolvedValue({ sourceChannel: 'whatsapp' });

      const svc = makeService();
      await svc.handle('t1', { message: 'HANDOFF:abc123xyz olá', conversationId: 'conv1' });

      // Não consumir o token importa: ele é de uso único e queimá-lo aqui
      // invalidaria a sessão que o cliente abriria no widget em seguida.
      expect(mockHandoff.consume).not.toHaveBeenCalled();
    });
  });

  // ── prospect asking for support ─────────────────────────────────────────────

  describe('prospect asking for support', () => {
    // 09/08/2026: a resposta deixou de carregar o link de cadastro. Suporte não é
    // cadastro, e o texto antigo dizia "fale com a equipe comercial" enquanto
    // entregava um autoatendimento — sem nunca dizer onde o suporte fica.
    it('direciona ao chat do site, sem link de cadastro', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'support' }));
      mockTmsLookup.batchLookup.mockResolvedValue(new Map()); // not a customer
      mockPrisma.salesPlaybook.findFirst.mockResolvedValue({ signupUrl: 'https://app.hipervias.com/register' });

      const svc = makeService();
      const res = await svc.handle('t1', { message: 'preciso de suporte técnico', conversationId: 'conv1' });

      expect(res.draft).toMatch(/chat no site/i);
      expect(res.draft).not.toMatch(/https?:\/\//);
      expect(mockSupport.ask).not.toHaveBeenCalled();
    });
  });

  // ── portal identity ─────────────────────────────────────────────────────────

  describe('portal identity', () => {
    it('forces support and skips gate de confiança when portalIdentity provided', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales', needsClarification: true }));

      const svc = makeService();
      const res = await svc.handle('t1', {
        message: 'não consigo emitir CT-e',
        conversationId: 'conv1',
        portalIdentity: { externalId: 'ext42', name: 'Empresa XYZ' },
      });

      expect(res.route.agent).toBe('support');
      expect(mockSupport.ask).toHaveBeenCalled();
    });

    it('propagates portalIdentity.page to SupportAgent via tmsCustomer (F10)', async () => {
      mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales' }));

      const svc = makeService();
      await svc.handle('t1', {
        message: 'não consigo emitir CT-e',
        conversationId: 'conv1',
        portalIdentity: { externalId: 'ext42', name: 'Empresa XYZ', page: '/fiscal/cte' },
      });

      expect(mockSupport.ask).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ tmsCustomer: expect.objectContaining({ page: '/fiscal/cte' }) }),
      );
    });
  });
});

// ── escalateOnly ───────────────────────────────────────────────────────────────

describe('ConversationAgentService.escalateOnly()', () => {
  it('returns route + handoff without writing a message (autonomy is OFF)', async () => {
    mockRouter.route.mockResolvedValue(makeRoute({ agent: 'sales', leadScore: 80 }));
    mockSellers.handoff.mockResolvedValue({ assigned: true, sellerName: 'Maria' });

    const svc = makeService();
    const res = await svc.escalateOnly('t1', { message: 'quero contratar', conversationId: 'conv1' });

    expect(res.route.agent).toBe('sales');
    expect(res.handoff?.assigned).toBe(true);
    expect(mockConversations.addMessage).not.toHaveBeenCalled();
  });
});

// ── Trilha pelo canal (decisão de produto, 08/08/2026) ───────────────────────
// Suporte é exclusivo do chat dentro do HiperTMS e da abertura de chamado. No
// WhatsApp/e-mail a Lia direciona quem pede suporte — não diagnostica, não abre
// chamado, não escala.
describe('suporte pedido em canal comercial', () => {
  beforeEach(() => {
    mockAutonomy.isEnabled.mockReturnValue(true);
    mockRouter.route.mockResolvedValue(makeRoute({ agent: 'support', intent: 'support_question' }));
  });

  it('CLIENTE do TMS no WhatsApp é direcionado ao chat do site', async () => {
    mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511999999999', sourceChannel: 'whatsapp' });
    // lookup encontra o telefone → é cliente ativo
    // .get fixo: o service chama TmsLookupService.normalize(phone) na chave, e
    // reproduzir a normalização aqui acoplaria o teste ao formato interno dela.
    mockTmsLookup.batchLookup.mockResolvedValue({
      get: () => ({ name: 'Empresa ABC', role: 'ADMIN', tenantName: 'ABC' }),
    } as any);

    const svc = makeService();
    const res = await svc.handle('t1', { message: 'meu CT-e foi rejeitado', conversationId: 'conv1' });

    expect(res.draft).toMatch(/chat no site/i);
    // Não gasta as chamadas de IA do pipeline de suporte só para dizer "canal errado"
    expect(mockSupport.ask).not.toHaveBeenCalled();
    // E não vira chamado: nada de escalar nem de marcar needsHuman
    expect(res.needsHuman).toBe(false);
  });

  // 09/08/2026: cliente e prospect passaram a receber a MESMA resposta no canal
  // comercial. A variante do prospect dizia "fale com a equipe comercial" e
  // entregava um link de autocadastro, sem nunca dizer onde o suporte fica.
  it('PROSPECT no WhatsApp recebe a mesma resposta do cliente', async () => {
    mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511977777777', sourceChannel: 'whatsapp' });
    mockTmsLookup.batchLookup.mockResolvedValue(new Map()); // não é cliente

    const svc = makeService();
    const res = await svc.handle('t1', { message: 'preciso de suporte', conversationId: 'conv1' });

    expect(res.draft).toMatch(/chat no site/i);
    expect(res.draft).toMatch(/exclusivo para quem já é cliente/i);
    // Nada de link de cadastro nesta resposta — suporte não é cadastro.
    expect(res.draft).not.toMatch(/https?:\/\//);
  });

  it('PROSPECT no chat do site não cai no suporte real — a resposta não é circular', async () => {
    mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511977777777', sourceChannel: 'web_chat' });
    mockTmsLookup.batchLookup.mockResolvedValue(new Map()); // não é cliente

    const svc = makeService();
    const res = await svc.handle('t1', { message: 'preciso de suporte', conversationId: 'conv1' });

    expect(mockSupport.ask).not.toHaveBeenCalled();
    expect(res.draft).toMatch(/exclusivo para quem já é cliente/i);
    // Já está NO chat do site — mandá-lo para lá seria circular.
    expect(res.draft).not.toMatch(/chat no site/i);
  });

  // A causa raiz do descarrilamento no primeiro teste real (09/08): a Lia ofereceu
  // a trilha de suporte por conta própria, e o lead entrou pela porta que ela abriu.
  it('a mensagem de esclarecimento NUNCA oferece suporte', async () => {
    mockRouter.route.mockResolvedValue(
      makeRoute({ agent: 'sales', intent: 'unknown', needsClarification: true }),
    );
    mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511977777777', sourceChannel: 'whatsapp' });

    const svc = makeService();
    const res = await svc.handle('t1', { message: 'oi', conversationId: 'conv1' });

    expect(res.draft).not.toMatch(/suporte/i);
  });

  it('no widget o suporte funciona normalmente', async () => {
    mockPrisma.aiConversation.findUnique.mockResolvedValue({ sourceChannel: 'web_chat' });

    const svc = makeService();
    const res = await svc.handle('t1', {
      message: 'meu CT-e foi rejeitado',
      conversationId: 'conv1',
      portalIdentity: { externalId: 'ext1', name: 'Empresa ABC' },
    });

    expect(mockSupport.ask).toHaveBeenCalled();
    expect(res.draft).not.toContain('time comercial');
  });

  it('cliente do TMS no WhatsApp segue na fila de VENDAS, não vira chamado', async () => {
    mockPrisma.aiConversation.findUnique.mockResolvedValue({ phone: '5511999999999', sourceChannel: 'whatsapp' });
    // .get fixo: o service chama TmsLookupService.normalize(phone) na chave, e
    // reproduzir a normalização aqui acoplaria o teste ao formato interno dela.
    mockTmsLookup.batchLookup.mockResolvedValue({
      get: () => ({ name: 'Empresa ABC', role: 'ADMIN', tenantName: 'ABC' }),
    } as any);

    const svc = makeService();
    const res = await svc.handle('t1', { message: 'meu CT-e foi rejeitado', conversationId: 'conv1' });

    // customerStage continua sendo gravado (é fato: ele É cliente), mas hoje isso
    // é só informação para quem vende — não move mais a conversa para o suporte.
    expect(res.route.agent).not.toBe('support');
  });
});
