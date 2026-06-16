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
} from '../types/campaign.types';

export async function listCampaigns(archived = false): Promise<Campaign[]> {
  const r = await api.get('/campaigns', { params: { archived } });
  return r.data;
}

export async function getCampaign(id: string): Promise<CampaignDetail> {
  const r = await api.get(`/campaigns/${id}`);
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
  data: { name: string; template: string },
): Promise<void> {
  await api.patch(`/campaigns/${id}`, data);
}

export async function startCampaign(id: string): Promise<void> {
  await api.post(`/campaigns/${id}/start`);
}

export async function pauseCampaign(id: string): Promise<void> {
  await api.post(`/campaigns/${id}/pause`);
}

export async function deleteCampaign(id: string): Promise<void> {
  await api.delete(`/campaigns/${id}`);
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
  const r = await api.put('/sender/settings', settings);
  return r.data;
}
