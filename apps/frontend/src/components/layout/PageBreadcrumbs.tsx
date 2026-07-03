import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface PageBreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function PageBreadcrumbs({ items, className }: PageBreadcrumbsProps) {
  const all = [{ label: 'Início', path: '/dashboard' }, ...items];

  return (
    <nav aria-label="Trilha de navegação" className={cn('flex items-center gap-1 text-xs text-base-content/50', className)}>
      {all.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <svg className="h-3 w-3 shrink-0 text-base-content/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          )}
          {i === 0 && (
            <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9,22 9,12 15,12 15,22" />
            </svg>
          )}
          {item.path && i < all.length - 1 ? (
            <Link to={item.path} className="hover:text-base-content transition-colors">
              {i > 0 ? item.label : null}
            </Link>
          ) : (
            <span className={i === all.length - 1 ? 'text-base-content font-medium' : ''}>
              {i > 0 ? item.label : null}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
