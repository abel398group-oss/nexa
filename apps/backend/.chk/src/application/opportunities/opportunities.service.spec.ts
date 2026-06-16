import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';

function makePrisma() {
  return {
    opportunity: {
      findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(), groupBy: vi.fn(),
    },
    opportunityStageHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  } as any;
}

describe('OpportunitiesService', () => {
  let prisma: any;
  let svc: OpportunitiesService;
  beforeEach(() => { prisma = makePrisma(); svc = new OpportunitiesService(prisma); });

  it('findAll: escopa por tenant + filtro de estagio', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]); prisma.opportunity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, 'qualified');
    const where = prisma.opportunity.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 't1', stage: 'qualified' });
  });

  it('findOne: 404 quando nao e do tenant', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);
    await expect(svc.findOne('t1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.opportunity.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'x', tenantId: 't1' });
  });

  it('moveStage: estagio invalido -> BadRequest', async () => {
    await expect(svc.moveStage('t1', 'o1', 'banana')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moveStage: mesmo estagio -> no-op (sem historico)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    const out = await svc.moveStage('t1', 'o1', 'new');
    expect(out).toMatchObject({ id: 'o1', stage: 'new' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('moveStage: muda estagio -> atualiza + grava historico (de->para)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    prisma.$transaction.mockResolvedValue([{ id: 'o1', stage: 'qualified' }, {}]);
    const out = await svc.moveStage('t1', 'o1', 'qualified', 'cliente respondeu');
    expect(out).toMatchObject({ stage: 'qualified' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('createFromLead: idempotente por conversationId (nao duplica)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'existente', conversationId: 'c1' });
    const out = await svc.createFromLead('t1', { conversationId: 'c1', phone: '5511' });
    expect(out).toMatchObject({ id: 'existente' });
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it('createFromLead: cria quando nao existe', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);
    prisma.opportunity.create.mockResolvedValue({ id: 'nova', stage: 'new' });
    const out = await svc.createFromLead('t1', { conversationId: 'c2', phone: '5511' });
    expect(out).toMatchObject({ id: 'nova' });
    expect(prisma.opportunity.create).toHaveBeenCalledTimes(1);
    expect(prisma.opportunity.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', stage: 'new', conversationId: 'c2' });
  });
});
