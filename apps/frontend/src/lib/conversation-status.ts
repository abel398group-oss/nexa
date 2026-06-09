/**
 * conversation-status.ts
 * Fonte única de verdade para labels, cores e ícones de status e outcome.
 * NUNCA espalhe essas definições por páginas/componentes — sempre importe daqui.
 */

// ─── Status (estado operacional) ─────────────────────────────────────────────

export type ConversationStatus =
  | 'open'
  | 'waiting_customer'
  | 'waiting_internal'
  | 'escalated'
  | 'opt_out'
  | 'closed';

export interface StatusConfig {
  label: string;
  labelPt: string;
  emoji: string;
  bg: string;       // Tailwind bg class
  text: string;     // Tailwind text class
  ring: string;     // Tailwind ring class (para destacar em alertas)
  dot: string;      // cor do dot (CSS var ou hex)
}

export const STATUS_CONFIG: Record<ConversationStatus, StatusConfig> = {
  open: {
    label: 'Open',
    labelPt: 'Aberta',
    emoji: '🟢',
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    ring: 'ring-emerald-400',
    dot: '#10b981',
  },
  waiting_customer: {
    label: 'Waiting Customer',
    labelPt: 'Aguard. Cliente',
    emoji: '🟡',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    ring: 'ring-amber-400',
    dot: '#f59e0b',
  },
  waiting_internal: {
    label: 'Waiting Internal',
    labelPt: 'Aguard. Equipe',
    emoji: '🔵',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    ring: 'ring-blue-400',
    dot: '#3b82f6',
  },
  escalated: {
    label: 'Escalated',
    labelPt: 'Escalada',
    emoji: '🟠',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    ring: 'ring-orange-400',
    dot: '#f97316',
  },
  closed: {
    label: 'Closed',
    labelPt: 'Encerrada',
    emoji: '⚫',
    bg: 'bg-zinc-100',
    text: 'text-zinc-500',
    ring: 'ring-zinc-300',
    dot: '#71717a',
  },
  opt_out: {
    label: 'Opt-out',
    labelPt: 'Opt-out',
    emoji: '🚫',
    bg: 'bg-red-100',
    text: 'text-red-600',
    ring: 'ring-red-400',
    dot: '#dc2626',
  },
};

// ─── Outcome (resultado comercial) ───────────────────────────────────────────

export type ConversationOutcome = 'won' | 'lost' | 'no_response' | 'opt_out';

export interface OutcomeConfig {
  label: string;
  labelPt: string;
  emoji: string;
  bg: string;
  text: string;
}

export const OUTCOME_CONFIG: Record<ConversationOutcome, OutcomeConfig> = {
  won: {
    label: 'Won',
    labelPt: 'Ganhou',
    emoji: '🏆',
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
  },
  lost: {
    label: 'Lost',
    labelPt: 'Perdeu',
    emoji: '❌',
    bg: 'bg-red-100',
    text: 'text-red-600',
  },
  no_response: {
    label: 'No Response',
    labelPt: 'Sem Resposta',
    emoji: '🔇',
    bg: 'bg-zinc-100',
    text: 'text-zinc-500',
  },
  opt_out: {
    label: 'Opt-out',
    labelPt: 'Opt-out',
    emoji: '🚫',
    bg: 'bg-red-50',
    text: 'text-red-500',
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status as ConversationStatus] ?? {
    label: status,
    labelPt: status,
    emoji: '❓',
    bg: 'bg-base-200',
    text: 'text-base-content/60',
    ring: 'ring-base-300',
    dot: '#a1a1aa',
  };
}

export function getOutcomeConfig(outcome: string): OutcomeConfig {
  return OUTCOME_CONFIG[outcome as ConversationOutcome] ?? {
    label: outcome,
    labelPt: outcome,
    emoji: '❓',
    bg: 'bg-base-200',
    text: 'text-base-content/60',
  };
}

/** Status que representam conversa "ativa" (exigem atenção operacional) */
export const ACTIVE_STATUSES: ConversationStatus[] = [
  'open',
  'waiting_customer',
  'waiting_internal',
  'escalated',
];

/** Todos os filtros disponíveis no inbox */
export const INBOX_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all',              label: 'Todas' },
  { key: 'open',             label: '🟢 Open' },
  { key: 'waiting_customer', label: '🟡 Waiting Customer' },
  { key: 'waiting_internal', label: '🔵 Waiting Internal' },
  { key: 'escalated',        label: '🟠 Escalated' },
  { key: 'closed',           label: '⚫ Closed' },
  { key: 'opt_out',          label: '🚫 Opt-out' },
];

/** Retorna true se a conversa waiting_internal está sem movimentação há mais de 2h */
export function isWaitingInternalStale(lastActivityAt?: string | null): boolean {
  if (!lastActivityAt) return false;
  const diff = Date.now() - new Date(lastActivityAt).getTime();
  return diff > 2 * 60 * 60 * 1000; // 2 horas em ms
}
