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
  /** F10: resumo de 3 linhas ([Problema Relatado]/[Ações Tentadas]/[Causa do Transbordo]) gerado no momento da escalação. */
  escalationSummary?: string | null;
  contact?: { id?: string; name?: string | null; nameSource?: string | null; company?: string | null; tags?: string[] } | null;
  campaign?: { id: string; name: string } | null;
  /** ADR 035: humano assumiu — Lia em modo rascunho até devolver/fechar. */
  humanTakeoverAt?: string | null;
  /** F12: dono humano do chamado de SUPORTE — não confundir com assignedSeller (comercial). */
  assignedAnalyst?: { id: string; name: string | null } | null;
  assignedAnalystId?: string | null;
  /** F13: link da issue de dev (Jira/GitHub/ClickUp/Trello) vinculada manualmente ao chamado. */
  linkedIssueUrl?: string | null;
}

// Mensagem de uma conversa (timeline do Inbox).
export interface Message {
  id: string;
  direction: string;
  content: string;
  createdAt: string;
  ack?: number;
  metadata?: Record<string, unknown> | null;
  /** F12: nota interna — visível só pra equipe, nunca chega ao cliente. */
  isInternal?: boolean;
}

/** F12: analista pro seletor de atribuição (GET /conversations/analysts). */
export interface AnalystMini {
  id: string;
  name: string | null;
}

export interface ConversationListResult {
  items: Conversation[];
  total?: number;
}
