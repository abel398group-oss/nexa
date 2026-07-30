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

/**
 * Block width in chars. Spec: 30; raised to 32 on 2026-07-21 to fill the bubble
 * (the do-not-reply notice was shortened at the same time so both meet at the
 * same width — no dead space on the right). Fallback to 28-30 if wrap is ever
 * reported on small phones — wrapping breaks alignment and is worse than a gap.
 */
export const BLOCK_WIDTH = 32;

/**
 * Sector → TMS panel hub page (2026-07-21, confirmed by Abel against the real
 * routes). NO contract change: the Nexa already knows each event's sector (it
 * builds the blocks from it), so the destination is a fixed table here — the
 * TMS never has to send a link.
 *
 * At most 5 links per message (one per sector), never one per item.
 */
// 2026-07-21: base CONFERIDA no roteador do TMS pelo squad — domínio raiz, sem
// o subdomínio `app.` (a primeira versão usava app.hipertms.com.br, deduzido do
// closing report, e NENHUM link resolvia).
const PANEL_BASE = (process.env.TMS_PANEL_BASE_URL ?? 'https://hipertms.com.br').replace(/\/$/, '');

// Páginas-hub por área (todas resolvem — hub ou redirect). O squad também
// mapeou destinos "lista" mais fundos (/logistic/shipments, /fleet/vehicles,
// /fiscal/cte, /procurement/orders); ficamos no HUB de propósito — é um
// destino melhor pra quem chega do alerta, e finance só tem hub.
const SECTOR_PANEL_PATHS: Record<string, string> = {
  fiscal: '/fiscal',
  logistic: '/logistic',
  frota: '/fleet',
  finance: '/finance',
  procurement: '/procurement',
};

/** Full panel URL for a sector, or undefined when the sector has no known page. */
export function sectorPanelUrl(sectorKey: string): string | undefined {
  const path = SECTOR_PANEL_PATHS[sectorKey];
  return path ? `${PANEL_BASE}${path}` : undefined;
}

/** Display form used in the WhatsApp text (no scheme — WhatsApp still links it). */
export function sectorPanelDisplayUrl(sectorKey: string): string | undefined {
  return sectorPanelUrl(sectorKey)?.replace(/^https?:\/\//, '');
}

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
 * resolved in actionVerbFor() (metadata.accountType, then title heuristic).
 *
 * VALIDATED against the real TMS rule enum on 2026-07-21 (TMS squad response —
 * source of truth: hipertms_v12 pending-event-rules.ts, PENDING_EVENT_RULES,
 * 28 rules). Aggregated count rules (one event per tenant/day with the total
 * in the title) use count-friendly/plural verbs — a singular verb pointing at
 * one specific item makes no sense there.
 */
export const RULE_ACTION_VERBS: Record<string, string> = {
  // fiscal (5)
  'cte.rejected': 'reenviar',
  'cte.pending_authorization': 'verificar',
  'mdfe.unclosed': 'encerrar',
  'certificate.expiring': 'renovar', // aggregated
  'certificate.expired': 'renovar',
  // logistic (8)
  'shipment.pickup_due': 'agendar coletas', // aggregated
  'shipment.delivery_due': 'ver entregas', // aggregated
  'shipment.delivered_uninvoiced': 'faturar', // aggregated
  'shipment.stalled': 'ver embarques', // aggregated count (TMS suggestion: plural)
  'shipment.unlinked': 'vincular', // aggregated count
  'quote.expiring': 'responder', // aggregated
  'quote.expired': 'responder', // aggregated
  'trip.overdue': 'acompanhar', // aggregated count (TMS suggestion)
  // frota (10)
  'fleet.cnh_expiring': 'renovar', // aggregated
  'fleet.cnh_expired': 'renovar',
  'fleet.document_expiring': 'renovar', // aggregated — cobre CRLV e seguro
  'fleet.document_expired': 'renovar',
  'fleet.maintenance_date_due': 'agendar', // aggregated
  'fleet.maintenance_date_overdue': 'agendar',
  'fleet.maintenance_km_due': 'agendar', // aggregated
  'fleet.maintenance_km_overdue': 'agendar',
  'fleet.in_maintenance': 'acompanhar', // aggregated count
  'fleet.consumption_anomaly': 'verificar', // aggregated
  // finance (3 + installment.overdue dinâmico em actionVerbFor)
  'installment.due_soon': 'programar', // aggregated
  'contract.billing_due': 'faturar',
  'budget.over': 'revisar',
  // procurement (1)
  'purchase.pending_approval': 'aprovar', // aggregated count
};

/**
 * Extracts the ruleId: metadata.ruleId → id prefix (`<ruleId>:<entity>`, the
 * TMS dedupeKey format) → bare `domain.rule` id.
 *
 * Aggregated events (2026-07-21): the TMS is flipping the aggregated id from
 * `agg:<ruleId>` to `<ruleId>:agg` so the prefix rule keeps working. We ALSO
 * handle the old `agg:` prefix defensively — if any event with the pre-flip
 * format slips through, the verb still renders instead of silently vanishing.
 */
export function ruleIdOf(item: Pick<TabularAlertItem, 'tmsEventId' | 'metadata'>): string | undefined {
  const metaRule = (item.metadata as any)?.ruleId;
  if (typeof metaRule === 'string' && metaRule) return metaRule;
  const id = item.tmsEventId ?? '';
  if (id.includes(':')) {
    const [prefix, rest] = id.split(':');
    return prefix === 'agg' && rest ? rest : prefix;
  }
  const m = id.match(/^[a-z_]+\.[a-z_]+/);
  return m ? m[0] : undefined;
}

/** Verb for the `→` line, or undefined (line omitted). */
export function actionVerbFor(item: Pick<TabularAlertItem, 'tmsEventId' | 'metadata' | 'title'>): string | undefined {
  const ruleId = ruleIdOf(item);
  if (!ruleId) return undefined;

  // Direction-dependent rule (spec §3): PAYABLE → pagar, RECEIVABLE → cobrar.
  // The TMS already records this as metadata.accountType (pending-event-rules
  // :1011/:1029) — it will flow once the metadata field ships. Until then,
  // degrade via today's TMS titles ("Conta a pagar/receber ...").
  if (ruleId === 'installment.overdue') {
    const kind = String(
      (item.metadata as any)?.accountType ?? (item.metadata as any)?.kind ?? (item.metadata as any)?.direction ?? '',
    ).toLowerCase();
    if (kind.includes('pay')) return 'pagar';
    if (kind.includes('receiv')) return 'cobrar';
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

/**
 * T11: rótulo da janela da semana corrente — `seg→qua`, `seg→sex`, `seg→dom`.
 * A janela SEMPRE começa na segunda (é o que o TMS agrega em `invoicedWeek`);
 * o fim é o dia de hoje, então o rótulo cresce sozinho ao longo da semana e o
 * usuário lê o período sem precisar de legenda no rodapé.
 *
 * Domingo (`getDay() === 0`) é o FIM da janela, não o começo — daí o `|| 7`.
 */
export function weekWindowLabel(now: Date): string {
  return `seg→${DOW_PT[now.getDay()]}`;
}

/**
 * T11: na SEGUNDA o acumulado é idêntico ao dia — mostrar as duas linhas seria
 * repetir o mesmo número e gastar 2 linhas do bloco. Então só a partir de terça.
 */
export function weekRowsAreRedundant(now: Date): boolean {
  const dow = now.getDay() || 7; // domingo (0) → 7, fim da semana
  return dow <= 1;
}

/** Wraps section lines in a WhatsApp monospace block, ═ above the title only. */
function monoBlock(lines: string[]): string {
  return `\`\`\` ${RULE_DOUBLE}\n${lines.join('\n')}\`\`\``;
}

function cashBlock(cash: TmsCashView, now: Date): string {
  const balance = cash.inflow15d.amount - cash.outflow15d.amount;
  // T11: o título passou de "15 dias" para a DATA. Com linhas de hoje, de semana
  // e de 15 dias no mesmo bloco, "SEU CAIXA — 15 dias" no cabeçalho passou a
  // descrever errado o conteúdo. As linhas de 15 dias mantêm o `(15d)` no rótulo.
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const lines: string[] = [` SEU CAIXA — ${DOW_PT[now.getDay()]} ${dd}/${mm}`];

  // T11: `(N)` = contagem de FATURAS (semântica de `invoicedToday.count`), não
  // de CT-e — ver o comentário em TmsCashView. Rótulo "Faturado" de propósito.
  const week = weekWindowLabel(now);
  const showWeek = !weekRowsAreRedundant(now);
  if (cash.invoicedToday) lines.push(moneyRow(`Faturado hoje (${cash.invoicedToday.count})`, cash.invoicedToday.amount));
  if (cash.invoicedWeek && showWeek) {
    lines.push(moneyRow(`Faturado ${week} (${cash.invoicedWeek.count})`, cash.invoicedWeek.amount));
  }
  if (cash.paidToday) lines.push(moneyRow(`Pago hoje (${cash.paidToday.count})`, cash.paidToday.amount));
  if (cash.paidWeek && showWeek) {
    lines.push(moneyRow(`Pago ${week} (${cash.paidWeek.count})`, cash.paidWeek.amount));
  }

  lines.push(moneyRow('Entra (15d)', cash.inflow15d.amount));
  lines.push(moneyRow('Sai (15d)', cash.outflow15d.amount));
  lines.push(RULE_SINGLE);
  lines.push(moneyRow(balance >= 0 ? 'Sobra' : 'Falta', balance));
  lines.push(moneyRow('Vencido s/ receber', cash.overdueReceivable.amount));
  // last line gets the closing fence glued by monoBlock (no trailing \n)
  lines.push(moneyRow('CT-e s/ faturar', cash.unbilledCte.amount));
  return monoBlock(lines);
}

function sectorBlock(sectorKey: string, label: string, entry: TabularSectorEntry): string {
  const lines: string[] = [` ${label.toUpperCase()} (${entry.total})`];
  entry.shown.forEach((item) => {
    // Bullet "- " em vez de numeração (2026-07-26): a maioria dos títulos do TMS
    // COMEÇA com número ("21 viagens atrasadas"), e "1. 21 viagens" era lido
    // como "1.21". O traço separa item de conteúdo sem ambiguidade.
    const prefix = '- ';
    const suffix = item.escalatedAgeDays !== undefined ? ` há ${item.escalatedAgeDays}d` : '';
    const room = BLOCK_WIDTH - prefix.length - suffix.length;
    lines.push(`${prefix}${truncate(item.title, room)}${suffix}`);
    const verb = actionVerbFor(item);
    if (verb) lines.push(`  → ${verb}`);
  });
  const overflow = entry.total - entry.shown.length;
  if (overflow > 0) {
    lines.push(RULE_SINGLE);
    lines.push(`+${overflow} no site`);
  }
  // O link do setor fica FORA do bloco monoespaçado DE PROPÓSITO: dentro de
  // ``` o WhatsApp não transforma URL em link clicável (vira texto morto).
  // Colado logo abaixo, parece a última linha do card e continua tocável.
  const url = sectorPanelDisplayUrl(sectorKey);
  return url ? `${monoBlock(lines)}\n${url}` : monoBlock(lines);
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
  if (cashView) parts.push(cashBlock(cashView, now));
  for (const sector of sectors) {
    const entry = alertsBySector.get(sector.key);
    if (!entry || entry.total === 0) continue;
    parts.push(sectorBlock(sector.key, sector.label, entry));
  }
  // Rodapé geral só quando nenhum setor trouxe link próprio — evita repetir
  // destino (os links por setor já levam ao painel).
  const hasSectorLinks = sectors.some(
    (s) => (alertsBySector.get(s.key)?.total ?? 0) > 0 && !!sectorPanelUrl(s.key),
  );
  if (!hasSectorLinks) parts.push(`Ver tudo: ${PANEL_BASE.replace(/^https?:\/\//, '')}`);
  return parts.join('\n\n');
}
