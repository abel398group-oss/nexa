// Os 3 blocos do painel "HOJE" do closer — puro, testável sem banco.
// Ver docs/features/telemarketing/prd.md §Módulo 3.

export interface NegocioAberto {
  id: string;
  stage: string;
  meetingAt: Date | null;
  pausedUntil: Date | null;
  /// Último movimento na oportunidade. É o que revela proposta que silenciou.
  updatedAt: Date;
}

export type Bloco = 'agora' | 'precisa_de_voce' | 'esperando';

/// Proposta sem movimento por mais que isso vira cobrança. Uma semana é o intervalo
/// em que "estou avaliando" ainda é verdade; depois disso é silêncio.
export const DIAS_PROPOSTA_PARADA = 7;

const ENCERRADAS = ['won', 'lost', 'discarded'];

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Em qual bloco o negócio cai. `null` = fora do painel.
 *
 * A ordem das perguntas é a regra: hora marcada ganha de tudo, depois o que parou,
 * e por último o que só precisa de paciência. Negócio que não cai em nenhum dos três
 * não precisa dele hoje — e isso é informação, não omissão.
 */
export function blocoDe(n: NegocioAberto, agora: Date): Bloco | null {
  if (ENCERRADAS.includes(n.stage)) return null;

  // 1. AGORA — tem hora marcada hoje.
  if (n.meetingAt && mesmoDia(n.meetingAt, agora)) return 'agora';

  // Pausa para o futuro é decisão explícita de não agir agora, e ganha de qualquer
  // regra de "está parado" abaixo. Sem este atalho, um negócio adiado para setembro
  // apareceria em PRECISA DE VOCÊ todo dia até lá — e a lista que deveria ser curta
  // vira ruído que ele aprende a ignorar.
  if (n.pausedUntil && n.pausedUntil.getTime() > agora.getTime()) return 'esperando';

  // 2. PRECISA DE VOCÊ — quatro situações, todas de coisa parada.
  //    A reunião que já passou entra aqui: aconteceu e ninguém registrou o que saiu
  //    dela, então o negócio está pendurado sem nome.
  if (n.meetingAt && n.meetingAt.getTime() < agora.getTime()) return 'precisa_de_voce';
  if (n.pausedUntil && n.pausedUntil.getTime() <= agora.getTime()) return 'precisa_de_voce';
  // Recebido do SDR e nada agendado: é o lead esfriando na mão do closer.
  if (n.stage === 'qualified' && !n.meetingAt) return 'precisa_de_voce';
  if (n.stage === 'proposal' && diasDesde(n.updatedAt, agora) >= DIAS_PROPOSTA_PARADA) {
    return 'precisa_de_voce';
  }

  // 3. ESPERANDO — reunião marcada pra frente, proposta ainda no prazo, pausa que
  //    não venceu.
  return 'esperando';
}

function diasDesde(quando: Date, agora: Date): number {
  return Math.floor((agora.getTime() - quando.getTime()) / 86_400_000);
}

export function agruparPorBloco<T extends NegocioAberto>(
  negocios: readonly T[],
  agora = new Date(),
): Record<Bloco, (T & { bloco: Bloco })[]> {
  const out: Record<Bloco, (T & { bloco: Bloco })[]> = {
    agora: [],
    precisa_de_voce: [],
    esperando: [],
  };

  for (const n of negocios) {
    const bloco = blocoDe(n, agora);
    if (bloco) out[bloco].push({ ...n, bloco });
  }

  // Dentro de AGORA a ordem é o relógio — ele precisa saber o que vem primeiro.
  out.agora.sort(
    (a, b) => (a.meetingAt?.getTime() ?? 0) - (b.meetingAt?.getTime() ?? 0),
  );
  // Nos outros, o que está parado há mais tempo primeiro.
  for (const chave of ['precisa_de_voce', 'esperando'] as const) {
    out[chave].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  }

  return out;
}
