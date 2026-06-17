/**
 * KpiCard / KpiRow — bloco de métrica KPI.
 * Label + valor tabular grande + delta colorido.
 * Espelha o kpi-card.tsx do HiperTMS (shared/ui).
 */
import { cn } from '@/shared/lib/cn';

export type KpiTone = 'pos' | 'neg' | 'warn' | 'muted';

const TONE: Record<KpiTone, string> = {
  pos: 'text-emerald-600',
  neg: 'text-red-600',
  warn: 'text-amber-600',
  muted: 'text-[var(--text-muted)]',
};

export interface KpiCardProps {
  label: string;
  value: string;
  /** Linha de contexto / delta, colorida por `tone`. */
  sub?: string;
  tone?: KpiTone;
  className?: string;
}

export function KpiCard({ label, value, sub, tone = 'muted', className }: KpiCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-base-300 bg-[var(--surface)] px-[18px] py-4',
        className,
      )}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="text-xs font-medium text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[26px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums text-base-content">
        {value}
      </div>
      {sub ? <div className={cn('mt-1 text-xs', TONE[tone])}>{sub}</div> : null}
    </div>
  );
}

export function KpiRow({
  items,
  className,
}: {
  items: KpiCardProps[];
  className?: string;
}) {
  return (
    <div className={cn('mb-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {items.map((it, i) => (
        <KpiCard key={`${it.label}-${i}`} {...it} />
      ))}
    </div>
  );
}
