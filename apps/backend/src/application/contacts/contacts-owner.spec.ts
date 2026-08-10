import { describe, it, expect, vi } from 'vitest';
import { ContactsService } from './contacts.service';

/**
 * Carteira por vendedor (11/08/2026).
 *
 * Três vendedores fazendo disparo, e os dados de um não podem se misturar com os
 * do outro. O modo de falhar aqui é SILENCIOSO — a tela carrega, só mostrando
 * demais —, então cada regra tem teste.
 */

function makeSvc(over: any = {}) {
  const prisma = {
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      upsert: vi.fn().mockResolvedValue({}),
      ...over.contact,
    },
    aiConversation: { updateMany: vi.fn().mockResolvedValue({ count: 3 }), ...over.aiConversation },
    seller: { findFirst: vi.fn().mockResolvedValue({ id: 'sel-2', tenantId: 't1' }), ...over.seller },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  } as any;
  const optOut = { blockedPhones: vi.fn().mockResolvedValue(new Set<string>()) };
  return { svc: new ContactsService(prisma, optOut as any), prisma };
}

const q = { limit: 20, offset: 0 } as any;

describe('findAll — quem vê o quê', () => {
  it('sem escopo (admin) não filtra por dono', async () => {
    const { svc, prisma } = makeSvc();

    await svc.findAll('t1', q);

    expect(JSON.stringify(prisma.contact.findMany.mock.calls[0][0].where)).not.toContain('ownerSellerId');
  });

  it('vendedor vê o que é dele MAIS o que não tem dono', async () => {
    const { svc, prisma } = makeSvc();

    await svc.findAll('t1', q, undefined, 'sel-1');

    const w = JSON.stringify(prisma.contact.findMany.mock.calls[0][0].where);
    expect(w).toContain('sel-1');
    expect(w).toContain('ownerSellerId":null');
  });

  /**
   * O furo que quase passou: a busca também usa `OR`. Se os dois `OR` ficassem no
   * mesmo objeto, o segundo apagaria o primeiro e o vendedor veria a base inteira
   * no instante em que digitasse na busca.
   */
  it('a busca NÃO desliga o escopo', async () => {
    const { svc, prisma } = makeSvc();

    await svc.findAll('t1', { ...q, search: 'aurora' }, undefined, 'sel-1');

    const where: any = prisma.contact.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeDefined();
    expect(JSON.stringify(where)).toContain('aurora');
    expect(JSON.stringify(where)).toContain('sel-1');
  });

  it('a contagem usa o MESMO where da lista (senão a paginação mente)', async () => {
    const { svc, prisma } = makeSvc();

    await svc.findAll('t1', q, undefined, 'sel-1');

    expect(prisma.contact.count.mock.calls[0][0].where)
      .toEqual(prisma.contact.findMany.mock.calls[0][0].where);
  });

  it('o filtro "sem dono" da tela acha quem falta distribuir', async () => {
    const { svc, prisma } = makeSvc();

    await svc.findAll('t1', q, undefined, undefined, 'sem-dono');

    expect(prisma.contact.findMany.mock.calls[0][0].where.ownerSellerId).toBeNull();
  });

  // O filtro é conveniência do admin; o escopo é trava. Um vendedor mandando
  // ?owner= de outro não escapa da própria carteira.
  it('o filtro da tela não fura o escopo do vendedor', async () => {
    const { svc, prisma } = makeSvc();

    await svc.findAll('t1', q, undefined, 'sel-1', 'sel-9');

    const where: any = prisma.contact.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where.AND)).toContain('sel-1');
  });
});

describe('transferir — quando alguém sai da empresa', () => {
  it('passa contatos E conversas para o novo dono', async () => {
    const { svc, prisma } = makeSvc({
      contact: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', phone: '5511' }, { id: 'c2', phone: '5512' }]) },
    });

    const r = await svc.transferir('t1', ['c1', 'c2'], 'sel-2');

    expect(r).toEqual({ transferidos: 2, conversas: 3 });
    expect(prisma.contact.updateMany.mock.calls[0][0].data).toEqual({ ownerSellerId: 'sel-2' });
    expect(prisma.aiConversation.updateMany.mock.calls[0][0].data.assignedSellerId).toBe('sel-2');
  });

  // Separar o contato e deixar a conversa com o vendedor antigo daria a ele
  // acesso ao histórico de um lead que não é mais dele.
  it('as duas escritas vão na mesma transação', async () => {
    const { svc, prisma } = makeSvc({
      contact: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', phone: '5511' }]) },
    });

    await svc.transferir('t1', ['c1'], 'sel-2');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('null devolve para o bolo sem dono', async () => {
    const { svc, prisma } = makeSvc({
      contact: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', phone: '5511' }]) },
    });

    await svc.transferir('t1', ['c1'], null);

    expect(prisma.contact.updateMany.mock.calls[0][0].data.ownerSellerId).toBeNull();
    expect(prisma.aiConversation.updateMany.mock.calls[0][0].data.assignedAt).toBeNull();
  });

  it('vendedor de outro tenant é recusado', async () => {
    const { svc } = makeSvc({ seller: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.transferir('t1', ['c1'], 'sel-de-outro')).rejects.toThrow(/não encontrado/i);
  });

  it('lista vazia não faz nada', async () => {
    const { svc, prisma } = makeSvc();
    await expect(svc.transferir('t1', [], 'sel-2')).resolves.toEqual({ transferidos: 0, conversas: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('importMany — de quem é a lista', () => {
  const lista = [{ phone: '5511999999999', name: 'Aurora' }] as any;

  it('grava o dono escolhido na importação', async () => {
    const { svc, prisma } = makeSvc();

    await svc.importMany('t1', lista, 'sel-1');

    expect(prisma.contact.upsert.mock.calls[0][0].create.ownerSellerId).toBe('sel-1');
  });

  it('sem dono escolhido, entra no bolo de todos', async () => {
    const { svc, prisma } = makeSvc();

    await svc.importMany('t1', lista);

    expect(prisma.contact.upsert.mock.calls[0][0].create.ownerSellerId).toBeUndefined();
  });

  // Reimportar uma lista em nome de outro vendedor não pode roubar o contato de
  // quem já vinha trabalhando nele.
  it('contato que já existe não troca de dono', async () => {
    const { svc, prisma } = makeSvc();

    await svc.importMany('t1', lista, 'sel-1');

    expect(prisma.contact.upsert.mock.calls[0][0].update).toEqual({});
  });
});
