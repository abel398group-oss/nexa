import { ConversationInbox } from '@/pages/InboxPage';

/**
 * Inbox de Suporte (rota /support) — mesmo formato do Inbox de Vendas (lista de
 * conversas + chat), filtrado para os tickets de atendimento (clientes ativos /
 * com categoria / escalados). Usa o componente compartilhado `ConversationInbox`
 * para nunca divergir do de Vendas.
 */
export function SupportPage() {
  return <ConversationInbox scope="support" />;
}
