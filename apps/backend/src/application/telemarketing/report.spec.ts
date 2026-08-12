import { describe, expect, it } from 'vitest';
import {
  AMOSTRA_MINIMA,
  aproveitamento,
  compararRoteiros,
  conversaoDoLote,
  type LinhaDeLote,
  type LinhaDeVendedor,
} from './report';

const lote = (p: Partial<LinhaDeLote>): LinhaDeLote => ({
  nome: 'Lote',
  productCode: 'tms',
  recebidos: 0,
  validos: 0,
  oportunidades: 0,
  ganhos: 0,
  perdidos: 0,
  emAndamento: 0,
  ...p,
});

describe('taxa não sai com amostra pequena', () => {
  it('6 válidos e 1 ganho NÃO viram 17%', () => {
    // O caso que motivou a regra: com número pequeno, percentual convence alguém a
    // comprar mais lista por causa de um ganho.
    const r = conversaoDoLote(lote({ validos: 6, ganhos: 1 }));
    expect(r.percentual).toBeNull();
    expect(r.amostraPequena).toBe(true);
    expect(r.base).toBe(6);
  });

  it('no limite da amostra mínima, já calcula', () => {
    const r = conversaoDoLote(lote({ validos: AMOSTRA_MINIMA, ganhos: 5 }));
    expect(r.amostraPequena).toBe(false);
    expect(r.percentual).toBeCloseTo(25);
  });
});

describe('conversão usa VÁLIDOS como denominador, não recebidos', () => {
  it('lista suja não se elogia sozinha', () => {
    // 100 linhas, 60 válidas, 6 ganhos. Sobre recebidos daria 6%; o certo é 10%.
    const r = conversaoDoLote(lote({ recebidos: 100, validos: 60, ganhos: 6 }));
    expect(r.percentual).toBeCloseTo(10);
    expect(r.base).toBe(60);
  });
});

describe('aproveitamento do SDR mede o trabalho dele', () => {
  const v = (p: Partial<LinhaDeVendedor>): LinhaDeVendedor => ({
    nome: 'SDR',
    atividades: 0,
    atendeu: 0,
    passouCloser: 0,
    ganhos: 0,
    ...p,
  });

  it('denominador é tentativa, não lead recebido', () => {
    // Dois SDRs com o mesmo aproveitamento e listas de qualidade diferente têm que
    // aparecer iguais aqui — senão demite-se a pessoa errada.
    const a = aproveitamento(v({ atividades: 40, atendeu: 10 }));
    const b = aproveitamento(v({ atividades: 40, atendeu: 10, ganhos: 0 }));
    expect(a.percentual).toBeCloseTo(25);
    expect(b.percentual).toBeCloseTo(a.percentual!);
  });

  it('8 atividades ainda não rende número', () => {
    expect(aproveitamento(v({ atividades: 8, atendeu: 1 })).percentual).toBeNull();
  });
});

describe('comparação de versões do roteiro', () => {
  it('ordena pela melhor e avisa quantas ficaram de fora', () => {
    const r = compararRoteiros([
      { versao: 1, acoes: 50, atendeu: 10 }, // 20%
      { versao: 2, acoes: 40, atendeu: 12 }, // 30%
      { versao: 3, acoes: 5, atendeu: 4 }, // amostra pequena, mesmo com 80%
    ]);

    expect(r.comparaveis.map((c) => c.versao)).toEqual([2, 1]);
    // A v3 tem a melhor taxa aparente e é justamente a que não pode entrar.
    expect(r.omitidasPorAmostra).toBe(1);
  });

  it('nenhuma versão com dado suficiente devolve lista vazia e o aviso', () => {
    const r = compararRoteiros([{ versao: 5, acoes: 8, atendeu: 1 }]);
    expect(r.comparaveis).toEqual([]);
    expect(r.omitidasPorAmostra).toBe(1);
  });
});
