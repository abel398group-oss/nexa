import type { ReactElement } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthContext';

/** Tela de carregamento padrão enquanto o auth resolve. */
function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center text-base-content/40">Carregando...</div>
  );
}

/**
 * Tela de "não consegui falar com o servidor".
 *
 * Existe para NÃO mandar ninguém ao /login por causa de um soluço de rede. A
 * sessão continua válida; o que faltou foi a resposta. Mandar para o login
 * perderia o lugar onde a pessoa estava e não resolveria nada — no /login ela
 * também não conseguiria falar com o servidor.
 *
 * O `retry` automático já roda no AuthProvider (1s, 2s, 4s, 8s, depois 15s em
 * 15s). O botão está aqui porque esperar sem poder fazer nada é pior que
 * esperar podendo tentar. E o link para o /login é a saída: sem ele, quem
 * REALMENTE quisesse trocar de conta ficaria preso nesta tela.
 */
function RouteOffline({ retry }: { retry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-base-content">Sem conexão com o servidor</p>
      <p className="max-w-sm text-xs text-base-content/50">
        Você continua logado — só não estamos conseguindo falar com o servidor agora.
        Tentando de novo sozinho.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={retry}
          className="rounded-md border border-base-300 px-3 py-1.5 text-xs font-medium text-base-content transition-colors hover:bg-base-200"
        >
          Tentar agora
        </button>
        <Link to="/login" className="text-xs text-base-content/40 underline hover:text-base-content/70">
          Ir para o login
        </Link>
      </div>
    </div>
  );
}

/**
 * RootRedirect — destino da raiz "/" no MODO INTERNO (sem landing de venda).
 * Enquanto o `/auth/me` resolve, mostra loading; autenticado → /inbox (app);
 * não autenticado → /login. A LandingPage segue no código (rota /landing) para
 * reativação fácil quando formos vender — basta trocar "/" de volta no App.tsx.
 */
export function RootRedirect() {
  const { user, loading, unreachable, retry } = useAuth();
  if (loading) return <RouteLoading />;
  if (unreachable && !user) return <RouteOffline retry={retry} />;
  return <Navigate to={user ? '/inbox' : '/login'} replace />;
}

/**
 * ProtectedRoute — exige usuário autenticado. Enquanto o `/auth/me` resolve,
 * mostra loading; sem usuário, redireciona para /login.
 *
 * `unreachable` vem ANTES da decisão de redirecionar: servidor inacessível não
 * é o mesmo que sessão inválida, e só o segundo justifica mandar ao login.
 */
export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading, unreachable, retry } = useAuth();
  if (loading) return <RouteLoading />;
  if (user) return children;
  if (unreachable) return <RouteOffline retry={retry} />;
  return <Navigate to="/login" replace />;
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
  const { user, loading, unreachable, retry } = useAuth();
  if (loading) return <RouteLoading />;
  if (!user) {
    if (unreachable) return <RouteOffline retry={retry} />;
    return <Navigate to="/login" replace />;
  }
  const allowed = user.role === 'admin' || (user.permissions ?? []).includes(perm);
  return allowed ? children : <Navigate to={fallback} replace />;
}
