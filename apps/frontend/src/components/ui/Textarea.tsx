import { TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

// Área de texto canônica (mesma linguagem do Input).
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-[80px] w-full rounded-md border border-base-300 bg-white px-3 py-2 text-sm text-base-content shadow-sm outline-none transition-colors',
          'placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
