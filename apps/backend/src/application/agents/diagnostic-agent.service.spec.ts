import { DiagnosticAgentService, DiagnosticResult } from './diagnostic-agent.service';

const ACCESS_KEY_44 = '12345678901234567890123456789012345678901234';

function mockAi(response: string) {
  return { complete: vi.fn().mockResolvedValue(response) } as any;
}

function mockConnector(overrides: Partial<Record<'getContractStatus' | 'getDocumentStatus' | 'getRejectionInfo' | 'isDegraded', any>> = {}) {
  return {
    getContractStatus: vi.fn().mockResolvedValue(null),
    getDocumentStatus: vi.fn().mockResolvedValue(null),
    getRejectionInfo: vi.fn().mockResolvedValue(null),
    isDegraded: vi.fn().mockReturnValue(false),
    ...overrides,
  } as any;
}

function aiJson(result: Partial<Omit<DiagnosticResult, 'diagnosticData'>>): string {
  return JSON.stringify({
    rootCause: 'causa qualquer',
    playbook: null,
    suggestedAction: 'ação qualquer',
    needsMoreInfo: false,
    questionsToAsk: [],
    confidence: 'high',
    ...result,
  });
}

const customer = { externalId: 'ext-1', name: 'Fulano', plan: 'pro' };

describe('DiagnosticAgentService', () => {
  // ─── Caminho feliz ───────────────────────────────────────────────────────
  it('returns the parsed diagnostic with the data collected from the connector', async () => {
    const ai = mockAi(aiJson({ rootCause: 'Certificado expirado' }));
    const connector = mockConnector({
      getContractStatus: vi.fn().mockResolvedValue({ externalId: 'ext-1', plan: 'pro', status: 'active' }),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'O sistema travou na tela de cadastro',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.rootCause).toBe('Certificado expirado');
    expect(result.diagnosticData.contract).toEqual({ externalId: 'ext-1', plan: 'pro', status: 'active' });
    expect(connector.getContractStatus).toHaveBeenCalledWith('ext-1');
  });

  it('does not look up contract status when there is no identified customer', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Não consigo acessar o sistema',
      category: 'usuarios',
      history: '',
      tmsCustomer: null,
    });

    expect(connector.getContractStatus).not.toHaveBeenCalled();
    expect(result.diagnosticData.contract).toBeUndefined();
  });

  // ─── Extração de chave de acesso / número de documento (CT-e/MDF-e/fiscal) ─
  it('extracts a 44-digit access key and queries getDocumentStatus with docType=cte for category cte', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({
      getDocumentStatus: vi.fn().mockResolvedValue({ documentId: ACCESS_KEY_44, status: 'rejected' }),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: `Minha CT-e com chave ${ACCESS_KEY_44} foi rejeitada`,
      category: 'cte',
      history: '',
      tmsCustomer: customer,
    });

    expect(connector.getDocumentStatus).toHaveBeenCalledWith('ext-1', 'cte', ACCESS_KEY_44);
    expect(result.diagnosticData.documentStatus).toEqual({ documentId: ACCESS_KEY_44, status: 'rejected' });
  });

  it('uses docType=mdfe for category mdfe', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: `Meu MDF-e ${ACCESS_KEY_44} não encerra`,
      category: 'mdfe',
      history: '',
      tmsCustomer: customer,
    });

    expect(connector.getDocumentStatus).toHaveBeenCalledWith('ext-1', 'mdfe', ACCESS_KEY_44);
  });

  it('falls back to a 7-15 digit document number when there is no 44-digit access key', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: 'O documento número 1234567 não emite',
      category: 'cte',
      history: '',
      tmsCustomer: customer,
    });

    expect(connector.getDocumentStatus).toHaveBeenCalledWith('ext-1', 'cte', '1234567');
  });

  it('does not query the document status for categories outside cte/mdfe/fiscal', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: `Chave ${ACCESS_KEY_44} não acessa o sistema`,
      category: 'usuarios',
      history: '',
      tmsCustomer: customer,
    });

    expect(connector.getDocumentStatus).not.toHaveBeenCalled();
  });

  it('does not query document status when there is no identified customer, even with a key in the message', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: `Chave ${ACCESS_KEY_44} rejeitada`,
      category: 'cte',
      history: '',
      tmsCustomer: null,
    });

    expect(connector.getDocumentStatus).not.toHaveBeenCalled();
  });

  // ─── Código de rejeição SEFAZ ────────────────────────────────────────────
  it('extracts a 3-4 digit SEFAZ rejection code and looks it up, independent of customer identification', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({
      getRejectionInfo: vi.fn().mockResolvedValue({
        code: '562',
        message: 'Rejeição: CT-e já cancelado',
        category: 'operacional',
        suggestedAction: 'Emitir novo CT-e',
      }),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Recebi o código de rejeição 562 ao emitir',
      category: 'fiscal',
      history: '',
      tmsCustomer: null,
    });

    expect(connector.getRejectionInfo).toHaveBeenCalledWith('562');
    expect(result.diagnosticData.rejectionInfo?.message).toBe('Rejeição: CT-e já cancelado');
  });

  // ─── Regra de privacidade / perguntas pendentes ──────────────────────────
  it('propagates needsMoreInfo and questionsToAsk from the AI response', async () => {
    const ai = mockAi(aiJson({ needsMoreInfo: true, questionsToAsk: ['Em qual tela aparece o erro?'] }));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Deu erro',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: null,
    });

    expect(result.needsMoreInfo).toBe(true);
    expect(result.questionsToAsk).toEqual(['Em qual tela aparece o erro?']);
  });

  // ─── Resiliência ──────────────────────────────────────────────────────────
  it('continues to the AI call even if a connector lookup throws while collecting diagnostic data', async () => {
    const ai = mockAi(aiJson({ rootCause: 'Diagnosticado mesmo com falha no connector' }));
    const connector = mockConnector({
      getContractStatus: vi.fn().mockRejectedValue(new Error('TMS indisponível')),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Problema qualquer',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.rootCause).toBe('Diagnosticado mesmo com falha no connector');
    expect(result.diagnosticData.contract).toBeUndefined();
  });

  it('falls back to a low-confidence, needsMoreInfo result when the AI call fails, while preserving collected diagnosticData', async () => {
    const ai = { complete: vi.fn().mockRejectedValue(new Error('AI indisponível')) } as any;
    const connector = mockConnector({
      getContractStatus: vi.fn().mockResolvedValue({ externalId: 'ext-1', plan: 'pro', status: 'active' }),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Problema qualquer',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result).toEqual({
      rootCause: null,
      playbook: null,
      diagnosticData: { contract: { externalId: 'ext-1', plan: 'pro', status: 'active' } },
      suggestedAction: null,
      needsMoreInfo: true,
      questionsToAsk: ['Pode me dar mais detalhes sobre o problema?'],
      confidence: 'low',
      tmsUnstable: false,
    });
  });

  it('falls back gracefully when the AI replies with invalid JSON', async () => {
    const ai = mockAi('não é json');
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Problema qualquer',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: null,
    });

    expect(result.confidence).toBe('low');
    expect(result.needsMoreInfo).toBe(true);
  });

  // ─── Gemini review (2026-08-05): TMS instável não pode virar "dado não existe" ──
  it('marks diagnosticData.tmsIndisponivel when the contract lookup comes back empty because the breaker is open', async () => {
    const ai = mockAi(aiJson({ rootCause: 'Instabilidade temporária no TMS' }));
    const connector = mockConnector({ isDegraded: vi.fn().mockReturnValue(true) });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Meu contrato sumiu',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.diagnosticData.tmsIndisponivel).toBe(true);
    expect(result.diagnosticData.contract).toBeUndefined();
  });

  // O flag precisa ser campo de primeira classe: o ResolutionAgent lê só o
  // resultado, nunca o diagnosticData — enquanto vivia lá dentro, o cliente
  // recebia escalação comum em vez do aviso de instabilidade.
  it('expõe tmsUnstable no RESULTADO, não só dentro de diagnosticData', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({ isDegraded: vi.fn().mockReturnValue(true) });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Meu contrato sumiu',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.tmsUnstable).toBe(true);
  });

  // No caminho do widget/portal o token do TMS não carrega o plano, então a Lia
  // atendia todo cliente do chat como "plano: desconhecido".
  it('usa o plano do contrato quando o cliente veio sem plano (widget/portal)', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({
      getContractStatus: vi.fn().mockResolvedValue({ externalId: 'ext-1', plan: 'profissional', status: 'active' }),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: 'CT-e não emite',
      category: 'cte',
      history: '',
      tmsCustomer: { externalId: 'ext-1', name: 'Empresa ABC' }, // sem plan
    });

    expect(ai.complete.mock.calls[0][1] as string).toContain('plano: profissional');
  });

  it('o plano que veio no contexto vence o do contrato', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({
      getContractStatus: vi.fn().mockResolvedValue({ externalId: 'ext-1', plan: 'basico', status: 'active' }),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: 'CT-e não emite', category: 'cte', history: '',
      tmsCustomer: { externalId: 'ext-1', name: 'Empresa ABC', plan: 'corporativo' },
    });

    expect(ai.complete.mock.calls[0][1] as string).toContain('plano: corporativo');
  });

  it('sem contrato e sem plano no contexto: continua desconhecido', async () => {
    const ai = mockAi(aiJson({}));
    const svc = new DiagnosticAgentService(ai, mockConnector());

    await svc.diagnose({
      message: 'problema', category: 'erro_sistema', history: '',
      tmsCustomer: { externalId: 'ext-1', name: 'Empresa ABC' },
    });

    expect(ai.complete.mock.calls[0][1] as string).toContain('plano: desconhecido');
  });

  it('tmsUnstable é false quando o TMS respondeu normalmente', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({
      getContractStatus: vi.fn().mockResolvedValue({ externalId: 'ext-1', plan: 'pro', status: 'active' }),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Problema qualquer',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.tmsUnstable).toBe(false);
  });

  it('does NOT mark tmsIndisponivel when the contract simply does not exist and the breaker is closed', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({ isDegraded: vi.fn().mockReturnValue(false) });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Problema qualquer',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.diagnosticData.tmsIndisponivel).toBeUndefined();
  });

  it('does NOT mark tmsIndisponivel when the lookup succeeds, even if the breaker later reports open', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({
      getContractStatus: vi.fn().mockResolvedValue({ externalId: 'ext-1', plan: 'pro', status: 'active' }),
      isDegraded: vi.fn().mockReturnValue(true),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: 'Problema qualquer',
      category: 'erro_sistema',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.diagnosticData.contract).toBeDefined();
    expect(result.diagnosticData.tmsIndisponivel).toBeUndefined();
  });

  it('marks tmsIndisponivel from a failed document lookup during breaker-open, independent of the contract lookup', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector({
      getDocumentStatus: vi.fn().mockResolvedValue(null),
      isDegraded: vi.fn().mockReturnValue(true),
    });
    const svc = new DiagnosticAgentService(ai, connector);

    const result = await svc.diagnose({
      message: `Minha CT-e com chave ${ACCESS_KEY_44} foi rejeitada`,
      category: 'cte',
      history: '',
      tmsCustomer: customer,
    });

    expect(result.diagnosticData.tmsIndisponivel).toBe(true);
  });

  // ─── F10: page (tela do TMS de origem do chat, do token de handoff) ────────
  it('inclui a tela do TMS no prompt quando tmsCustomer.page está presente', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: 'não emite CT-e',
      category: 'cte',
      history: '',
      tmsCustomer: { ...customer, page: '/fiscal/cte' },
    });

    const userMsg = ai.complete.mock.calls[0][1];
    expect(userMsg).toContain('/fiscal/cte');
  });

  it('não menciona tela quando tmsCustomer.page está ausente', async () => {
    const ai = mockAi(aiJson({}));
    const connector = mockConnector();
    const svc = new DiagnosticAgentService(ai, connector);

    await svc.diagnose({
      message: 'não emite CT-e',
      category: 'cte',
      history: '',
      tmsCustomer: customer,
    });

    const userMsg = ai.complete.mock.calls[0][1];
    expect(userMsg).not.toContain('na tela:');
  });
});
