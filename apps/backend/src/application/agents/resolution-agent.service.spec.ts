import { ResolutionAgentService, ResolutionResult } from './resolution-agent.service';
import { DiagnosticResult } from './diagnostic-agent.service';

function mockAi(response: string) {
  return { complete: vi.fn().mockResolvedValue(response) } as any;
}

function mockKnowledge(rows: { id: string; title: string; score: number; content: string; topic?: string }[] = []) {
  return { retrieve: vi.fn().mockResolvedValue(rows) } as any;
}

function mockPlaybook(supportPersona: string | null = '') {
  if (supportPersona === null) {
    return { get: vi.fn().mockRejectedValue(new Error('falha ao carregar playbook')) } as any;
  }
  return { get: vi.fn().mockResolvedValue({ supportPersona }) } as any;
}

function diag(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    rootCause: null,
    playbook: null,
    diagnosticData: {},
    suggestedAction: null,
    needsMoreInfo: false,
    questionsToAsk: [],
    confidence: 'high',
    ...overrides,
  };
}

function aiJson(result: Partial<Omit<ResolutionResult, 'usedKnowledge'>>): string {
  return JSON.stringify({
    draft: 'Resposta padrão',
    resolved: true,
    action: null,
    confidence: 'high',
    ...result,
  });
}

const baseInput = {
  tenantId: 'tenant-1',
  message: 'Minha CT-e não emite',
  category: 'cte' as const,
  priority: 'high' as const,
  diagnostic: diag(),
  history: '',
  tmsCustomer: { name: 'Fulano' },
};

describe('ResolutionAgentService', () => {
  // ─── Caminho feliz ───────────────────────────────────────────────────────
  it('returns the parsed resolution with the retrieved knowledge mapped into usedKnowledge', async () => {
    const ai = mockAi(aiJson({ draft: 'Veja o passo a passo', resolved: true }));
    const knowledge = mockKnowledge([{ id: 'kb-1', title: 'Como emitir CT-e', score: 0.9, content: 'conteúdo', topic: 'operacao-cte' }]);
    const playbook = mockPlaybook('');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    const result = await svc.resolve(baseInput);

    expect(result.draft).toBe('Veja o passo a passo\n\n📖 <a href="https://hipertms.com.br/ajuda/operacao/cte" target="_blank">Central de Ajuda</a>');
    expect(result.resolved).toBe(true);
    expect(result.usedKnowledge).toEqual([{ id: 'kb-1', title: 'Como emitir CT-e', score: 0.9 }]);
  });

  it('queries knowledge.retrieve with the tenant, message, topN=4 and excludeCategories=[comercial]', async () => {
    const ai = mockAi(aiJson({}));
    const knowledge = mockKnowledge([]);
    const playbook = mockPlaybook('');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    await svc.resolve(baseInput);

    // topN=4: suporte precisa de mais contexto KB do que vendas (atualizado no service)
    expect(knowledge.retrieve).toHaveBeenCalledWith('tenant-1', 'Minha CT-e não emite', 4, {
      excludeCategories: ['comercial'],
    });
  });

  it('strips residual markdown from the AI draft', async () => {
    const ai = mockAi(aiJson({ draft: '**Resolvido!** Veja o `código` abaixo:\n- passo um' }));
    const knowledge = mockKnowledge([]);
    const playbook = mockPlaybook('');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    const result = await svc.resolve(baseInput);

    expect(result.draft).not.toContain('**');
    expect(result.draft).not.toContain('`');
    expect(result.draft).toContain('Resolvido!');
    expect(result.draft).toContain('• passo um');
  });

  it('includes the configured support persona in the system prompt sent to the AI', async () => {
    const ai = mockAi(aiJson({}));
    const knowledge = mockKnowledge([]);
    const playbook = mockPlaybook('Seja sempre extremamente formal e cordial.');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    await svc.resolve(baseInput);

    const [system] = ai.complete.mock.calls[0];
    expect(system).toContain('Seja sempre extremamente formal e cordial.');
  });

  // ─── Resiliência: falha do playbook é absorvida ──────────────────────────
  it('still produces a resolution when playbook.get() rejects', async () => {
    const ai = mockAi(aiJson({ draft: 'Resposta sem persona customizada' }));
    const knowledge = mockKnowledge([]);
    const playbook = mockPlaybook(null);
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    const result = await svc.resolve(baseInput);

    expect(result.draft).toBe('Resposta sem persona customizada');
  });

  // ─── Fallback em caso de falha da IA ─────────────────────────────────────
  it('falls back to a low-confidence, unresolved draft when ai.complete throws, while keeping usedKnowledge', async () => {
    const ai = { complete: vi.fn().mockRejectedValue(new Error('AI indisponível')) } as any;
    const knowledge = mockKnowledge([{ id: 'kb-1', title: 'Como emitir CT-e', score: 0.9, content: 'conteúdo' }]);
    const playbook = mockPlaybook('');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    const result = await svc.resolve(baseInput);

    // draft e allowedFacts refletem o texto e o shape atuais do service
    expect(result).toEqual({
      draft: 'Não consegui identificar a solução para o seu problema. Vou encaminhar para um atendente especializado que vai entrar em contato em breve.',
      resolved: false,
      action: null,
      usedKnowledge: [{ id: 'kb-1', title: 'Como emitir CT-e', score: 0.9 }],
      confidence: 'low',
      allowedFacts: '[KB 1: Como emitir CT-e]\nconteúdo',
    });
  });

  it('falls back gracefully when the AI replies with invalid JSON', async () => {
    const ai = mockAi('não é json');
    const knowledge = mockKnowledge([]);
    const playbook = mockPlaybook('');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    const result = await svc.resolve(baseInput);

    expect(result.resolved).toBe(false);
    expect(result.confidence).toBe('low');
  });
});
