// Funções puras de acesso à API de lotes de lead (FSD — sem React).
import { api } from '@/shared/lib/api';
import type {
  ImportarLotePayload,
  LeadBatch,
  RelatorioImportacao,
} from '../types/lead-batch.types';

/**
 * Prévia da peneira: roda tudo e devolve o relatório **sem gravar nada**.
 *
 * É o ponto do módulo 1 — o operador vê o que a lista vale antes de ela entrar.
 * Confirmar sem prévia faria ele descobrir que a lista era ruim depois.
 */
export async function simularImportacao(
  payload: Omit<ImportarLotePayload, 'dryRun'>,
): Promise<RelatorioImportacao> {
  const r = await api.post('/lead-batches', { ...payload, dryRun: true });
  return r.data;
}

/// Importação de verdade: grava o lote e cria uma oportunidade por lead válido.
export async function importarLote(
  payload: Omit<ImportarLotePayload, 'dryRun'>,
): Promise<RelatorioImportacao> {
  const r = await api.post('/lead-batches', { ...payload, dryRun: false });
  return r.data;
}

export async function listLeadBatches(): Promise<LeadBatch[]> {
  const r = await api.get('/lead-batches');
  return r.data;
}
