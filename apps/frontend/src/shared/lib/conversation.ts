// Heurística única (fonte da verdade no front) para classificar uma conversa
// como ticket de SUPORTE vs conversa de VENDA. Usada pelo Inbox de Vendas
// (exclui suporte) e pelo Inbox de Suporte (só suporte), pra não divergirem.
export interface TicketLike {
  status?: string | null;
  customerStage?: string | null;
  ticketCategory?: string | null;
  sourceChannel?: string | null;
}

export function isSupportTicket(c: TicketLike): boolean {
  return (
    !!c.ticketCategory ||
    c.customerStage === 'cliente_ativo' ||
    c.status === 'escalated' ||
    c.sourceChannel === 'portal'
  );
}
