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

  // 40 tentativas, 10 com "atendeu", todas carimbadas na versão 3 e LIGADAS a uma
  // oportunidade — como acontece de verdade (`registrarAtividade` exige a oportunidade).
  // Sem esse vínculo, o filtro de mercado passa pela oportunidade e derruba a linha.
  const alvo = await prisma.opportunity.findFirst({
    where: { tenantId: TENANT, batchId: lote.id },
    select: { id: true },
  });
  for (let i = 0; i < 40; i += 1) {
    await prisma.sellerActivity.create({
      data: {
        tenantId: TENANT,
        sellerId: sdr.id,
        opportunityId: alvo!.id,
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

  it('atividade sem oportunidade: some com filtro de mercado, aparece sem filtro', async () => {
    // A assimetria que o teste anterior expôs. Não é bug: sem oportunidade não existe
    // mercado a que a atividade pertença, então filtrar por mercado a exclui. Mas o
    // comportamento fica pinado, porque um dia alguém vai estranhar o número mudando ao
    // trocar o filtro.
    const { sdr } = await cenario();
    await prisma.sellerActivity.create({
      data: {
        tenantId: TENANT,
        sellerId: sdr.id,
        type: 'call',
        result: 'atendeu',
        scriptVersion: 9, // versão que SÓ existe nesta atividade solta
      },
    });

    const comFiltro = await service.relatorio(TENANT, MERCADO);
    const semFiltro = await service.relatorio(TENANT);

    const versoes = (r: Awaited<ReturnType<typeof service.relatorio>>) =>
      r.roteiros.comparaveis.map((c) => c.versao).concat(
        // a v9 tem 1 ação, então cai em "omitidas" — o que importa é o total considerado
        r.roteiros.omitidasPorAmostra > 0 ? ['omitiu'] as unknown as number[] : [],
      );

    expect(versoes(comFiltro)).toEqual([3]); // v9 nem foi contada
    expect(versoes(semFiltro)).toEqual([3, 'omitiu' as unknown as number]); // v9 contada e omitida
  });

  it('tenant sem dado devolve listas vazias, não erro', async () => {
    const r = await service.relatorio('tenant-que-nao-existe');
    expect(r.lotes).toEqual([]);
    expect(r.vendedores).toEqual([]);
    expect(r.roteiros.comparaveis).toEqual([]);
  });

  it('SLA de primeiro contato: média em horas entre a entrada e a 1ª atividade', async () => {
    const sdr = await prisma.seller.create({
      data: { tenantId: TENANT, name: 'SDR SLA', phone: '5511900000099' },
    });
    const entrada = new Date('2026-01-01T00:00:00Z');

    // AMOSTRA_MINIMA (20) oportunidades entrando no mesmo instante, cada uma com a
    // primeira atividade 1, 2, 3 ... 20 horas depois — média conhecida: 10,5h. Prova
    // que o cálculo é ENTRADA → PRIMEIRA atividade, não qualquer atividade.
    for (let i = 1; i <= 20; i += 1) {
      const o = await prisma.opportunity.create({
        data: { tenantId: TENANT, productCode: MERCADO, stage: 'new', createdAt: entrada },
      });
      await prisma.sellerActivity.create({
        data: {
          tenantId: TENANT,
          sellerId: sdr.id,
          opportunityId: o.id,
          type: 'call',
          result: 'nao_atendeu', // a 1ª tentativa, não precisa ter atendido
          createdAt: new Date(entrada.getTime() + i * 3_600_000),
        },
      });
      // 2ª atividade bem mais tarde: prova que o MIN() ignora ela, não a última.
      await prisma.sellerActivity.create({
        data: {
          tenantId: TENANT,
          sellerId: sdr.id,
          opportunityId: o.id,
          type: 'call',
          result: 'atendeu',
          createdAt: new Date(entrada.getTime() + 100 * 3_600_000),
        },
      });
    }

    const r = await service.relatorio(TENANT, MERCADO);
    expect(r.slaPrimeiroContato.amostraPequena).toBe(false);
    expect(r.slaPrimeiroContato.mediaHoras).toBeCloseTo(10.5, 1);
  });

  it('menos que a amostra mínima: sem número, mas sem erro', async () => {
    const sdr = await prisma.seller.create({
      data: { tenantId: TENANT, name: 'SDR SLA 2', phone: '5511900000098' },
    });
    const entrada = new Date('2026-01-01T00:00:00Z');
    const o = await prisma.opportunity.create({
      data: { tenantId: TENANT, productCode: MERCADO, stage: 'new', createdAt: entrada },
    });
    await prisma.sellerActivity.create({
      data: {
        tenantId: TENANT,
        sellerId: sdr.id,
        opportunityId: o.id,
        type: 'call',
        result: 'atendeu',
        createdAt: new Date(entrada.getTime() + 3_600_000),
      },
    });

    const r = await service.relatorio(TENANT, MERCADO);
    expect(r.slaPrimeiroContato.mediaHoras).toBeNull();
    expect(r.slaPrimeiroContato.amostraPequena).toBe(true);
  });

  it('oportunidade sem nenhuma atividade não entra na média (não é "0 horas")', async () => {
    // 50 oportunidades 'new' do cenario() acima não têm atividade nenhuma — se
    // entrassem como zero, puxariam a média para um tempo que não existe.
    await cenario();
    const r = await service.relatorio(TENANT, MERCADO);
    // As 40 atividades do cenário são todas na MESMA oportunidade (1 amostra) —
    // isolado, então continua abaixo da amostra mínima.
    expect(r.slaPrimeiroContato.amostraPequena).toBe(true);
  });
});
