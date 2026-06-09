interface Props {
  label: string;
  value: number | string;
  emoji?: string;
  hint?: string;
  accent?: 'green' | 'amber' | 'red' | 'blue' | 'orange' | 'zinc' | 'brand';
  /** Se true, destaca o card com borda colorida */
  highlight?: boolean;
}

const ACCENT_STYLES: Record<string, { value: string; border: string }> = {
  green:  { value: 'text-emerald-600', border: 'border-l-emerald-400' },
  amber:  { value: 'text-amber-600',   border: 'border-l-amber-400' },
  red:    { value: 'text-red-600',     border: 'border-l-red-400' },
  blue:   { value: 'text-blue-600',    border: 'border-l-blue-400' },
  orange: { value: 'text-orange-600',  border: 'border-l-orange-400' },
  zinc:   { value: 'text-zinc-500',    border: 'border-l-zinc-300' },
  brand:  { value: 'text-brand-600',   border: 'border-l-brand-500' },
};

export function ConversationMetricsCard({ label, value, emoji, hint, accent, highlight }: Props) {
  const a = accent ? ACCENT_STYLES[accent] : null;
  return (
    <div
      className={[
        'card p-4 border-l-4',
        highlight && a ? a.border : 'border-l-transparent',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-base-content/50">
        {emoji && <span>{emoji}</span>}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-bold ${a ? a.value : 'text-base-content'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-base-content/40">{hint}</div>}
    </div>
  );
}
