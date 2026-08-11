// Funções puras de acesso à API da mesa do SDR (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { Closer, ItemDaFila } from '../types/sdr.types';

/// Fila do SDR numa chamada só: oportunidade + ficha + lote + histórico recente, já
/// ordenada e com a prioridade calculada. Cinco requisições por lead, quarenta leads
/// por dia, seria meio segundo de espera a cada troca.
export async function listQueue(): Promise<ItemDaFila[]> {
  const r = await api.get('/sdr/queue');
  return r.data;
}

/// Closers do mercado do lead. Lista curta e específica: closer de fora do mercado é
/// recusado pelo backend, então mostrar todo mundo só geraria erro na cara do SDR.
export async function listClosers(productCode: string): Promise<Closer[]> {
  const r = await api.get('/sdr/closers', { params: { productCode } });
  return r.data;
}

/// Material de consulta do mercado: a base de conhecimento que já existe, filtrada.
/// Só leitura — o SDR consulta durante a ligação, não edita o acervo.
export async function listMaterial(
  productCode: string,
  q?: string,
): Promise<{ id: string; title: string; content: string; category: string | null; topic: string | null }[]> {
  const r = await api.get('/sdr/knowledge', { params: { productCode, q: q || undefined } });
  return r.data;
}

export async function registrarAtividade(dados: {
  opportunityId: string;
  type: 'call' | 'whatsapp' | 'email' | 'note';
  result?: string;
  notes?: string;
  durationSec?: number;
}) {
  const r = await api.post('/sdr/activity', dados);
  return r.data;
}

export async function pausarLead(id: string, retornoEm: string, notes?: string) {
  const r = await api.patch(`/sdr/opportunities/${id}/pause`, { retornoEm, notes });
  return r.data;
}

export async function descartarLead(id: string, motivo: string, notes?: string) {
  const r = await api.patch(`/sdr/opportunities/${id}/discard`, { motivo, notes });
  return r.data;
}

export async function transferirParaCloser(
  id: string,
  dados: { closerId: string; meetingAt?: string; meetingUrl?: string; notes?: string },
) {
  const r = await api.patch(`/sdr/opportunities/${id}/transfer`, dados);
  return r.data;
}
