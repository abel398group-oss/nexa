// Funções puras de acesso à API de contatos (FSD — sem React).
// Única camada que conhece os endpoints `/contacts`. As páginas/hooks
// consomem estas funções via barrel `@/features/contact`.
import { api } from '@/shared/lib/api';
import type {
  Contact,
  ContactInput,
  ContactListParams,
  ContactListResult,
  ContactCampaign,
  ImportContactInput,
  TagCount,
} from '../types/contact.types';

export async function listContacts(params: ContactListParams = {}): Promise<ContactListResult> {
  const r = await api.get('/contacts', {
    params: {
      search: params.search || undefined,
      tag: params.tag || undefined,
      status: params.status || undefined,
      limit: params.limit ?? 100,
      offset: params.offset || undefined,
    },
  });
  return r.data;
}

// Lista as tags distintas do tenant (com contagem).
export async function listTags(): Promise<TagCount[]> {
  const r = await api.get('/contacts/tags');
  return r.data;
}

// Adiciona/remove uma tag em vários contatos de uma vez.
export async function bulkTagContacts(
  ids: string[],
  tag: string,
  mode: 'add' | 'remove' = 'add',
): Promise<{ updated: number }> {
  const r = await api.post('/contacts/bulk-tag', { ids, tag, mode });
  return r.data;
}

// renomeia uma tag em todos os contatos do tenant
export async function renameTag(from: string, to: string): Promise<{ updated: number }> {
  const r = await api.patch('/contacts/tags/rename', { from, to });
  return r.data;
}

// exclui uma tag de todos os contatos do tenant
export async function deleteTag(tag: string): Promise<{ updated: number }> {
  const r = await api.post('/contacts/tags/delete', { tag });
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

// marca como descadastrado (opt-out) — não recebe mais disparos (LGPD)
export async function optOutContact(id: string): Promise<void> {
  await api.patch(`/contacts/${id}/opt-out`);
}

export async function deleteContact(id: string): Promise<void> {
  await api.delete(`/contacts/${id}`);
}

export async function importContacts(contacts: ImportContactInput[]): Promise<{ imported: number }> {
  const r = await api.post('/contacts/import', { contacts });
  return r.data;
}

// Exclui vários contatos numa única requisição (uma só confirmação de break-glass).
export async function bulkDeleteContacts(ids: string[]): Promise<{ deleted: number }> {
  const r = await api.post('/contacts/bulk-delete', { ids });
  return r.data;
}

// Campanhas que o contato recebeu (histórico).
export async function getContactCampaigns(id: string): Promise<ContactCampaign[]> {
  const r = await api.get(`/contacts/${id}/campaigns`);
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
