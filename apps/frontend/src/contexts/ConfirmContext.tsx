import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, ButtonVariant } from '@/components/ui/Button';

interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}
type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

const VARIANT: Record<'danger' | 'warning' | 'info', { icon: string; btn: ButtonVariant }> = {
  danger: { icon: '⚠️', btn: 'destructive' },
  warning: { icon: '🔔', btn: 'primary' },
  info: { icon: 'ℹ️', btn: 'primary' },
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState(opts);
      }),
    [],
  );

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  }, []);

  const v = VARIANT[state?.variant ?? 'danger'];

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <span className="text-xl">{v.icon}</span>
            {state?.title ?? 'Confirmar ação'}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {state?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant={v.btn} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-base-content/70">{state?.message}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
