import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icons';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; message: string }

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}
const ToastCtx = createContext<ToastApi>({ success: () => {}, error: () => {}, info: () => {} });

let counter = 0;
const STYLE: Record<ToastType, { bg: string; icon: IconName }> = {
  success: { bg: 'border-emerald-500 bg-emerald-50 text-emerald-800', icon: 'check' },
  error: { bg: 'border-red-500 bg-red-50 text-red-800', icon: 'close' },
  info: { bg: 'border-sky-500 bg-sky-50 text-sky-800', icon: 'help' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, type, message }]);
      setTimeout(() => remove(id), 3800);
    },
    [remove],
  );

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* container */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 max-w-[90vw] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`pointer-events-auto flex cursor-pointer items-start gap-2 rounded-lg border-l-4 px-4 py-3 text-sm shadow-lg animate-[slideInRight_.2s_ease-out] ${STYLE[t.type].bg}`}
          >
            <Icon name={STYLE[t.type].icon} className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
