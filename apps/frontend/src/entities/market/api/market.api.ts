// Funções puras de acesso à API de mercados (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { Market, MarketReadiness, MarketSellers } from '../types/market.types';

/**
 * `somenteLiberados` é o que a tela de Disparo usa: mercado em rascunho não pode
 * aparecer para o vendedor, senão a trava de liberação não serve para nada.
 */
export async function listMarkets(somenteLiberados = false): Promise<Market[]> {
  const r = await api.get('/markets', {
    params: somenteLiberados ? { liberados: 'true' } : {},
  });
  return r.data;
}

export async function getMarketReadiness(code: string): Promise<MarketReadiness> {
  const r = await api.get(`/markets/${code}/readiness`);
  return r.data;
}

export async function releaseMarket(code: string): Promise<Market> {
  const r = await api.post(`/markets/${code}/release`);
  return r.data;
}

export async function pauseMarket(code: string): Promise<Market> {
  const r = await api.post(`/markets/${code}/pause`);
  return r.data;
}

/// Vendedores do mercado: quem trabalha e quem ainda não. As duas listas vêm juntas
/// porque a tela precisa das duas — sem os de fora não há o que escolher.
export async function getMarketSellers(code: string): Promise<MarketSellers> {
  const r = await api.get(`/markets/${code}/sellers`);
  return r.data;
}

/// Vincular é o que decide quem pode receber lead deste mercado: a transferência do
/// SDR recusa closer sem vínculo.
export async function linkMarketSeller(
  code: string,
  sellerId: string,
  role: 'seller' | 'lead' = 'seller',
): Promise<MarketSellers> {
  const r = await api.post(`/markets/${code}/sellers/${sellerId}`, { role });
  return r.data;
}

export async function unlinkMarketSeller(
  code: string,
  sellerId: string,
): Promise<MarketSellers> {
  const r = await api.delete(`/markets/${code}/sellers/${sellerId}`);
  return r.data;
}
