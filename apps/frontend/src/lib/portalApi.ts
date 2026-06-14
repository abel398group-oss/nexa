import axios from 'axios';

/**
 * Client HTTP do PORTAL DO CLIENTE — isolado da auth interna.
 * baseURL `/api/portal`; `withCredentials` envia o cookie `portal_session`
 * (HttpOnly, escopo /api/portal). Sem os interceptors do client interno
 * (acting-tenant, refresh→/login) — a sessão do portal é independente.
 */
export const portalApi = axios.create({
  baseURL: '/api/portal',
  withCredentials: true,
});

export interface PortalMe {
  externalId: string;
  tenantId: string;
  name: string | null;
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
