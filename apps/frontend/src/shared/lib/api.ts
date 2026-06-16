import axios from 'axios';
import { getActingTenantId, setActingTenantId } from '@/lib/actingTenant';
import { confirmDestructive } from '@/lib/destructiveConfirm';

// withCredentials -> envia o cookie HttpOnly (auth) automaticamente
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Injeta o cliente ativo (platform admin) em cada request. O backend SO honra este
// header quando o usuario e admin da plataforma (User.tenantId === null).
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

    // Auto-cura: cliente (tenant) ativo ficou defasado/inativo -> o header enviado
    // aponta pra um cliente que o backend nao reconhece (403 "Cliente (tenant)...").
    // Limpa o cliente salvo e recarrega: cai na tela "Selecione um cliente".
    if (
      status === 403 &&
      getActingTenantId() &&
      typeof error.response?.data?.message === 'string' &&
      error.response.data.message.includes('Cliente (tenant)')
    ) {
      setActingTenantId(null); // some o header nas proximas requisicoes -> sem loop
      window.location.reload();
      return Promise.reject(error);
    }

    // Quebra de vidro: acao irreversivel bloqueada em modo cliente. Confirma e repete
    // a MESMA requisicao com o header de override.
    if (
      status === 403 &&
      error.response?.data?.code === 'acting_destructive_blocked' &&
      original &&
      !original._override
    ) {
      const msg =
        error.response?.data?.message ||
        'Esta acao e irreversivel e voce esta operando como cliente. Confirmar?';
      const ok = await confirmDestructive(msg);
      if (ok) {
        original._override = true;
        original.headers = original.headers ?? {};
        original.headers['X-Acting-Override'] = 'true';
        return api(original);
      }
      return Promise.reject(error);
    }

    // nao tenta renovar em rotas de auth nem se ja tentou
    const isAuthRoute =
      url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/me');
    if (status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        await doRefresh();
        return api(original);
      } catch {
        if (!location.pathname.startsWith('/login')) location.assign('/login');
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
