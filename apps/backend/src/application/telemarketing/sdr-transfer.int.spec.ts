import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SdrService } from './sdr.service';

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
const service = new SdrService(prisma as any);

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
});
