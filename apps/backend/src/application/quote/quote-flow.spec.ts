import { describe, expect, it } from 'vitest';
import {
  comCidadesEncontradas,
  dadosDaCotacao,
  ehGatilho,
  ehSaida,
  novaCotacao,
  responder,
  MAX_TENTATIVAS,
  type EstadoCotacao,
} from './quote-flow';
import type { CidadeDoTms } from './quote-city';

const CAMPINAS: CidadeDoTms = { code: '3509502', name: 'Campinas', state: 'SP' };
const BH: CidadeDoTms = { code: '3106200', name: 'Belo Horizonte', state: 'MG' };
const SANTAS: CidadeDoTms[] = [
  { code: '1', name: 'Santa Rita', state: 'PB' },
  { code: '2', name: 'Santa Rita do Sapucaí', state: 'MG' },
];

/// Leva o estado até a etapa pedida, pelo caminho normal.
function ate(etapa: EstadoCotacao['etapa']): EstadoCotacao {
  let e = novaCotacao();
  const seguir = (p: ReturnType<typeof responder>) => {
    if (p.tipo !== 'seguir') throw new Error('esperava seguir, veio ' + p.tipo);
    return p.estado;
  };
  if (etapa === 'origem') return e;
  e = seguir(comCidadesEncontradas(e, [CAMPINAS], 'SP', 'origem'));
  if (etapa === 'destino') return e;
  e = seguir(comCidadesEncontradas(e, [BH], 'MG', 'destino'));
  if (etapa === 'modalidade') return e;
  e = seguir(responder(e, '1')); // dedicado
  if (etapa === 'veiculo') return e;
  e = seguir(responder(e, '2')); // carreta
  return e; // valor
}

describe('gatilho e saída', () => {
  it('abre com as palavras combinadas, com ou sem acento', () => {
    for (const t of ['cotar', 'COTAR', 'cotação', 'cotacao', 'frete', 'cotar frete de sp']) {
      expect(ehGatilho(t)).toBe(true);
    }
  });

  it('não abre com palavra que só CONTÉM o gatilho', () => {
    // "descotar" ou "fretecheio" no meio de um papo não pode sequestrar a conversa.
    expect(ehGatilho('descotar')).toBe(false);
    expect(ehGatilho('fretecheio')).toBe(false);
  });

  it('sair cancela de qualquer etapa', () => {
    expect(ehSaida('sair')).toBe(true);
    const p = responder(ate('veiculo'), 'sair');
    expect(p.tipo === 'seguir' && p.estado.etapa).toBe('cancelado');
  });
});

describe('as 5 perguntas', () => {
  it('cidade vai para a busca, não é adivinhada aqui', () => {
    const p = responder(novaCotacao(), 'Campinas SP');
    expect(p).toEqual({ tipo: 'buscar_cidade', termo: 'campinas', uf: 'SP', para: 'origem' });
  });

  it('uma cidade só avança E fica gravada — é dela que sai o eco', () => {
    const p = comCidadesEncontradas(novaCotacao(), [CAMPINAS], 'SP', 'origem');
    expect(p.tipo).toBe('seguir');
    if (p.tipo !== 'seguir') return;
    expect(p.estado.origem).toEqual(CAMPINAS);
    expect(p.estado.etapa).toBe('destino');
  });

  it('mais de uma cidade vira menu, cortado no teto', () => {
    const p = comCidadesEncontradas(novaCotacao(), SANTAS, null, 'origem');
    expect(p.tipo).toBe('seguir');
    if (p.tipo !== 'seguir') return;
    expect(p.estado.etapa).toBe('escolher_origem');
    expect(p.estado.opcoes).toHaveLength(2);
  });

  it('escolher pelo número do menu grava a cidade certa', () => {
    const menu = comCidadesEncontradas(novaCotacao(), SANTAS, null, 'origem');
    if (menu.tipo !== 'seguir') throw new Error('menu');
    const p = responder(menu.estado, '2');
    expect(p.tipo === 'seguir' && p.estado.origem?.state).toBe('MG');
  });

  it('dedicado pergunta veículo; fracionado pergunta peso', () => {
    const m = ate('modalidade');
    const ded = responder(m, '1');
    const fra = responder(m, '2');
    expect(ded.tipo === 'seguir' && ded.estado.etapa).toBe('veiculo');
    expect(fra.tipo === 'seguir' && fra.estado.etapa).toBe('peso');
  });

  it('aceita número como gente escreve', () => {
    for (const [escrito, esperado] of [
      ['80000', 80000],
      ['80.000', 80000],
      ['R$ 80.000,00', 80000],
      ['80000,50', 80000.5],
    ] as const) {
      const p = responder(ate('valor'), escrito);
      expect(p.tipo === 'seguir' && p.estado.valorMercadoria, escrito).toBe(esperado);
    }
  });

  it('recusa valor por extenso em vez de chutar', () => {
    // "80 mil" viraria 80 se alguém "interpretasse" — e isso é valor de seguro.
    const p = responder(ate('valor'), '80 mil');
    expect(p.tipo).toBe('repetir');
  });

  it('recusa zero e negativo', () => {
    expect(responder(ate('valor'), '0').tipo).toBe('repetir');
    expect(responder(ate('valor'), '-5').tipo).toBe('repetir');
  });
});

describe('erro e desistência', () => {
  it('conta erro no campo atual e desiste na terceira', () => {
    let e = ate('modalidade');
    for (let i = 1; i < MAX_TENTATIVAS; i++) {
      const p = responder(e, 'sei la');
      expect(p.tipo).toBe('repetir');
      if (p.tipo !== 'repetir') return;
      expect(p.motivo).toBe('invalido');
      e = p.estado;
    }
    const ultima = responder(e, 'sei la');
    expect(ultima.tipo === 'repetir' && ultima.motivo).toBe('desistiu');
  });

  it('acertar ZERA a contagem — erro num campo não condena o próximo', () => {
    const errado = responder(ate('modalidade'), 'xxx');
    if (errado.tipo !== 'repetir') throw new Error('esperava repetir');
    expect(errado.estado.tentativas).toBe(1);
    const certo = responder(errado.estado, '1');
    expect(certo.tipo === 'seguir' && certo.estado.tentativas).toBe(0);
  });

  it('busca sem resultado conta como erro, não avança', () => {
    const p = comCidadesEncontradas(novaCotacao(), [], null, 'origem');
    expect(p.tipo).toBe('repetir');
  });
});

describe('dados para o TMS', () => {
  it('só entrega quando está pronto', () => {
    expect(dadosDaCotacao(ate('valor'))).toBeNull();
  });

  it('dedicado entrega veículo e peso nulo', () => {
    const p = responder(ate('valor'), '80000');
    if (p.tipo !== 'seguir') throw new Error('esperava seguir');
    expect(dadosDaCotacao(p.estado)).toEqual({
      originCode: CAMPINAS.code,
      destCode: BH.code,
      freightMode: 'DEDICATED',
      vehicleType: 'carreta',
      weightKg: null,
      merchandiseValue: 80000,
    });
  });

  it('fracionado entrega peso e veículo nulo', () => {
    let e = ate('modalidade');
    const fra = responder(e, '2');
    if (fra.tipo !== 'seguir') throw new Error('modalidade');
    const peso = responder(fra.estado, '500');
    if (peso.tipo !== 'seguir') throw new Error('peso');
    const valor = responder(peso.estado, '12000');
    if (valor.tipo !== 'seguir') throw new Error('valor');
    expect(dadosDaCotacao(valor.estado)).toMatchObject({
      freightMode: 'FRACTIONAL',
      vehicleType: null,
      weightKg: 500,
      merchandiseValue: 12000,
    });
  });
});
