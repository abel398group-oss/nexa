import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * PageContainer — moldura padrão de conteúdo (scroll + padding), padrão HiperTMS.
 * Use como wrapper raiz de cada tela do app.
 */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('h-full overflow-auto bg-base-100 px-6 py-6', className)}>{children}</div>;
}

/**
 * PageHeader — cabeçalho de tela: (breadcrumb) + título + subtítulo + ações.
 * Substitui os headers montados à mão em cada página.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {breadcrumb}
        <h1 className="truncate text-xl font-bold text-base-content">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-base-content/50">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
