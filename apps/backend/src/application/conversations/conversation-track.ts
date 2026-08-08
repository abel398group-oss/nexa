/**
 * A que trilha uma conversa pertence — suporte ou vendas.
 *
 * Fonte única do critério, em duas formas: filtro para o Prisma e predicado para
 * decidir em memória. Antes existia só o filtro, privado dentro do
 * ConversationsService, e quem precisava do predicado não tinha de onde tirar.
 *
 * A heurística nasceu no frontend (`shared/lib/conversation.ts`) e a cópia de lá
 * ainda existe, porque a lista do Inbox é filtrada no servidor mas a marcação na
 * tela é feita no cliente. **As duas têm que andar juntas: mudou uma condição
 * aqui, mude lá.**
 */

/** Uma conversa é de suporte se bater em QUALQUER uma destas condições. */
export const SUPPORT_MATCH = [
  { ticketCategory: { not: null } },
  { customerStage: 'cliente_ativo' },
  { status: 'escalated' },
  { sourceChannel: { in: ['portal', 'web_chat'] } },
] as const;

/** Campos mínimos para classificar uma conversa. */
export interface TrackFields {
  ticketCategory?: string | null;
  customerStage?: string | null;
  status?: string | null;
  sourceChannel?: string | null;
}

/** Mesmas condições de SUPPORT_MATCH, avaliadas em memória. */
export function isSupportConversation(c: TrackFields): boolean {
  return (
    (c.ticketCategory ?? null) !== null ||
    c.customerStage === 'cliente_ativo' ||
    c.status === 'escalated' ||
    c.sourceChannel === 'portal' ||
    c.sourceChannel === 'web_chat'
  );
}

/**
 * Filtro Prisma para uma trilha. `sales` é o complemento exato de `support` — sem
 * sobreposição e sem lacuna, então toda conversa pertence a exatamente uma.
 */
export function trackWhere(track: 'support' | 'sales'): Record<string, unknown> {
  const or = [...SUPPORT_MATCH];
  return track === 'support' ? { OR: or } : { NOT: { OR: or } };
}
