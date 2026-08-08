// Acesso à API de audiência do site (FSD — sem React). Única camada que conhece
// `/analytics/*`.
import { api } from '@/shared/lib/api';
import type { VisaoGeralSite } from '../types/site-analytics.types';

/** `from`/`to` em YYYY-MM-DD; `to` é inclusivo. Ausentes → últimos 7 dias. */
export async function getSiteOverview(from?: string, to?: string): Promise<VisaoGeralSite> {
  const r = await api.get('/analytics/site', { params: { from, to } });
  return r.data;
}
