import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';

export interface Crumb {
  label: string;
  /** Se houver `to`, vira link; senão é o item atual (sem link). */
  to?: string;
}

/** Trilha de navegação (padrão HiperTMS `PageBreadcrumbs`). */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav className={cn('mb-1 flex items-center gap-1 text-xs text-base-content/45', className)} aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-base-content/25">/</span>}
          {c.to ? (
            <Link to={c.to} className="transition-colors hover:text-base-content/70">
              {c.label}
            </Link>
          ) : (
            <span className="text-base-content/70">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
