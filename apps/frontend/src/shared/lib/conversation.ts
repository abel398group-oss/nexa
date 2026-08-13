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
import { displayPhone, isPhoneLike } from './phone';

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

// ─── Identidade visível do contato ───────────────────────────────────────────

const CANAL_LABEL: Record<string, string> = {
  web_chat: 'Web chat (TMS)',
  portal: 'Portal do cliente',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
};

/**
 * O que escrever no lugar onde o operador espera "o telefone do contato".
 *
 * A coluna `phone` da conversa guarda três coisas diferentes: o número no
 * WhatsApp, `email:<endereço>` no canal de e-mail, e o UUID da sessão no web
 * chat e no portal — que são justamente os canais de SUPORTE, onde telefone não
 * existe.
 *
 * Isto ia direto pro `displayPhone`, que arrancava os dígitos do UUID e
 * imprimia "988354311937846295" embaixo do nome de um cliente real: 18 dígitos
 * com cara de telefone, que ninguém disca nem procura. Achado em 13/08/2026 na
 * tela de Clientes.
 *
 * Devolve string vazia quando não há nada verdadeiro a dizer — cabe à tela
 * decidir se some com a linha ou mostra um traço.
 */
export function identidadeVisivel(
  phone: string | null | undefined,
  sourceChannel?: string | null,
): string {
  if (phone?.startsWith('email:')) return displayPhone(phone);
  if (isPhoneLike(phone)) return displayPhone(phone);
  return sourceChannel ? CANAL_LABEL[sourceChannel] ?? sourceChannel : '';
}
