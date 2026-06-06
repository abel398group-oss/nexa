// Action Policy (ADR 012): quais ações exigem backend e quais exigem humano.
// IA solicita; backend valida aqui antes de executar.

export interface ActionRule {
  requiresBackend: boolean;
  requiresHuman: boolean;
}

export const ACTION_POLICY: Record<string, ActionRule> = {
  create_payment: { requiresBackend: true, requiresHuman: false },
  consult_plan: { requiresBackend: true, requiresHuman: false },
  update_context: { requiresBackend: true, requiresHuman: false },
  escalate: { requiresBackend: true, requiresHuman: false },
  // irreversíveis → exigem humano (nunca a IA executa sozinha)
  cancel_payment: { requiresBackend: true, requiresHuman: true },
  refund: { requiresBackend: true, requiresHuman: true },
  cancel_subscription: { requiresBackend: true, requiresHuman: true },
  delete_customer: { requiresBackend: true, requiresHuman: true },
  alter_contract: { requiresBackend: true, requiresHuman: true },
};

export function getActionRule(actionType: string): ActionRule | null {
  return ACTION_POLICY[actionType] ?? null;
}
