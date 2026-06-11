// Funções puras de acesso à API de contatos (FSD — sem React).
// Única camada que conhece os endpoints `/contacts`. As páginas/hooks
// consomem estas funções via barrel `@/features/contact`.
import { api } from '@/lib/api';
import type {
  Contact,
  ContactInput,
  ContactListParams,
  ContactListResult,
  ImportContactInput,
} from '../types/contact.types';

export async function listContacts(params: ContactListParams = {}): Promise<ContactListResult> {
  const r = await api.get('/contacts', {
    params: { search: params.search || undefined, limit: params.limit ?? 100 },
  });
  return r.data;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const r = await api.post('/contacts', { ...normalize(input), source: 'manual' });
  return r.data;
}

export async function updateContact(id: string, input: ContactInput): Promise<Contact> {
  const r = await api.patch(`/contacts/${id}`, normalize(input));
  return r.data;
}

export async function reactivateContact(id: string): Promise<void> {
  await api.patch(`/contacts/${id}/reactivate`);
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(`/contacts/${id}`);
}

export async function importContacts(contacts: ImportContactInput[]): Promise<{ imported: number }> {
  const r = await api.post('/contacts/import', { contacts });
  return r.data;
}

// trim do telefone e campos vazios → undefined (não envia string vazia)
function normalize(input: ContactInput): ContactInput {
  return {
    phone: input.phone.trim(),
    name: input.name || undefined,
    company: input.company || undefined,
    email: input.email || undefined,
  };
}
