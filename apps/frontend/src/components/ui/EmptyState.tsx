import { ReactNode } from 'react';
import { Icon } from '@/components/ui/icons';

// Estado vazio — ícone + título + descrição + ação opcional (inspirado no TMS).
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-base-300 bg-base-100/40 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center text-base-content/30">
        {icon ?? <Icon name="inbox" className="h-9 w-9" />}
      </div>
      <h3 className="text-sm font-semibold text-base-content">{title}</h3>
      {description && <p className="max-w-sm text-xs text-base-content/60">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
