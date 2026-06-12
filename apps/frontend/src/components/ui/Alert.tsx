import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Alerta/banner contextual. Tons com variantes dark explícitas.
export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<AlertTone, string> = {
  info: 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-200',
  success:
    'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200',
  warning:
    'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200',
  danger:
    'bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200',
  neutral: 'bg-base-200 border-base-300 text-base-content',
};

export function Alert({
  tone = 'info',
  title,
  icon,
  className,
  children,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="alert" className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', TONE[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
    </div>
  );
}
