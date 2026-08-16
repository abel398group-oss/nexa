import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { MarketScopeService, filtroDeMercado, assertMercado } from './market-scope.service';

/**
 * "Cada operador no mercado dele" — e o modo de falhar é silencioso NOS DOIS SENTIDOS.
 *
 * Escopo de menos e o SDR lê a carteira do colega, sem nada na tela indicando. Escopo
 * demais e a fila abre vazia: o operador acha que acabou o trabalho e vai embora. Por
 * isso cada caso da tabela-verdade tem um teste, inclusive a válvula.
 */
function makeSvc(vinculos: { productCode: string }[], totalNoTenant: number) {
  const prisma = {
    sellerMarket: {
      findMany: vi.fn().mockResolvedValue(vinculos),
      count: vi.fn().mockResolvedValue(totalNoTenant),
    },
  };
  return { svc: new MarketScopeService(prisma as any), prisma };
}

describe('mercadosDoUsuario — quem é limitado', () => {
  it('admin vê todos os mercados', async () => {
    const { svc, prisma } = makeSvc([], 5);
    expect(await svc.mercadosDoUsuario('t1', { role: 'admin', sellerId: 's1' })).toBeUndefined();
    // Nem consulta: admin passa antes de qualquer query.
    expect(prisma.sellerMarket.count).not.toHaveBeenCalled();
  });

  it('quem não opera lead não é limitado — não regride operacional/gestor', async () => {
    const { svc } = makeSvc([], 5);
    expect(await svc.mercadosDoUsuario('t1', { role: 'operacional', permissions: ['inbox'] })).toBeUndefined();
  });

  it('SDR vinculado fica preso aos mercados dele', async () => {
    const { svc } = makeSvc([{ productCode: 'agabe' }, { productCode: 'oleo' }], 9);
    expect(await svc.mercadosDoUsuario('t1', { permissions: ['sdr'], sellerId: 's1' }))
      .toEqual(['agabe', 'oleo']);
  });

  it('closer também é limitado', async () => {
    const { svc } = makeSvc([{ productCode: 'pneus' }], 9);
    expect(await svc.mercadosDoUsuario('t1', { permissions: ['closer'], sellerId: 's2' }))
      .toEqual(['pneus']);
  });

  it('quem ainda tem a permissão antiga é limitado igual', async () => {
    const { svc } = makeSvc([{ productCode: 'agabe' }], 9);
    expect(await svc.mercadosDoUsuario('t1', { permissions: ['telemarketing'], sellerId: 's1' }))
      .toEqual(['agabe']);
  });

  // Fail-closed: é o furo que existia até hoje — SDR criado como `operacional` sem
  // sellerId caía em "sem escopo" e via a fila inteira do tenant.
  it('opera lead mas sem vínculo de vendedor NÃO vira "vê tudo"', async () => {
    const { svc } = makeSvc([], 9);
    expect(await svc.mercadosDoUsuario('t1', { permissions: ['sdr'], sellerId: null })).toEqual([]);
  });

  it('vendedor vinculado a nenhum mercado fica com lista vazia, não com tudo', async () => {
    const { svc } = makeSvc([], 9);
    expect(await svc.mercadosDoUsuario('t1', { permissions: ['sdr'], sellerId: 's9' })).toEqual([]);
  });
});

describe('mercadosDoUsuario — válvula de alívio', () => {
  // Sem isto, o deploy zeraria a fila de todo mundo: `seller_markets` está esparsa e a
  // maior parte da operação nunca vinculou ninguém. Mesma escada de markets.service.
  it('tenant SEM nenhum vínculo não aplica escopo, mesmo para SDR sem vendedor', async () => {
    const { svc } = makeSvc([], 0);
    expect(await svc.mercadosDoUsuario('t1', { permissions: ['sdr'], sellerId: null })).toBeUndefined();
  });

  it('basta UM vínculo no tenant para a regra passar a valer', async () => {
    const { svc } = makeSvc([], 1);
    expect(await svc.mercadosDoUsuario('t1', { permissions: ['sdr'], sellerId: 's9' })).toEqual([]);
  });
});

describe('mercadosDoUsuario — cache', () => {
  it('não repete a consulta dentro da janela', async () => {
    const { svc, prisma } = makeSvc([{ productCode: 'agabe' }], 9);
    const user = { permissions: ['sdr'], sellerId: 's1' };
    await svc.mercadosDoUsuario('t1', user);
    await svc.mercadosDoUsuario('t1', user);
    expect(prisma.sellerMarket.count).toHaveBeenCalledTimes(1);
  });

  // O caso "sem escopo" é o mais comum hoje; se ele não fosse cacheado, seria o único
  // a bater no banco a cada request.
  it('cacheia também o resultado sem escopo', async () => {
    const { svc, prisma } = makeSvc([], 0);
    const user = { permissions: ['sdr'], sellerId: 's1' };
    await svc.mercadosDoUsuario('t1', user);
    await svc.mercadosDoUsuario('t1', user);
    expect(prisma.sellerMarket.count).toHaveBeenCalledTimes(1);
  });

  it('invalidar força a próxima consulta', async () => {
    const { svc, prisma } = makeSvc([{ productCode: 'agabe' }], 9);
    const user = { permissions: ['sdr'], sellerId: 's1' };
    await svc.mercadosDoUsuario('t1', user);
    svc.invalidar('t1', 's1');
    await svc.mercadosDoUsuario('t1', user);
    expect(prisma.sellerMarket.count).toHaveBeenCalledTimes(2);
  });
});

describe('filtroDeMercado — o que entra no where', () => {
  it('sem escopo não filtra nada', () => {
    expect(filtroDeMercado(undefined)).toEqual({});
  });

  it('com escopo restringe aos mercados', () => {
    expect(filtroDeMercado(['agabe'])).toEqual({ productCode: { in: ['agabe'] } });
  });

  // `{ in: [] }` não casa com nada — é o fail-closed. Um `{}` aqui devolveria a base
  // inteira para quem não tem vínculo, que é o oposto do pedido.
  it('lista vazia não casa com nada, em vez de liberar tudo', () => {
    expect(filtroDeMercado([])).toEqual({ productCode: { in: [] } });
  });
});

describe('assertMercado — rota que recebe o mercado por parâmetro', () => {
  it('sem escopo deixa passar qualquer mercado', () => {
    expect(() => assertMercado(undefined, 'qualquer')).not.toThrow();
  });

  it('mercado próprio passa', () => {
    expect(() => assertMercado(['agabe', 'oleo'], 'oleo')).not.toThrow();
  });

  it('mercado alheio é recusado', () => {
    expect(() => assertMercado(['agabe'], 'pneus')).toThrow(ForbiddenException);
  });

  // Sem esta linha, `?productCode=` vazio driblava o assert e caía na consulta sem filtro.
  it('mercado ausente é recusado quando há escopo', () => {
    expect(() => assertMercado(['agabe'], undefined)).toThrow(ForbiddenException);
    expect(() => assertMercado(['agabe'], '')).toThrow(ForbiddenException);
  });
});
