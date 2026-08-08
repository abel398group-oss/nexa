// Funções puras de acesso à API de campanhas + números/horários de envio
// (FSD — sem React). Única camada que conhece `/campaigns` e `/sender/*`.
import { api } from '@/shared/lib/api';
import type {
  Campaign,
  CampaignDetail,
  CampaignCreateResult,
  SenderNumber,
  SenderSettings,
  CampaignMedia,
  EmailAudience,
} from '../types/campaign.types';

export async function listCampaigns(archived = false): Promise<Campaign[]> {
  const r = await api.get('/campaigns', { params: { archived } });
  return r.data;
}

/**
 * Detalhe da campanha. DISP-003: `limit` liga a paginação e `status`/`search`
 * filtram no banco. Os agregados (counts/engagement/conversion) vêm sempre da
 * campanha inteira — só a LISTA de destinatários é paginada.
 * Sem opções, o backend devolve tudo (comportamento antigo).
 */
export async function getCampaign(
  id: string,
  opts: { limit?: number; offset?: number; status?: string; search?: string } = {},
): Promise<CampaignDetail> {
  const params: Record<string, string | number> = {};
  if (opts.limit !== undefined) params.limit = opts.limit;
  if (opts.offset) params.offset = opts.offset;
  if (opts.status) params.status = opts.status;
  if (opts.search) params.search = opts.search;
  const r = await api.get(`/campaigns/${id}`, { params });
  return r.data;
}

// Cria campanha de WhatsApp. O payload é montado na tela (público/mídia/limite).
export async function createWhatsappCampaign(
  payload: Record<string, unknown>,
): Promise<CampaignCreateResult> {
  const r = await api.post('/campaigns', payload);
  return r.data;
}

// Cria campanha de e-mail.
export async function createEmailCampaign(
  payload: Record<string, unknown>,
): Promise<CampaignCreateResult> {
  const r = await api.post('/campaigns/email', payload);
  return r.data;
}

// Edita uma campanha em rascunho (nome/template).
export async function updateCampaign(
  id: string,
  data: { name: string; template?: string; link?: string | null; mediaUrl?: string | null; mediaName?: string | null },
): Promise<void> {
  await api.patch(`/campaigns/${id}`, data);
}

export async function startCampaign(id: string): Promise<void> {
  await api.post(`/campaigns/${id}/start`);
}

export async function pauseCampaign(id: string): Promise<void> {
  await api.post(`/campaigns/${id}/pause`);
}

// DISP-002: recoloca na fila os alvos que falharam, na própria campanha.
// Só 'failed' volta — 'skipped' é exclusão deliberada (opt-out, blocklist, etc).
export async function retryFailedTargets(id: string): Promise<{ requeued: number; status: string }> {
  const r = await api.post(`/campaigns/${id}/retry-failed`);
  return r.data;
}

/**
 * Reenvio TOTAL — recoloca na fila TODOS os alvos, inclusive os já enviados.
 * Ferramenta de teste: o servidor responde 403 quando CAMPAIGN_RESEND_ALL_ENABLED
 * está desligado (o padrão), então a rota nunca fica exposta em produção por engano.
 */
export async function resendAllTargets(id: string): Promise<{ requeued: number; status: string }> {
  const r = await api.post(`/campaigns/${id}/resend-all`);
  return r.data;
}

export async function deleteCampaign(id: string): Promise<void> {
  await api.delete(`/campaigns/${id}`);
}

export async function removeCampaignTarget(campaignId: string, targetId: string): Promise<void> {
  await api.delete(`/campaigns/${campaignId}/targets/${targetId}`);
}

export async function bulkDeleteCampaigns(ids: string[]): Promise<void> {
  await api.post('/campaigns/bulk-delete', { ids });
}

export async function setCampaignsArchived(ids: string[], archived: boolean): Promise<void> {
  await api.post(`/campaigns/${archived ? 'archive' : 'unarchive'}`, { ids });
}

// Sobe um anexo/mídia e devolve a URL hospedada.
export async function uploadCampaignMedia(file: File): Promise<CampaignMedia> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api.post('/campaigns/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data;
}

export async function listSenderNumbers(): Promise<SenderNumber[]> {
  const r = await api.get('/sender/numbers');
  return r.data;
}

export async function getSenderSettings(): Promise<SenderSettings> {
  const r = await api.get('/sender/settings');
  return r.data;
}

export async function saveSenderSettings(settings: SenderSettings): Promise<SenderSettings> {
  // strip tenantId — backend derives it from JWT; forbidNonWhitelisted would reject it
  const { waStartHour, waEndHour, emailStartHour, emailEndHour } = settings;
  const r = await api.put('/sender/settings', { waStartHour, waEndHour, emailStartHour, emailEndHour });
  return r.data;
}

/**
 * Pré-visualização de quem receberá a campanha "Contatos com e-mail".
 * Espelha o where do disparo no servidor — `total` respeita a busca,
 * `totalAudiencia` é o número real que vai receber.
 */
export async function getEmailAudience(params: { search?: string; limit?: number; offset?: number } = {}): Promise<EmailAudience> {
  const r = await api.get('/campaigns/audience/email', {
    params: {
      search: params.search?.trim() || undefined,
      limit: params.limit ?? 50,
      offset: params.offset || undefined,
    },
  });
  return r.data;
}
