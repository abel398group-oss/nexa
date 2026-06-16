// Barrel público da entity "ticket" (portal do cliente — FSD).
// Importe SEMPRE por aqui: `@/entities/ticket`. Nunca alcance o interior.
export type {
  PortalMe,
  PortalTicketSummary,
  PortalTicketMessage,
  PortalTicketDetail,
  PortalTicketList,
  OpenTicketInput,
} from './types/ticket.types';

export {
  portalSession,
  portalLogout,
  getPortalMe,
  listPortalTickets,
  getPortalTicket,
  openPortalTicket,
  replyPortalTicket,
} from './api/ticket.api';
