import axios from 'axios';
import { getActingTenantId } from '@/lib/actingTenant';

// withCredentials -> envia o cookie HttpOnly (auth) automaticamente
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Injeta o cliente ativo (platform admin) em cada request. O backend SO honra este
// header quando o usuario e admin da plataforma (User.tenantId === null); para os
// demais ele e ignorado (regra de seguranca no servidor).
api.interceptors.request.use((config) => {
  const acting = getActingTenantId();
  if (acting) {
    config.headers = config.headers ?? {};
    (config.headers as any)['X-Acting-Tenant-Id'] = acting;
  }
  return config;
});

// ---- Auto-refresh do token no 401 (renova sozinho, sem deslogar) ----
let refreshing: Promise<void> | null = null;

function doRefresh(): Promise<void> {
  // garante uma unica chamada de refresh simultanea (fila)
  if (!refreshing) {
    refreshing = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then(() => undefined)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url: string = original?.url ?? '';

    // nao tenta renovar em rotas de auth nem se ja tentou
    const isAuthRoute =
      url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/me');
    if (status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        await doRefresh();
        return api(original); // repete a requisicao original com o token novo
      } catch {
        // refresh falhou -> sessao realmente expirada: manda pro login
        if (!location.pathname.startsWith('/login')) location.assign('/login');
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
