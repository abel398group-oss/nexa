// Tipos do painel do closer (módulo 3 do telemarketing).
// Espelham GET /api/closer/today — ver docs/features/telemarketing/prd.md §Módulo 3.
import type { AtividadeRecente } from '@/entities/sdr';

/// Os três blocos vêm agrupados do backend. A tela rotula e renderiza, nunca
/// recalcula a regra: duas versões da mesma classificação divergem no primeiro ajuste.
export type Bloco = 'agora' | 'precisa_de_voce' | 'esperando';

export interface Negocio {
  id: string;
  stage: string;
  meetingAt: string | null;
  meetingUrl: string | null;
  pausedUntil: string | null;
  updatedAt: string;
  /// Vem como string do Prisma (Decimal), não number — converter antes de formatar.
  value: string | number | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  productCode: string | null;
  contactId: string | null;
  assignedSellerId: string | null;
  bloco: Bloco;
  /// Últimas 10 tentativas, mais recente primeiro — inclui a nota que o SDR escreveu
  /// ao passar o lead (`result: 'passou_closer'`). Adicionado 19/08/2026: antes essa
  /// nota era gravada e nunca lida por este painel.
  activities: AtividadeRecente[];
}

export type PainelDeHoje = Record<Bloco, Negocio[]>;

export const ROTULO_BLOCO: Record<Bloco, string> = {
  agora: 'Agora',
  precisa_de_voce: 'Precisa de você',
  esperando: 'Esperando',
};

/// "Esperando" NÃO é "pausados": junta reunião marcada pra frente, proposta ainda no
/// prazo e pausa que não venceu. Rotular de "pausados" faria o closer achar que as
/// reuniões futuras sumiram do painel.
export const SUBTITULO_BLOCO: Record<Bloco, string> = {
  agora: 'Reunião marcada para hoje',
  precisa_de_voce: 'Parou e depende de você para andar',
  esperando: 'Propostas no prazo · reuniões futuras · pausas em andamento',
};

export const MOTIVOS_PERDA = [
  { valor: 'preco', rotulo: 'Preço' },
  { valor: 'concorrente', rotulo: 'Fechou com concorrente' },
  { valor: 'sem_fit', rotulo: 'Não tem perfil' },
  { valor: 'sem_resposta', rotulo: 'Parou de responder' },
  { valor: 'outro', rotulo: 'Outro' },
];
