import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';

// Checkbox nativo estilizado na cor da marca.
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'size-4 shrink-0 rounded border-base-300 accent-brand-500 outline-none',
          'focus-visible:ring-[3px] focus-visible:ring-brand-500/30 disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
