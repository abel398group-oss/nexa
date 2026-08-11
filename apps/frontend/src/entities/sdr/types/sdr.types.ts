// Tipos da mesa de trabalho do SDR (módulo 2 do telemarketing).
// Espelham GET /api/sdr/queue — ver docs/features/telemarketing/prd.md §Módulo 2.

/// Vem calculada do backend, junto com a ordem. A tela agrupa e rotula, nunca
/// recalcula a regra — duas versões da mesma prioridade divergem no primeiro ajuste.
export type PrioridadeFila = 'retorno_hoje' | 'nunca_tocado' | 'em_andamento';

export interface AtividadeRecente {
  id: string;
  type: string; // call | whatsapp | email | note
  result: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FichaDoContato {
  id: string;
  name: string | null;
  company: string | null;
  phone: string;
  email: string | null;
  fleetSize: number | null;
  batch: { id: string; name: string; source: string | null } | null;
}

export interface ItemDaFila {
  id: string;
  productCode: string | null;
  pausedUntil: string | null;
  createdAt: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  assignedSellerId: string | null;
  contactId: string | null;
  contact: FichaDoContato | null;
  activities: AtividadeRecente[];
  tentativas: number;
  prioridade: PrioridadeFila;
}

export interface Closer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export const ROTULO_PRIORIDADE: Record<PrioridadeFila, string> = {
  retorno_hoje: 'Prometido para hoje',
  nunca_tocado: 'Nunca contatado',
  em_andamento: 'Em andamento',
};

export const ROTULO_RESULTADO: Record<string, string> = {
  atendeu: 'atendeu',
  nao_atendeu: 'não atendeu',
  agendou_retorno: 'agendou retorno',
  sem_interesse: 'sem interesse',
  numero_errado: 'número errado',
  nao_e_decisor: 'não é quem decide',
  passou_closer: 'passou pro closer',
  enviado: 'enviado',
  respondido: 'respondido',
  outro: 'outro',
};
