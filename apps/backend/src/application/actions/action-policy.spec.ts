import { describe, it, expect } from 'vitest';
import { ACTION_POLICY, getActionRule } from './action-policy';

// Ações irreversíveis que NUNCA podem ser executadas pela IA sozinha (ADR 012).
const HUMAN_REQUIRED = [
  'cancel_payment',
  'refund',
  'cancel_subscription',
  'delete_customer',
  'alter_contract',
];

// Ações que o backend executa sem humano.
const BACKEND_ONLY = ['create_payment', 'consult_plan', 'update_context', 'escalate'];

describe('getActionRule', () => {
  it('retorna null para ação desconhecida', () => {
    expect(getActionRule('foo_bar')).toBeNull();
  });

  it.each(HUMAN_REQUIRED)('ação irreversível "%s" exige humano', (action) => {
    const rule = getActionRule(action);
    expect(rule).not.toBeNull();
    expect(rule!.requiresHuman).toBe(true);
    expect(rule!.requiresBackend).toBe(true);
  });

  it.each(BACKEND_ONLY)('ação "%s" roda no backend sem humano', (action) => {
    const rule = getActionRule(action);
    expect(rule).not.toBeNull();
    expect(rule!.requiresHuman).toBe(false);
    expect(rule!.requiresBackend).toBe(true);
  });
});

describe('ACTION_POLICY (invariantes)', () => {
  it('toda ação mapeada exige passar pelo backend', () => {
    for (const rule of Object.values(ACTION_POLICY)) {
      expect(rule.requiresBackend).toBe(true);
    }
  });

  it('cobre exatamente as ações esperadas', () => {
    expect(Object.keys(ACTION_POLICY).sort()).toEqual(
      [...HUMAN_REQUIRED, ...BACKEND_ONLY].sort(),
    );
  });
});
