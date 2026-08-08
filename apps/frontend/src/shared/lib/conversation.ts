// Classifica uma conversa como ticket de SUPORTE vs conversa de VENDA. Usada pelo
// Inbox de Vendas (exclui suporte) e pelo Inbox de Suporte (só suporte).
//
// A REGRA É O CANAL (decisão de produto, 08/08/2026):
//
//   chat do HiperTMS (widget) e portal  → SUPORTE
//   WhatsApp e e-mail                   → COMERCIAL
//
// Suporte é exclusivo do chat embutido e da abertura de chamado; no WhatsApp de
// marketing a Lia direciona quem pede suporte, não atende.
//
// Antes eram quatro condições, e três delas não olhavam o canal (`ticketCategory`,
// `customerStage = 'cliente_ativo'`, `status = 'escalated'`). Efeitos que existiam:
// cliente do TMS mandando WhatsApp era marcado `cliente_ativo` e a conversa saía da
// fila de vendas para a de suporte, no canal errado; e lead que pedia atendente
// humano virava `escalated` e era contado como chamado de suporte, sendo um lead
// quente.
//
// Espelho do backend: `apps/backend/src/application/conversations/conversation-track.ts`.
// **Mudou aqui, mude lá** — a lista é filtrada no servidor, a marcação na tela é aqui.
export interface TicketLike {
  status?: string | null;
  customerStage?: string | null;
  ticketCategory?: string | null;
  sourceChannel?: string | null;
}

/** Canais em que a Lia faz SUPORTE. Qualquer outro é comercial. */
export const SUPPORT_CHANNELS = ['portal', 'web_chat'] as const;

export function isSupportTicket(c: TicketLike): boolean {
  return c.sourceChannel === 'portal' || c.sourceChannel === 'web_chat';
}
