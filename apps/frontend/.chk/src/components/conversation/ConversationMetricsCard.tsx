import { Icon, type IconName } from '@/components/ui/icons';

interface Props {
  label: string;
  value: number | string;
  /** Emoji (fallback) — usado quando não há `icon`. */
  emoji?: string;
  /** Ícone de linha do design system (preferível ao emoji). */
  icon?: IconName;
  hint?: string;
  accent?: 'green' | 'amber' | 'red' | 'blue' | 'orange' | 'zinc' | 'brand';
  /** Se true, destaca o card com um anel na cor do accent. */
  highlight?: boolean;
}

// Estilo do número, da caixa do ícone e do anel por accent (com variantes dark).
const ACCENT: Record<string, { value: string; box: string; ring: string }> = {
  green:  { value: 'text-emerald-600', box: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15', ring: 'ring-emerald-300/60' },
  amber:  { value: 'text-amber-600',   box: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15',       ring: 'ring-amber-300/60' },
  red:    { value: 'text-red-600',     box: 'bg-red-50 text-red-600 dark:bg-red-500/15',             ring: 'ring-red-300/60' },
  blue:   { value: 'text-blue-600',    box: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15',          ring: 'ring-blue-300/60' },
  orange: { value: 'text-orange-600',  box: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15',    ring: 'ring-orange-300/60' },
  zinc:   { value: 'text-zinc-500',    box: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-500/15',         ring: 'ring-zinc-300/60' },
  brand:  { value: 'text-brand-600',   box: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15',       ring: 'ring-brand-400/50' },
};

// Metric card no padrão do HiperTMS: ícone à esquerda, rótulo discreto, número grande.
export function ConversationMetricsCard({ label, value, emoji, icon, hint, accent, highlight }: Props) {
  const a = accent ? ACCENT[accent] : null;
  return (
    <div className={`card p-4 ${highlight && a ? `ring-1 ${a.ring}` : ''}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            a ? a.box : 'bg-base-200 text-base-content/60'
          }`}
        >
          {icon ? <Icon name={icon} className="h-5 w-5" /> : <span className="text-lg leading-none">{emoji}</span>}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-base-content/50">
            {label}
          </div>
          <div className={`mt-0.5 text-2xl font-bold ${a ? a.value : 'text-base-content'}`}>{value}</div>
          {hint && <div className="mt-0.5 text-xs text-base-content/40">{hint}</div>}
        </div>
      </div>
    </div>
  );
}
