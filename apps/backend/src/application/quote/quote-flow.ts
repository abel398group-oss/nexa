// As perguntas da cotação por WhatsApp — 5 no fracionado, 6 no dedicado — puro, sem IO e sem IA.
//
// Sem IA de propósito (spec fechada): são cinco campos numa ordem fixa, o que é
// formulário e não conversa. Menu numerado não inventa preço, não erra cidade, não custa
// token e tem caso de teste. O dia que a IA entrar aqui, ela pré-preenche e o formulário
// confirma — nunca decide.
//
// Este módulo NÃO chama o TMS. Quando precisa de cidade, ele PEDE a busca a quem o usa e
// espera o resultado voltar. É o que o mantém testável sem banco e sem rede.

import { filtrarPorUf, prepararBuscaDeCidade, MAX_OPCOES, type CidadeDoTms } from './quote-city';

export type Etapa =
  | 'origem'
  | 'escolher_origem'
  | 'destino'
  | 'escolher_destino'
  | 'modalidade'
  | 'veiculo'
  | 'carga'
  | 'peso'
  | 'valor'
  | 'pronto'
  | 'cancelado';

export type Modalidade = 'dedicado' | 'fracionado';

export const VEICULOS = ['truck', 'carreta', 'bitrem', 'rodotrem'] as const;
export type Veiculo = (typeof VEICULOS)[number];

export interface EstadoCotacao {
  etapa: Etapa;
  origem?: CidadeDoTms;
  destino?: CidadeDoTms;
  modalidade?: Modalidade;
  veiculo?: Veiculo;
  /// Rótulo do tipo de carga, exatamente como vem da tabela do tenant no TMS.
  cargoType?: string;
  /// Opções pendentes de tipo de carga.
  opcoesCarga?: string[];
  pesoKg?: number;
  valorMercadoria?: number;
  /// Opções pendentes de escolha (menu de cidade).
  opcoes?: CidadeDoTms[];
  /// Erros seguidos NO CAMPO ATUAL. Zera ao avançar.
  tentativas: number;
}

/// Três erros no mesmo campo e o fluxo desiste — insistir vira o robô que não entende.
export const MAX_TENTATIVAS = 3;

/// Palavras que abrem o fluxo.
const GATILHOS = ['cotar', 'cotacao', 'frete', 'orcamento'];
/// Saída explícita. Sem ela, quem começou errado abandona e deixa estado pendurado.
const SAIDAS = ['sair', 'cancelar', 'parar'];

function limpo(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function ehGatilho(texto: string): boolean {
  const t = limpo(texto);
  return GATILHOS.some((g) => t === g || t.startsWith(g + ' '));
}

export function ehSaida(texto: string): boolean {
  return SAIDAS.includes(limpo(texto));
}

export function novaCotacao(): EstadoCotacao {
  return { etapa: 'origem', tentativas: 0 };
}

/**
 * O que o fluxo precisa que aconteça a seguir.
 *
 * `buscar_cidade` é o único caso em que ele depende do mundo externo: quem chama vai ao
 * TMS e volta com `comCidadesEncontradas`.
 */
export type Passo =
  | { tipo: 'buscar_cidade'; termo: string; uf: string | null; para: 'origem' | 'destino' }
  | { tipo: 'buscar_cargas'; vehicleType: Veiculo }
  | { tipo: 'seguir'; estado: EstadoCotacao }
  | { tipo: 'repetir'; estado: EstadoCotacao; motivo: 'invalido' | 'desistiu' }
  /**
   * O tenant não tem tabela de frete para aquele veículo. Não é erro do usuário nem
   * falha do sistema — é ausência de cadastro, e insistir na pergunta não resolve.
   * Quem chama diz isso com a própria frase e encerra.
   */
  | { tipo: 'sem_tabela'; estado: EstadoCotacao };

/**
 * Número escrito por gente: "80000", "80.000", "R$ 80.000,00".
 *
 * Por extenso ("80 mil") fica de fora de propósito — é onde a interpretação erra, e este
 * número vira valor de seguro na cotação.
 */
function numero(texto: string): number | null {
  const t = String(texto ?? '').replace(/[R$\s]/gi, '');
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  // O último separador é quem decide: "80.000,50" tem vírgula decimal, "80,000.50" tem
  // ponto decimal. Olhar o primeiro erraria num dos dois formatos.
  const ultimo = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  const parteInteira = (ultimo >= 0 ? t.slice(0, ultimo) : t).replace(/[.,]/g, '');
  const parteDecimal = ultimo >= 0 ? t.slice(ultimo + 1) : '';
  // Três dígitos depois do separador é MILHAR, não decimal: "80.000" são oitenta mil.
  const valor =
    parteDecimal.length === 3 || parteDecimal.length === 0
      ? Number(parteInteira + parteDecimal)
      : Number(parteInteira + '.' + parteDecimal);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

function erro(estado: EstadoCotacao): Passo {
  const tentativas = estado.tentativas + 1;
  return {
    tipo: 'repetir',
    estado: { ...estado, tentativas },
    motivo: tentativas >= MAX_TENTATIVAS ? 'desistiu' : 'invalido',
  };
}

function escolhaDeMenu(texto: string, total: number): number | null {
  const n = Number(limpo(texto));
  return Number.isInteger(n) && n >= 1 && n <= total ? n : null;
}

/** Recebe a resposta do usuário e diz o que fazer. Nunca faz IO. */
export function responder(estado: EstadoCotacao, texto: string): Passo {
  if (ehSaida(texto)) return { tipo: 'seguir', estado: { ...estado, etapa: 'cancelado' } };

  switch (estado.etapa) {
    case 'origem':
    case 'destino': {
      const { termo, uf } = prepararBuscaDeCidade(texto);
      if (!termo) return erro(estado);
      return { tipo: 'buscar_cidade', termo, uf, para: estado.etapa };
    }

    case 'escolher_origem':
    case 'escolher_destino': {
      const opcoes = estado.opcoes ?? [];
      const n = escolhaDeMenu(texto, opcoes.length);
      if (!n) return erro(estado);
      const cidade = opcoes[n - 1];
      const ehOrigem = estado.etapa === 'escolher_origem';
      return {
        tipo: 'seguir',
        estado: {
          ...estado,
          ...(ehOrigem ? { origem: cidade } : { destino: cidade }),
          etapa: ehOrigem ? 'destino' : 'modalidade',
          opcoes: undefined,
          tentativas: 0,
        },
      };
    }

    case 'modalidade': {
      const n = escolhaDeMenu(texto, 2);
      if (!n) return erro(estado);
      const modalidade: Modalidade = n === 1 ? 'dedicado' : 'fracionado';
      return {
        tipo: 'seguir',
        estado: {
          ...estado,
          modalidade,
          // Dedicado pergunta veículo; fracionado pergunta peso. É por isso que a
          // contagem "4/5" cabe nos dois caminhos — muda a pergunta, não o total.
          etapa: modalidade === 'dedicado' ? 'veiculo' : 'peso',
          tentativas: 0,
        },
      };
    }

    case 'veiculo': {
      const n = escolhaDeMenu(texto, VEICULOS.length);
      if (!n) return erro(estado);
      // Escolhido o veículo, o tipo de carga depende dele: a tabela de frete é por
      // veículo no TMS. Então aqui não se avança — pede-se o catálogo.
      return { tipo: 'buscar_cargas', vehicleType: VEICULOS[n - 1] };
    }

    case 'carga': {
      const opcoes = estado.opcoesCarga ?? [];
      const n = escolhaDeMenu(texto, opcoes.length);
      if (!n) return erro(estado);
      return {
        tipo: 'seguir',
        estado: {
          ...estado,
          cargoType: opcoes[n - 1],
          etapa: 'valor',
          opcoesCarga: undefined,
          tentativas: 0,
        },
      };
    }

    case 'peso': {
      const kg = numero(texto);
      if (kg === null) return erro(estado);
      return { tipo: 'seguir', estado: { ...estado, pesoKg: kg, etapa: 'valor', tentativas: 0 } };
    }

    case 'valor': {
      const v = numero(texto);
      if (v === null) return erro(estado);
      return {
        tipo: 'seguir',
        estado: { ...estado, valorMercadoria: v, etapa: 'pronto', tentativas: 0 },
      };
    }

    default:
      return { tipo: 'seguir', estado };
  }
}

/**
 * Estado depois da busca de cidade no TMS.
 *
 * Uma cidade só avança direto, mas fica GRAVADA — é dela que sai o eco na pergunta
 * seguinte ("Origem: São Paulo/SP ✓"), que é a última trava contra cidade errada.
 */
export function comCidadesEncontradas(
  estado: EstadoCotacao,
  encontradas: readonly CidadeDoTms[],
  uf: string | null,
  para: 'origem' | 'destino',
): Passo {
  const cidades = filtrarPorUf(encontradas, uf);
  if (!cidades.length) return erro(estado);

  if (cidades.length === 1) {
    const [cidade] = cidades;
    return {
      tipo: 'seguir',
      estado: {
        ...estado,
        ...(para === 'origem' ? { origem: cidade } : { destino: cidade }),
        etapa: para === 'origem' ? 'destino' : 'modalidade',
        opcoes: undefined,
        tentativas: 0,
      },
    };
  }

  return {
    tipo: 'seguir',
    estado: {
      ...estado,
      etapa: para === 'origem' ? 'escolher_origem' : 'escolher_destino',
      opcoes: cidades.slice(0, MAX_OPCOES),
      tentativas: 0,
    },
  };
}

/**
 * Estado depois de buscar os tipos de carga daquele veículo.
 *
 * Três saídas, e as três importam:
 *
 *   vazio  → o tenant não tem tabela de frete para esse veículo. Perguntar de novo não
 *            resolve, e deixar seguir daria erro na cotação lá na frente, longe da causa.
 *   um só  → não pergunta. Escolha única não é escolha, e uma pergunta com uma opção só
 *            faz o fluxo parecer burro. Continua em 5 perguntas.
 *   vários → menu com os rótulos EXATOS do tenant. O motor do TMS casa `cargoType` por
 *            igualdade estrita, então rótulo escrito por nós nunca casaria.
 */
export function comCargasEncontradas(
  estado: EstadoCotacao,
  vehicleType: Veiculo,
  cargas: readonly string[],
): Passo {
  const base = { ...estado, veiculo: vehicleType, tentativas: 0 };
  if (!cargas.length) return { tipo: 'sem_tabela', estado: base };

  if (cargas.length === 1) {
    return {
      tipo: 'seguir',
      estado: { ...base, cargoType: cargas[0], etapa: 'valor', opcoesCarga: undefined },
    };
  }

  return {
    tipo: 'seguir',
    estado: { ...base, etapa: 'carga', opcoesCarga: cargas.slice(0, MAX_OPCOES) },
  };
}

/**
 * Onde a pessoa está, e quantas perguntas tem o caminho dela.
 *
 * O total MUDA com a modalidade: dedicado tem veículo e carga (6), fracionado tem peso
 * (5). Fixar em 5 faria o dedicado mostrar "6/5"; fixar em 6 prometeria ao fracionado uma
 * pergunta que nunca vem. Antes de escolher a modalidade o total é 5 — que é o caminho
 * mais curto, e crescer para 6 é melhor que anunciar 6 e entregar 5.
 */
export function passoAtual(estado: EstadoCotacao): { n: number; total: number } | null {
  // `veiculo` e `carga` só existem no caminho dedicado, então a etapa por si já diz qual
  // é o caminho. Depender só de `modalidade` fazia a contagem DESAPARECER num estado que
  // ainda não a tivesse gravada — e pergunta sem contador no meio de um fluxo que tem
  // contador parece defeito.
  const dedicado =
    estado.modalidade === 'dedicado' || estado.etapa === 'veiculo' || estado.etapa === 'carga';
  const ordem: Record<string, number> = dedicado
    ? { origem: 1, escolher_origem: 1, destino: 2, escolher_destino: 2, modalidade: 3, veiculo: 4, carga: 5, valor: 6 }
    : { origem: 1, escolher_origem: 1, destino: 2, escolher_destino: 2, modalidade: 3, peso: 4, valor: 5 };
  const n = ordem[estado.etapa];
  return n ? { n, total: dedicado ? 6 : 5 } : null;
}

/**
 * O corpo que vai para `POST /nexa/quote`.
 *
 * Tudo em INGLÊS, e não misturado como na primeira versão: o padrão da API do TMS é
 * inglês, e o PRD deles já fala `originCode`, `merchandiseValue`, `distanceKm`. Contrato
 * bilíngue é o tipo de coisa que se paga caro para desfazer depois — o próprio time do
 * TMS lembrou que mudança unilateral de contrato derrubou o suporte em 09/07/2026.
 *
 * `null` = ainda falta campo, e quem chama não deve mandar nada.
 */
export interface CorpoDaCotacao {
  originCode: string;
  destCode: string;
  freightMode: 'DEDICATED' | 'FRACTIONAL';
  vehicleType: Veiculo | null;
  /// Rótulo exato da tabela do tenant. Opcional no contrato: sem ele o TMS infere.
  cargoType: string | null;
  weightKg: number | null;
  merchandiseValue: number;
}

export function dadosDaCotacao(estado: EstadoCotacao): CorpoDaCotacao | null {
  if (estado.etapa !== 'pronto') return null;
  if (!estado.origem || !estado.destino || !estado.modalidade || !estado.valorMercadoria) {
    return null;
  }
  return {
    originCode: estado.origem.code,
    destCode: estado.destino.code,
    freightMode: estado.modalidade === 'dedicado' ? 'DEDICATED' : 'FRACTIONAL',
    vehicleType: estado.veiculo ?? null,
    cargoType: estado.cargoType ?? null,
    weightKg: estado.pesoKg ?? null,
    merchandiseValue: estado.valorMercadoria,
  };
}
