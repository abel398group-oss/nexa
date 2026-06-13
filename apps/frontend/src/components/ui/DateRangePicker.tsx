import { useEffect, useRef, useState } from 'react';
import { useDateRange, lastDays, ALL_TIME, DateRange } from '@/contexts/DateRangeContext';
import { Icon } from '@/components/ui/icons';

// Seletor de período da topbar (como o calendário do TMS) — filtra o painel.
export function DateRangePicker() {
  const { range, setRange } = useDateRange();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const boxRef = useRef<HTMLDivElement>(null);

  // fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function applyPreset(r: DateRange) {
    setRange(r);
    setFrom(r.from);
    setTo(r.to);
    setOpen(false);
  }
  function applyCustom() {
    if (!from && !to) return applyPreset(ALL_TIME);
    const fmt = (s: string) => (s ? s.split('-').reverse().join('/') : '…');
    setRange({ from, to, label: `${fmt(from)} – ${fmt(to)}` });
    setOpen(false);
  }

  const presets = [
    { label: 'Hoje', r: lastDays(1, 'Hoje') },
    { label: 'Últimos 7 dias', r: lastDays(7, 'Últimos 7 dias') },
    { label: 'Últimos 30 dias', r: lastDays(30, 'Últimos 30 dias') },
    { label: 'Últimos 90 dias', r: lastDays(90, 'Últimos 90 dias') },
    { label: 'Todo período', r: ALL_TIME },
  ];

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Período dos indicadores"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-base-300 bg-white px-3 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-100"
      >
        <Icon name="calendar" className="h-4 w-4 text-base-content/50" />
        {range.label}
        <Icon name="chevronDown" className="h-3.5 w-3.5 text-base-content/40" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-base-200 bg-white p-2 shadow-elevated dark:bg-sidebar">
          <div className="space-y-0.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.r)}
                className={`block w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-base-100 ${
                  range.label === p.label ? 'bg-brand-600 text-white hover:bg-brand-600' : 'text-base-content'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-base-200 pt-2">
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-base-content/40">
              Período personalizado
            </div>
            <div className="flex items-center gap-1.5 px-1">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input flex-1 px-2 py-1 text-xs" />
              <span className="text-base-content/40">–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input flex-1 px-2 py-1 text-xs" />
            </div>
            <button onClick={applyCustom} className="btn-primary mt-2 w-full py-1.5 text-xs">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
