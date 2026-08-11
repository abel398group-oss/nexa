// Funções puras de acesso à API do painel do closer (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { PainelDeHoje } from '../types/closer.types';

/// Os 3 blocos já agrupados e ordenados. Sempre vem com as três chaves, mesmo vazias —
/// a tela renderiza os cabeçalhos de qualquer forma.
export async function getPainelDeHoje(): Promise<PainelDeHoje> {
  const r = await api.get('/closer/today');
  return r.data;
}

export async function registrarProposta(id: string, valor: number, notes?: string) {
  const r = await api.patch(`/closer/opportunities/${id}/proposal`, { valor, notes });
  return r.data;
}

export async function reagendarReuniao(
  id: string,
  meetingAt: string,
  meetingUrl?: string,
  notes?: string,
) {
  const r = await api.patch(`/closer/opportunities/${id}/reschedule`, {
    meetingAt,
    meetingUrl,
    notes,
  });
  return r.data;
}

/// Ganhou. No backend isto também estampa `Contact.customerSince`, que é o que impede
/// o cliente novo de receber campanha fria antes de existir no TMS.
export async function marcarGanho(id: string, valor?: number, notes?: string) {
  const r = await api.patch(`/closer/opportunities/${id}/win`, { valor, notes });
  return r.data;
}

export async function marcarPerda(id: string, motivo: string, notes?: string) {
  const r = await api.patch(`/closer/opportunities/${id}/lose`, { motivo, notes });
  return r.data;
}

/// Perda por timing: congela com data de volta em vez de matar. "Sem orçamento agora"
/// não é "sem perfil".
export async function adiarNegocio(
  id: string,
  voltarEm: string,
  motivo: string,
  notes?: string,
) {
  const r = await api.patch(`/closer/opportunities/${id}/postpone`, {
    voltarEm,
    motivo,
    notes,
  });
  return r.data;
}
