// Regras do relatório comercial, puras. Ver docs/features/telemarketing/prd.md.
//
// Existe separado do service porque a parte que erra aqui não é a consulta, é a
// interpretação: taxa sobre amostra minúscula, denominador errado, e número que parece
// resposta sem ser.

/// Abaixo disto, percentual é ruído: 1 ganho em 6 leads vira "17% de conversão" e alguém
/// decide comprar mais lista por causa disso. Vinte é baixo para estatística e alto o
/// bastante para não mentir na cara.
export const AMOSTRA_MINIMA = 20;

export interface LinhaDeLote {
  nome: string;
  productCode: string;
  recebidos: number;
  validos: number;
  oportunidades: number;
  ganhos: number;
  perdidos: number;
  emAndamento: number;
}

export interface TaxaCalculada {
  /// `null` quando a amostra é pequena — e a tela DEVE mostrar "—", não zero. Zero é uma
  /// afirmação; null é a ausência dela.
  percentual: number | null;
  amostraPequena: boolean;
  base: number;
}

/**
 * Conversão de um lote.
 *
 * Denominador é `validos`, nunca `recebidos`: taxa sobre o que chegou faz lista suja se
 * elogiar sozinha — 100 linhas, 40 lixo, 6 ganhos viram "6%" quando na verdade foram 6
 * em 60. É a mesma regra das definições de funil do PRD.
 */
export function conversaoDoLote(l: LinhaDeLote): TaxaCalculada {
  const base = l.validos;
  if (base < AMOSTRA_MINIMA) {
    return { percentual: null, amostraPequena: true, base };
  }
  return { percentual: (l.ganhos / base) * 100, amostraPequena: false, base };
}

export interface LinhaDeVendedor {
  nome: string;
  atividades: number;
  atendeu: number;
  passouCloser: number;
  ganhos: number;
}

/**
 * Aproveitamento do SDR: quantas tentativas viram conversa.
 *
 * Denominador é `atividades` e não leads: mede o trabalho dele, não a qualidade da lista
 * que ele recebeu. Um SDR com lista ruim tem conversão baixa e aproveitamento normal —
 * misturar os dois é como se demite a pessoa errada.
 */
export function aproveitamento(v: LinhaDeVendedor): TaxaCalculada {
  const base = v.atividades;
  if (base < AMOSTRA_MINIMA) {
    return { percentual: null, amostraPequena: true, base };
  }
  return { percentual: (v.atendeu / base) * 100, amostraPequena: false, base };
}

export interface LinhaDeRoteiro {
  versao: number;
  acoes: number;
  atendeu: number;
}

/**
 * Comparação entre versões do roteiro — o que o carimbo na atividade tornou possível.
 *
 * Devolve as versões com amostra suficiente E o aviso de quantas foram omitidas. Sem o
 * aviso, quem olha conclui que só existiram duas versões, quando na verdade as outras
 * ainda não têm dado. Omissão silenciosa aqui inverte a leitura.
 */
export function compararRoteiros(linhas: readonly LinhaDeRoteiro[]): {
  comparaveis: (LinhaDeRoteiro & { percentual: number })[];
  omitidasPorAmostra: number;
} {
  const comparaveis = linhas
    .filter((l) => l.acoes >= AMOSTRA_MINIMA)
    .map((l) => ({ ...l, percentual: (l.atendeu / l.acoes) * 100 }))
    .sort((a, b) => b.percentual - a.percentual);

  return { comparaveis, omitidasPorAmostra: linhas.length - comparaveis.length };
}
