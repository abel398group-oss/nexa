import { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

const VARIANT: Record<BadgeVariant, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  neutral: 'bg-zinc-100 text-zinc-600',
};

// Selo de status padronizado (inspirado no TMS).
// `className`, quando informado, SUBSTITUI a cor do `variant` em vez de somar
// (evita duas classes de bg-*/text-* concorrentes no mesmo elemento) — use para
// paletas de cor específicas de domínio (ex.: cor por setor) que não mapeiam
// 1:1 pras 5 variantes semânticas.
export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', className ?? VARIANT[variant])}>
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
