/**
 * DropdownMenu — menu de ações posicionado via portal.
 * Fecha no Esc / clique fora / Tab. Keyboard: ArrowUp / ArrowDown / Enter.
 * Sem dependência externa (igual ao HiperTMS shared/ui/dropdown-menu.tsx).
 *
 * Uso:
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild>
 *       <Button variant="ghost">Ações</Button>
 *     </DropdownMenuTrigger>
 *     <DropdownMenuContent>
 *       <DropdownMenuItem onSelect={() => {}}>Editar</DropdownMenuItem>
 *       <DropdownMenuSeparator />
 *       <DropdownMenuItem onSelect={() => {}} destructive>Excluir</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */
type DropdownCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
};
const DropdownContext = React.createContext<DropdownCtx | null>(null);

function useCtx() {
  const ctx = React.useContext(DropdownContext);
  if (!ctx) throw new Error('DropdownMenu: use dentro de <DropdownMenu>.');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Root                                                                 */
/* ------------------------------------------------------------------ */
export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        queueMicrotask(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current?.contains(t)) return;
      if (contentRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerRef, contentRef }}>
      {children}
    </DropdownContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Trigger                                                              */
/* ------------------------------------------------------------------ */
export function DropdownMenuTrigger({
  children,
  asChild = false,
}: {
  children: React.ReactElement;
  asChild?: boolean;
}) {
  const { open, setOpen, triggerRef } = useCtx();

  const handleRef = (el: HTMLElement | null) => {
    triggerRef.current = el;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(!open);
  };

  if (asChild) {
    return React.cloneElement(children, {
      ref: handleRef,
      onClick: handleClick,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
    } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <button
      ref={handleRef as React.Ref<HTMLButtonElement>}
      onClick={handleClick}
      aria-haspopup="menu"
      aria-expanded={open}
      type="button"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Content (portal, posicionamento automático)                          */
/* ------------------------------------------------------------------ */
export function DropdownMenuContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const { open, setOpen, triggerRef, contentRef } = useCtx();
  const [pos, setPos] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    setPos({
      top: (rect.bottom + window.scrollY + 4) / zoom,
      left:
        align === 'end'
          ? (rect.right + window.scrollX) / zoom
          : (rect.left + window.scrollX) / zoom,
    });
  }, [open, align]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={contentRef}
      role="menu"
      onKeyDown={handleKeyDown}
      className={cn(
        'fixed z-[200] min-w-[10rem] overflow-hidden rounded-lg border border-base-300',
        'bg-[var(--surface-elevated)] py-1 shadow-[var(--shadow-elevated)]',
        'animate-[fadeIn_.12s_ease-out]',
        className,
      )}
      style={{
        top: pos.top,
        ...(align === 'end'
          ? { right: `calc(100vw - ${pos.left}px)` }
          : { left: pos.left }),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Item                                                                 */
/* ------------------------------------------------------------------ */
export function DropdownMenuItem({
  children,
  onSelect,
  destructive = false,
  disabled = false,
  className,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { setOpen } = useCtx();

  const handle = () => {
    if (disabled) return;
    setOpen(false);
    onSelect?.();
  };

  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={handle}
      onKeyDown={(e) => e.key === 'Enter' && handle()}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none',
        'transition-colors focus:bg-base-200 hover:bg-base-200',
        destructive
          ? 'text-red-600 focus:bg-red-50 hover:bg-red-50'
          : 'text-base-content',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Separator                                                            */
/* ------------------------------------------------------------------ */
export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn('my-1 border-t border-base-200', className)} />;
}
