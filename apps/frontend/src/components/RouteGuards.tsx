import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/** Tela de carregamento padrão enquanto o auth resolve. */
function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center text-base-content/40">Carregando...</div>
  );
}

/**
 * RootRedirect — destino da raiz "/" no MODO INTERNO (sem landing de venda).
 * Enquanto o `/auth/me` resolve, mostra loading; autenticado → /inbox (app);
 * não autenticado → /login. A LandingPage segue no código (rota /landing) para
 * reativação fácil quando formos vender — basta trocar "/" de volta no App.tsx.
 */
export function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoading />;
  return <Navigate to={user ? '/inbox' : '/login'} replace />;
}

/**
 * ProtectedRoute — exige usuário autenticado. Enquanto o `/auth/me` resolve,
 * mostra loading; sem usuário, redireciona para /login.
 */
export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoading />;
  return user ? children : <Navigate to="/login" replace />;
}

/**
 * PermissionRoute — exige uma permissão específica (admin passa sempre).
 * Deve ficar DENTRO de uma ProtectedRoute (assume usuário já carregado).
 * Sem a permissão, redireciona para o `fallback` (padrão /inbox).
 */
export function PermissionRoute({
  perm,
  children,
  fallback = '/inbox',
}: {
  perm: string;
  children: ReactElement;
  fallback?: string;
}) {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoading />;
  if (!user) return <Navigate to="/login" replace />;
  const allowed = user.role === 'admin' || (user.permissions ?? []).includes(perm);
  return allowed ? children : <Navigate to={fallback} replace />;
}
