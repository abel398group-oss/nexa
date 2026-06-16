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
      if (cleaned !== e.target.value) e.target.value = cleaned; // RHF/onChange leem e.target.