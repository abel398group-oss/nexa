import { describe, it, expect } from 'vitest';
import { parseEmailList } from './CampaignsPage';

/**
 * `parseEmailList` decide DUAS coisas ao mesmo tempo: o número que o operador lê
 * embaixo do campo e a lista que vai no payload. Enquanto forem a mesma função
 * elas não podem divergir — que era o bug de origem, medido em 13/08/2026.
 */
describe('parseEmailList', () => {
  it('conta só os endereços válidos, ignorando o lixo do meio', () => {
    const r = parseEmailList(
      'nao-e-email\nzz.a@example.com\n@empresa.com\nzz.b@example.com\noutro@@x.com\nespaco no meio@example.com',
    );
    expect(r).toEqual(['zz.a@example.com', 'zz.b@example.com']);
  });

  // O rodapé mostrava "3" para o mesmo endereço três vezes, e a campanha nascia
  // com 1 — o backend já desduplicava. A tela é que contava outra coisa.
  it('desduplica, inclusive quando só muda a caixa', () => {
    const r = parseEmailList('zz.a@example.com\nzz.a@example.com\nZZ.A@EXAMPLE.COM');
    expect(r).toEqual(['zz.a@example.com']);
  });

  // Colar de Outlook / de uma coluna de planilha traz tudo numa linha só. Antes
  // o campo respondia "0 detectado(s)" para uma lista visivelmente cheia.
  it('aceita vírgula e ponto-e-vírgula como separador', () => {
    expect(parseEmailList(' zz.a@example.com , zz.b@example.com ')).toEqual([
      'zz.a@example.com',
      'zz.b@example.com',
    ]);
    expect(parseEmailList('zz.a@example.com; zz.b@example.com')).toEqual([
      'zz.a@example.com',
      'zz.b@example.com',
    ]);
  });

  it('a quebra de linha continua funcionando como sempre funcionou', () => {
    expect(parseEmailList('zz.a@example.com\nzz.b@example.com')).toEqual([
      'zz.a@example.com',
      'zz.b@example.com',
    ]);
  });

  it('espaço sobrando em volta não atrapalha', () => {
    expect(parseEmailList('  zz.a@example.com  \n\n  zz.b@example.com  ')).toEqual([
      'zz.a@example.com',
      'zz.b@example.com',
    ]);
  });

  it('lista vazia ou só lixo devolve nada — é o que trava o "Criar campanha"', () => {
    expect(parseEmailList('')).toEqual([]);
    expect(parseEmailList('\n\n  \n')).toEqual([]);
    expect(parseEmailList('nao-e-email\n@x.com\njoao@')).toEqual([]);
  });

  it('preserva a ordem em que foram digitados', () => {
    expect(parseEmailList('zz.c@example.com\nzz.a@example.com\nzz.b@example.com')).toEqual([
      'zz.c@example.com',
      'zz.a@example.com',
      'zz.b@example.com',
    ]);
  });
});
