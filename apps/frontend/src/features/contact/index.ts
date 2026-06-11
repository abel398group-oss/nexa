// Barrel público da feature "contact" (FSD — padrão HiperTMS).
// Importe SEMPRE por aqui: `@/features/contact`. Nunca alcance o interior.
export type {
  Contact,
  ContactInput,
  ImportContactInput,
  ContactListParams,
  ContactListResult,
} from './types/contact.types';

export {
  listContacts,
  createContact,
  updateContact,
  reactivateContact,
  deleteContact,
  importContacts,
} from './api/contact.api';
