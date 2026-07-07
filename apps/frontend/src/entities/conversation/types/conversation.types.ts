// Tipos do domínio "conversa" (FSD — entities/conversation).
// Superset usado tanto pelo Inbox (vendas/suporte) quanto por telas de leitura
// (ex.: Clientes de Suporte). Campos extras são opcionais.
export interface Conversation {
  id: string;
  phone: string;
  sourceChannel?: string | null;
  status: string;
  outcome?: string | null;
  lastActivityAt?: string | null;
  assignedSeller?: { name: string } | null;
  assignedSellerId?: string | null;
  customerStage?: string | null;
  ticketCategory?: string | null;
  ticketPriority?: string | null;
  rootCause?: string | null;
  contact?: { id?: string; name?: string | null; nameSource?: string | null; company?: string | null; tags?: string[] } | null;
  campaign?: { id: string; name: string } | null;
}

// Mensagem de uma conversa (timeline do Inbox).
export interface Message {
  id: string;
  direction: string;
  content: string;
  createdAt: string;
  ack?: number;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationListResult {
  items: Conversation[];
  total?: number;
}
