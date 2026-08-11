// Funções puras de acesso à API do roteiro (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { RoteiroInput, SalesScript } from '../types/sales-script.types';

/// Versão vigente. `null` quando ninguém escreveu ainda — a tela precisa distinguir
/// "não tem roteiro" de "roteiro em branco".
export async function getRoteiro(productCode: string): Promise<SalesScript | null> {
  const r = await api.get(`/sales-scripts/${productCode}`);
  return r.data ?? null;
}

export async function getHistoricoRoteiro(productCode: string): Promise<SalesScript[]> {
  const r = await api.get(`/sales-scripts/${productCode}/history`);
  return r.data;
}

/// Publica uma versão nova. O que não for enviado é herdado da anterior — por isso a
/// tela manda só o item que foi editado.
export async function salvarRoteiro(
  productCode: string,
  dados: RoteiroInput,
): Promise<SalesScript> {
  const r = await api.put(`/sales-scripts/${productCode}`, dados);
  return r.data;
}
