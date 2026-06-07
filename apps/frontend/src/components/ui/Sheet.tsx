import { ReactNode, useEffect } from 'react';

// Drawer lateral (Sheet) — painel que desliza da borda. Sem libs externas (inspirado no TMS).
export function Sheet({
  open,
  onClose,
  title,
  side = 'right',
  width = 'w-[420px]',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: 'right' | 'left';
  width?: string;
  children: ReactNode;
}) {
  // fecha no ESC + trava o scroll do body enquanto aberto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const sideClasses =
    side === 'right'
      ? 'right-0 border-l animate-[slideInRight_.2s_ease-out]'
      : 'left-0 border-r animate-[slideInLeft_.2s_ease-out]';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`absolute top-0 bottom-0 ${sideClasses} ${width} max-w-[90vw] flex flex-col border-base-200 bg-white shadow-elevated dark:bg-sidebar`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-base-200 px-5">
          <h2 className="text-sm font-semibold text-base-content">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-base-content/60 transition-colors hover:bg-base-200"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
