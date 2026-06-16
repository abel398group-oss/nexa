import {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
  useMemo,
  useState,
} from 'react';
import { cn } from '@/shared/lib/cn';

// Wrappers de tabela. O tema dark é resolvido pelos overrides `table/thead/...` em index.css.
export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_th]:text-base-content/60', className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-base-200 transition-colors hover:bg-base-200/50', className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('h-10 px-3 text-left align-middle text-xs font-medium', className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}

/* ───────────────────────── Ordenação por coluna ─────────────────────────
 * Padrão do TMS: header clicável que alterna asc → desc → sem ordenação.
 */

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: string;
  direction: SortDirection;
}

/**
 * Hook de ordenação client-side. Retorna as linhas ordenadas, o estado atual
 * e um `toggle(key)` para ligar nos headers (asc → desc → limpa).
 */
export function useTableSort<T extends Record<string, any>>(
  rows: T[],
  initial: SortState | null = null,
) {
  const [sort, setSort] = useState<SortState | null>(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { key, direction } = sort;
    const dir = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return -dir;
      if (bv == null) return dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true }) * dir;
    });
  }, [rows, sort]);

  function toggle(key: string) {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, direction: 'asc' };
      if (cur.direction === 'asc') return { key, direction: 'desc' };
      return null; // 3º clique limpa a ordenação
    });
  }

  return { sorted, sort, toggle, setSort };
}

/** Header clicável com indicador de ordenação. Use com `useTableSort`. */
export function SortableTH({
  sortKey,
  sort,
  onSort,
  className,
  children,
}: {
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort!.direction : undefined;
  return (
    <TH className={cn('p-0', className)} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex h-10 w-full items-center gap-1 px-3 text-left transition-colors hover:text-base-content"
      >
        {children}
        <span
          className={cn(
            'text-[9px] leading-none transition-opacity',
            active ? 'text-brand-500 opacity-100' : 'opacity-30',
          )}
          aria-hidden
        >
          {dir === 'desc' ? '▼' : '▲'}
        </span>
      </button>
    </TH>
  );
}
