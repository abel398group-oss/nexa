import { ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

// Popover leve: clique no gatilho abre/fecha; clique fora ou Esc fecha. Sem dependências.
export type PopoverAlign = 'start' | 'center' | 'end';

const ALIGN: Record<PopoverAlign, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

export function Popover({
  trigger,
  align = 'start',
  className,
  children,
}: {
  /** Elemento que abre o popover ao ser clicado. */
  trigger: ReactNode;
  align?: PopoverAlign;
  className?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative inline-flex">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute top-full z-50 mt-1.5 min-w-[12rem] rounded-lg border border-base-300 bg-[var(--surface-elevated)] p-1 shadow-elevated',
            ALIGN[align],
            className,
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
