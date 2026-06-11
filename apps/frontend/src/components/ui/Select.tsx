import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

// Select nativo estilizado (mesma linguagem do Input). Dark via overrides de index.css.
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-base-300 bg-white px-3 text-sm text-base-content shadow-sm outline-none transition-colors',
          'focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
