import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SdrService } from './sdr.service';
import { MarketScopeService } from '@/shared/auth/market-scope.service';
import { MarketAssetsService } from '@/application/markets/market-assets.service';

/**
 * Transferência para o closer, contra Postgres real.
 *
 * O caso que motivou este arquivo: passar o lead PARA SI MESMO era recusado, mas com a
 * mensagem "este closer não trabalha o mercado deste lead" — que é falsa quando o
 * vínculo existe, e manda quem der suporte investigar mercado por meia hora. Mensagem
 * errada em erro raro custa mais que o erro.
 */
const prisma = new PrismaClient();
const TENANT = 'tenant-int-transfer';
const MERCADO = 'int-transfer-tms';
// MarketScopeService de verdade, contra o mesmo banco: o cenário cria vínculos em
// `seller_markets`, então o escopo por mercado é exercido junto — que é o ponto.
const service = new SdrService(
  prisma as any,
  new MarketScopeService(prisma as any),
  // KnowledgeService não é tocado neste cenário — o material aprovado só entra na
  // mesa do SDR, e a transferência não lê nada dele.
  new MarketAssetsService(prisma as any, {} as any),
  // A cadência não é exercida aqui: o cenário não cria `FollowUp`, e `stopByPhone`
  // num telefone sem cadência é um UPDATE que casa zero linhas.
  { stopByPhone: async () => 0 } as any,
);

async function limpar() {
  await prisma.sellerActivity.deleteMany({ where: { tenantId: TENANT } });
  await prisma.opportunityStageHistory.deleteMany({
    where: { opportunity: { tenantId: TENANT } },
  });
  await prisma.opportunity.deleteMany({ where: { tenantId: TENANT } });
  await prisma.contact.deleteMany({ where: { tenantId: TENANT } });
  await prisma.sellerMarket.deleteMany({ where: { tenantId: TENANT } });
  await prisma.seller.deleteMany({ where: { tenantId: TENANT } });
}

async function cenario() {
  const [sdr, closer] = await Promise.all([
    prisma.seller.create({ data: { tenantId: TENANT, name: 'SDR', phone: '5511900000001' } }),
    prisma.seller.create({ data: { tenantId: TENANT, name: 'Closer', phone: '5511900000002' } }),
  ]);
  for (const s of [sdr, closer]) {
    await prisma.sellerMarket.create({
      data: { tenantId: TENANT, sellerId: s.id, productCode: MERCADO },
    });
  }
  const contato = await prisma.contact.create({
    data: { tenantId: TENANT, phone: '5511988887777', name: 'Lead Teste' },
  });
  const op = await prisma.opportunity.create({
    data: {
      tenantId: TENANT,
      contactId: contato.id,
      productCode: MERCADO,
      stage: 'new',
      assignedSellerId: sdr.id,
    },
  });
  return { sdr, closer, contato, op };
}

beforeEach(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

describe('passar pro closer', () => {
  it('recusa passar para si mesmo com a mensagem certa', async () => {
    const { sdr, op } = await cenario();
    const user = { role: 'vendedor', sellerId: sdr.id };

    await expect(
      service.transferir(TENANT, user, op.id, { closerId: sdr.id }),
    ).rejects.toThrow('Você não pode passar o lead para você mesmo.');
  });

  it('recusa closer de outro mercado', async () => {
    const { sdr, op } = await cenario();
    const deFora = await prisma.seller.create({
      data: { tenantId: TENANT, name: 'De outro mercado', phone: '5511900000003' },
    });

    await expect(
      service.transferir(TENANT, { role: 'vendedor', sellerId: sdr.id }, op.id, {
        closerId: deFora.id,
      }),
    ).rejects.toThrow('não trabalha o mercado');
  });

  it('transfere e move os DOIS campos de posse na mesma transação', async () => {
    const { sdr, closer, contato, op } = await cenario();

    await service.transferir(TENANT, { role: 'vendedor', sellerId: sdr.id }, op.id, {
      closerId: closer.id,
      meetingAt: new Date('2026-08-20T18:00:00Z'),
      scriptVersion: 7,
    });

    const [depois, ct, hist, ativ] = await Promise.all([
      prisma.opportunity.findUnique({ where: { id: op.id } }),
      prisma.contact.findUnique({ where: { id: contato.id } }),
      prisma.opportunityStageHistory.findFirst({ where: { opportunityId: op.id } }),
      prisma.sellerActivity.findFirst({ where: { opportunityId: op.id } }),
    ]);

    expect(depois?.stage).toBe('qualified'); // não uma etapa inventada
    expect(depois?.assignedSellerId).toBe(closer.id);
    expect(ct?.ownerSellerId).toBe(closer.id); // o inbox segue o trabalho
    // De quem saiu e pra quem foi: é o que sustenta comissão, e não se reconstrói depois.
    expect(hist?.reason).toContain(sdr.id);
    expect(hist?.reason).toContain(closer.id);
    // O carimbo do roteiro atravessa a transferência.
    expect(ativ?.scriptVersion).toBe(7);
  });

  /**
   * O mesmo lead importado em lotes diferentes vira UMA linha na fila, mas continuam
   * sendo várias oportunidades. Antes, a transferência movia só a representante — as
   * irmãs ficavam em `new`, com zero tentativas, e voltavam ao topo como "nunca
   * contatado". O SDR ligava para quem já era do closer.
   */
  it('as oportunidades irmãs saem da fila junto, como duplicadas', async () => {
    const { sdr, closer, contato, op } = await cenario();
    const irma = await prisma.opportunity.create({
      data: {
        tenantId: TENANT,
        contactId: contato.id,
        productCode: MERCADO,
        stage: 'new',
        assignedSellerId: sdr.id,
      },
    });

    await service.transferir(TENANT, { role: 'vendedor', sellerId: sdr.id }, op.id, {
      closerId: closer.id,
    });

    const depois = await prisma.opportunity.findUnique({ where: { id: irma.id } });
    // `discarded`, e não `qualified`: três linhas qualificadas para um negócio só
    // inflariam o funil e a conversão do vendedor.
    expect(depois?.stage).toBe('discarded');
    expect(depois?.discardReason).toBe('duplicado');

    const hist = await prisma.opportunityStageHistory.findFirst({
      where: { opportunityId: irma.id },
    });
    expect(hist?.reason).toContain(op.id);
  });

  /**
   * Lead sem mercado pulava a checagem INTEIRA, e com ela a garantia de que o destino
   * existe e está ativo. Bastava um lead importado sem mercado para qualquer id ser
   * aceito.
   */
  it('lead sem mercado ainda recusa closer inativo', async () => {
    const { sdr, closer, contato } = await cenario();
    await prisma.seller.update({ where: { id: closer.id }, data: { active: false } });
    const semMercado = await prisma.opportunity.create({
      data: { tenantId: TENANT, contactId: contato.id, stage: 'new', assignedSellerId: sdr.id },
    });

    await expect(
      service.transferir(TENANT, { role: 'vendedor', sellerId: sdr.id }, semMercado.id, {
        closerId: closer.id,
      }),
    ).rejects.toThrow('inativo ou ausente');
  });

  it('lead sem mercado aceita closer ativo', async () => {
    const { sdr, closer, contato } = await cenario();
    const semMercado = await prisma.opportunity.create({
      data: { tenantId: TENANT, contactId: contato.id, stage: 'new', assignedSellerId: sdr.id },
    });

    await service.transferir(TENANT, { role: 'vendedor', sellerId: sdr.id }, semMercado.id, {
      closerId: closer.id,
    });

    const depois = await prisma.opportunity.findUnique({ where: { id: semMercado.id } });
    expect(depois?.stage).toBe('qualified');
    expect(depois?.assignedSellerId).toBe(closer.id);
  });
});
