/**
 * ToastContext -- thin wrapper over `sonner` that keeps the existing
 * `useToast().success/error/info/warning` API intact across all pages.
 *
 * The actual <Toaster> renderer is placed once in App.tsx.
 * New code can also call `toast.*` from 'sonner' directly.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { toast } from 'sonner';

interface ToastApi {
  success: (msg: string) => void;
  error:   (msg: string) => void;
  info:    (msg: string) => void;
  warning: (msg: string) => void;
}

const ToastCtx = createContext<ToastApi>({
  success: () => {},
  error:   () => {},
  info:    () => {},
  warning: () => {},
});

const api: ToastApi = {
  success: (m) => toast.success(m),
  error:   (m) => toast.error(m),
  info:    (m) => toast.info(m),
  warning: (m) => toast.warning(m),
};

/** Keeps the provider wrapper so App.tsx tree structure stays the same. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <ToastCtx.Provider value={api}>{children}</ToastCtx.Provider>;
}

export const useToast = () => useContext(ToastCtx);
