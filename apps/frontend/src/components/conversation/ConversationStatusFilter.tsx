import { INBOX_FILTERS } from '@/shared/lib/conversation-status';

interface Props {
  active: string;
  onChange: (key: string) => void;
  counts?: Record<string, number>;
}

export function ConversationStatusFilter({ active, onChange, counts }: Props) {
  return (
    <div className="flex flex-wrap gap-1 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
      {INBOX_FILTERS.map((f) => {
        // `?? 0` importa: status sem nenhuma conversa não vem no statusCounts,
        // e o chip saía SEM número nenhum — ao lado de "Aberta 4", o "Encerrada"
        // pelado lia como "ainda não contei" e não como "não tem nenhuma".
        const count = f.key === 'all'
          ? (counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined)
          : counts ? counts[f.key] ?? 0 : undefined;
        const isActive = active === f.key;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={[
              'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              isActive
                ? 'bg-brand-600 text-white'
                : 'bg-base-200 text-base-content/60 hover:bg-base-300 hover:text-base-content',
            ].join(' ')}
          >
            {f.label}
            {count !== undefined && (
              <span className={`ml-1 ${isActive ? 'text-white/80' : 'text-base-content/40'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
