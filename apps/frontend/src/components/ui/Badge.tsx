import { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

const VARIANT: Record<BadgeVariant, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  neutral: 'bg-zinc-100 text-zinc-600',
};

// Selo de status padronizado (inspirado no TMS).
export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${VARIANT[variant]}`}>
      {children}
    </span>
  );
}

// mapeia status comuns do app → variante de cor
export function statusVariant(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (['running', 'won', 'ganho', 'ativo', 'active', 'open', 'aberta', 'done', 'sent', 'pago', 'paid'].includes(s)) return 'success';
  if (['lost', 'perdido', 'failed', 'erro', 'error', 'opted_out', 'closed'].includes(s)) return 'error';
  if (['paused', 'pausada', 'pending', 'aguardando', 'warm'].includes(s)) return 'warning';
  if (['draft', 'queued', 'cold', 'novo', 'new'].includes(s)) return 'info';
  return 'neutral';
}
