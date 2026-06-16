// Funções puras de acesso à API do PORTAL DO CLIENTE (FSD — sem React).
// Usam a instância isolada `portalApi` (cookie portal_session, baseURL /api/portal).
import { portalApi } from '@/shared/lib/portalApi';
import type {
  PortalMe,
  PortalTicketDetail,
  PortalTicketList,
  OpenTicketInput,
} from '../types/ticket.types';

// Troca o token da URL por uma sessão de portal (cookie HttpOnly).
export async function portalSession(token: string): Promise<void> {
  await portalApi.post('/session', { token });
}

export async function portalLogout(): Promise<void> {
  await portalApi.post('/session/logout', {});
}

export async function getPortalMe(): Promise<PortalMe> {
  const r = await portalApi.get<PortalMe>('/me');
  return r.data;
}

export async function listPortalTickets(limit = 100, offset = 0): Promise<PortalTicketList> {
  const r = await portalApi.get<PortalTicketList>('/tickets', { params: { limit, offset } });
  return r.data;
}

export async function getPortalTicket(id: string): Promise<PortalTicketDetail> {
  const r = await portalApi.get<PortalTicketDetail>(`/tickets/${id}`);
  return r.data;
}

export async function openPortalTicket(input: OpenTicketInput): Promise<PortalTicketDetail> {
  const r = await portalApi.post<PortalTicketDetail>('/tickets', input);
  return r.data;
}

export async function replyPortalTicket(id: string, message: string): Promise<PortalTicketDetail> {
  const r = await portalApi.post<PortalTicketDetail>(`/tickets/${id}/messages`, { message });
  return r.data;
}
