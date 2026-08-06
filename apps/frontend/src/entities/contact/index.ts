// Barrel público da feature "contact" (FSD — padrão HiperTMS).
// Importe SEMPRE por aqui: `@/entities/contact`. Nunca alcance o interior.
export type {
  Contact,
  ContactInput,
  ImportContactInput,
  ContactListParams,
  ContactListResult,
  ContactCampaign,
  ContactTicket,
  TagCount,
  BannedContact,
} from './types/contact.types';

export {
  listContacts,
  listTags,
  bulkTagContacts,
  renameTag,
  deleteTag,
  createContact,
  updateContact,
  reactivateContact,
  optOutContact,
  deleteContact,
  bulkDeleteContacts,
  bulkBlockContacts,
  bulkUnblockContacts,
  importContacts,
  getContactCampaigns,
  getContactTickets,
  listBannedContacts,
  unbanContact,
} from './api/contact.api';
