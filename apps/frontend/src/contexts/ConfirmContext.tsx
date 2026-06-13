import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, ButtonVariant } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/icons';

interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}
type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

const VARIANT: Record<'danger' | 'warning' | 'info', { icon: IconName; tone: string; btn: ButtonVariant }> = {
  danger: { icon: 'alert', tone: 'text-red-500', btn: 'destructive' },
  warning: { icon: 'bell', tone: 'text-amber-500', btn: 'primary' },
  info: { icon: 'help', tone: 'text-sky-500', btn: 'primary' },
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
            <Icon name={v.icon} className={`h-5 w-5 ${v.tone}`} />
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
