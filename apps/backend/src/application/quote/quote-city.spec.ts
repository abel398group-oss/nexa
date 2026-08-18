import { describe, expect, it } from 'vitest';
import { filtrarPorUf, prepararBuscaDeCidade, type CidadeDoTms } from './quote-city';

describe('preparação do texto de cidade', () => {
  it('separa a UF em qualquer separador comum', () => {
    for (const entrada of ['Campinas SP', 'Campinas/SP', 'Campinas-SP', 'Campinas, SP', 'Campinas   sp']) {
      expect(prepararBuscaDeCidade(entrada)).toEqual({ termo: 'campinas', uf: 'SP' });
    }
  });

  it('tira acento, espaço sobrando e enfeite', () => {
    expect(prepararBuscaDeCidade('  de  São Paulo/sp ')).toEqual({ termo: 'sao paulo', uf: 'SP' });
    expect(prepararBuscaDeCidade('cidade de Brasília')).toEqual({ termo: 'brasilia', uf: null });
  });

  it('duas letras que NÃO são UF continuam sendo parte do nome', () => {
    // "Rio do Sul" perderia o "Sul" se a regra fosse "último token de 2 letras".
    expect(prepararBuscaDeCidade('Rio do Sul')).toEqual({ termo: 'rio do sul', uf: null });
    expect(prepararBuscaDeCidade('Ji-Paraná')).toEqual({ termo: 'ji-parana', uf: null });
  });

  it('sem UF, devolve o nome inteiro para a busca decidir', () => {
    expect(prepararBuscaDeCidade('santa rita')).toEqual({ termo: 'santa rita', uf: null });
  });

  it('não inventa apelido — "sampa" segue sendo "sampa"', () => {
    // De propósito: apelido e correção por semelhança é onde se erra cidade com
    // confiança, e cidade errada vira preço errado sem ninguém ver.
    expect(prepararBuscaDeCidade('sampa')).toEqual({ termo: 'sampa', uf: null });
  });

  it('entrada vazia ou lixo não quebra', () => {
    expect(prepararBuscaDeCidade('')).toEqual({ termo: '', uf: null });
    expect(prepararBuscaDeCidade('   ')).toEqual({ termo: '', uf: null });
    expect(prepararBuscaDeCidade(undefined as any)).toEqual({ termo: '', uf: null });
  });
});

describe('filtro por UF sobre o resultado do TMS', () => {
  const cidades: CidadeDoTms[] = [
    { code: '1', name: 'Santa Rita', state: 'PB' },
    { code: '2', name: 'Santa Rita do Sapucaí', state: 'MG' },
    { code: '3', name: "Santa Rita d'Oeste", state: 'SP' },
  ];

  it('a UF do usuário corta a lista', () => {
    expect(filtrarPorUf(cidades, 'MG').map((c) => c.code)).toEqual(['2']);
  });

  it('sem UF, devolve tudo', () => {
    expect(filtrarPorUf(cidades, null)).toHaveLength(3);
  });

  it('UF que não casa devolve a lista ORIGINAL, não vazia', () => {
    // Sumir com tudo faria a tela dizer "não achei" sobre cidade que existe. Melhor
    // mostrar as de outros estados e deixar a pessoa escolher.
    expect(filtrarPorUf(cidades, 'AC')).toHaveLength(3);
  });
});
