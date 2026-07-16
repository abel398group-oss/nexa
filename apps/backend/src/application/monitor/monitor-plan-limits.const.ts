/**
 * monitor-plan-limits.const.ts
 *
 * Defines the number of WhatsApp recipients included per plan for Monitor Proativo,
 * plus helpers to compute the effective limit (included + purchased extras) and to
 * enforce it. Shared between MonitorController (Nexa's own panel, /monitor/config)
 * and MonitorService (TMS proxy, /monitor/external-config) so both entry points
 * apply identical plan/number gates — see docs/monitor/ajuste-limites-planos-v2-2026-07-14.md.
 *
 * Business rules (revised 2026-07-14 — supersedes 2026-07-13):
 *   free / starter           → Monitor blocked (0 included)
 *   Básico                   → 1 included  (Monitor now available on Básico)
 *   Essencial                → 3 included
 *   Profissional / pro       → 5 included
 *   Corporativo / enterprise → 5 included + extras via monitorExtraNumbers (sob consulta)
 *   monitorOverride          → 10 (technical cap, platform-admin only)
 *
 * Extra numbers: R$ 29.90/number/month, contracted via TMS/Asaas.
 * The count is unique per tenant (same phone in multiple sectors = 1).
 * Email recipients have no per-plan limit (only the 10/sector technical cap).
 */
import { normalizePhone } from '@/shared/utils/phone.util';
import { MAX_SEND_TIMES_PER_CONTACT } from './contact-recipient.types';

/** WhatsApp numbers included per plan (case-insensitive key). */
export const MONITOR_WA_INCLUDED: Readonly<Record<string, number>> = {
  free:         0,
  starter:      0,
  basico:       1,
  essencial:    3,
  pro:          5,
  profissional: 5,
  professional: 5,
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

/**
 * T7.2 (2026-07-16): máximo de horários próprios por contato, por plano.
 *
 * Hoje TODOS os planos usam o mesmo teto (`MAX_SEND_TIMES_PER_CONTACT`, = 3) —
 * a variação por plano ainda não existe. Existe como função (em vez de só usar
 * a constante direto) porque o plano Corporativo vai ganhar um modo "turbinado"
 * com horários ilimitados no futuro (decisão de negócio aprovada pelo Abel em
 * 2026-07-16 — NÃO implementar agora, só deixar o gancho). Quando isso
 * acontecer, só este `switch` muda — nenhum outro ponto do código (DTO,
 * sanitizeContacts, scheduler) precisa saber de plano.
 *
 * TODO(turbinado-corporativo): plano 'enterprise'/'corporativo'/'corporate' com
 * add-on "turbinado" → retornar Infinity (ou um teto alto configurável). Ver
 * decisão de negócio de 2026-07-16.
 */
export function maxContactTimes(_plan: string | null | undefined): number {
  return MAX_SEND_TIMES_PER_CONTACT;
}

/** Plans that have Monitor Proativo included (free/starter = blocked). */
export const MONITOR_PLANS = new Set([
  'basico',
  'essencial',
  'pro', 'professional',
  'enterprise', 'corporativo', 'corporate',
  'profissional',
]);

/** Whether a plan (case-insensitive) has Monitor Proativo included. */
export function isPlanAllowed(plan: string | null | undefined): boolean {
  return MONITOR_PLANS.has((plan ?? 'free').toLowerCase());
}

/**
 * Extracts all unique normalised WhatsApp numbers from a sectorConfig object
 * plus an optional root-level notificationPhone (legacy field), plus an
 * optional T6 `contacts[]` array (per-contact model — see contact-recipient.types.ts).
 * The same number appearing in multiple sectors/contacts counts once — the
 * plan limit is per unique WhatsApp number, regardless of which format added it.
 */
export function extractUniqueWaNumbers(
  sectorConfig: Record<string, any> | null | undefined,
  rootPhone?: string | null,
  contacts?: Array<{ whatsapp?: string }> | null,
): Set<string> {
  const unique = new Set<string>();

  if (Array.isArray(contacts)) {
    for (const c of contacts) {
      if (c?.whatsapp) {
        const norm = normalizePhone(c.whatsapp);
        if (norm) unique.add(norm);
      }
    }
  }

  if (sectorConfig && typeof sectorConfig === 'object') {
    for (const sc of Object.values(sectorConfig)) {
      if (!sc) continue;
      // Modern recipients[]
      if (Array.isArray(sc.recipients)) {
        for (const r of sc.recipients) {
          if (r?.channel === 'whatsapp' && typeof r.contact === 'string') {
            const norm = normalizePhone(r.contact);
            if (norm) unique.add(norm);
          }
        }
      }
      // Legacy per-sector `phone` field
      if (typeof sc.phone === 'string') {
        const norm = normalizePhone(sc.phone);
        if (norm) unique.add(norm);
      }
    }
  }

  // Legacy root-level notificationPhone
  if (rootPhone) {
    const norm = normalizePhone(rootPhone.split(',')[0]);
    if (norm) unique.add(norm);
  }

  return unique;
}
