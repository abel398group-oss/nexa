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
        classNam