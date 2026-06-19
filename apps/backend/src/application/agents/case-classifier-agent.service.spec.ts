import { CaseClassifierAgentService, ClassificationResult } from './case-classifier-agent.service';

function mockAi(response: string | (() => string)) {
  return {
    complete: vi.fn().mockImplementation(async () => {
      if (typeof response === 'function') return response();
      return response;
    }),
  } as any;
}

function json(result: Partial<ClassificationResult>): string {
  return JSON.stringify({
    category: 'treinamento',
    priority: 'low',
    requiresHuman: false,
    confidence: 'high',
    reasoning: 'motivo',
    ...result,
  });
}

describe('CaseClassifierAgentService', () => {
  // ─── Caminho feliz ───────────────────────────────────────────────────────
  it('returns the parsed classification when the AI replies with valid JSON', async () => {
    const ai = mockAi(json({ category: 'cte', priority: 'high', confidence: 'high', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Minha CT-e está com erro');

    expect(result).toEqual({
      category: 'cte',
      priority: 'high',
      requiresHuman: false,
      confidence: 'high',
      reasoning: 'motivo',
    });
  });

  it('strips a ```json fenced code block before parsing', async () => {
    const ai = mockAi('```json\n' + json({ category: 'frete' }) + '\n```');
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Quanto custa o frete?');

    expect(result.category).toBe('frete');
  });

  it('passes the raw message to the AI when there is no history', async () => {
    const ai = mockAi(json({}));
    const svc = new CaseClassifierAgentService(ai);

    await svc.classify('Esqueci minha senha');

    const [, userMsg] = ai.complete.mock.calls[0];
    expect(userMsg).toContain('Mensagem: Esqueci minha senha');
    expect(userMsg).not.toContain('Histórico');
  });

  it('includes history in the prompt when provided', async () => {
    const ai = mockAi(json({}));
    const svc = new CaseClassifierAgentService(ai);

    await svc.classify('E agora?', 'Cliente perguntou sobre NF-e ontem');

    const [, userMsg] = ai.complete.mock.calls[0];
    expect(userMsg).toContain('Histórico recente:');
    expect(userMsg).toContain('Cliente perguntou sobre NF-e ontem');
    expect(userMsg).toContain('Mensagem atual: E agora?');
  });

  // ─── ADR 015 D6 — regra de segurança fiscal/financeiro ──────────────────
  it('D6: forces requiresHuman=true when category=fiscal and confidence=low, even if the AI said false', async () => {
    const ai = mockAi(json({ category: 'fiscal', confidence: 'low', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Rejeição SEFAZ 562');

    expect(result.requiresHuman).toBe(true);
  });

  it('D6: forces requiresHuman=true when category=financeiro and confidence=low', async () => {
    const ai = mockAi(json({ category: 'financeiro', confidence: 'low', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Minha fatura está errada');

    expect(result.requiresHuman).toBe(true);
  });

  it('D6: does NOT force requiresHuman when category=fiscal but confidence=high', async () => {
    const ai = mockAi(json({ category: 'fiscal', confidence: 'high', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Como emito uma CT-e complementar?');

    expect(result.requiresHuman).toBe(false);
  });

  it('D6: does not touch requiresHuman for other categories with low confidence', async () => {
    const ai = mockAi(json({ category: 'erro_sistema', confidence: 'low', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('A tela travou');

    expect(result.requiresHuman).toBe(false);
  });

  // ─── Fallback em caso de falha ───────────────────────────────────────────
  it('falls back to treinamento/medium/low when the AI response is not valid JSON', async () => {
    const ai = mockAi('isto não é JSON');
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('qualquer coisa');

    expect(result).toEqual({
      category: 'treinamento',
      priority: 'medium',
      requiresHuman: false,
      confidence: 'low',
      reasoning: 'fallback por falha na classificação',
    });
  });

  it('falls back to the default classification when ai.complete throws', async () => {
    const ai = { complete: vi.fn().mockRejectedValue(new Error('timeout')) } as any;
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('qualquer coisa');

    expect(result.category).toBe('treinamento');
    expect(result.confidence).toBe('low');
    expect(result.requiresHuman).toBe(false);
  });
});
