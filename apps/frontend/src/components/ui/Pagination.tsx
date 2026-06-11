import { cn } from '@/lib/cn';

// Paginação simples (anterior / página atual / próxima).
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const go = (p: number) => onPageChange(Math.min(Math.max(1, p), pageCount));
  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-base-300 bg-base-100 px-2 text-sm text-base-content transition-colors hover:bg-base-200 disabled:pointer-events-none disabled:opacity-40';
  return (
    <nav className={cn('flex items-center gap-1', className)} aria-label="Paginação">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Anterior">
        ‹
      </button>
      <span className="px-2 text-sm text-base-content/70">
        {page} / {pageCount}
      </span>
      <button
        type="button"
        className={btn}
        disabled={page >= pageCount}
        onClick={() => go(page + 1)}
        aria-label="Próxima"
      >
        ›
      </button>
    </nav>
  );
}
