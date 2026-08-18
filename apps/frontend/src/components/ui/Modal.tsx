import { ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '@/shared/lib/cn';

// Shell de diálogo reutilizável: overlay + painel centralizado, fecha no Esc / clique fora.
// WCAG 2.1: role=dialog + aria-modal + aria-labelledby + focus trap + foco automático ao abrir.
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<ModalSize, string> = {
  sm: 'w-96 max-w-[92vw]',
  md: 'w-[32rem] max-w-[94vw]',
  lg: 'w-[44rem] max-w-[96vw]',
  xl: 'w-[60rem] max-w-[97vw]',
};

// Selectors de elementos focáveis para o focus trap.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * `onClose` guardado em ref para NÃO entrar nas dependências dos efeitos.
   *
   * Quase todo chamador passa uma arrow (`onClose={() => setAberto(false)}`), que é
   * uma referência NOVA a cada render do pai. Com ela nas dependências, todo render
   * refazia o efeito — e o efeito começa mandando o foco para o primeiro campo.
   *
   * O estrago aparecia ao digitar: cada tecla re-renderizava o formulário, o efeito
   * rodava de novo e o cursor pulava do campo para o primeiro elemento do diálogo.
   * Digitar o nome do mercado era impossível. Visto em 18/08/2026 na criação de
   * mercado, mas valia para todo diálogo do sistema.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Foco inicial: só ao ABRIR. Depender de qualquer outra coisa devolve o bug —
  // este efeito rouba o foco de quem estiver digitando toda vez que roda.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  // Esc fecha; Tab / Shift+Tab circulam dentro do diálogo.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCloseRef.current(); return; }

      const panel = panelRef.current;
      if (e.key === 'Tab' && panel) {
        // Lido a cada Tab, e não uma vez só: o conteúdo do diálogo muda enquanto ele
        // está aberto (campo que aparece, lista que carrega), e uma lista congelada na
        // montagem prenderia o Tab nos elementos que existiam no começo.
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) { e.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      {/* Overlay — aria-hidden para screen readers ignorarem o fundo */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative flex max-h-[92vh] flex-col rounded-xl border border-base-300 bg-[var(--surface-elevated)] shadow-elevated',
          SIZE[size],
          className,
        )}
      >
        {title && (
          <div
            id={titleId}
            className="flex-none border-b border-base-200 px-6 py-4 text-base font-semibold text-base-content"
          >
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
