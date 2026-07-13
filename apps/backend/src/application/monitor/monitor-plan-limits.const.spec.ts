// monitor-plan-limits.const.spec.ts
import { describe, it, expect } from 'vitest';
import { monitorWaLimit, MONITOR_WA_INCLUDED, MONITOR_WA_OVERRIDE_LIMIT } from './monitor-plan-limits.const';

describe('monitorWaLimit', () => {
  // U1: Essencial inclui 1
  it('U1: essencial sem extras → 1', () => {
    expect(monitorWaLimit('essencial', 0, false)).toBe(1);
  });

  // U2: Profissional + 2 extras → 5
  it('U2: profissional + 2 extras → 5', () => {
    expect(monitorWaLimit('profissional', 2, false)).toBe(5);
  });

  // U3: override ignora plano e extras → cap técnico 10
  it('U3: override=true ignora plano e extras → OVERRIDE_LIMIT', () => {
    expect(monitorWaLimit('corporativo', 0, true)).toBe(MONITOR_WA_OVERRIDE_LIMIT);
    expect(monitorWaLimit('free', 99, true)).toBe(MONITOR_WA_OVERRIDE_LIMIT);
  });

  // U4: sem PlanLimit (null) → 0
  it('U4: plan=null → 0 (default free = bloqueado)', () => {
    expect(monitorWaLimit(null, 0, false)).toBe(0);
    expect(monitorWaLimit(undefined, 0, false)).toBe(0);
  });

  // free / starter = 0
  it('free e starter → 0', () => {
    expect(monitorWaLimit('free', 0, false)).toBe(0);
    expect(monitorWaLimit('starter', 0, false)).toBe(0);
  });

  // pro aliases
  it('pro e professional aliases → 3', () => {
    expect(monitorWaLimit('pro', 0, false)).toBe(3);
    expect(monitorWaLimit('professional', 0, false)).toBe(3);
  });

  // enterprise aliases
  it('enterprise, corporativo, corporate → 5', () => {
    expect(monitorWaLimit('enterprise', 0, false)).toBe(5);
    expect(monitorWaLimit('corporativo', 0, false)).toBe(5);
    expect(monitorWaLimit('corporate', 0, false)).toBe(5);
  });

  // extras negativo → treated as 0
  it('extras negativo → tratado como 0', () => {
    expect(monitorWaLimit('essencial', -5, false)).toBe(1);
  });

  // case insensitive
  it('case insensitive: PROFISSIONAL → 3', () => {
    expect(monitorWaLimit('PROFISSIONAL', 0, false)).toBe(3);
  });

  // unknown plan → 0
  it('plano desconhecido → 0', () => {
    expect(monitorWaLimit('plano-inexistente', 0, false)).toBe(0);
  });
});

describe('MONITOR_WA_INCLUDED', () => {
  it('todos os planos obrigatórios estão mapeados', () => {
    const required = ['free', 'starter', 'essencial', 'pro', 'profissional', 'enterprise', 'corporativo'];
    for (const plan of required) {
      expect(MONITOR_WA_INCLUDED).toHaveProperty(plan);
    }
  });
});
