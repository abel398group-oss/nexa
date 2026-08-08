import { ResolutionAgentService, ResolutionResult } from './resolution-agent.service';
import { DiagnosticResult } from './diagnostic-agent.service';
import { SUPPORT_CATEGORIES } from '@/application/knowledge/knowledge-tracks.const';

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
    tmsUnstable: false,
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

  // Antes este teste travava `excludeCategories: ['comercial']`. Lista negra de UMA
  // categoria contra 16 deixava `precificacao` e `vendas` alcançáveis pelo suporte —
  // e esse conteúdo virava `allowedFacts`, então a Supervisora passava a APROVAR a Lia
  // citando preço dentro de um chamado. Agora é lista branca da trilha.
  it('busca a KB com lista BRANCA da trilha de suporte, topN=4', async () => {
    const ai = mockAi(aiJson({}));
    const knowledge = mockKnowledge([]);
    const playbook = mockPlaybook('');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    await svc.resolve(baseInput);

    // topN=4: suporte precisa de mais contexto KB do que vendas
    expect(knowledge.retrieve).toHaveBeenCalledWith('tenant-1', 'Minha CT-e não emite', 4, {
      includeCategories: SUPPORT_CATEGORIES,
      productCode: undefined,
    });
  });

  it('nenhuma categoria comercial é alcançável pelo suporte', async () => {
    for (const proibida of ['comercial', 'precificacao', 'vendas']) {
      expect(SUPPORT_CATEGORIES).not.toContain(proibida);
    }
  });

  it('repassa o productCode — vendas já filtrava por produto e o suporte não', async () => {
    const ai = mockAi(aiJson({}));
    const knowledge = mockKnowledge([]);
    const svc = new ResolutionAgentService(ai, knowledge, mockPlaybook(''));

    await svc.resolve({ ...baseInput, productCode: 'pneus' } as any);

    expect(knowledge.retrieve).toHaveBeenCalledWith(
      'tenant-1', 'Minha CT-e não emite', 4,
      expect.objectContaining({ productCode: 'pneus' }),
    );
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

  // A regra anti-identidade existia só no agente de DIAGNÓSTICO — e quem
  // escreve o texto que o cliente lê é este. Sem ela, nada impedia a resposta
  // final de pedir CNPJ a quem já veio autenticado do TMS.
  it('proíbe pedir dado de identificação ao cliente', async () => {
    const ai = mockAi(aiJson({}));
    const svc = new ResolutionAgentService(ai, mockKnowledge([]), mockPlaybook(''));

    await svc.resolve(baseInput);

    const system = ai.complete.mock.calls[0][0] as string;
    expect(system).toContain('NUNCA peça dados pessoais ou de identificação');
    expect(system).toContain('CNPJ');
  });

  // ─── TMS instável (2026-08-05) ────────────────────────────────────────────
  // Antes o flag morria no diagnóstico e o cliente recebia escalação comum —
  // podendo entender que o documento/contrato dele não existe.

  it('instrui a avisar da instabilidade quando o TMS está fora', async () => {
    const ai = mockAi(aiJson({}));
    const knowledge = mockKnowledge([]);
    const playbook = mockPlaybook('');
    const svc = new ResolutionAgentService(ai, knowledge, playbook);

    await svc.resolve({ ...baseInput, diagnostic: diag({ tmsUnstable: true }) });

    const userMsg = ai.complete.mock.calls[0][1] as string;
    expect(userMsg).toContain('SISTEMA INSTÁVEL');
    expect(userMsg).toContain('NUNCA afirme que o documento');
  });

  it('TMS normal: nenhum aviso de instabilidade no prompt', async () => {
    const ai = mockAi(aiJson({}));
    const svc = new ResolutionAgentService(ai, mockKnowledge([]), mockPlaybook(''));

    await svc.resolve(baseInput);

    expect(ai.complete.mock.calls[0][1] as string).not.toContain('SISTEMA INSTÁVEL');
  });

  it('IA fora do ar + TMS instável: fallback fala da instabilidade, não de "não sei resolver"', async () => {
    const ai = { complete: vi.fn().mockRejectedValue(new Error('AI fora')) } as any;
    const svc = new ResolutionAgentService(ai, mockKnowledge([]), mockPlaybook(''));

    const r = await svc.resolve({ ...baseInput, diagnostic: diag({ tmsUnstable: true }) });

    expect(r.draft).toContain('instabilidade');
    expect(r.draft).not.toContain('Não consegui identificar a solução');
    expect(r.resolved).toBe(false);
  });

  // ─── F10: page (tela do TMS de origem do chat, do token de handoff) ────────
  it('inclui a tela do TMS no prompt quando tmsCustomer.page está presente', async () => {
    const ai = mockAi(aiJson({}));
    const svc = new ResolutionAgentService(ai, mockKnowledge([]), mockPlaybook(''));

    await svc.resolve({ ...baseInput, tmsCustomer: { name: 'Fulano', page: '/fiscal/cte' } });

    const system = ai.complete.mock.calls[0][0] as string;
    expect(system).toContain('/fiscal/cte');
  });

  it('não menciona tela quando tmsCustomer.page está ausente', async () => {
    const ai = mockAi(aiJson({}));
    const svc = new ResolutionAgentService(ai, mockKnowledge([]), mockPlaybook(''));

    await svc.resolve(baseInput);

    const system = ai.complete.mock.calls[0][0] as string;
    expect(system).not.toContain('O cliente abriu o chat a partir da tela');
  });
});
