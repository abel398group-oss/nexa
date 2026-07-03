import React from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageBreadcrumbs, type BreadcrumbItem } from '@/components/layout/PageBreadcrumbs';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TabItem {
  id: string;
  label: string;
  /** Contagem exibida como badge na aba (ex: número de erros de validação) */
  badge?: number;
}

interface StandardFormPageProps {
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  /** Rota para o botão "← Voltar" */
  backPath?: string;
  backLabel?: string;
  isLoading?: boolean;
  hasData?: boolean;
  error?: unknown;
  onRetry?: () => void;
  loadingMessage?: string;
  errorTitle?: string;
  tabs?: TabItem[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Botões no canto direito do header */
  headerActions?: React.ReactNode;
  /** Botões de ação (Salvar / Cancelar) */
  footerActions?: React.ReactNode;
  /** Cola o footer na base da tela */
  stickyFooter?: boolean;
  children: React.ReactNode;
  className?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function StandardFormPage({
  icon: Icon,
  iconColor = 'text-[var(--accent-brand)]',
  iconBg = 'bg-orange-50 dark:bg-orange-950/30',
  title,
  subtitle,
  description,
  breadcrumb,
  backPath,
  backLabel = 'Voltar',
  isLoading = false,
  hasData = false,
  error,
  onRetry,
  loadingMessage,
  errorTitle,
  tabs,
  activeTab,
  onTabChange,
  headerActions,
  footerActions,
  stickyFooter = false,
  children,
  className,
}: StandardFormPageProps) {
  const navigate = useNavigate();

  if (isLoading && !hasData) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState label={loadingMessage ?? 'Carregando...'} />
      </div>
    );
  }

  if (error && !hasData) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <ErrorState
          title={errorTitle ?? 'Erro ao carregar'}
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

  return (
    <PageContainer variant="wide" className={className}>
      {/* Breadcrumb */}
      {breadcrumb && <PageBreadcrumbs items={breadcrumb} className="mb-4" />}

      {/* Botão voltar */}
      {backPath && (
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="mb-4 flex items-center gap-2 text-sm text-base-content/60 transition-colors hover:text-base-content"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          {backLabel}
        </button>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', iconBg)}>
              <Icon className={cn('h-7 w-7', iconColor)} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-base-content">{title}</h1>
            {description && <p className="mt-1 text-sm text-base-content/60">{description}</p>}
            {subtitle && <div className="mt-1 text-sm text-base-content/60">{subtitle}</div>}
          </div>
        </div>
        {headerActions && (
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        )}
      </div>

      {/* Tabs */}
      {tabs && tabs.length > 0 && onTabChange && (
        <div className="mb-6 border-b border-base-300">
          <nav className="flex space-x-6 overflow-x-auto" aria-label="Abas">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'border-[var(--accent-brand)] text-[var(--accent-brand)]'
                    : 'border-transparent text-base-content/60 hover:text-base-content',
                )}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="rounded-full bg-base-200 px-1.5 py-0.5 text-xs text-base-content/60">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Conteúdo */}
      <div className={cn('space-y-6', stickyFooter && 'pb-28')}>{children}</div>

      {/* Footer de ações */}
      {footerActions && (
        stickyFooter ? (
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-base-300 bg-[var(--surface)] px-6 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:left-16">
            <div className="mx-auto flex max-w-[1760px] items-center justify-end gap-3">
              {footerActions}
            </div>
          </div>
        ) : (
          <div className="mt-8 flex items-center justify-end gap-3 border-t border-base-300 pt-6">
            {footerActions}
          </div>
        )
      )}
    </PageContainer>
  );
}

// ─── Primitivos de formulário ─────────────────────────────────────────────────

/** Cartão de seção dentro do formulário */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-base-300 bg-[var(--surface)] p-6 shadow-[var(--shadow-card)]', className)}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-semibold text-base-content">{title}</h2>}
          {description && <p className="mt-1 text-sm text-base-content/60">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Grid de colunas dentro de uma FormSection */
export function FormGroup({
  cols = 1,
  children,
}: {
  cols?: 1 | 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const gridClass: Record<number, string> = {
    1: '',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-4',
  };
  return (
    <div className={cn('grid grid-cols-1 gap-4', gridClass[cols])}>{children}</div>
  );
}

/** Campo de formulário com label, validação e mensagem de erro */
export function FormField({
  label,
  required,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <label className="block text-sm font-medium text-base-content/80">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
