// monitor-plan-limits.const.spec.ts
import { describe, it, expect } from 'vitest';
import {
  monitorWaLimit,
  monitorWaIncluded,
  MONITOR_WA_INCLUDED,
  MONITOR_WA_OVERRIDE_LIMIT,
} from './monitor-plan-limits.const';

describe('monitorWaLimit — v2 matriz 2026-07-14', () => {
  // U1: Básico inclui 3 desde o repricing de agosto/2026 — o Básico de R$89 foi
  // extinto e o novo (R$599) herdou os limites do antigo Essencial. Era 1.
  it('U1: basico sem extras → 3', () => {
    expect(monitorWaLimit('basico', 0, false)).toBe(3);
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

// 2026-08-03 — ADR 011: o catálogo de planos é do TMS. O que ele sincroniza em
// PlanLimit.monitorNumbersIncluded manda; a tabela acima virou só fallback.
describe('monitorWaIncluded — valor do TMS tem prioridade sobre a tabela local', () => {
  it('usa o valor do TMS mesmo quando diverge da tabela', () => {
    // Tabela local diz 3 para basico; se o TMS passar a incluir 2, vale 2.
    expect(monitorWaIncluded('basico', 2)).toBe(2);
    // E o contrário também: um plano que a tabela dá 5 pode ser reduzido no TMS.
    expect(monitorWaIncluded('profissional', 1)).toBe(1);
  });

  it('0 do TMS é um valor legítimo, não "não informado"', () => {
    expect(monitorWaIncluded('profissional', 0)).toBe(0);
    expect(monitorWaLimit('profissional', 0, false, 0)).toBe(0);
  });

  it('negativo = ilimitado no TMS → cap técnico do Nexa', () => {
    expect(monitorWaIncluded('corporativo', -1)).toBe(MONITOR_WA_OVERRIDE_LIMIT);
  });

  it('null/undefined = tenant ainda não sincronizado → fallback da tabela', () => {
    expect(monitorWaIncluded('essencial', null)).toBe(3);
    expect(monitorWaIncluded('essencial', undefined)).toBe(3);
    expect(monitorWaLimit('essencial', 0, false, null)).toBe(3);
  });

  it('extras somam por cima do valor do TMS', () => {
    expect(monitorWaLimit('essencial', 2, false, 3)).toBe(5);
  });

  it('override continua ignorando tudo, inclusive o valor do TMS', () => {
    expect(monitorWaLimit('free', 0, true, 0)).toBe(MONITOR_WA_OVERRIDE_LIMIT);
  });
});
