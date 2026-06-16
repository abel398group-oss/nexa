import { ReactNode, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';

// Shell de diálogo reutilizável: overlay + painel centralizado, fecha no Esc / clique fora.
export type ModalSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ModalSize, string> = {
  sm: 'w-96 max-w-[92vw]',
  md: 'w-[32rem] max-w-[94vw]',
  lg: 'w-[44rem] max-w-[96vw]',
};

export function Modal({
  open,
  onClose,
  title,
  footer,
  size = 'md',
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  className?: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[92vh] flex-col rounded-xl border border-base-300 bg-[var(--surface-elevated)] shadow-elevated',
          SIZE[size],
          className,
        )}
      >
        {title && (
          <div className="flex-none border-b border-base-200 px-6 py-4 text-base font-semibold text-base-content">
            {title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-none justify-end gap-2 border-t border-base-200 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
