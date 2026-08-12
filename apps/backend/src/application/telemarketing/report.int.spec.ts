import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TelemarketingReportService } from './report.service';

/**
 * Relatório contra Postgres real.
 *
 * SQL cru é onde erro passa calado: um `FILTER` no lugar errado devolve número plausível
 * e errado, e ninguém percebe olhando a tela. Aqui o cenário é montado com resultado
 * conhecido, então a conta tem que fechar na mão.
 */
const prisma = new PrismaClient();
const TENANT = 'tenant-int-report';
const MERCADO = 'int-report-tms';
const service = new TelemarketingReportService(prisma as any);

async function limpar() {
  await prisma.sellerActivity.deleteMany({ where: { tenantId: TENANT } });
  await prisma.opportunity.deleteMany({ where: { tenantId: TENANT } });
  await prisma.contact.deleteMany({ where: { tenantId: TENANT } });
  await prisma.sellerMarket.deleteMany({ where: { tenantId: TENANT } });
  await prisma.seller.deleteMany({ where: { tenantId: TENANT } });
  await prisma.leadBatch.deleteMany({ where: { tenantId: TENANT } });
}

beforeEach(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

/** Lote com 100 recebidos, 60 válidos: 6 ganhos, 4 perdidos, 50 em andamento. */
async function cenario() {
  const lote = await prisma.leadBatch.create({
    data: {
      tenantId: TENANT,
      productCode: MERCADO,
      name: 'Feira teste',
      receivedCount: 100,
      validCount: 60,
    },
  });
  const sdr = await prisma.seller.create({
    data: { tenantId: TENANT, name: 'SDR Teste', phone: '5511900000010' },
  });

  const etapas = [
    ...Array(6).fill('won'),
    ...Array(3).fill('lost'),
    ...Array(1).fill('discarded'),
    ...Array(50).fill('new'),
  ];
  for (const stage of etapas) {
    await prisma.opportunity.create({
      data: {
        tenantId: TENANT,
        productCode: MERCADO,
        batchId: lote.id,
        stage,
        assignedSellerId: sdr.id,
      },
    });
  }

  // 40 tentativas, 10 com "atendeu", todas carimbadas na versão 3.
  for (let i = 0; i < 40; i += 1) {
    await prisma.sellerActivity.create({
      data: {
        tenantId: TENANT,
        sellerId: sdr.id,
        type: 'call',
        result: i < 10 ? 'atendeu' : 'nao_atendeu',
        scriptVersion: 3,
      },
    });
  }
  return { lote, sdr };
}

describe('relatório contra o banco', () => {
  it('conta o lote certo e usa VÁLIDOS como denominador', async () => {
    await cenario();
    const r = await service.relatorio(TENANT, MERCADO);
    const l = r.lotes[0];

    expect(l.recebidos).toBe(100);
    expect(l.validos).toBe(60);
    expect(l.oportunidades).toBe(60);
    expect(l.ganhos).toBe(6);
    expect(l.perdidos).toBe(4); // lost + discarded
    expect(l.emAndamento).toBe(50);
    // 6/60 = 10%. Sobre recebidos daria 6% — o erro que a regra evita.
    expect(l.conversao.percentual).toBeCloseTo(10);
  });

  it('aproveitamento do vendedor é atendeu / tentativas', async () => {
    await cenario();
    const r = await service.relatorio(TENANT, MERCADO);
    const v = r.vendedores.find((x) => x.nome === 'SDR Teste')!;

    expect(v.atividades).toBe(40);
    expect(v.atendeu).toBe(10);
    expect(v.ganhos).toBe(6);
    expect(v.aproveitamento.percentual).toBeCloseTo(25);
  });

  it('compara versões de roteiro e ignora atividade sem carimbo', async () => {
    const { sdr } = await cenario();
    // Atividade antiga, sem versão: não pode virar uma linha fantasma no comparativo.
    await prisma.sellerActivity.create({
      data: { tenantId: TENANT, sellerId: sdr.id, type: 'call', result: 'atendeu' },
    });

    const r = await service.relatorio(TENANT, MERCADO);
    expect(r.roteiros.comparaveis).toHaveLength(1);
    expect(r.roteiros.comparaveis[0]).toMatchObject({ versao: 3, acoes: 40, atendeu: 10 });
    expect(r.roteiros.comparaveis[0].percentual).toBeCloseTo(25);
  });

  it('tenant sem dado devolve listas vazias, não erro', async () => {
    const r = await service.relatorio('tenant-que-nao-existe');
    expect(r.lotes).toEqual([]);
    expect(r.vendedores).toEqual([]);
    expect(r.roteiros.comparaveis).toEqual([]);
  });
});
