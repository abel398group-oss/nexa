/**
 * digest-tabular.ts — T10 tabular WhatsApp digest format (approved 2026-07-20,
 * spec: docs/monitor/t10-digest-tabular-format-2026-07.md).
 *
 * WhatsApp TEXT only — the unified e-mail keeps its HTML layout (channel
 * asymmetry). Pure functions, no Nest/Prisma imports: ConsolidationService
 * delegates here and the whole format is unit-testable in isolation.
 *
 * Layout (follow the spec example TO THE LETTER):
 *   - header in normal text: `*HiperTMS · {dow dd/mm} · {N} pendências*`
 *   - each section (cash + sector) is its own monospace block (```),
 *     30 chars wide, double rule (═) only ABOVE the title, single rule (─)
 *     before the block footer, closing fence glued to the last line
 *   - max 3 numbered items per sector, action verb on an indented `→` line,
 *     overflow as `+N no site`
 *   - no emojis anywhere; severity is expressed by ORDER (§2)
 *
 * Design rationale (spec §1): ISA-18.2 (alert = reason + action + priority),
 * NN/g F-pattern (keyword first), Cowan working-memory cap, progressive
 * disclosure (message = trigger, panel = detail).
 */
import type { TmsCashView } from '@/application/connectors/hipertms.connector';

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Block width in chars. Spec: 30 (fallback 28 if wrap is reported on small phones). */
export const BLOCK_WIDTH = 30;

/** OVERDUE older than this many days is promoted to the top of its band (§2). */
export const DIGEST_AGE_ESCALATION_DAYS = Number(process.env.DIGEST_AGE_ESCALATION_DAYS ?? 30);

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITY_BAND = ['CRITICAL', 'OVERDUE', 'DUE_SOON', 'INFO'];
const DOW_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal alert shape the format needs — AlertState rows satisfy it. */
export interface TabularAlertItem {
  severity: string;
  title: string;
  description?: string | null;
  tmsEventId?: string;
  createdAt?: Date | string;
  /**
   * Tie-break inputs pushed by the TMS (amount, hoursWaiting, daysLate,
   * daysLeft, ruleId…). NOT a column today — read defensively; missing →
   * degrade to createdAt (spec §2, "never crash").
   */
  metadata?: Record<string, unknown> | null;
  /** Set by rankSectorAlerts when age-escalated — rendered as `há Nd`. */
  escalatedAgeDays?: number;
}

export interface TabularSectorEntry {
  shown: TabularAlertItem[];
  total: number;
}

interface SectorMetaLite {
  key: string;
  label: string;
}

// ─── §3 Action verb map ──────────────────────────────────────────────────────

/**
 * Static ruleId → short action verb for the `   → verb` line. Unknown ruleId →
 * NO arrow line (never guess). `installment.overdue` is direction-dependent —
 * resolved in actionVerbFor() (metadata.kind/direction, then title heuristic).
 *
 * ⚠️ Best-effort list built from the TMS rule domains known on 2026-07-20 —
 * MUST be cross-checked against the TMS rule enum by the TMS squad (spec §5).
 */
export const RULE_ACTION_VERBS: Record<string, string> = {
  // fiscal
  'cte.rejected': 'reenviar',
  'cte.pending_return': 'verificar',
  'mdfe.rejected': 'reenviar',
  'mdfe.pending_return': 'verificar',
  'mdfe.unclosed': 'encerrar',
  'certificate.expiring': 'renovar',
  'certificate.expired': 'renovar',
  // logistic
  'shipment.pending_pickup': 'agendar coleta',
  'shipment.pending_delivery': 'ver entrega',
  'shipment.delayed': 'ver embarque',
  'shipment.stalled': 'ver embarque',
  'shipment.unlinked': 'vincular',
  'quote.expiring': 'responder',
  'quote.expired': 'responder',
  'trip.overdue': 'ver rotas',
  // frota
  'fleet.cnh_expiring': 'renovar',
  'fleet.cnh_expired': 'renovar',
  'fleet.crlv_expiring': 'renovar',
  'fleet.crlv_expired': 'renovar',
  'fleet.maintenance_due': 'agendar',
  'fleet.in_maintenance': 'acompanhar',
  // finance
  'installment.due_soon': 'programar',
  'contract.billing_due': 'faturar',
  // procurement (compras)
  'purchase.pending_approval': 'aprovar',
  'purchase.overdue': 'ver pedido',
};

/** Extracts the ruleId: metadata.ruleId → `<ruleId>:<entity>` prefix → bare `domain.rule` id. */
export function ruleIdOf(item: Pick<TabularAlertItem, 'tmsEventId' | 'metadata'>): string | undefined {
  const metaRule = (item.metadata as any)?.ruleId;
  if (typeof metaRule === 'string' && metaRule) return metaRule;
  const id = item.tmsEventId ?? '';
  if (id.includes(':')) return id.split(':')[0];
  const m = id.match(/^[a-z_]+\.[a-z_]+/);
  return m ? m[0] : undefined;
}

/** Verb for the `→` line, or undefined (line omitted). */
export function actionVerbFor(item: Pick<TabularAlertItem, 'tmsEventId' | 'metadata' | 'title'>): string | undefined {
  const ruleId = ruleIdOf(item);
  if (!ruleId) return undefined;

  // Direction-dependent rule (spec §3): PAYABLE → pagar, RECEIVABLE → cobrar.
  if (ruleId === 'installment.overdue') {
    const kind = String((item.metadata as any)?.kind ?? (item.metadata as any)?.direction ?? '').toLowerCase();
    if (kind.includes('pay')) return 'pagar';
    if (kind.includes('receiv')) return 'cobrar';
    // Degrade: today's TMS titles say "Conta a pagar/receber ..." — use them.
    if (/conta a pagar/i.test(item.title)) return 'pagar';
    if (/conta a receber/i.test(item.title)) return 'cobrar';
    return undefined;
  }

  return RULE_ACTION_VERBS[ruleId];
}

// ─── §2 Ranking ──────────────────────────────────────────────────────────────

/** Per-sector tie-break metric. Returns [value, biggerFirst] or null when n/a. */
function sectorMetric(sectorKey: string, item: TabularAlertItem): [number, boolean] | null {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (sectorKey) {
    case 'finance': {
      const v = num(meta.amount);
      return v === null ? null : [v, true]; // highest R$ first
    }
    case 'fiscal': {
      const v = num(meta.hoursWaiting);
      return v === null ? null : [v, true]; // most hours stuck first
    }
    case 'logistic': {
      const v = num(meta.daysLate);
      return v === null ? null : [v, true]; // most days late first
    }
    case 'frota': {
      const v = num(meta.daysLeft);
      return v === null ? null : [v, false]; // fewest days until expiry first
    }
    default:
      return null; // procurement: single aggregated line — n/a
  }
}

function createdAtMs(item: TabularAlertItem): number {
  const t = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t; // sem data → por último
}

/**
 * Sorts a sector's alerts per spec §2 and stamps `escalatedAgeDays` on
 * OVERDUE items older than DIGEST_AGE_ESCALATION_DAYS (promoted to the top of
 * their band). Never throws on missing metadata — degrades to oldest-first.
 */
export function rankSectorAlerts<T extends TabularAlertItem>(
  sectorKey: string,
  alerts: T[],
  now: Date,
): Array<T & { escalatedAgeDays?: number }> {
  const stamped = alerts.map((a) => {
    const ageDays = Math.floor((now.getTime() - createdAtMs(a)) / DAY_MS);
    const escalated = a.severity === 'OVERDUE' && ageDays > DIGEST_AGE_ESCALATION_DAYS;
    return escalated ? { ...a, escalatedAgeDays: ageDays } : { ...a };
  });

  return stamped.sort((a, b) => {
    // 1. severity band
    const band = SEVERITY_BAND.indexOf(a.severity) - SEVERITY_BAND.indexOf(b.severity);
    if (band !== 0) return band;
    // §2 age escalation: escalated first within the band, oldest (biggest age) first
    const escA = a.escalatedAgeDays ?? -1;
    const escB = b.escalatedAgeDays ?? -1;
    if ((escA >= 0) !== (escB >= 0)) return escB >= 0 ? 1 : -1;
    if (escA >= 0 && escB >= 0 && escA !== escB) return escB - escA;
    // 2. per-sector metric (item with metric ranks above item without)
    const mA = sectorMetric(sectorKey, a);
    const mB = sectorMetric(sectorKey, b);
    if (mA && mB) {
      const [va, biggerFirst] = mA;
      const vb = mB[0];
      if (va !== vb) return biggerFirst ? vb - va : va - vb;
    } else if (mA || mB) {
      return mA ? -1 : 1;
    }
    // 3. oldest first
    return createdAtMs(a) - createdAtMs(b);
  });
}

// ─── §1 Rendering ────────────────────────────────────────────────────────────

const RULE_DOUBLE = '═'.repeat(BLOCK_WIDTH);
const RULE_SINGLE = '─'.repeat(BLOCK_WIDTH);

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** `R$ 38.400` — integer BRL, number right-aligned to 6 chars (spec column). */
function moneyValue(amount: number): string {
  const intBR = Math.round(Math.abs(amount)).toLocaleString('pt-BR');
  return `R$ ${intBR.padStart(6)}`;
}

/** Right-aligned money row filling BLOCK_WIDTH: `label……value`. */
function moneyRow(label: string, amount: number): string {
  const value = moneyValue(amount);
  const labelWidth = Math.max(1, BLOCK_WIDTH - value.length);
  return `${truncate(label, labelWidth - 1).padEnd(labelWidth)}${value}`;
}

/** Wraps section lines in a WhatsApp monospace block, ═ above the title only. */
function monoBlock(lines: string[]): string {
  return `\`\`\` ${RULE_DOUBLE}\n${lines.join('\n')}\`\`\``;
}

function cashBlock(cash: TmsCashView): string {
  const balance = cash.inflow15d.amount - cash.outflow15d.amount;
  const lines: string[] = [' SEU CAIXA — 15 dias'];
  if (cash.invoicedToday) lines.push(moneyRow('Faturado hoje', cash.invoicedToday.amount));
  if (cash.paidToday) lines.push(moneyRow('Gasto hoje', cash.paidToday.amount));
  lines.push(moneyRow('Entra (15d)', cash.inflow15d.amount));
  lines.push(moneyRow('Sai (15d)', cash.outflow15d.amount));
  lines.push(RULE_SINGLE);
  lines.push(moneyRow(balance >= 0 ? 'Sobra' : 'Falta', balance));
  lines.push(moneyRow('Vencido s/ receber', cash.overdueReceivable.amount));
  // last line gets the closing fence glued by monoBlock (no trailing \n)
  lines.push(moneyRow('CT-e s/ faturar', cash.unbilledCte.amount));
  return monoBlock(lines);
}

function sectorBlock(label: string, entry: TabularSectorEntry): string {
  const lines: string[] = [` ${label.toUpperCase()} (${entry.total})`];
  entry.shown.forEach((item, i) => {
    const prefix = `${i + 1}. `;
    const suffix = item.escalatedAgeDays !== undefined ? ` há ${item.escalatedAgeDays}d` : '';
    const room = BLOCK_WIDTH - prefix.length - suffix.length;
    lines.push(`${prefix}${truncate(item.title, room)}${suffix}`);
    const verb = actionVerbFor(item);
    if (verb) lines.push(`   → ${verb}`);
  });
  const overflow = entry.total - entry.shown.length;
  if (overflow > 0) {
    lines.push(RULE_SINGLE);
    lines.push(`+${overflow} no site`);
  }
  return monoBlock(lines);
}

/**
 * The full WhatsApp digest message (spec §1). `sectors` in display order;
 * sector with 0 items (or absent from the map) is omitted.
 */
export function buildTabularDigest(
  sectors: SectorMetaLite[],
  alertsBySector: Map<string, TabularSectorEntry>,
  now: Date,
  cashView?: TmsCashView | null,
): string {
  const total = [...alertsBySector.values()].reduce((sum, e) => sum + e.total, 0);
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const header = `*HiperTMS · ${DOW_PT[now.getDay()]} ${dd}/${mm} · ${total} pendência${total !== 1 ? 's' : ''}*`;

  const parts: string[] = [header];
  if (cashView) parts.push(cashBlock(cashView));
  for (const sector of sectors) {
    const entry = alertsBySector.get(sector.key);
    if (!entry || entry.total === 0) continue;
    parts.push(sectorBlock(sector.label, entry));
  }
  parts.push('Ver tudo: hipertms.com.br/painel');
  return parts.join('\n\n');
}
