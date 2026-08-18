import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MarketAssetsService, TAMANHO_MAXIMO } from './market-assets.service';

/**
 * O que estes testes protegem é a APROVAÇÃO.
 *
 * O material vira o que a Lia afirma para o lead. Um caminho que deixe texto não lido
 * chegar lá anula a razão de a aprovação existir — e o pior desses caminhos não é o
 * óbvio (subir já aprovado), é o silencioso: aprovar, editar o arquivo depois, e a
 * aprovação continuar valendo para um texto que ninguém releu.
 */
function makeSvc(market: any = { code: 'hipertms' }, asset: any = null) {
  const prisma = {
    product: { findUnique: vi.fn().mockResolvedValue(market) },
    marketAsset: {
      upsert: vi.fn().mockImplementation(({ create, update }: any) => ({ id: 'a1', ...create, ...update })),
      findFirst: vi.fn().mockResolvedValue(asset),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }: any) => ({ id: 'a1', ...asset, ...data })),
      delete: vi.fn().mockResolvedValue(asset),
    },
  };
  return { svc: new MarketAssetsService(prisma as any), prisma };
}

describe('MarketAssetsService.subir', () => {
  it('material novo nasce pendente — ninguém leu ainda', async () => {
    const { svc, prisma } = makeSvc();

    await svc.subir('t1', 'hipertms', { name: '02_eixo_cotacoes.md', content: '# Cotações' });

    expect(prisma.marketAsset.upsert.mock.calls[0][0].create.status).toBe('pending');
  });

  // O caminho silencioso: aprovar o texto de ontem e deixar o de hoje entrar por baixo
  // dá a garantia sem cumpri-la. Reenviar é correção, e correção volta para a fila.
  it('reenviar o mesmo arquivo derruba a aprovação', async () => {
    const { svc, prisma } = makeSvc();

    await svc.subir('t1', 'hipertms', { name: '02_eixo_cotacoes.md', content: 'texto novo' });

    const { update, where } = prisma.marketAsset.upsert.mock.calls[0][0];
    expect(update.status).toBe('pending');
    expect(update.approvedAt).toBeNull();
    expect(update.approvedBy).toBeNull();
    // Mesmo nome no mesmo mercado é a MESMA linha: sem isto a lista fica com duas
    // versões do mesmo arquivo e ninguém sabe qual a Lia lê.
    expect(where.tenantId_productCode_name).toEqual({
      tenantId: 't1',
      productCode: 'hipertms',
      name: '02_eixo_cotacoes.md',
    });
  });

  it('recusa PDF — é binário e não cabe numa coluna de texto', async () => {
    const { svc } = makeSvc();
    await expect(
      svc.subir('t1', 'hipertms', { name: 'portfolio.pdf', content: '%PDF-1.4' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a recusa diz o nome do arquivo, para achar na pilha que foi arrastada', async () => {
    const { svc } = makeSvc();
    await expect(
      svc.subir('t1', 'hipertms', { name: 'planilha.xlsx', content: 'x' }),
    ).rejects.toThrow(/planilha\.xlsx/);
  });

  it('arquivo vazio não entra', async () => {
    const { svc } = makeSvc();
    await expect(svc.subir('t1', 'hipertms', { name: 'vazio.md', content: '' })).rejects.toThrow(
      /vazio/,
    );
  });

  // O limite é em BYTES. Um plano cheio de "ç" e "ã" tem menos caracteres que bytes, e
  // uma checagem por `length` deixaria passar o que o banco recusa.
  it('o limite conta bytes, não caracteres', async () => {
    const { svc } = makeSvc();
    // Cada "ç" ocupa 2 bytes: metade dos caracteres do limite já estoura.
    const acentuado = 'ç'.repeat(TAMANHO_MAXIMO / 2 + 10);
    expect(acentuado.length).toBeLessThan(TAMANHO_MAXIMO);

    await expect(svc.subir('t1', 'hipertms', { name: 'grande.md', content: acentuado })).rejects.toThrow(
      /limite/,
    );
  });

  it('mercado inexistente é 404, não uma linha órfã', async () => {
    const { svc, prisma } = makeSvc(null);
    await expect(svc.subir('t1', 'nao-existe', { name: 'a.md', content: 'x' })).rejects.toThrow(
      'Mercado não encontrado',
    );
    expect(prisma.marketAsset.upsert).not.toHaveBeenCalled();
  });
});

describe('MarketAssetsService.aprovar', () => {
  const pendente = { id: 'a1', name: '02_eixo_cotacoes.md', productCode: 'hipertms', status: 'pending' };

  it('guarda quem aprovou — a pergunta depois vai ser quem leu isto', async () => {
    const { svc, prisma } = makeSvc(undefined, pendente);

    await svc.aprovar('t1', 'a1', 'user-9');

    const { data } = prisma.marketAsset.update.mock.calls[0][0];
    expect(data.status).toBe('approved');
    expect(data.approvedBy).toBe('user-9');
    expect(data.approvedAt).toBeInstanceOf(Date);
  });

  it('aprovar de novo não reescreve a data da primeira leitura', async () => {
    const { svc, prisma } = makeSvc(undefined, { ...pendente, status: 'approved' });

    await svc.aprovar('t1', 'a1', 'user-9');

    expect(prisma.marketAsset.update).not.toHaveBeenCalled();
  });

  it('reprovar devolve para pendente sem perder o texto', async () => {
    const { svc, prisma } = makeSvc(undefined, { ...pendente, status: 'approved' });

    await svc.reprovar('t1', 'a1');

    const { data } = prisma.marketAsset.update.mock.calls[0][0];
    expect(data.status).toBe('pending');
    expect(data.approvedAt).toBeNull();
    expect(data).not.toHaveProperty('content');
  });

  // Material de outro cliente não pode ser aprovado nem lido daqui: o `findFirst`
  // filtra por tenant, e é o que impede um id adivinhado de alcançar a conta vizinha.
  it('material de outro cliente não é encontrado', async () => {
    const { svc } = makeSvc(undefined, null);
    await expect(svc.aprovar('t1', 'id-de-outro', 'user-9')).rejects.toThrow(
      'Material não encontrado',
    );
  });
});

describe('MarketAssetsService.listar', () => {
  it('não devolve o conteúdo na lista', async () => {
    const { svc, prisma } = makeSvc();

    await svc.listar('t1', 'hipertms');

    // Sete arquivos de 15 KB seriam ~100 KB por render só para mostrar nome e tamanho.
    const { select } = prisma.marketAsset.findMany.mock.calls[0][0];
    expect(select.content).toBeUndefined();
    expect(select.name).toBe(true);
  });

  /**
   * O que precisa de ação vem no topo — a lista existe para ser trabalhada até zerar,
   * e pendente enterrado embaixo de aprovado é como ele fica lá para sempre.
   *
   * O teste afirma a ORDEM RESULTANTE, não o parâmetro passado ao Prisma. A primeira
   * versão afirmava `status: 'asc'` e passava — enquanto entregava a lista invertida,
   * porque "approved" vem antes de "pending" no alfabeto. Um teste que copia a
   * implementação concorda com o defeito.
   */
  it('pendente aparece antes de aprovado', async () => {
    const { svc, prisma } = makeSvc();
    const ordenar = (linhas: any[]) => {
      const { orderBy } = prisma.marketAsset.findMany.mock.calls[0][0];
      const dir = orderBy[0].status === 'desc' ? -1 : 1;
      return [...linhas].sort((a, b) => a.status.localeCompare(b.status) * dir);
    };

    await svc.listar('t1', 'hipertms');

    const ordenadas = ordenar([
      { name: 'aprovado.md', status: 'approved' },
      { name: 'pendente.md', status: 'pending' },
    ]);
    expect(ordenadas.map((l) => l.status)).toEqual(['pending', 'approved']);
  });
});
