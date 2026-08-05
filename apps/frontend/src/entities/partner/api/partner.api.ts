// Funções puras de acesso à API de parceiros (FSD — sem React).
// Única camada que conhece os endpoints `/partners` (+ o compartilhamento de
// lead, que mora em `/opportunities/:id/...` por pertencer à oportunidade).
import { api } from '@/shared/lib/api';
import type { Partner, PartnerInput } from '../types/partner.types';

export async function listPartners(search?: string): Promise<Partner[]> {
  const r = await api.get('/partners', { params: { search: search || undefined } });
  return r.data;
}

export async function createPartner(input: PartnerInput): Promise<Partner> {
  const r = await api.post('/partners', normalize(input));
  return r.data;
}

export async function updatePartner(id: string, input: PartnerInput): Promise<Partner> {
  const r = await api.patch(`/partners/${id}`, normalize(input));
  return r.data;
}

export async function togglePartnerActive(id: string, active: boolean): Promise<void> {
  await api.patch(`/partners/${id}/active`, { active });
}

/**
 * Registra o consentimento do lead para compartilhar os dados dele com um
 * parceiro externo (LGPD). Precisa vir ANTES de `shareLeadWithPartner` — o
 * backend recusa o compartilhamento sem este carimbo.
 */
export async function recordPartnerConsent(opportunityId: string): Promise<void> {
  await api.patch(`/opportunities/${opportunityId}/partner-consent`);
}

/** Compartilha o lead com o parceiro. Falha (400) se não houver consentimento. */
export async function shareLeadWithPartner(opportunityId: string, partnerId: string): Promise<void> {
  await api.post(`/opportunities/${opportunityId}/share-partner`, { partnerId });
}

// campos vazios → undefined (não envia string vazia ao backend)
function normalize(input: PartnerInput): PartnerInput {
  return {
    name: input.name,
    type: input.type,
    contactEmail: input.contactEmail || undefined,
    contactPhone: input.contactPhone || undefined,
  };
}
