// Funções puras de acesso à API de modelos de mensagem (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { MessageTemplate, TemplatePreview } from '../types/message-template.types';

export async function listTemplates(productCode?: string, channel?: string): Promise<MessageTemplate[]> {
  const r = await api.get('/message-templates', {
    params: { productCode: productCode || undefined, channel: channel || undefined },
  });
  return r.data;
}

export async function createTemplate(input: {
  productCode: string; name: string; channel: string; subject?: string; body: string; step?: number;
}): Promise<MessageTemplate> {
  const r = await api.post('/message-templates', input);
  return r.data;
}

export async function updateTemplate(
  id: string,
  input: { name?: string; subject?: string; body?: string; step?: number },
): Promise<MessageTemplate> {
  const r = await api.patch(`/message-templates/${id}`, input);
  return r.data;
}

/** Arquiva (desativa). A campanha antiga continua apontando para o texto que a gerou. */
export async function archiveTemplate(id: string): Promise<void> {
  await api.delete(`/message-templates/${id}`);
}

/**
 * POST e não GET: o corpo da campanha inteiro numa query string estoura o limite e
 * ainda vaza a copy para o log de acesso do servidor.
 */
export async function previewTemplate(input: {
  productCode?: string; channel: string; subject?: string; body: string; nomeTeste?: string;
}): Promise<TemplatePreview> {
  const r = await api.post('/message-templates/preview', input);
  return r.data;
}

export async function sendTemplateTest(input: {
  to: string; productCode?: string; subject?: string; body: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const r = await api.post('/message-templates/send-test', input);
  return r.data;
}
