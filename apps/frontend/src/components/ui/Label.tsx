import { LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

// Rótulo de formulário.
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium leading-none text-base-content', className)}
      {...props}
    />
  );
}
