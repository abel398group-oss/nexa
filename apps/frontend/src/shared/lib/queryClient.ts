import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient único do app (E8 — fatia 1: React Query).
 * Defaults conservadores: sem refetch automático no foco (evita rajadas de
 * request), 1 retry, e dados considerados "frescos" por 5s. Telas que precisam
 * de tempo real definem `refetchInterval` na própria query.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5_000,
    },
  },
});
