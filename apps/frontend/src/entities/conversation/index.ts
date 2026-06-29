// Barrel público da entity "conversation" (FSD).
// Importe SEMPRE por aqui: `@/entities/conversation`. Nunca alcance o interior.
export type { Conversation, Message, ConversationListResult } from './types/conversation.types';

export {
  listConversations,
  getConversationMessages,
  sendMessage,
  setConversationOutcome,
  assignSeller,
  setConversationResolved,
  archiveConversation,
  deleteConversation,
  bulkConversationAction,
} from './api/conversation.api';
