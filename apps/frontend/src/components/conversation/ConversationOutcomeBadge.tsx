import { getOutcomeConfig } from '@/lib/conversation-status';

interface Props {
  outcome: string;
  size?: 'sm' | 'md';
}

export function ConversationOutcomeBadge({ outcome, size = 'sm' }: Props) {
  const cfg = getOutcomeConfig(outcome);
  const px = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${px} ${cfg.bg} ${cfg.text}`}
      title={cfg.label}
    >
      <span>{cfg.labelPt}</span>
    </span>
  );
}
