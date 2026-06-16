// Funções puras de acesso à API de vendedores (FSD — sem React).
// Única camada que conhece os endpoints `/sellers` (+ KPIs em /metrics/sellers).
import { api } from '@/shared/lib/api';
import type { Seller, SellerKpi, SellerMini, SellerInput } from '../types/seller.types';

export async function listSellers(search?: string): Promise<Seller[]> {
  const r = await api.get('/sellers', { params: { search: search || undefined } });
  return r.data;
}

// Lista enxuta (id + nome) para seletores — ex.: reatribuir lead no Inbox.
export async function listSellersMini(): Promise<SellerMini[]> {
  const r = await api.get('/sellers');
  return r.data;
}

export async function listSellerKpis(): Promise<SellerKpi[]> {
  const r = await api.get('/metrics/sellers');
  return r.data;
}

export async function createSeller(input: SellerInput): Promise<Seller> {
  const r = await api.post('/sellers', normalize(input));
  return r.data;
}

export async function updateSeller(id: string, input: SellerInput): Promise<Seller> {
  const r = await api.patch(`/sellers/${id}`, normalize(input));
  return r.data;
}

export async function toggleSellerActive(id: string, active: boolean): Promise<void> {
  await api.patch(`/sellers/${id}/active`, { active });
}

export async function deleteSeller(id: string): Promise<void> {
  await api.delete(`/sellers/${id}`);
}

export async function bulkDeleteSellers(ids: string[]): Promise<{ deleted: number }> {
  const r = await api.post('/sellers/bulk-delete', { ids });
  return r.data;
}

// campos vazios → undefined (não envia string vazia ao backend)
function normalize(input: SellerInput): SellerInput {
  return {
    name: input.name,
    phone: input.phone,
    email: input.email || undefined,
    password: input.password || undefined,
  };
}
