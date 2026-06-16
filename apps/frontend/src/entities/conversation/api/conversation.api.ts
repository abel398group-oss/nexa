// Funções puras de acesso à API de conversas (FSD — sem React).
// Única camada que conhece os endpoints `/conversations`.
import { api } from '@/shared/lib/api';
import type { Conversation, Message, ConversationListResult } from '../types/conversation.types';

// Lista as conversas do tenant. Aceita um AbortSignal (cancela ao desmontar).
export async function listConversations(signal?: AbortSignal): Promise<ConversationListResult> {
  const r = await api.get('/conversations', { signal });
  return r.data;
}

export async function getConversationMessages(id: string): Promise<Message[]> {
  const r = await api.get(`/conversations/${id}/messages`);
  return r.data;
}

export async function sendMessage(id: string, content: string): Promise<void> {
  await api.post(`/conversations/${id}/messages`, { direction: 'outbound', content });
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

// Suporte: resolver (fecha) ou reabrir o chamado.
export async function setConversationResolved(
  id: string,
  resolved: boolean,
): Promise<Pick<Conversation, 'status' | 'outcome'>> {
  const r = await api.patch(`/conversations/${id}/resolve`, { resolved });
  return r.data;
}
