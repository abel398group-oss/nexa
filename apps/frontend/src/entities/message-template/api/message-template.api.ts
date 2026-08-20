// Funções puras de acesso à API de modelos de mensagem (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { MessageTemplate, TemplatePreview } from '../types/message-template.types';

/** `approvedOnly` é o que o seletor do Disparo usa — rascunho fica de fora. */
export async function listTemplates(
  productCode?: string,
  channel?: string,
  approvedOnly = false,
): Promise<MessageTemplate[]> {
  const r = await api.get('/message-templates', {
    params: {
      productCode: productCode || undefined,
      channel: channel || undefined,
      approved: approvedOnly ? 'true' : undefined,
    },
  });
  return r.data;
}

/** Aprova: passa a aparecer no seletor do Disparo. Exige permissão `settings`. */
export async function approveTemplate(id: string): Promise<void> {
  await api.post(`/message-templates/${id}/approve`);
}

/** Volta para rascunho — some do seletor sem perder o texto. */
export async function unapproveTemplate(id: string): Promise<void> {
  await api.post(`/message-templates/${id}/unapprove`);
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
 * Exclui de vez — a linha some da tabela. Para o que nunca deveria estar na lista
 * (rascunho descartado, teste, nome errado); o que já rodou some com `archive`.
 * O histórico não sofre: a campanha guarda o texto enviado nela mesma.
 */
export async function deleteTemplate(id: string): Promise<void> {
  await api.delete(`/message-templates/${id}/permanente`);
}

/** Exclui todos os modelos de um mercado. `productCode` é obrigatório no servidor. */
export async function deleteAllTemplates(productCode: string): Promise<{ deleted: number }> {
  const r = await api.delete('/message-templates/todos', { params: { productCode } });
  return r.data;
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

/** Uma proposta de modelo — ainda NÃO salva. Espelha o formulário desta tela. */
export interface RascunhoDeModelo {
  name: string;
  subject: string;
  body: string;
  step: number;
  /** Por que a IA propôs esta mensagem. Some ao salvar; serve para escolher. */
  porque: string;
}

/**
 * Rascunha modelos a partir do roteiro APROVADO do mercado.
 *
 * Devolve proposta, não grava: quem salva continua sendo quem lê, depois de rodar o
 * "Gerar teste" e ver como a mensagem chega. É POST porque custa tokens e cada
 * chamada devolve um texto novo — nada aqui é idempotente.
 */
export async function rascunharModelos(input: {
  productCode: string; channel: 'email' | 'whatsapp'; quantos?: number;
}): Promise<RascunhoDeModelo[]> {
  const r = await api.post('/message-templates/rascunhar', input);
  return r.data;
}
