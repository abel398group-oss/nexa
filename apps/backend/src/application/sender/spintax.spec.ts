import { describe, it, expect } from 'vitest';
import { spin, spinVariants } from './spintax';

/** Gerador determinístico: sempre escolhe a opção do índice pedido. */
const pick = (index: number) => () => index / 10;

describe('spin — retrocompatibilidade (o que NÃO pode mudar)', () => {
  it('template sem chaves passa intacto', () => {
    const t = 'Oi João, tudo bem? Sou a Lia da Hipervias.';
    expect(spin(t)).toBe(t);
  });

  it('chave sem pipe não é tocada — não é grupo de variação', () => {
    expect(spin('Use {enter} para continuar')).toBe('Use {enter} para continuar');
  });

  it('{{nome}} sobrevive caso o spin rode antes da substituição', () => {
    // Nos renders o {{...}} sai primeiro, mas a garantia vale nos dois sentidos:
    // o par de chaves não contém `|`, logo não casa com o grupo.
    expect(spin('Oi {{nome}}, tudo bem?')).toBe('Oi {{nome}}, tudo bem?');
  });

  it('string vazia e nula não quebram', () => {
    expect(spin('')).toBe('');
    expect(spin(undefined as unknown as string)).toBe('');
  });
});

describe('spin — variação', () => {
  it('escolhe a primeira opção', () => {
    expect(spin('{Oi|Olá|Bom dia}, tudo bem?', pick(0))).toBe('Oi, tudo bem?');
  });

  it('escolhe a última opção', () => {
    expect(spin('{Oi|Olá|Bom dia}, tudo bem?', () => 0.99)).toBe('Bom dia, tudo bem?');
  });

  it('expande vários grupos na mesma frase', () => {
    expect(spin('{Oi|Olá} João! {Tudo bem|Como vai}?', pick(0))).toBe('Oi João! Tudo bem?');
  });

  it('opção vazia é válida — serve para incluir/omitir um trecho', () => {
    expect(spin('Bom dia{, tudo bem|}?', () => 0.99)).toBe('Bom dia?');
  });

  it('expande grupos aninhados', () => {
    expect(spin('{Oi|{Olá|Opa}} João', () => 0.99)).toBe('Opa João');
  });

  it('gera textos diferentes ao longo de vários envios', () => {
    const t = '{Oi|Olá|Bom dia} {{nome}}, {tudo bem|como vai}?';
    const saidas = new Set(Array.from({ length: 200 }, () => spin(t)));
    // 3 x 2 = 6 combinações; em 200 sorteios todas devem aparecer.
    expect(saidas.size).toBe(6);
  });
});

describe('spin — robustez (não pode derrubar o disparo)', () => {
  it('chave não fechada sai como está, sem lançar', () => {
    expect(() => spin('{Oi|Olá João')).not.toThrow();
    expect(spin('{Oi|Olá João')).toBe('{Oi|Olá João');
  });

  it('rand fora de faixa não estoura o array', () => {
    expect(spin('{a|b|c}', () => 1)).toBe('c');
    expect(spin('{a|b|c}', () => -1)).toBe('a');
    expect(spin('{a|b|c}', () => NaN)).toBe('a');
  });

  it('aninhamento absurdo termina em vez de travar o worker', () => {
    const fundo = '{a|b}'.padStart(200, '{').padEnd(400, '}');
    expect(() => spin(fundo)).not.toThrow();
  });
});

describe('spinVariants', () => {
  it('template sem variação = 1 mensagem possível', () => {
    expect(spinVariants('Oi {{nome}}, tudo bem?')).toBe(1);
  });

  it('multiplica as opções de cada grupo', () => {
    expect(spinVariants('{Oi|Olá|Bom dia} {{nome}}, {tudo bem|como vai}?')).toBe(6);
  });

  it('quatro grupos de quatro opções = 256', () => {
    expect(spinVariants('{a|b|c|d}{e|f|g|h}{i|j|k|l}{m|n|o|p}')).toBe(256);
  });
});
