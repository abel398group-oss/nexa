import { ChangeEvent, InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';
import { stripInvisible } from '@/shared/lib/sanitize';

// Input de texto canônico. O dark mode é resolvido pelos overrides `input` em index.css.
// Limpa caracteres invisíveis (zero-width/BOM/bidi) ao digitar ou colar — assim
// validações como `.email()` não reprovam valores colados que "parecem" corretos.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, onChange, ...props }, ref) {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const cleaned = stripInvisible(e.target.value);
      if (cleaned !== e.target.value) e.target.value = cleaned; // RHF/onChange leem e.target.value
      onChange?.(e);
    };
    return (
      <input
        ref={ref}
        onChange={handleChange}
        className={cn(
          'h-9 w-full rounded-md border border-base-300 bg-white px-3 text-sm text-base-content shadow-sm outline-none transition-colors',
          'placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
