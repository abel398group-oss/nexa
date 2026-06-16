import axios from 'axios';

/**
 * Client HTTP do PORTAL DO CLIENTE — isolado da auth interna.
 * baseURL `/api/portal`; `withCredentials` envia o cookie `portal_session`
 * (HttpOnly, escopo /api/portal). Sem os interceptors do client interno
 * (acting-tenant, refresh→/login) — a sessão do portal é independente.
 */
export const portalApi = axios.create({
  baseURL: '/api/portal',
  withCredentials: true,
});

// Os tipos de domínio do ticket vivem em `@/entities/ticket` (FSD).
// Esta camada (shared) expõe só a instância HTTP isolada do portal.
