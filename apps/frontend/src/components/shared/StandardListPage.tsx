import React from 'react';
import { cn } from '@/shared/lib/cn';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageBreadcrumbs, type BreadcrumbItem } from '@/components/layout/PageBreadcrumbs';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';

interface PaginationConfig {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

interface StandardListPageProps {
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  title: string;
  breadcrumb?: BreadcrumbItem[];
  description?: string;
  totalItems?: number;
  totalShowing?: number;
  entityName?: string;
  isLoading?: boolean;
  hasData?: boolean;
  error?: unknown;
  onRetry?: () => void;
  loadingMessage?: string;
  errorTitle?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  headerActions?: React.ReactNode;
  filtersContent?: React.ReactNode;
  actionsContent?: React.ReactNode;
  extraToolbar?: React.ReactNode;
  /** Content between header and toolbar (e.g. KPI cards) */
  topContent?: React.ReactNode;
  pagination?: PaginationConfig;
  children: React.ReactNode;
  className?: string;
}

export function StandardListPage({
  icon: Icon,
  iconColor = 'text-[var(--accent-brand)]',
  title,
  breadcrumb,
  description,
  totalItems,
  totalShowing,
  entityName = 'registros',
  isLoading = false,
  hasData = false,
  error,
  onRetry,
  loadingMessage,
  errorTitle,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  headerActions,
  filtersContent,
  actionsContent,
  extraToolbar,
  topContent,
  pagination,
  children,
  className,
}: StandardListPageProps) {
  if (isLoading && !hasData) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState label={loadingMessage ?? `Carregando ${entityName}...`} />
      </div>
    );
  }

  if (error && !hasData) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <ErrorState
          title={errorTitle ?? `Erro ao carregar ${entityName}`}
          description={(error as Error)?.message}
          action={
            onRetry && (
              <button type="button" onClick={onRetry} className="btn btn-sm btn-outline mt-2">
                Tentar novamente
              </button>
            )
          }
        />
      </div>
    );
  }

  const countLabel =
    totalItems !== undefined && totalShowing !== undefined
      ? `Mostrando ${totalShowing} de ${totalItems} ${entityName}`
      : totalItems !== undefined
      ? `${totalItems} ${entityName}`
      : null;

  return (
    <PageContainer variant="wide" fillHeight className={className}>
      <div className="flex min-h-0 flex-1 flex-col">
        {breadcrumb && <PageBreadcrumbs items={breadcrumb} className="mb-4" />}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div>
            <h1 className={cn('flex items-center gap-3 text-xl font-semibold text-base-content')}>
              {Icon && <Icon className={cn('h-6 w-6 shrink-0', iconColor)} />}
              {title}
            </h1>
            {description && <p className="mt-1 text-sm text-base-content/60">{description}</p>}
            {countLabel && <p className="mt-1 text-sm text-base-content/60">{countLabel}</p>}
          </div>
          {headerActions && <div className="flex shrink-0 gap-2">{headerActions}</div>}
        </div>

        {topContent}

        {(onSearchChange || filtersContent || actionsContent || extraToolbar) && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            {onSearchChange && (
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchValue ?? ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="input pl-9 w-full"
                />
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40"
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle cx={11} cy={11} r={8} />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
            )}
            {extraToolbar}
            {filtersContent}
            {actionsContent}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-base-300 bg-[var(--surface)] shadow-[var(--shadow-card)]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </div>
          {pagination && (
            <div className="shrink-0 border-t border-base-300 px-4 py-2 flex justify-end">
              <Pagination
                page={pagination.page}
                pageCount={pagination.pageCount}
                onPageChange={pagination.onPageChange}
              />
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
