import { getStatusConfig, isWaitingInternalStale } from '@/lib/conversation-status';

interface Props {
  status: string;
  lastActivityAt?: string | null;
  size?: 'sm' | 'md';
}

export function ConversationStatusBadge({ status, lastActivityAt, size = 'sm' }: Props) {
  const cfg = getStatusConfig(status);
  const stale = status === 'waiting_internal' && isWaitingInternalStale(lastActivityAt);
  const px = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${px} ${cfg.bg} ${cfg.text}`}
      title={cfg.label}
    >
      <span>{cfg.emoji}</span>
      <span>{cfg.labelPt}</span>
      {stale && (
        <span title="Sem movimentação há mais de 2h" className="text-amber-600">
          ⚠️
        </span>
      )}
    </span>
  );
}
