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
      category: 'usuarios',
      priority: 'low',
      diagnostic: diag(),
      resolution: resol({ resolved: true, confidence: 'high' }),
      requiresHumanFromClassifier: false,
    });
    expect(r.escalate).toBe(false);
  });

  // ─── High priority unresolved ─────────────────────────────────────────
  it('high priority + low confidence resolution → escalate', () => {
    const r = svc.decide({
      category: 'integracoes',
      priority: 'high',
      diagnostic: diag(),
      resolution: resol({ resolved: false, confidence: 'low' }),
      requiresHumanFromClassifier: false,
    });
    expect(r.escalate).toBe(true);
    expect(r.reason).toBe('high_priority_unresolved');
  });
});
