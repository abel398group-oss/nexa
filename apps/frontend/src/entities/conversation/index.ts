// Barrel público da entity "conversation" (FSD).
// Importe SEMPRE por aqui: `@/entities/conversation`. Nunca alcance o interior.
export type { Conversation, Message, ConversationListResult, AnalystMini } from './types/conversation.types';

export type { ListConversationsParams, SupportStats, ClientesDoTms, ClienteDoTms } from './api/conversation.api';

export {
  listConversations,
  getSupportStats,
  getConversation,
  getConversationMessages,
  sendMessage,
  updateInternalNote,
  deleteInternalNote,
  returnConversationToAi,
  setConversationOutcome,
  assignSeller,
  assignAnalyst,
  listAnalystsMini,
  setLinkedIssue,
  setConversationResolved,
  archiveConversation,
  deleteConversation,
  bulkConversationAction,
  listSupportClients,
} from './api/conversation.api';
