/**
 * Checagem de permissão da tela — uma função só, usada por rota, menu e aba.
 *
 * Antes cada lugar reimplementava `user.role === 'admin' || permissions.includes(x)`, e
 * os cockpits nasceram sem checagem nenhuma nas abas: sete permissões distintas
 * colapsaram numa só e quem tinha acesso a uma tela perdeu o caminho para ela.
 *
 * Isto é gate de INTERFACE — esconde o que a pessoa não pode usar. A trava de verdade é
 * o `@RequirePerm` de cada rota do backend; as duas precisam concordar, e é por isso que
 * a tabela abaixo espelha `apps/backend/src/shared/auth/perms.ts`.
 */

/**
 * Permissão antiga que ainda satisfaz uma nova, durante a transição.
 *
 * ESPELHA `PERM_LEGADA` em `apps/backend/src/shared/auth/perms.ts` — mudou lá, muda aqui.
 * Não vem do `GET /users/areas` porque o guard de rota precisa decidir de forma síncrona,
 * antes de qualquer requisição.
 */
const PERM_LEGADA: Record<string, string[]> = {
  sdr: ['telemarketing'],
  closer: ['telemarketing'],
  support: ['inbox'],
};

export interface UsuarioComPerms {
  role?: string;
  permissions?: string[];
}

/**
 * O usuário tem a permissão? Aceita uma lista, e aí a semântica é QUALQUER UMA —
 * é o caso da tela que agrupa abas de permissões diferentes: basta poder ver uma aba
 * para a tela fazer sentido.
 */
export function temPerm(user: UsuarioComPerms | null | undefined, perm: string | string[]): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true; // admin passa sempre, igual ao guard
  const concedidas = user.permissions ?? [];
  const exigidas = Array.isArray(perm) ? perm : [perm];
  return exigidas.some(
    (p) => concedidas.includes(p) || (PERM_LEGADA[p] ?? []).some((l) => concedidas.includes(l)),
  );
}
