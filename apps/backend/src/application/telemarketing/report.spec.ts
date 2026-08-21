import { describe, expect, it } from 'vitest';
import {
  AMOSTRA_MINIMA,
  aproveitamento,
  compararRoteiros,
  conversaoDaCampanha,
  conversaoDoLote,
  respostaDaCampanha,
  type LinhaDeCampanha,
  type LinhaDeLote,
  type LinhaDeVendedor,
} from './report';

const campanha = (p: Partial<LinhaDeCampanha>): LinhaDeCampanha => ({
  nome: 'Campanha',
  canal: 'email',
  enviados: 100,
  oportunidades: 10,
  ganhos: 2,
  perdidos: 3,
  emAndamento: 5,
  ...p,
});

describe('conversão e resposta por campanha', () => {
  // O denominador é o que foi ENTREGUE, e é isso que separa "valeu disparar?" de
  // "de quem respondeu, quantos fecharam?".
  it('conversão é sobre entregues, não sobre quem respondeu', () => {
    const c = conversaoDaCampanha(campanha({ enviados: 100, oportunidades: 10, ganhos: 2 }));
    expect(c.percentual).toBe(2); // 2 de 100, não 2 de 10
    expect(c.base).toBe(100);
  });

  it('resposta mede quantos entregues viraram lead no funil', () => {
    const r = respostaDaCampanha(campanha({ enviados: 200, oportunidades: 20 }));
    expect(r.percentual).toBe(10);
  });

  // As duas juntas separam problemas diferentes: resposta baixa é lista ou mensagem;
  // resposta alta com conversão baixa é o comercial não fechando.
  it('resposta alta com conversão baixa aparece como dois números distintos', () => {
    const c = campanha({ enviados: 100, oportunidades: 30, ganhos: 1 });
    expect(respostaDaCampanha(c).percentual).toBe(30);
    expect(conversaoDaCampanha(c).percentual).toBe(1);
  });

  // Campanha de teste com meia dúzia de envios não pode virar percentual: alguém
  // repetiria o disparo por causa de um número que é ruído.
  it('amostra pequena não vira percentual, nas duas taxas', () => {
    const c = campanha({ enviados: AMOSTRA_MINIMA - 1, oportunidades: 3, ganhos: 1 });
    expect(conversaoDaCampanha(c).percentual).toBeNull();
    expect(conversaoDaCampanha(c).amostraPequena).toBe(true);
    expect(respostaDaCampanha(c).percentual).toBeNull();
  });

  // Campanha que não entregou nada precisa aparecer no relatório sem quebrar — é
  // justamente a que alguém precisa investigar.
  it('campanha sem envio nenhum não divide por zero', () => {
    const c = campanha({ enviados: 0, oportunidades: 0, ganhos: 0 });
    expect(conversaoDaCampanha(c).percentual).toBeNull();
    expect(conversaoDaCampanha(c).base).toBe(0);
  });
});

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
