// Funções puras de acesso à API da mesa do SDR (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { Closer, ItemDaFila } from '../types/sdr.types';
import type { MarketAssetContent } from '@/entities/market';

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

/// Material APROVADO do mercado (roteiro em .md + portfólio) — validado no painel
/// Validação de Campanha. Distinto de `listMaterial`, que lê o acervo antigo
/// (`ai_knowledge_base`); as duas fontes convivem até a operação migrar uma pra outra.
export async function listMaterialAprovado(productCode: string): Promise<MarketAssetContent[]> {
  const r = await api.get('/sdr/material-aprovado', { params: { productCode } });
  return r.data;
}

// `scriptVersion` em toda ação: é o carimbo da versão do roteiro que estava na tela.
// Sem ele, o versionamento do roteiro não mede conversão — e ligação registrada sem o
// carimbo é dado perdido para sempre.
export async function registrarAtividade(dados: {
  opportunityId: string;
  type: 'call' | 'whatsapp' | 'email' | 'note';
  result?: string;
  notes?: string;
  durationSec?: number;
  scriptVersion?: number;
}) {
  const r = await api.post('/sdr/activity', dados);
  return r.data;
}

export async function pausarLead(
  id: string,
  retornoEm: string,
  notes?: string,
  scriptVersion?: number,
) {
  const r = await api.patch(`/sdr/opportunities/${id}/pause`, {
    retornoEm,
    notes,
    scriptVersion,
  });
  return r.data;
}

export async function descartarLead(
  id: string,
  motivo: string,
  notes?: string,
  scriptVersion?: number,
) {
  const r = await api.patch(`/sdr/opportunities/${id}/discard`, {
    motivo,
    notes,
    scriptVersion,
  });
  return r.data;
}

/**
 * Grava o que o SDR descobriu na ligação.
 *
 * PATCH de verdade: manda só o que mudou. Ele marca um critério durante a ligação e
 * escreve a observação depois — o segundo salvamento não pode apagar o primeiro.
 */
export async function qualificarLead(
  id: string,
  dados: { decisor?: boolean; frotaPropria?: boolean; temOrcamento?: boolean; observacao?: string },
) {
  const r = await api.patch(`/sdr/opportunities/${id}/qualification`, dados);
  return r.data;
}

/**
 * Recalibra o termômetro do lead.
 *
 * O número era escrito só pela IA, a partir do texto que o lead mandou. Quem falou
 * com a pessoa sabe mais que o classificador — e o servidor grava uma atividade com o
 * de-para, para depois se saber quem mexeu.
 */
export async function ajustarScore(id: string, interestScore: number) {
  const r = await api.patch(`/sdr/opportunities/${id}/score`, { interestScore });
  return r.data;
}

export async function transferirParaCloser(
  id: string,
  dados: {
    closerId: string;
    meetingAt?: string;
    meetingUrl?: string;
    notes?: string;
    scriptVersion?: number;
  },
) {
  const r = await api.patch(`/sdr/opportunities/${id}/transfer`, dados);
  return r.data;
}

/** Uma campanha que já bateu neste contato. */
export interface CampanhaRecebida {
  campaignId: string;
  name: string;
  channel: 'email' | 'whatsapp';
  status: string;
  sentAt: string | null;
  createdAt: string;
}

/**
 * O que já foi disparado para este lead antes de o SDR ligar.
 *
 * Sem isto ele abre a ligação sem saber que o lead recebeu três e-mails esta semana
 * — e repete o que já foi dito, ou pergunta se recebeu algo sem saber a resposta.
 */
export async function listCampanhasDoContato(contactId: string): Promise<CampanhaRecebida[]> {
  const r = await api.get(`/contacts/${contactId}/campaigns`);
  return r.data;
}
