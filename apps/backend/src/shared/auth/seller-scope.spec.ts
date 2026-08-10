import { describe, it, expect } from 'vitest';
import { escopoDeVendedor, filtroDeDono, comEscopo } from './seller-scope';

/**
 * "Cada vendedor no seu galho" — e o galho do admin é a árvore inteira.
 *
 * Estes testes existem porque o modo de falhar aqui é SILENCIOSO: a tela continua
 * carregando, só mostrando dados de quem não devia. Ninguém percebe até um
 * vendedor comentar de um lead que não é dele.
 */

describe('escopoDeVendedor — quem é limitado', () => {
  it('vendedor fica preso ao próprio id', () => {
    expect(escopoDeVendedor({ role: 'vendedor', sellerId: 'sel-1' })).toBe('sel-1');
  });

  // Sem isto, admin e gestor perderiam a visão que sempre tiveram — o oposto do pedido.
  it('admin, gestor, operacional e financeiro veem tudo', () => {
    for (const role of ['admin', 'gestor', 'operacional', 'financeiro']) {
      expect(escopoDeVendedor({ role, sellerId: 'sel-1' })).toBeUndefined();
    }
  });

  // Fail-closed: papel de vendedor sem vínculo NÃO pode virar "vê tudo".
  it('vendedor sem vínculo recebe um id que não casa com ninguém', () => {
    expect(escopoDeVendedor({ role: 'vendedor' })).toBe('__none__');
    expect(escopoDeVendedor({ role: 'vendedor', sellerId: null })).toBe('__none__');
  });

  it('sem usuário não limita (rota interna, sem sessão)', () => {
    expect(escopoDeVendedor(undefined)).toBeUndefined();
  });
});

describe('filtroDeDono — o que entra no where', () => {
  it('sem escopo não filtra nada', () => {
    expect(filtroDeDono(undefined)).toEqual({});
  });

  // Sem dono é de todo mundo: é o estado da base inteira antes do campo existir,
  // e é o lead que entrou pelo site sem ninguém para atender.
  it('com escopo, pega o que é dele MAIS o que não tem dono', () => {
    expect(filtroDeDono('sel-1')).toEqual({
      OR: [{ ownerSellerId: 'sel-1' }, { ownerSellerId: null }],
    });
  });
});

describe('comEscopo — o furo que isto fecha', () => {
  it('sem escopo devolve o where intacto', () => {
    const w = { tenantId: 't1', status: 'active' };
    expect(comEscopo(w, undefined)).toBe(w);
  });

  /**
   * O caso que motivou a função: a busca por nome/e-mail também usa `OR`.
   * Espalhando os dois no mesmo objeto, o segundo apaga o primeiro — e o vendedor
   * passa a ver a base inteira no instante em que digita na busca.
   */
  it('escopo e busca convivem — um OR não apaga o outro', () => {
    const busca = {
      tenantId: 't1',
      OR: [{ name: { contains: 'aurora' } }, { email: { contains: 'aurora' } }],
    };

    const r: any = comEscopo(busca, 'sel-1');

    expect(r.AND).toHaveLength(2);
    // o OR da busca sobreviveu…
    expect(r.AND[0].OR).toHaveLength(2);
    expect(JSON.stringify(r.AND[0])).toContain('aurora');
    // …e o do escopo também
    expect(r.AND[1]).toEqual(filtroDeDono('sel-1'));
    // e nenhum OR ficou solto na raiz para ser sobrescrito
    expect(r.OR).toBeUndefined();
  });

  it('preserva um AND que já existia', () => {
    const w = { tenantId: 't1', AND: [{ status: 'active' }] };
    const r: any = comEscopo(w, 'sel-1');
    expect(r.AND).toHaveLength(3); // o que existia + o resto + o escopo
  });

  it('o tenant continua no where — escopo não substitui isolamento de cliente', () => {
    const r: any = comEscopo({ tenantId: 't1' }, 'sel-1');
    expect(JSON.stringify(r)).toContain('t1');
  });
});
