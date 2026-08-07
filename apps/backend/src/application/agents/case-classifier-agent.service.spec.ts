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

  // ─── §1 (auditoria 2026-08-05) — normalização antes da trava D6 ─────────
  // Sem normalizar, a IA respondendo "Fiscal" (maiúscula) ou "Low" fazia a
  // comparação === falhar em silêncio e pular a trava de segurança inteira.
  it('D6: still forces requiresHuman when the AI returns category with different casing', async () => {
    const ai = mockAi(json({ category: 'Fiscal', confidence: 'low', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Rejeição SEFAZ 562');

    expect(result.requiresHuman).toBe(true);
    expect(result.category).toBe('fiscal'); // normalizado
  });

  it('D6: still forces requiresHuman when the AI returns confidence with different casing', async () => {
    const ai = mockAi(json({ category: 'financeiro', confidence: 'Low', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Minha fatura está errada');

    expect(result.requiresHuman).toBe(true);
    expect(result.confidence).toBe('low'); // normalizado
  });

  it('D6: forces requiresHuman + logs a warning when the AI returns an unrecognized category with low confidence (fail-safe, cannot rule out fiscal/financeiro)', async () => {
    const ai = mockAi(json({ category: 'compliance', confidence: 'low', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);
    const warnSpy = vi.spyOn((svc as any).logger, 'warn');

    const result = await svc.classify('Preciso de um relatório de conformidade');

    expect(result.requiresHuman).toBe(true);
    expect(result.category).toBe('compliance'); // não inventa categoria, só sinaliza
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('categoria não reconhecida'));
  });

  it('D6: does NOT force requiresHuman for an unrecognized category with high confidence', async () => {
    const ai = mockAi(json({ category: 'compliance', confidence: 'high', requiresHuman: false }));
    const svc = new CaseClassifierAgentService(ai);

    const result = await svc.classify('Preciso de um relatório de conformidade');

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

// ─── Setor do widget + critério de requiresHuman ─────────────────────────────
// Contexto (incidente do CT-e 519, 2026-08-07): "Meu CT-e foi rejeitado, código
// 519. O que eu faço?" foi classificado como treinamento/baixa e o modelo marcou
// requiresHuman=true por conta própria — o campo estava no template do JSON sem
// nenhum critério que dissesse quando usá-lo. Enquanto isso, o widget do TMS
// obrigava o cliente a escolher um setor e o Nexa descartava o dado.
describe('CaseClassifierAgentService — setor do widget', () => {
  it('leva o setor escolhido ao prompt como INDÍCIO, não como verdade', async () => {
    const ai = mockAi(json({ category: 'fiscal' }));
    const svc = new CaseClassifierAgentService(ai);

    await svc.classify('não consigo emitir', '', 'Fiscal');

    const system = ai.complete.mock.calls[0][0] as string;
    expect(system).toContain('INDÍCIO');
    expect(system).toContain('"Fiscal"');
    expect(system).toContain('fiscal');
    // Precisa dizer explicitamente que a mensagem vence — senão o setor
    // sequestra a classificação de quem clicou em qualquer coisa para poder enviar.
    expect(system).toMatch(/a mensagem vence/i);
  });

  it('mapeia Logística → frete e Sistema → erro_sistema', async () => {
    for (const [setor, esperado] of [['Logística', 'frete'], ['Sistema', 'erro_sistema']] as const) {
      const ai = mockAi(json({}));
      await new CaseClassifierAgentService(ai).classify('oi', '', setor);
      expect(ai.complete.mock.calls[0][0]).toContain(`"${esperado}"`);
    }
  });

  it('"Outro" não vira dica nenhuma (não carrega informação)', async () => {
    const ai = mockAi(json({}));
    await new CaseClassifierAgentService(ai).classify('oi', '', 'Outro');

    expect(ai.complete.mock.calls[0][0]).not.toContain('INDÍCIO');
  });

  it('sem setor o prompt segue igual ao de antes', async () => {
    const ai = mockAi(json({}));
    await new CaseClassifierAgentService(ai).classify('oi');

    expect(ai.complete.mock.calls[0][0]).not.toContain('INDÍCIO');
  });

  it('o prompt define QUANDO marcar requiresHuman e manda errar para false', async () => {
    const ai = mockAi(json({}));
    await new CaseClassifierAgentService(ai).classify('oi');

    const system = ai.complete.mock.calls[0][0] as string;
    expect(system).toContain('requiresHuman — quando marcar true');
    expect(system).toMatch(/Na dúvida, false/);
  });

  it('rejeição de CT-e não pode cair em treinamento por causa do "o que eu faço?"', async () => {
    const ai = mockAi(json({}));
    await new CaseClassifierAgentService(ai).classify('Meu CT-e foi rejeitado, código 519. O que eu faço?');

    const system = ai.complete.mock.calls[0][0] as string;
    expect(system).toMatch(/Rejeição de CT-e.*→ cte/s);
    expect(system).toMatch(/o que eu faço/i);
  });
});
