import { EscalationAgentService } from './escalation-agent.service';
import { DiagnosticResult } from './diagnostic-agent.service';
import { ResolutionResult } from './resolution-agent.service';

const diag = (overrides: Partial<DiagnosticResult> = {}): DiagnosticResult => ({
  rootCause: null,
  playbook: null,
  diagnosticData: {},
  suggestedAction: null,
  needsMoreInfo: false,
  questionsToAsk: [],
  confidence: 'high',
  ...overrides,
});

const resol = (overrides: Partial<ResolutionResult> = {}): ResolutionResult => ({
  draft: 'Resposta',
  resolved: true,
  action: null,
  usedKnowledge: [],
  confidence: 'high',
  ...overrides,
});

describe('EscalationAgentService', () => {
  let svc: EscalationAgentService;

  beforeEach(() => { svc = new EscalationAgentService(); });

  // ─── ADR 015 D6 — Regra de segurança fiscal/financeiro ────────────────
  it('D6: fiscal + low confidence → escalate', () => {
    const r = svc.decide({
      message: 'Minha CT-e não emite',
      category: 'fiscal',
      priority: 'medium',
      diagnostic: diag({ confidence: 'low' }),
      resolution: resol({ confidence: 'high' }),
      requiresHumanFromClassifier: false,
    });
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe('fiscal_financeiro_low_confidence');
  });

  it('D6: financeiro + requiresHuman=true → escalate', () => {
    const r = svc.decide({
      message: 'Preciso de nota de débito',
      category: 'financeiro',
      priority: 'high',
      diagnostic: diag(),
      resolution: resol(),
      requiresHumanFromClassifier: true,
    });
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe('fiscal_financeiro_low_confidence');
  });

  it('D6: fiscal + high confidence + requiresHuman=false → may NOT escalate on fiscal alone', () => {
    const r = svc.decide({
      message: 'Minha CT-e não emite',
      category: 'fiscal',
      priority: 'medium',
      diagnostic: diag({ confidence: 'high' }),
      resolution: resol({ confidence: 'high', resolved: true }),
      requiresHumanFromClassifier: false,
    });
    // fiscal com alta confiança resolvida não deve escalar
    expect(r.escalate).toBe(false);
  });

  // ─── Prioridade crítica ────────────────────────────────────────────────
  it('critical priority → escalate immediately', () => {
    const r = svc.decide({
      message: 'Sistema parado, não consigo emitir nada',
      category: 'cte',
      priority: 'critical',
      diagnostic: diag(),
      resolution: resol({ confidence: 'high', resolved: true }),
      requiresHumanFromClassifier: false,
    });
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe('priority_critical');
  });

  // ─── Resolução normal ─────────────────────────────────────────────────
  it('resolved with high confidence → no escalation', () => {
    const r = svc.decide({
      message: 'Como cadastro um usuário novo?',
      category: 'usuarios',
      priority: 'low',
      diagnostic: diag(),
      resolution: resol({ resolved: true, confidence: 'high' }),
      requiresHumanFromClassifier: false,
    });
    expect(r.escalate).toBe(false);
  });

  // ─── High priority unresolved ─────────────────────────────────────────
  // resolved=false → service retorna 'unresolved_no_kb_match' antes de checar prioridade.
  // Para 'high_priority_low_confidence' o resolved precisa ser true mas confidence=low.
  it('high priority + unresolved → escalate with unresolved_no_kb_match', () => {
    const r = svc.decide({
      message: 'Integração com o ERP parou de funcionar',
      category: 'integracoes',
      priority: 'high',
      diagnostic: diag(),
      resolution: resol({ resolved: false, confidence: 'low' }),
      requiresHumanFromClassifier: false,
    });
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe('unresolved_no_kb_match');
  });

  it('high priority + resolved but low confidence → escalate with high_priority_low_confidence', () => {
    const r = svc.decide({
      message: 'Integração com o ERP parou de funcionar',
      category: 'integracoes',
      priority: 'high',
      diagnostic: diag(),
      resolution: resol({ resolved: true, confidence: 'low' }),
      requiresHumanFromClassifier: false,
    });
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe('high_priority_low_confidence');
  });

  // ─── F10: resumo executivo de 3 linhas ────────────────────────────────
  describe('summary (resumo executivo)', () => {
    it('escalação gera summary com as 3 seções, na ordem', () => {
      const r = svc.decide({
        message: 'Sistema parado, não consigo emitir nada',
        category: 'cte',
        priority: 'critical',
        diagnostic: diag({ rootCause: 'Certificado digital vencido', suggestedAction: 'Renovar certificado no painel' }),
        resolution: resol({ resolved: true, confidence: 'high' }),
        requiresHumanFromClassifier: false,
      });

      expect(r.summary).not.toBeNull();
      const lines = r.summary!.split('\n');
      expect(lines[0]).toContain('[Problema Relatado]');
      expect(lines[0]).toContain('Sistema parado');
      expect(lines[1]).toContain('[Ações Tentadas]');
      expect(lines[1]).toContain('Certificado digital vencido');
      expect(lines[1]).toContain('Renovar certificado no painel');
      expect(lines[2]).toContain('[Causa do Transbordo]');
      expect(lines[2]).toContain('Prioridade crítica');
    });

    it('sem diagnóstico/resolução prévios: ações tentadas indica que nada foi tentado', () => {
      const r = svc.decide({
        message: 'Preciso falar com alguém',
        category: 'usuarios',
        priority: 'high',
        diagnostic: diag(),
        resolution: resol({ resolved: false, confidence: 'low', draft: '' }),
        requiresHumanFromClassifier: false,
      });

      expect(r.summary).toContain('Nenhuma — encaminhado antes de tentar resolver');
    });

    it('não escala → summary é null (não faz sentido resumir caso resolvido pela IA)', () => {
      const r = svc.decide({
        message: 'Como cadastro um usuário novo?',
        category: 'usuarios',
        priority: 'low',
        diagnostic: diag(),
        resolution: resol({ resolved: true, confidence: 'high' }),
        requiresHumanFromClassifier: false,
      });

      expect(r.summary).toBeNull();
    });

    it('mensagem muito longa é truncada em 200 chars no resumo', () => {
      const longMsg = 'a'.repeat(300);
      const r = svc.decide({
        message: longMsg,
        category: 'cte',
        priority: 'critical',
        diagnostic: diag(),
        resolution: resol({ resolved: true, confidence: 'high' }),
        requiresHumanFromClassifier: false,
      });

      const problemLine = r.summary!.split('\n')[0];
      expect(problemLine.length).toBeLessThan(250);
      expect(problemLine).toContain('…');
    });
  });
});
