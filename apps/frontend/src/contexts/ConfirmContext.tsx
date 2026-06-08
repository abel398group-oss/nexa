import { createContext, useContext, useRef, useState, useCallback, useEffect, ReactNode } from 'react';

interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}
type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

const VARIANT = {
  danger: { icon: '⚠️', btn: 'bg-red-600 hover:bg-red-700' },
  warning: { icon: '🔔', btn: 'bg-amber-500 hover:bg-amber-600' },
  info: { icon: 'ℹ️', btn: 'bg-brand-600 hover:bg-brand-700' },
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

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, close]);

  const v = VARIANT[state?.variant ?? 'danger'];

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
          <div className="relative w-96 max-w-[92vw] rounded-xl bg-white p-6 shadow-elevated dark:bg-sidebar">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-2xl">{v.icon}</span>
              <h2 className="text-base font-semibold text-base-content">{state.title ?? 'Confirmar ação'}</h2>
            </div>
            <p className="mb-5 text-sm text-base-content/70">{state.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => close(false)}
                className="rounded-lg px-4 py-2 text-sm text-base-content/60 hover:bg-base-200"
              >
                {state.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${v.btn}`}
              >
                {state.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
