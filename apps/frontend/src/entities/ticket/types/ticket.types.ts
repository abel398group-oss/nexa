// Tipos do domínio "ticket de suporte" no portal do cliente (FSD — entities/ticket).
export interface PortalMe {
  externalId: string;
  tenantId: string;
  name: string | null;
  phone: string | null; // telefone do cadastro (prefill do form de abrir chamado)
  contract: { plan?: string; status?: string; [k: string]: unknown } | null;
}

export interface PortalTicketSummary {
  id: string;
  status: string;
  ticketCategory: string | null;
  ticketPriority: string | null;
  rootCause: string | null;
  sourceChannel: string;
  createdAt: string;
  lastActivityAt: string | null;
  resolvedAt: string | null;
  outcome: string | null;
}

export interface PortalTicketMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  intent: string | null;
  ack: number | null;
  createdAt: string;
}

export interface PortalTicketDetail extends PortalTicketSummary {
  autoCloseAt: string | null;
  messages: PortalTicketMessage[];
}

// Dados de abertura de chamado (form do portal).
export interface OpenTicketInput {
  subject: string;
  message: string;
  category?: string;
  phone?: string;
}

export interface PortalTicketList {
  items: PortalTicketSummary[];
  total: number;
}
