// Funções puras de acesso à API de mercados (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { Market, MarketReadiness } from '../types/market.types';

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
