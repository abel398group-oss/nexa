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

/// Campos que identificam DE QUEM é a oportunidade. Tudo opcional: o agrupamento
/// degrada para "cada linha é uma pessoa" quando não há por onde ligar duas.
export interface ItemAgrupavel extends ItemDaFila {
  contactId?: string | null;
  phone?: string | null;
  company?: string | null;
  assignedSellerId?: string | null;
  /// Histórico das irmãs entra junto: a ligação registrada antes do agrupamento
  /// existir ficou na outra linha, e sumir com ela faria o card dizer "1 tentativa"
  /// sem mostrar qual.
  activities?: readonly { createdAt: Date }[];
}

/**
 * Chave de identidade do lead. O dono entra na chave de propósito: se o mesmo
 * contato tem oportunidade com dois SDRs, isso é conflito de carteira e some da
 * tela se a gente fundir — cada um continua vendo a sua, e o admin vê as duas.
 */
function chaveDoContato(item: ItemAgrupavel): string {
  const dono = item.assignedSellerId ?? '-';
  if (item.contactId) return `${dono}|c:${item.contactId}`;
  const digitos = (item.phone ?? '').replace(/\D/g, '');
  if (digitos) return `${dono}|p:${digitos}`;
  const empresa = (item.company ?? '').trim().toLowerCase();
  if (empresa) return `${dono}|e:${empresa}`;
  // Sem nada que identifique, cada linha é ela mesma — fundir por vazio juntaria
  // leads que não têm relação nenhuma.
  return `${dono}|o:${item.id}`;
}

/**
 * Junta as oportunidades do MESMO lead numa linha só.
 *
 * Existe porque importar a mesma lista em dois lotes cria duas oportunidades de
 * propósito — é assim que se mede qual lista prestou. Sem juntar aqui, o SDR
 * enxerga a mesma empresa duas vezes e liga duas vezes.
 *
 * O agrupamento vem ANTES da ordenação, e não é cosmético: `tentativas` e
 * `pausedUntil` passam a valer para o CONTATO. Se fosse só na exibição, o SDR
 * ligaria, marcaria a tentativa na linha representante, e a linha irmã — ainda
 * com zero tentativas — voltaria ao topo como "nunca tocado" na atualização
 * seguinte. Ele ligaria de novo achando que era lead virgem.
 *
 * Promessa de retorno também é do contato: basta uma irmã pausada para o futuro
 * para o lead inteiro sair da fila até lá. Ligar antes da data combinada é o
 * mesmo dano que ligar depois.
 */
export function agruparPorContato<T extends ItemAgrupavel>(
  itens: readonly T[],
  agora = new Date(),
): (T & { oportunidades: string[] })[] {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDoContato(item);
    const atual = grupos.get(chave);
    if (atual) atual.push(item);
    else grupos.set(chave, [item]);
  }

  return [...grupos.values()].map((irmas) => {
    // Representante: a mais antiga — é a oportunidade original do lead.
    const base = irmas.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));

    const futuros = irmas
      .map((o) => o.pausedUntil)
      .filter((d): d is Date => !!d && d.getTime() > agora.getTime());
    const vencidos = irmas
      .map((o) => o.pausedUntil)
      .filter((d): d is Date => !!d && d.getTime() <= agora.getTime());

    const pausedUntil = futuros.length
      ? // a promessa mais distante manda: respeitar a data mais próxima ainda
        // ligaria antes de uma combinação que existe.
        new Date(Math.max(...futuros.map((d) => d.getTime())))
      : vencidos.length
        ? // vencida: a mais antiga, que é a que está esperando há mais tempo.
          new Date(Math.min(...vencidos.map((d) => d.getTime())))
        : null;

    return {
      ...base,
      pausedUntil,
      tentativas: irmas.reduce((soma, o) => soma + o.tentativas, 0),
      // Preenche o que faltar na representante a partir das irmãs — lote novo às
      // vezes traz o nome que o antigo não tinha.
      phone: base.phone || irmas.find((o) => o.phone)?.phone || base.phone,
      company: base.company || irmas.find((o) => o.company)?.company || base.company,
      activities: irmas
        .flatMap((o) => o.activities ?? [])
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 10),
      oportunidades: irmas.map((o) => o.id),
    };
  });
}

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
