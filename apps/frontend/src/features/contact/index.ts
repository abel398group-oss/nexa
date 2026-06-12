// Barrel público da feature "contact" (FSD — padrão HiperTMS).
// Importe SEMPRE por aqui: `@/features/contact`. Nunca alcance o interior.
export type {
  Contact,
  ContactInput,
  ImportContactInput,
  ContactListParams,
  ContactListResult,
  ContactCampaign,
  TagCount,
} from './types/contact.types';

export {
  listContacts,
  listTags,
  bulkTagContacts,
  createContact,
  updateContact,
  reactivateContact,
  deleteContact,
  importContacts,
  getContactCampaigns,
} from './api/contact.api';
