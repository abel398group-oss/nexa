import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Estado de erro — mesmo formato visual do EmptyState, com moldura de alerta.
export function ErrorState({
  title = 'Algo deu errado',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-red-300 bg-red-50/40 px-6 py-12 text-center',
        'dark:border-red-500/30 dark:bg-red-500/5',
        className,
      )}
    >
      <div className="text-3xl">⚠️</div>
      <h3 className="text-sm font-semibold text-base-content">{title}</h3>
      {description && <p className="max-w-sm text-xs text-base-content/60">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
