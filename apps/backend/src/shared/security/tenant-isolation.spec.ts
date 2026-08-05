/**
 * tenant-isolation.spec.ts — a garantia mais crítica do produto, testada.
 *
 * ## Por que existe
 *
 * O Nexa é multi-tenant: várias transportadoras no mesmo banco, cada uma enxergando
 * só o que é dela. O isolamento estava implementado e **nenhum teste verificava**.
 *
 * O risco não é o código de hoje — é o de amanhã. Basta alguém escrever
 * `findFirst({ where: { id } })` esquecendo o `tenantId` para o tenant A passar a ler
 * dado do tenant B. O sistema continua funcionando, a suíte inteira segue verde, e a
 * descoberta vem por telefone de cliente. Aí já vazou.
 *
 * ## Por que um banco falso de verdade, e não `vi.fn()`
 *
 * Um mock com `mockResolvedValue(linhaDoOutroTenant)` provaria apenas que o service
 * repassa o que o Prisma devolve — e passaria **mesmo com o filtro removido**, que é
 * exatamente o bug que queremos pegar. O duplo abaixo guarda linhas e aplica o `where`
 * de verdade: sem `tenantId` na cláusula, ele devolve a linha do outro tenant e o
 * teste quebra. É a diferença entre testar a intenção e testar o comportamento.
 *
 * ## Como adicionar um service novo aqui
 *
 * Toda vez que nascer um método `(tenantId, id)` que lê, altera ou apaga por id,
 * acrescente um caso. O padrão é sempre o mesmo: semeia a linha no tenant B, chama
 * com o tenant A, exige que NÃO encontre.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { OpportunitiesService } from '@/application/opportunities/opportunities.service';
import { ActionsService } from '@/application/actions/actions.service';
import { UsersService } from '@/application/users/users.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

// ── Banco falso, mas com semântica real ───────────────────────────────────────

type Row = Record<string, any>;

/** Casa a linha contra um `where` simples do Prisma (igualdade e `in`). */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [campo, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (cond !== null && typeof cond === 'object' && 'in' in cond) {
      if (!(cond.in as any[]).includes(row[campo])) return false;
    } else if (row[campo] !== cond) {
      return false;
    }
  }
  return true;
}

function makeTable(seed: Row[] = []) {
  let rows: Row[] = seed.map((r) => ({ ...r }));
  return {
    _rows: () => rows,
    findFirst: vi.fn(async ({ where }: any = {}) => rows.find((r) => matches(r, where)) ?? null),
    findUnique: vi.fn(async ({ where }: any = {}) => rows.find((r) => matches(r, where)) ?? null),
    findMany: vi.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where))),
    count: vi.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length),
    update: vi.fn(async ({ where, data }: any) => {
      const alvo = rows.find((r) => matches(r, where));
      if (!alvo) throw new Error('registro não encontrado');
      Object.assign(alvo, data);
      return alvo;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const alvos = rows.filter((r) => matches(r, where));
      alvos.forEach((r) => Object.assign(r, data));
      return { count: alvos.length };
    }),
    delete: vi.fn(async ({ where }: any) => {
      const alvo = rows.find((r) => matches(r, where));
      if (!alvo) throw new Error('registro não encontrado');
      rows = rows.filter((r) => r !== alvo);
      return alvo;
    }),
    deleteMany: vi.fn(async ({ where }: any = {}) => {
      const antes = rows.length;
      rows = rows.filter((r) => !matches(r, where));
      return { count: antes - rows.length };
    }),
    upsert: vi.fn(async ({ where, create }: any) => {
      const alvo = rows.find((r) => matches(r, where));
      if (alvo) return alvo;
      const novo = { ...create };
      rows.push(novo);
      return novo;
    }),
  };
}

/** Linha do tenant B — é ela que NUNCA pode ser alcançada pelo tenant A. */
const doTenantB = (id: string, extra: Row = {}): Row => ({ id, tenantId: TENANT_B, ...extra });

function makePrisma(tabelas: Record<string, ReturnType<typeof makeTable>>) {
  return { ...tabelas, $queryRaw: vi.fn(async () => []), $executeRaw: vi.fn(async () => 0) } as any;
}

const semDeps = () => ({}) as any;

// ── Testes ────────────────────────────────────────────────────────────────────

describe('Isolamento entre tenants — leitura por id', () => {
  it('ContactsService.findOne não enxerga contato de outro tenant', async () => {
    const contact = makeTable([doTenantB('c1', { phone: '5511999999999' })]);
    const svc = new ContactsService(makePrisma({ contact }), semDeps());

    await expect(svc.findOne(TENANT_A, 'c1')).rejects.toThrow(NotFoundException);
    // Sanidade: o dono continua enxergando — o teste falharia por engano se o
    // duplo simplesmente nunca encontrasse nada.
    await expect(svc.findOne(TENANT_B, 'c1')).resolves.toMatchObject({ id: 'c1' });
  });

  it('ConversationsService.findOne não enxerga conversa de outro tenant', async () => {
    const aiConversation = makeTable([doTenantB('conv1')]);
    const svc = new ConversationsService(makePrisma({ aiConversation }), semDeps(), semDeps());

    await expect(svc.findOne(TENANT_A, 'conv1')).rejects.toThrow(NotFoundException);
    await expect(svc.findOne(TENANT_B, 'conv1')).resolves.toMatchObject({ id: 'conv1' });
  });

  it('KnowledgeService.findOne não enxerga artigo de outro tenant', async () => {
    const aiKnowledgeBase = makeTable([doTenantB('kb1', { title: 'interno' })]);
    const svc = new KnowledgeService(makePrisma({ aiKnowledgeBase }), semDeps(), semDeps());

    await expect(svc.findOne(TENANT_A, 'kb1')).rejects.toThrow(NotFoundException);
  });

  it('OpportunitiesService.findOne não enxerga oportunidade de outro tenant', async () => {
    const opportunity = makeTable([doTenantB('opp1', { assignedSellerId: null })]);
    const svc = new OpportunitiesService(makePrisma({ opportunity }));

    await expect(svc.findOne(TENANT_A, 'opp1')).rejects.toThrow(NotFoundException);
  });

  it('ActionsService.findOne não enxerga ação de outro tenant', async () => {
    const aiAction = makeTable([doTenantB('act1')]);
    const svc = new ActionsService(makePrisma({ aiAction }), semDeps());

    await expect(svc.findOne(TENANT_A, 'act1')).rejects.toThrow(NotFoundException);
  });
});

describe('Isolamento entre tenants — escrita e exclusão', () => {
  it('ContactsService.update não altera contato de outro tenant', async () => {
    const contact = makeTable([doTenantB('c1', { name: 'Original' })]);
    const svc = new ContactsService(makePrisma({ contact }), semDeps());

    await expect(svc.update(TENANT_A, 'c1', { name: 'Invadido' } as any)).rejects.toThrow(
      NotFoundException,
    );
    expect(contact._rows()[0].name).toBe('Original');
  });

  it('ContactsService.remove não apaga contato de outro tenant', async () => {
    const contact = makeTable([doTenantB('c1')]);
    const svc = new ContactsService(makePrisma({ contact }), semDeps());

    await expect(svc.remove(TENANT_A, 'c1')).rejects.toThrow(NotFoundException);
    expect(contact._rows()).toHaveLength(1);
  });

  it('ContactsService.deleteMany ignora ids de outro tenant', async () => {
    // Exclusão em LOTE é o caminho mais perigoso: um `deleteMany` por id sem tenant
    // apagaria a base de outra empresa inteira numa chamada.
    const contact = makeTable([doTenantB('c1'), doTenantB('c2')]);
    const svc = new ContactsService(makePrisma({ contact }), semDeps());

    const r = await svc.deleteMany(TENANT_A, ['c1', 'c2']);

    expect(r.deleted).toBe(0);
    expect(contact._rows()).toHaveLength(2);
  });

  it('ContactsService.block ignora ids de outro tenant', async () => {
    const contact = makeTable([doTenantB('c1', { status: 'active' })]);
    const svc = new ContactsService(makePrisma({ contact }), semDeps());

    const r = await svc.block(TENANT_A, ['c1']);

    expect(r.blocked).toBe(0);
    expect(contact._rows()[0].status).toBe('active');
  });

  it('UsersService.remove não apaga usuário de outro tenant', async () => {
    // O pior caso do produto: apagar o usuário de outra empresa tira o acesso dela.
    const user = makeTable([doTenantB('u1', { email: 'dono@outraempresa.com' })]);
    const svc = new UsersService(makePrisma({ user }));

    await expect(svc.remove(TENANT_A, 'u1')).rejects.toThrow(NotFoundException);
    expect(user._rows()).toHaveLength(1);
  });

  it('OpportunitiesService.remove não apaga oportunidade de outro tenant', async () => {
    const opportunity = makeTable([doTenantB('opp1', { assignedSellerId: null })]);
    const svc = new OpportunitiesService(makePrisma({ opportunity }));

    await expect(svc.remove(TENANT_A, 'opp1')).rejects.toThrow(NotFoundException);
    expect(opportunity._rows()).toHaveLength(1);
  });
});

describe('Isolamento entre tenants — listagens', () => {
  it('ContactsService.findAll devolve só o que é do tenant', async () => {
    const contact = makeTable([
      { id: 'a1', tenantId: TENANT_A, name: 'Meu' },
      doTenantB('b1', { name: 'Do outro' }),
    ]);
    const svc = new ContactsService(makePrisma({ contact }), semDeps());

    const out = await svc.findAll(TENANT_A, { limit: 50, offset: 0 } as any);

    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe('a1');
  });
});

// ── Metateste: o duplo tem que ser capaz de reprovar ──────────────────────────

describe('o banco falso realmente aplica o filtro', () => {
  it('sem tenantId no where, a linha do outro tenant É encontrada', async () => {
    // Este teste protege os de cima. Se um refactor quebrar o duplo e ele passar a
    // nunca encontrar nada, todos os testes acima passariam por engano — provando
    // isolamento que talvez não exista mais. Aqui exigimos que ele SAIBA encontrar.
    const contact = makeTable([doTenantB('c1')]);
    expect(await contact.findFirst({ where: { id: 'c1' } })).toMatchObject({ id: 'c1' });
    expect(await contact.findFirst({ where: { id: 'c1', tenantId: TENANT_A } })).toBeNull();
  });
});
