import axios from 'axios';
import { getActingTenantId, setActingTenantId } from '@/shared/lib/actingTenant';
import { confirmDestructive } from '@/shared/lib/destructiveConfirm';

// withCredentials -> envia o cookie HttpOnly (auth) automaticamente
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Injeta o cliente ativo (platform admin) em cada request. O backend SO honra este
// header quando o usuario e admin da plataforma (User.tenantId === null).
// Tambem injeta X-Acting-Override quando o config foi marcado como break-glass (_override),
// pois o mergeConfig do Axios cria nova instancia de AxiosHeaders no retry e perderia o header
// setado diretamente no objeto original antes do retry.
api.interceptors.request.use((config) => {
  const acting = getActingTenantId();
  if (acting) {
    config.headers = config.headers ?? {};
    (config.headers as any)['X-Acting-Tenant-Id'] = acting;
  }
  if ((config as any)._override) {
    config.headers = config.headers ?? {};
    (config.headers as any)['X-Acting-Override'] = 'true';
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

    // Quebra de vidro: acao irreversivel bloqueada em modo cliente.
    // Primeira ocorrencia: abre modal de confirmacao e repete com _override=true.
    // O interceptor de REQUEST injeta X-Acting-Override quando config._override=true,
    // pois o mergeConfig do Axios perderia o header setado diretamente no objeto original.
    const isDestructiveBlocked =
      status === 403 && error.response?.data?.code === 'acting_destructive_blocked';

    if (isDestructiveBlocked && original && !original._override) {
      const msg =
        error.response?.data?.message ||
        'Esta acao e irreversivel e voce esta operando como cliente. Confirmar?';
      const ok = await confirmDestructive(msg);
      if (ok) {
        original._override = true;
        return api(original);
      }
      return Promise.reject(error);
    }

    // Retry com override ainda bloqueado -- troca o code para o caller exibir toast de erro.
    if (isDestructiveBlocked && original && original._override) {
      if (error.response) {
        error.response.data = { ...error.response.data, code: 'acting_override_failed' };
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
