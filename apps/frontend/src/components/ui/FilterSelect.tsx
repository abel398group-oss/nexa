/**
 * FilterSelect — select rotulado para barras de filtro de listagens.
 * Distinto do SelectField: a 1ª opção ("Todos") é selecionável, sem placeholder desabilitado.
 * Espelha o filter-select.tsx do HiperTMS (shared/ui).
 */
import React from 'react';
import { cn } from '@/shared/lib/cn';

export interface FilterSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  id?: string;
  /** Classe do wrapper externo (ex.: largura na grade de filtros). */
  className?: string;
  /** Classe do <select>. Default `w-full`. */
  selectClassName?: string;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({
  label,
  value,
  onChange,
  options,
  id,
  className,
  selectClassName = 'w-full',
}) => (
  <div className={className}>
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
      {label}
    </label>
    <select
      id={id}
      className={cn(
        'h-9 rounded-md border border-base-300 bg-[var(--surface-input)]',
        'px-3 text-sm text-base-content shadow-sm',
        'outline-none focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30',
        selectClassName,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);
