/**
 * monitor-plan-limits.const.ts
 *
 * Defines the number of WhatsApp recipients included per plan for Monitor Proativo,
 * plus helper to compute the effective limit (included + purchased extras).
 *
 * Business rules (approved 2026-07-13):
 *   Básico / free / starter  → Monitor blocked (0 included)
 *   Essencial                → 1 included
 *   Profissional / pro       → 3 included
 *   Corporativo / enterprise → 5 included
 *   monitorOverride          → 10 (technical cap, platform-admin only)
 *
 * Extra numbers: R$ 29.90/number/month, contracted via TMS/Asaas.
 * The count is unique per tenant (same phone in multiple sectors = 1).
 * Email recipients have no per-plan limit (only the 10/sector technical cap).
 */

/** WhatsApp numbers included per plan (case-insensitive key). */
export const MONITOR_WA_INCLUDED: Readonly<Record<string, number>> = {
  free:         0,
  starter:      0,
  essencial:    1,
  pro:          3,
  profissional: 3,
  professional: 3,
  enterprise:   5,
  corporativo:  5,
  corporate:    5,
};

/** Maximum WhatsApp numbers when monitorOverride is active (platform-admin unlock). */
export const MONITOR_WA_OVERRIDE_LIMIT = 10;

/**
 * Returns the total number of WhatsApp recipients allowed for a tenant.
 *
 * @param plan - plan code from PlanLimit.plan (null/undefined → treated as 'free')
 * @param extras - PlanLimit.monitorExtraNumbers (purchased add-ons)
 * @param override - TenantNotificationConfig.monitorOverride
 */
export function monitorWaLimit(
  plan: string | null | undefined,
  extras: number,
  override: boolean,
): number {
  if (override) return MONITOR_WA_OVERRIDE_LIMIT;
  const key = (plan ?? 'free').toLowerCase();
  const included = MONITOR_WA_INCLUDED[key] ?? 0;
  return included + Math.max(0, extras);
}
