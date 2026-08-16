/**
 * perms.ts — catálogo único de permissões (16/08/2026).
 *
 * Antes existiam DUAS listas mantidas à mão: `AREAS` em `application/users/users.service.ts`
 * e `ALL_AREAS` em `UsersPage.tsx`. As duas estavam desatualizadas em relação aos
 * `@RequirePerm` reais, e como `AREAS` é um FILTRO — o create/update do usuário descarta
 * em silêncio o que não estiver nela — três permissões exigidas por rota (`settings`,
 * `webhooks:manage`, `admin`) tinham virado admin-only por acidente: nenhuma tela
 * conseguia concedê-las.
 *
 * Este arquivo mora em `shared/auth` e não em `application/users` porque
 * `shared/auth/permissions.guard.ts` precisa importá-lo, e `shared` não pode depender de
 * `application` sem inverter a camada.
 */

/**
 * TODA permissão válida num `@RequirePerm`. Incluir aqui é o que faz o decorator compilar.
 *
 * `dashboard` e `inbox` não têm `@RequirePerm` no backend hoje (são gate só de tela), mas
 * continuam aqui porque são concedidas e lidas pelo frontend.
 */
export const PERMS = [
  'dashboard',
  'inbox',
  'contacts',
  'knowledge',
  'sellers',
  'campaigns',
  'opportunities',
  'metrics',
  'ai_control',
  'users',
  'partners',
  'lead_batches',
  // Exigidas por rota e ausentes da lista antiga — eram inconcedíveis por qualquer tela.
  'settings', // configurar mercado e escrever o roteiro do SDR
  'webhooks:manage',
  // Prospecção ativa. `telemarketing` — a permissão única que dava as duas mesas — foi
  // removida em 16/08/2026, depois de o backfill confirmar que nenhum usuário dependia
  // dela (`count(*) FILTER (WHERE 'telemarketing' = ANY(permissions))` = 0).
  'sdr',
  'closer',
  'support',
  // Bypass total do guard. Fica FORA de `GRANTABLE_PERMS` de propósito — ver abaixo.
  'admin',
] as const;

export type Perm = (typeof PERMS)[number];

/**
 * Permissões que a tela de Usuários oferece.
 *
 * `admin` fica de fora deliberadamente: no guard ela não é "mais uma área", é bypass de
 * tudo (`permissions.guard.ts`). Conceder isso num checkbox ao lado de "Contatos" faria
 * parecer equivalente ao que não é. Quem precisa de tudo recebe `role: 'admin'`.
 */
export const GRANTABLE_PERMS: readonly Perm[] = PERMS.filter((p) => p !== 'admin');

/**
 * Permissão legada que ainda satisfaz uma nova, durante a transição.
 *
 * A ponte `telemarketing → sdr/closer` saiu em 16/08/2026: o backfill mostrou zero
 * usuários com a permissão antiga, então ela não carregava ninguém. Ponte que sobrevive
 * ao motivo vira regra invisível — quem ler o guard daqui a um ano não saberia por que
 * uma permissão que não existe mais ainda abre duas telas.
 *
 * `inbox → support` continua: os dois vendedores do tenant têm `inbox` e passariam a
 * perder as telas de atendimento sem ela. Sai quando o admin decidir que vendedor não vê
 * suporte — é decisão de operação, não de código.
 */
export const PERM_LEGADA: Partial<Record<Perm, Perm[]>> = {
  support: ['inbox'],
};

/** Rótulo e agrupamento para a tela de Usuários. Servido por `GET /users/areas`. */
export interface PermCatalogItem {
  id: Perm;
  label: string;
  group: string;
  /** Substituída por outra: a tela deixa remover, nunca conceder de novo. */
  legacy?: boolean;
}

export const PERM_CATALOG: readonly PermCatalogItem[] = [
  { id: 'dashboard', label: 'Painel', group: 'Geral' },
  { id: 'inbox', label: 'Inbox', group: 'Geral' },
  { id: 'contacts', label: 'Contatos', group: 'Geral' },
  { id: 'knowledge', label: 'Base de conhecimento', group: 'Geral' },
  { id: 'metrics', label: 'Relatórios', group: 'Geral' },

  { id: 'campaigns', label: 'Disparo', group: 'Vendas' },
  { id: 'opportunities', label: 'Oportunidades', group: 'Vendas' },
  { id: 'sellers', label: 'Vendedores', group: 'Vendas' },
  { id: 'partners', label: 'Parceiros', group: 'Vendas' },
  { id: 'lead_batches', label: 'Listas de lead', group: 'Vendas' },

  { id: 'sdr', label: 'Mesa do SDR', group: 'Prospecção' },
  { id: 'closer', label: 'Painel do closer', group: 'Prospecção' },

  { id: 'support', label: 'Atendimento', group: 'Suporte' },

  { id: 'ai_control', label: 'Controle da Lia', group: 'Configuração' },
  { id: 'settings', label: 'Configurar mercado e roteiro', group: 'Configuração' },
  { id: 'users', label: 'Usuários e acessos', group: 'Configuração' },
  { id: 'webhooks:manage', label: 'Webhooks', group: 'Configuração' },
];

/**
 * A permissão exigida está satisfeita por esta lista?
 *
 * Uma função só, usada pelo guard — e espelhada no frontend a partir do catálogo servido
 * pela API, para as duas metades não divergirem.
 */
export function satisfazPerm(concedidas: readonly string[], exigida: string): boolean {
  if (concedidas.includes(exigida)) return true;
  const legadas = PERM_LEGADA[exigida as Perm];
  return !!legadas?.some((l) => concedidas.includes(l));
}
