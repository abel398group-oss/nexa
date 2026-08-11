// Ordem da fila do SDR — pura, pra ser testável sem banco.
// Ver docs/features/telemarketing/prd.md §Módulo 2.

export interface ItemDaFila {
  id: string;
  /// Retorno prometido. Passado ou hoje = o lead está esperando a ligação.
  pausedUntil: Date | null;
  /// Quantas tentativas já foram registradas (COUNT de SellerActivity — não existe
  /// coluna de contador, de propósito).
  tentativas: number;
  createdAt: Date;
}

export type Prioridade = 'retorno_hoje' | 'nunca_tocado' | 'em_andamento';

/**
 * Por que esta ordem, e não "mais novo primeiro":
 *
 * 1. `retorno_hoje` — o lead PEDIU pra ser chamado hoje. Furar isso é o pior erro
 *    da operação: ele lembra, e a próxima ligação começa com desculpa.
 * 2. `nunca_tocado` — lead sem nenhuma tentativa esfria por dia que passa. É onde
 *    a primeira ligação vale mais.
 * 3. `em_andamento` — já tem histórico, então já está andando.
 *
 * Lead pausado para o futuro NÃO entra na fila. Aparecer antes da data combinada
 * faz o SDR ligar cedo, que é o mesmo dano de ligar tarde.
 */
export function prioridadeDe(item: ItemDaFila, agora: Date): Prioridade | null {
  if (item.pausedUntil) {
    return item.pausedUntil.getTime() <= agora.getTime() ? 'retorno_hoje' : null;
  }
  return item.tentativas === 0 ? 'nunca_tocado' : 'em_andamento';
}

const PESO: Record<Prioridade, number> = {
  retorno_hoje: 0,
  nunca_tocado: 1,
  em_andamento: 2,
};

export function ordenarFila<T extends ItemDaFila>(
  itens: readonly T[],
  agora = new Date(),
): (T & { prioridade: Prioridade })[] {
  return itens
    .map((item) => ({ item, prioridade: prioridadeDe(item, agora) }))
    .filter((x): x is { item: T; prioridade: Prioridade } => x.prioridade !== null)
    .sort((a, b) => {
      const peso = PESO[a.prioridade] - PESO[b.prioridade];
      if (peso !== 0) return peso;
      // Empate: o mais antigo primeiro. Lead velho na mesma prioridade é o que
      // corre mais risco de nunca ser chamado.
      return a.item.createdAt.getTime() - b.item.createdAt.getTime();
    })
    .map((x) => ({ ...x.item, prioridade: x.prioridade }));
}
