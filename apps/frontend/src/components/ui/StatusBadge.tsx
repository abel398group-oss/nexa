import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * StatusBadge — badge de status canônico (porte do TMS).
 * Use o `tone` semântico em vez de cores soltas; `statusTone()` mapeia strings
 * de status comuns do app para um tom.
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';
export type StatusBadgeSize = 'xs' | 'sm' | 'md';
export type StatusBadgeVariant = 'soft' | 'outlined' | 'pill';

// Cores soft — variantes dark já cobertas pelos overrides de index.css.
const SOFT: Record<StatusTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-600',
  info: 'bg-sky-100 text-sky-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  primary: 'bg-brand-50 text-brand-700',
};

const OUTLINED: Record<StatusTone, string> = {
  neutral: 'border border-zinc-300 text-zinc-600',
  info: 'border border-sky-300 text-sky-700',
  success: 'border border-emerald-300 text-emerald-700',
  warning: 'border border-amber-300 text-amber-700',
  danger: 'border border-red-300 text-red-700',
  primary: 'border border-brand-300 text-brand-700',
};

const SIZE: Record<StatusBadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export interface StatusBadgeProps {
  tone?: StatusTone;
  size?: StatusBadgeSize;
  variant?: StatusBadgeVariant;
  /** Exibe um ponto colorido antes do texto. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function StatusBadge({
  tone = 'neutral',
  size = 'sm',
  variant = 'soft',
  dot = false,
  className,
  children,
}: StatusBadgeProps) {
  const tones = variant === 'outlined' ? OUTLINED : SOFT;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 font-medium',
        variant === 'pill' ? 'rounded-full' : 'rounded-md',
        tones[tone],
        SIZE[size],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

// Mapeia status comuns do app → tom semântico (para migrar badges sem reescrever a lógica).
const TONE_MAP: Record<string, StatusTone> = {
  running: 'success', won: 'success', ganho: 'success', ativo: 'success', active: 'success',
  open: 'success', aberta: 'success', done: 'success', sent: 'success', pago: 'success', paid: 'success',
  lost: 'danger', perdido: 'danger', failed: 'danger', erro: 'danger', error: 'danger',
  opted_out: 'danger', closed: 'danger',
  paused: 'warning', pausada: 'warning', pending: 'warning', aguardando: 'warning', warm: 'warning',
  draft: 'info', queued: 'info', cold: 'info', novo: 'info', new: 'info',
};

export function statusTone(status: string): StatusTone {
  return TONE_MAP[(status || '').toLowerCase()] ?? 'neutral';
}
