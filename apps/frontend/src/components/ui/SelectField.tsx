/**
 * SelectField — select nativo estilizado para formulários.
 * API: `onValueChange` (não `onChange`) + `options[]` + `placeholder` desabilitado.
 * Espelha o select-field.tsx do HiperTMS (shared/ui).
 */
import * as React from 'react';
import { cn } from '@/shared/lib/cn';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectFieldProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'defaultValue' | 'onChange'
> & {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: SelectOption[];
};

export function SelectField({
  value,
  onValueChange,
  placeholder = 'Selecione...',
  options,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-base-300 bg-[var(--surface-input)]',
          'px-3 pr-9 text-sm text-base-content shadow-sm',
          'outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-base-content/60">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </div>
  );
}
