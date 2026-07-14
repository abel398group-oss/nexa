// monitor-plan-limits.const.spec.ts
import { describe, it, expect } from 'vitest';
import { monitorWaLimit, MONITOR_WA_INCLUDED, MONITOR_WA_OVERRIDE_LIMIT } from './monitor-plan-limits.const';

describe('monitorWaLimit — v2 matriz 2026-07-14', () => {
  // U1: Básico inclui 1 (Monitor disponível no Básico)
  it('U1: basico sem extras → 1', () => {
    expect(monitorWaLimit('basico', 0, false)).toBe(1);
  });

  // U1b: Essencial inclui 3
  it('U1b: essencial sem extras → 3', () => {
    expect(monitorWaLimit('essencial', 0, false)).toBe(3);
  });

  // U2: Profissional + 2 extras → 7
  it('U2: profissional + 2 extras → 7', () => {
    expect(monitorWaLimit('profissional', 2, false)).toBe(7);
  });

  // Corporativo + 2 extras → 7
  it('corporativo + 2 extras → 7', () => {
    expect(monitorWaLimit('corporativo', 2, false)).toBe(7);
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

  // free / starter = 0 (sem assinatura ativa)
  it('free e starter → 0', () => {
    expect(monitorWaLimit('free', 0, false)).toBe(0);
    expect(monitorWaLimit('starter', 0, false)).toBe(0);
  });

  // pro aliases → 5
  it('pro e professional aliases → 5', () => {
    expect(monitorWaLimit('pro', 0, false)).toBe(5);
    expect(monitorWaLimit('professional', 0, false)).toBe(5);
  });

  // enterprise aliases → 5
  it('enterprise, corporativo, corporate → 5', () => {
    expect(monitorWaLimit('enterprise', 0, false)).toBe(5);
    expect(monitorWaLimit('corporativo', 0, false)).toBe(5);
    expect(monitorWaLimit('corporate', 0, false)).toBe(5);
  });

  // extras negativo → treated as 0
  it('extras negativo → tratado como 0', () => {
    expect(monitorWaLimit('essencial', -5, false)).toBe(3);
  });

  // case insensitive
  it('case insensitive: PROFISSIONAL → 5', () => {
    expect(monitorWaLimit('PROFISSIONAL', 0, false)).toBe(5);
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
