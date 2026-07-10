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
  } as any;

  const notifications = { create: vi.fn().mockResolvedValue({}) } as any;

  // Dependências que não são chamadas nos cenários de confirmação
  const noop = () => ({}) as any;
  const conversations = { getMessages: vi.fn().mockResolvedValue([]) } as any;
  const ai = {} as any;
  const classifier = { classify: vi.fn().mockResolvedValue({ category: 'suporte', priority: 'normal', requiresHuman: false }) } as any;
  const diagnostic = { diagnose: vi.fn().mockResolvedValue({ needsMoreInfo: false, questionsToAsk: [], rootCause: null }) } as any;
  const resolution = { resolve: vi.fn().mockResolvedValue({ draft: 'resp', usedKnowledge: [], allowedFacts: '', confidence: 'high', resolved: false }) } as any;
  const escalation = { decide: vi.fn().mockResolvedValue({ escalate: false, reason: '' }) } as any;
  const intelligence = { analyze: vi.fn().mockResolvedValue({}) } as any;

  return { prisma, notifications, conversations, ai, classifier, diagnostic, resolution, escalation, intelligence };
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
  );
}

// Estado de "aguardando confirmação"
const pendingConvState = {
  resolvedAt: new Date(),
  autoCloseAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  status: 'open',
  outcome: null,
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
      resolvedAt: null, autoCloseAt: null, status: 'open', outcome: null,
    });

    await svc.ask('t1', { question: 'nao consigo emitir CT-e', conversationId: 'c1' });

    expect(deps.classifier.classify).toHaveBeenCalled();
  });
});
