import React from 'react';
import { cn } from '@/shared/lib/cn';
import { EmptyState } from '@/components/ui/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
  width?: string;
  nowrap?: boolean;
  /** Card mobile: célula exibida como título em destaque */
  mobileTitle?: boolean;
  /** Card mobile: omite esta coluna nos cards */
  mobileHidden?: boolean;
  /** Card mobile: rótulo curto (fallback ao header string) */
  mobileLabel?: string;
}

interface RowAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

interface DataTableEmpty {
  /** Ícone SVG exibido acima do título */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Ação (botão/link) JSX exibido abaixo da mensagem */
  action?: React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Abre detalhe ao double-click (desktop) ou click (mobile) */
  onRowOpen?: (row: T) => void;
  /** Abre ao single-click em vez de double-click */
  openOnSingleClick?: boolean;
  /** Ações por linha — renderiza um dropdown "⋮" na última coluna */
  rowActions?: (row: T) => RowAction[];
  /** Classes extras por linha (highlight, cor de status, etc.) */
  rowClassName?: (row: T) => string | undefined;
  empty?: DataTableEmpty;
  tableClassName?: string;
}

// ─── Componente principal ────────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowOpen,
  openOnSingleClick = false,
  rowActions,
  rowClassName,
  empty,
  tableClassName,
}: DataTableProps<T>) {
  const mobileTitleCol = columns.find((c) => c.mobileTitle);
  const mobileBodyCols = columns.filter((c) => !c.mobileHidden && c !== mobileTitleCol);

  const alignClass = (a?: string) =>
    a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left';

  const emptyNode = empty ? (
    <EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
  ) : (
    <span className="text-sm text-base-content/40">Nenhum registro encontrado</span>
  );

  // ── Desktop: tabela HTML ──
  const desktopTable = (
    <div className="hidden overflow-x-auto sm:block">
      <table className={cn('min-w-full divide-y divide-base-300', tableClassName)}>
        <thead className="bg-base-100/60">
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className={cn(
                  'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/50',
                  alignClass(col.align),
                  col.headerClassName,
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
            {rowActions && (
              <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-base-content/50 w-12">
                Ações
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-base-300 bg-[var(--surface)]">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (rowActions ? 1 : 0)} className="py-12 text-center">
                {emptyNode}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              return (
                <tr
                  key={id}
                  className={cn(
                    'transition-colors',
                    onRowOpen && 'cursor-pointer hover:bg-base-100/60',
                    rowClassName?.(row),
                  )}
                  onClick={onRowOpen && openOnSingleClick ? () => onRowOpen(row) : undefined}
                  onDoubleClick={onRowOpen && !openOnSingleClick ? () => onRowOpen(row) : undefined}
                  tabIndex={onRowOpen ? 0 : undefined}
                  onKeyDown={
                    onRowOpen
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowOpen(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        'px-4 py-3 text-sm text-base-content',
                        alignClass(col.align),
                        col.nowrap && 'whitespace-nowrap',
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActionsDropdown items={rowActions(row)} />
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  // ── Mobile: cards empilhados ──
  const mobileCards = (
    <div className="flex flex-col gap-3 p-3 sm:hidden">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-base-300 p-6 text-center">
          {emptyNode}
        </div>
      ) : (
        rows.map((row) => {
          const id = getRowId(row);
          return (
            <div
              key={id}
              className={cn(
                'rounded-xl border border-base-300 bg-[var(--surface)] p-3 shadow-sm',
                onRowOpen && 'cursor-pointer hover:shadow-md transition-shadow',
                rowClassName?.(row),
              )}
              onClick={onRowOpen ? () => onRowOpen(row) : undefined}
            >
              {mobileTitleCol && (
                <div className="text-sm font-semibold text-base-content">
                  {mobileTitleCol.cell(row)}
                </div>
              )}
              <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-1', mobileTitleCol && 'mt-2')}>
                {mobileBodyCols.map((col) => {
                  const label =
                    col.mobileLabel ??
                    (typeof col.header === 'string' ? col.header : null);
                  if (!label) {
                    return (
                      <dd key={col.id} className="col-span-2 text-sm">
                        {col.cell(row)}
                      </dd>
                    );
                  }
                  return (
                    <React.Fragment key={col.id}>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-base-content/40">
                        {label}
                      </dt>
                      <dd className="text-sm text-base-content">{col.cell(row)}</dd>
                    </React.Fragment>
                  );
                })}
              </dl>
              {rowActions && (
                <div
                  className="mt-2 flex justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RowActionsDropdown items={rowActions(row)} />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <>
      {desktopTable}
      {mobileCards}
    </>
  );
}

// ─── Dropdown de ações da linha ───────────────────────────────────────────────

function RowActionsDropdown({ items }: { items: RowAction[] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-base-content/40 transition-colors hover:bg-base-200 hover:text-base-content"
        aria-label="Ações"
      >
        {/* ⋮ vertical ellipsis */}
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm-2 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-base-300 bg-[var(--surface-elevated,var(--surface))] shadow-lg">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { item.onClick(); setOpen(false); }}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-base-100',
                item.destructive ? 'text-red-600' : 'text-base-content',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
