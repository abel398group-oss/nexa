/**
 * A que trilha uma conversa pertence — suporte ou vendas.
 *
 * A REGRA É O CANAL (decisão de produto, 08/08/2026):
 *
 *   chat do HiperTMS (widget) e portal  → SUPORTE
 *   WhatsApp e e-mail                   → COMERCIAL
 *
 * Suporte é exclusivo do chat embutido e da abertura de chamado; o WhatsApp é
 * canal de marketing e o cliente que pedir suporte por lá é direcionado, não
 * atendido. Ver SCRIPTS.suporteCanalComercial no ConversationAgent.
 *
 * Antes disto a trilha era uma heurística de quatro condições —
 * `ticketCategory != null` OU `customerStage = 'cliente_ativo'` OU
 * `status = 'escalated'` OU canal em (portal, web_chat) — e as três primeiras não
 * olhavam o canal. Consequências que existiam:
 *
 *   • cliente do TMS mandando WhatsApp era marcado `cliente_ativo` e a conversa
 *     saía da fila de vendas para a de suporte, no canal errado;
 *   • lead que pedia atendente humano virava `escalated` e era contado como
 *     chamado de suporte, sendo um lead quente.
 *
 * Verificado na base antes da troca: 7 conversas de WhatsApp, ZERO casavam na
 * heurística antiga — ou seja, a mudança não move nenhum chamado em andamento.
 * Os 3 chamados com analista atribuído são todos de `web_chat`.
 *
 * A cópia do frontend (`shared/lib/conversation.ts`) precisa dizer o mesmo: a
 * lista é filtrada no servidor mas a marcação na tela é feita no cliente.
 * **Mudou aqui, mude lá.**
 */

/** Canais em que a Lia faz SUPORTE. Qualquer outro é comercial. */
export const SUPPORT_CHANNELS = ['portal', 'web_chat'] as const;

/** Filtro Prisma da trilha de suporte. */
export const SUPPORT_MATCH = [{ sourceChannel: { in: [...SUPPORT_CHANNELS] } }] as const;

/** Campos mínimos para classificar uma conversa. */
export interface TrackFields {
  sourceChannel?: string | null;
}

/** Mesma condição de SUPPORT_MATCH, avaliada em memória. */
export function isSupportConversation(c: TrackFields): boolean {
  return SUPPORT_CHANNELS.includes(c.sourceChannel as (typeof SUPPORT_CHANNELS)[number]);
}

/** O canal admite atendimento de suporte pela Lia? */
export function isSupportChannel(sourceChannel?: string | null): boolean {
  return isSupportConversation({ sourceChannel });
}

/**
 * Filtro Prisma para uma trilha. `sales` é o complemento exato de `support` — sem
 * sobreposição e sem lacuna, então toda conversa pertence a exatamente uma.
 */
export function trackWhere(track: 'support' | 'sales'): Record<string, unknown> {
  const or = [...SUPPORT_MATCH];
  return track === 'support' ? { OR: or } : { NOT: { OR: or } };
}
