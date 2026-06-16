import 'react-day-picker/style.css';
import type { CSSProperties } from 'react';
import { DayPicker, type DateRange, type DayPickerProps } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';
import { Popover } from './Popover';
import { cn } from '@/shared/lib/cn';

export type { DateRange };

// Variáveis do react-day-picker mapeadas pros tokens do design system (accent = brand).
const rdpTheme: CSSProperties = {
  // @ts-expect-error – CSS custom properties
  '--rdp-accent-color': 'var(--brand-500, #f97316)',
  '--rdp-accent-background-color': 'var(--brand-50, #fff7ed)',
  '--rdp-today-color': 'var(--brand-600, #ea580c)',
  '--rdp-font-family': 'inherit',
};

/** Calendário base (mesma lib do TMS: react-day-picker v9), localizado em pt-BR. */
export function Calendar(props: DayPickerProps) {
  return (
    <div style={rdpTheme} className="text-sm text-base-content [&_.rdp-day_button:hover]:bg-base-200">
      <DayPicker locale={ptBR} showOutsideDays {...props} />
    </div>
  );
}

function fmt(d: Date) {
  return format(d, 'dd MMM', { locale: ptBR });
}
function fmtFull(d: Date) {
  return format(d, 'dd MMM yyyy', { locale: ptBR });
}

/**
 * Seletor de intervalo de datas no padrão do TMS: botão (ícone + rótulo + estado)
 * que abre um calendário de 2 meses em modo range. Controlado via `value`/`onChange`.
 */
export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Selecione um período',
  numberOfMonths = 2,
  className,
}: {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  numberOfMonths?: number;
  className?: string;
}) {
  const label = value?.from
    ? value.to
      ? `${fmt(value.from)} – ${fmtFull(value.to)}`
      : fmtFull(value.from)
    : placeholder;

  return (
    <Popover
      align="end"
      trigger={
        <button
          type="button"
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg border border-base-300 bg-[var(--surface)] px-3 text-sm font-medium text-base-content transition-colors hover:bg-base-200',
            !value?.from && 'text-base-content/50',
            className,
          )}
        >
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-base-content/40" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
            <path d="M3 9h18M8 2.5v4M16 2.5v4" strokeLinecap="round" />
          </svg>
          <span className="truncate">{label}</span>
        </button>
      }
    >
      <div className="p-2">
        <Calendar mode="range" numberOfMonths={numberOfMonths} selected={value} onSelect={onChange} />
      </div>
    </Popover>
  );
}
