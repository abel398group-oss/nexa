import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LeadImportService } from './lead-import.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';

/**
 * Integração de verdade: Postgres real, transações reais, unique real.
 *
 * Existe porque os 80 testes unitários provam a REGRA e não provam o BANCO. Três dos
 * cinco bugs achados na auditoria de 11/08 eram exatamente disso: unique sem tenant,
 * lead sumindo por colisão de chave, e o lote na entidade errada. Nenhum deles um teste
 * puro pegaria.
 *
 * Banco: container local (5434). Nunca produção — ver vitest.integration.config.ts.
 */
const prisma = new PrismaClient();
const TENANT = 'tenant-int-telemarketing';
const MERCADO = 'int-tms';

// TMS desligado: sem TMS_DB_URL o batchLookup devolve vazio sem erro, que é o caminho
// que a peneira usa quando o banco do TMS está fora. Testar contra o TMS real deixaria
// a suíte dependendo de infraestrutura de terceiro.
const tms = new TmsLookupService();
const service = new LeadImportService(prisma as any, tms);

async function limpar() {
  // Ordem importa por causa das FKs. Tudo escopado no tenant de teste — nenhum
  // deleteMany sem `tenantId` neste arquivo, e é regra: um filtro esquecido aqui
  // apagaria a base inteira se alguém apontasse para o banco errado.
  await prisma.sellerActivity.deleteMany({ where: { tenantId: TENANT } });
  await prisma.opportunity.deleteMany({ where: { tenantId: TENANT } });
  await prisma.contact.deleteMany({ where: { tenantId: TENANT } });
  await prisma.sellerMarket.deleteMany({ where: { tenantId: TENANT } });
  await prisma.seller.deleteMany({ where: { tenantId: TENANT } });
  await prisma.leadBatch.deleteMany({ where: { tenantId: TENANT } });
  // A importação valida que o mercado existe (19/08/2026) — o lote de teste
  // precisa do dele. Upsert: `products` é global e a linha pode sobrar de uma
  // rodada anterior.
  await prisma.product.upsert({
    where: { code: MERCADO },
    create: { code: MERCADO, name: 'Mercado de integração', connector: 'none', status: 'draft' },
    update: {},
  });
}

beforeEach(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const CSV = (linhas: string[]) => ['nome;empresa;telefone;email', ...linhas].join('\n');
const base = { productCode: MERCADO, name: 'Lote de teste' };

describe('importação contra o banco real', () => {
  it('dryRun não grava NADA', async () => {
    const r = await service.importar(
      TENANT,
      { ...base, dryRun: true },
      CSV(['Carlos;Silva;11999887766;carlos@silva.com']),
    );

    expect(r.batchId).toBeNull();
    // A prova não é o batchId nulo — é a contagem no banco.
    expect(await prisma.contact.count({ where: { tenantId: TENANT } })).toBe(0);
    expect(await prisma.leadBatch.count({ where: { tenantId: TENANT } })).toBe(0);
  });

  it('importa, cria contato e uma oportunidade em new com o lote', async () => {
    const r = await service.importar(
      TENANT,
      base,
      CSV(['Carlos;Silva;11999887766;carlos@silva.com']),
    );

    const o = await prisma.opportunity.findFirst({ where: { tenantId: TENANT } });
    expect(o?.stage).toBe('new');
    expect(o?.productCode).toBe(MERCADO);
    // O lote na oportunidade é o que a distribuição procura (bug B2).
    expect(o?.batchId).toBe(r.batchId);
  });

  it('R2: reimportar com coluna em branco NÃO apaga o que a Lia coletou', async () => {
    await service.importar(TENANT, base, CSV(['Carlos Mendes;Transportes Silva;11999887766;c@s.com']));

    // A Lia aprende conversando, depois da importação.
    await prisma.contact.updateMany({
      where: { tenantId: TENANT },
      data: { fleetSize: 12, interestScore: 70, leadStatus: 'hot' },
    });

    // Planilha nova, mesma pessoa, colunas vazias e nome pior.
    await service.importar(
      TENANT,
      { ...base, name: 'Lote 2', forcarJaNaBase: true },
      CSV(['CARLOS;;11999887766;']),
    );

    const c = await prisma.contact.findFirst({ where: { tenantId: TENANT } });
    expect(c?.name).toBe('Carlos Mendes'); // não foi sobrescrito por "CARLOS"
    expect(c?.company).toBe('Transportes Silva'); // coluna vazia não apagou
    expect(c?.fleetSize).toBe(12);
    expect(c?.interestScore).toBe(70);
    expect(c?.email).toBe('c@s.com');
  });

  it('o mesmo contato numa segunda lista continua alcançável pela distribuição — depois que o primeiro negócio fecha', async () => {
    // O bug B2 inteiro, ponta a ponta: antes, esta segunda oportunidade nascia órfã.
    // Precondição mudou em 22/08/2026 (Item 2 do Fase 1): forçar reimportação não
    // pode mais duplicar uma oportunidade ABERTA no mesmo mercado — então este teste
    // só prova a jornada B2 depois que a primeira oportunidade já fechou (lost).
    const seller = await prisma.seller.create({
      data: { tenantId: TENANT, name: 'Mateus', phone: '5511900000000' },
    });
    await prisma.sellerMarket.create({
      data: { tenantId: TENANT, sellerId: seller.id, productCode: MERCADO },
    });

    await service.importar(TENANT, base, CSV(['Carlos;Silva;11999887766;c@s.com']));
    await prisma.opportunity.updateMany({
      where: { tenantId: TENANT },
      data: { stage: 'lost' },
    });

    const lote2 = await service.importar(
      TENANT,
      { ...base, name: 'Lote 2', forcarJaNaBase: true },
      CSV(['Carlos;Silva;11999887766;c@s.com']),
    );

    const r = await service.distribuir(TENANT, lote2.batchId as string, [seller.id]);
    expect(r.distribuidos).toBe(1);

    // E os DOIS campos de posse andaram juntos.
    const o = await prisma.opportunity.findFirst({
      where: { tenantId: TENANT, batchId: lote2.batchId },
    });
    const c = await prisma.contact.findFirst({ where: { tenantId: TENANT } });
    expect(o?.assignedSellerId).toBe(seller.id);
    expect(c?.ownerSellerId).toBe(seller.id);
  });

  it('reimportação forçada NÃO duplica oportunidade aberta no mesmo mercado', async () => {
    // O bug que o Item 2 fecha: reimportar (forçado) um contato que já tem negócio
    // ABERTO no mesmo mercado não pode criar uma segunda oportunidade — o SDR/Closer
    // que já está com o lead perderia a oportunidade original por baixo dos panos.
    await service.importar(TENANT, base, CSV(['Carlos;Silva;11999887766;c@s.com']));

    const r = await service.importar(
      TENANT,
      { ...base, name: 'Lote 2', forcarJaNaBase: true },
      CSV(['Carlos;Silva;11999887766;c@s.com']),
    );

    expect(r.contadores.valid).toBe(0);
    expect(r.descartes[0]).toMatchObject({ motivo: 'ja_tem_oportunidade', forcavel: false });
    expect(await prisma.opportunity.count({ where: { tenantId: TENANT } })).toBe(1);
  });

  it('o segundo lead sem telefone é descartado com motivo, não some', async () => {
    // Bug A3: o unique é (tenantId, phone) e phone não é nullable, então só cabe um
    // contato novo com phone ''. Antes o excedente estourava o unique e virava log.
    const r = await service.importar(
      TENANT,
      base,
      CSV([';Empresa A;;a@a.com', ';Empresa B;;b@b.com']),
    );

    expect(r.contadores.valid).toBe(1);
    expect(r.descartes.map((d) => d.motivo)).toContain('sem_telefone');
    expect(await prisma.contact.count({ where: { tenantId: TENANT } })).toBe(1);
  });

  it('vendedor ausente não recebe na distribuição', async () => {
    const presente = await prisma.seller.create({
      data: { tenantId: TENANT, name: 'Presente', phone: '5511900000001' },
    });
    const ferias = await prisma.seller.create({
      data: {
        tenantId: TENANT,
        name: 'Ferias',
        phone: '5511900000002',
        awayUntil: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    for (const s of [presente, ferias]) {
      await prisma.sellerMarket.create({
        data: { tenantId: TENANT, sellerId: s.id, productCode: MERCADO },
      });
    }

    const lote = await service.importar(
      TENANT,
      base,
      CSV(['A;A;11911111111;', 'B;B;11922222222;']),
    );
    const r = await service.distribuir(TENANT, lote.batchId as string, [
      presente.id,
      ferias.id,
    ]);

    expect(r.distribuidos).toBe(2);
    expect(r.porVendedor[presente.id]).toBe(2);
    expect(r.porVendedor[ferias.id]).toBeUndefined();
  });

  it('opt-out não entra nem com forçar', async () => {
    await prisma.contact.create({
      data: {
        tenantId: TENANT,
        phone: '5511933333333',
        status: 'opted_out',
        optOutAt: new Date(),
      },
    });

    const r = await service.importar(
      TENANT,
      { ...base, forcarJaNaBase: true },
      CSV(['Zé;Zé Ltda;11933333333;ze@ze.com']),
    );

    expect(r.contadores.valid).toBe(0);
    expect(r.descartes[0]).toMatchObject({ motivo: 'opt_out', forcavel: false });
  });
});
