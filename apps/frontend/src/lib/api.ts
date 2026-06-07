import axios from 'axios';

// withCredentials → envia o cookie HttpOnly (auth) automaticamente
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// ---- Auto-refresh do token no 401 (renova sozinho, sem deslogar) ----
let refreshing: Promise<void> | null = null;

function doRefresh(): Promise<void> {
  // garante uma única chamada de refresh simultânea (fila)
  if (!refreshing) {
    refreshing = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then(() => undefined)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url: string = original?.url ?? '';

    // não tenta renovar em rotas de auth nem se já tentou
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/me');
    if (status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        await doRefresh();
        return api(original); // repete a requisição original com o token novo
      } catch {
        // refresh falhou → sessão realmente expirada: manda pro login
        if (!location.pathname.startsWith('/login')) location.assign('/login');
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
