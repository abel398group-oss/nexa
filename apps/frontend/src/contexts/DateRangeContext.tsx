import { createContext, useContext, useState, ReactNode } from 'react';

export interface DateRange {
  from: string; // YYYY-MM-DD ('' = sem início)
  to: string; // YYYY-MM-DD ('' = sem fim)
  label: string; // texto curto pro botão
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// período relativo (últimos N dias, incluindo hoje)
export function lastDays(days: number, label: string): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from: ymd(from), to: ymd(to), label };
}
export const ALL_TIME: DateRange = { from: '', to: '', label: 'Todo período' };

interface Ctx {
  range: DateRange;
  setRange: (r: DateRange) => void;
}
const DateRangeCtx = createContext<Ctx>({ range: ALL_TIME, setRange: () => {} });

export function DateRangeProvider({ children }: { children: ReactNode }) {
  // padrão: últimos 30 dias (como o TMS)
  const [range, setRange] = useState<DateRange>(() => lastDays(30, 'Últimos 30 dias'));
  return <DateRangeCtx.Provider value={{ range, setRange }}>{children}</DateRangeCtx.Provider>;
}

export const useDateRange = () => useContext(DateRangeCtx);
