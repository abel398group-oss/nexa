// Funções puras de acesso à API de conversas (FSD — sem React).
// Única camada que conhece os endpoints `/conversations`.
import { api } from '@/shared/lib/api';
import type { Conversation, Message, ConversationListResult, AnalystMini } from '../types/conversation.types';

// Etapa 2B: filtros da lista agora são do SERVIDOR. Antes isto buscava as 50
// conversas mais recentes (vendas + suporte misturadas) e o Inbox filtrava o
// que tinha em mãos — um pico de vendas empurrava chamado de suporte pra fora
// da página e ele sumia da fila sem ninguém perceber.
export interface ListConversationsParams {
  scope?: 'support' | 'sales';
  queue?: 'all' | 'mine' | 'unassigned' | 'waiting_internal';
  status?: string;
  sellerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listConversations(
  params: ListConversationsParams = {},
  signal?: AbortSignal,
): Promise<ConversationListResult> {
  const r = await api.get('/conversations', {
    signal,
    params: {
      scope: params.scope || undefined,
      // 'all' é o default do backend — não precisa viajar na query.
      queue: params.queue && params.queue !== 'all' ? params.queue : undefined,
      status: params.status && params.status !== 'all' ? params.status : undefined,
      sellerId: params.sellerId || undefined,
      search: params.search?.trim() || undefined,
      limit: params.limit ?? 50,
      offset: params.offset || undefined,
    },
  });
  return r.data;
}

/** Etapa 2B: contagens do painel operacional — do banco inteiro, não da página. */
export interface SupportStats {
  escaladosSemDono: number;
  emAtendimento: number;
  aguardandoDev: number;
  semDono: number;
  meus: number;
  maisAntigosSemDono: Conversation[];
}

export async function getSupportStats(signal?: AbortSignal): Promise<SupportStats> {
  const r = await api.get('/conversations/stats', { signal });
  return r.data;
}

/**
 * Uma conversa pelo id, sem passar pela listagem.
 *
 * Serve para abrir um chamado que NÃO está na página carregada — o histórico de
 * chamados do contato aponta para tickets antigos, que por definição não estão
 * entre os mais recentes. Devolve a linha crua (sem o `contact`, que a listagem
 * junta por telefone); quem chama completa com o contato que já tem em mãos.
 */
export async function getConversation(id: string): Promise<Conversation> {
  const r = await api.get(`/conversations/${id}`);
  return r.data;
}

export async function getConversationMessages(id: string): Promise<Message[]> {
  const r = await api.get(`/conversations/${id}/messages`);
  return r.data;
}

// Etapa 2A: editar/excluir NOTA INTERNA. O backend só aceita mensagem com
// isInternal=true, e só do autor (ou de um admin) — resposta já enviada ao
// cliente nunca pode ser reescrita por aqui.
export async function updateInternalNote(messageId: string, content: string): Promise<Message> {
  const r = await api.patch(`/conversations/messages/${messageId}`, { content });
  return r.data;
}

export async function deleteInternalNote(messageId: string): Promise<{ id: string; deleted: boolean }> {
  const r = await api.delete(`/conversations/messages/${messageId}`);
  return r.data;
}

export async function sendMessage(id: string, content: string, isInternal = false): Promise<void> {
  await api.post(`/conversations/${id}/messages`, {
    direction: 'outbound',
    content,
    metadata: { senderType: 'human' },
    isInternal,
  });
}

// ADR 035: "Devolver pra Lia" — libera o takeover humano; a Lia volta a atender.
export async function returnConversationToAi(
  id: string,
): Promise<{ id: string; humanTakeoverAt: null; status: string }> {
  const r = await api.post(`/conversations/${id}/return-to-ai`);
  return r.data;
}

// Vendas: marcar o resultado do lead (ganho/perdido) ou limpar.
export async function setConversationOutcome(
  id: string,
  outcome: 'won' | 'lost' | null,
): Promise<Pick<Conversation, 'outcome'>> {
  const r = await api.patch(`/conversations/${id}/outcome`, { outcome });
  return r.data;
}

// Vendas: (re)atribuir o lead a um vendedor (ou desatribuir com null).
export async function assignSeller(
  id: string,
  sellerId: string | null,
): Promise<Pick<Conversation, 'assignedSeller' | 'assignedSellerId'>> {
  const r = await api.patch(`/conversations/${id}/assign`, { sellerId });
  return r.data;
}

// Suporte: (re)atribuir o chamado a um analista humano (ou desatribuir com null).
// Não confundir com assignSeller acima — aquele é o lado comercial.
// `expectedAnalystId` liga a trava de concorrência do backend: mande o dono que
// a TELA está mostrando (null = "está na fila geral"). Se o banco discordar, vem
// 409 com o nome de quem assumiu antes, em vez de sobrescrever em silêncio.
// Omita em transferência deliberada pelo seletor.
export async function assignAnalyst(
  id: string,
  userId: string | null,
  opts: { expectedAnalystId?: string | null } = {},
): Promise<Pick<Conversation, 'assignedAnalyst' | 'assignedAnalystId'>> {
  const r = await api.patch(`/conversations/${id}/assign-analyst`, {
    userId,
    ...(opts.expectedAnalystId !== undefined ? { expectedAnalystId: opts.expectedAnalystId } : {}),
  });
  return r.data;
}

// Lista enxuta de analistas do tenant, pro seletor de atribuição do Inbox.
export async function listAnalystsMini(): Promise<AnalystMini[]> {
  const r = await api.get('/conversations/analysts');
  return r.data;
}

// Vincula (ou remove, url=null) o link da issue de dev (Jira/GitHub/ClickUp/
// Trello) — o backend move o chamado pra waiting_internal quando vincula.
export async function setLinkedIssue(
  id: string,
  url: string | null,
): Promise<Pick<Conversation, 'linkedIssueUrl'> & { status: string }> {
  const r = await api.patch(`/conversations/${id}/linked-issue`, { url });
  return r.data;
}

// Suporte: resolver (fecha) ou reabrir o chamado.
export async function setConversationResolved(
  id: string,
  resolved: boolean,
): Promise<Pick<Conversation, 'status' | 'outcome'>> {
  const r = await api.patch(`/conversations/${id}/resolve`, { resolved });
  return r.data;
}

// Arquiva uma conversa (soft close — some da lista, mas permanece no banco).
export async function archiveConversation(id: string): Promise<{ id: string; archived: boolean }> {
  const r = await api.patch(`/conversations/${id}/archive`);
  return r.data;
}

// Exclui permanentemente uma conversa e todas as suas mensagens.
export async function deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
  const r = await api.delete(`/conversations/${id}`);
  return r.data;
}

// Ação em lote: arquivar ou excluir múltiplas conversas.
export async function bulkConversationAction(
  ids: string[],
  action: 'archive' | 'delete',
): Promise<{ archived?: number; deleted?: number }> {
  const r = await api.post('/conversations/bulk-action', { ids, action });
  return r.data;
}
