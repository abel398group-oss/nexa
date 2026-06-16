import { ChangeEvent, TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';
import { stripInvisible } from '@/shared/lib/sanitize';

// Área de texto canônica (mesma linguagem do Input). Também limpa caracteres
// invisíveis ao digitar/colar (mantém quebras de linha).
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, onChange, ...props }, ref) {
    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      const cleaned = stripInvisible(e.target.value);
      if (cleaned !== e.target.value) e.target.value = cleaned;
      onChange?.(e);
    };
    return (
      <textarea
        ref={ref}
        onChange={handleChange}
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
