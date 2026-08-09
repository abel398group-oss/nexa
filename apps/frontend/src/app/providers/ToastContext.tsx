/**
 * ToastContext -- thin wrapper over `sonner` that keeps the existing
 * `useToast().success/error/info/warning` API intact across all pages.
 *
 * The actual <Toaster> renderer is placed once in App.tsx.
 * New code can also call `toast.*` from 'sonner' directly.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { toast } from 'sonner';

/**
 * Opções repassadas ao sonner. Opcional em todos os métodos — as chamadas
 * existentes (só a mensagem) continuam válidas. Serve para o caso de aviso
 * longo, que some antes de dar tempo de ler no tempo padrão.
 */
type ToastOpts = { duration?: number };

interface ToastApi {
  success: (msg: string, opts?: ToastOpts) => void;
  error:   (msg: string, opts?: ToastOpts) => void;
  info:    (msg: string, opts?: ToastOpts) => void;
  warning: (msg: string, opts?: ToastOpts) => void;
}

const ToastCtx = createContext<ToastApi>({
  success: () => {},
  error:   () => {},
  info:    () => {},
  warning: () => {},
});

const api: ToastApi = {
  success: (m, o) => toast.success(m, o),
  error:   (m, o) => toast.error(m, o),
  info:    (m, o) => toast.info(m, o),
  warning: (m, o) => toast.warning(m, o),
};

/** Keeps the provider wrapper so App.tsx tree structure stays the same. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <ToastCtx.Provider value={api}>{children}</ToastCtx.Provider>;
}

export const useToast = () => useContext(ToastCtx);
