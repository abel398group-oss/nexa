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

  // ── F6+ seller-leads (2026-07-20): escopo por vendedor + paused/discarded ──

  it('findAll com sellerScope: filtra assignedSellerId', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]); prisma.opportunity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, undefined, 's1');
    expect(prisma.opportunity.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', assignedSellerId: 's1' });
  });

  it('findAll com sellerScope __none__ (vendedor sem sellerId): nunca vaza', async () => {
    prisma.opportunity.findMany.mockResolvedValue([]); prisma.opportunity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, undefined, '__none__');
    expect(prisma.opportunity.findMany.mock.calls[0][0].where.assignedSellerId).toBe('__never__');
  });

  it('findOne com sellerScope: lead de OUTRO vendedor -> 404 (query escopada)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue(null);
    await expect(svc.findOne('t1', 'o1', 's1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.opportunity.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'o1', tenantId: 't1', assignedSellerId: 's1' });
  });

  it('moveStage paused: grava pausedUntil; discarded: grava discardReason', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    prisma.$transaction.mockResolvedValue([{ id: 'o1', stage: 'paused' }, {}]);
    await svc.moveStage('t1', 'o1', 'paused', undefined, { pausedUntil: '2026-08-05' });
    let data = prisma.opportunity.update.mock.calls[0][0].data;
    expect(data.stage).toBe('paused');
    expect(data.pausedUntil).toBeInstanceOf(Date);

    prisma.opportunity.update.mockClear();
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o2', stage: 'new', stageHistory: [] });
    prisma.$transaction.mockResolvedValue([{ id: 'o2', stage: 'discarded' }, {}]);
    await svc.moveStage('t1', 'o2', 'discarded', undefined, { discardReason: 'sem_fit' });
    data = prisma.opportunity.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ stage: 'discarded', discardReason: 'sem_fit', pausedUntil: null });
  });

  it('moveStage discarded com motivo invalido -> BadRequest', async () => {
    await expect(
      svc.moveStage('t1', 'o1', 'discarded', undefined, { discardReason: 'preguica' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Achado da revisão externa (Gemini, 2026-08-05): sem isto, discardReason ficava
  // null e o painel de motivo de perda perdia justamente os casos sem explicação.
  it('moveStage discarded SEM motivo -> BadRequest (motivo agora obrigatorio)', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', stage: 'new', stageHistory: [] });
    await expect(
      svc.moveStage('t1', 'o1', 'discarded'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('createFromLead: adota assignedSellerId quando oportunidade existe sem dono', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'o1', conversationId: 'c1', assignedSellerId: null, assignedTo: null });
    prisma.opportunity.update.mockResolvedValue({ id: 'o1', assignedSellerId: 's1' });
    const out = await svc.createFromLead('t1', { conversationId: 'c1', assignedSellerId: 's1', assignedTo: 'João' });
    expect(out).toMatchObject({ assignedSellerId: 's1' });
    expect(prisma.opportunity.update.mock.calls[0][0].data).toMatchObject({ assignedSellerId: 's1', assignedTo: 'João' });
  });

  it('evolution: agrupa recebidos e ganhos por semana respeitando o escopo', async () => {
    const now = new Date();
    prisma.opportunity.findMany.mockResolvedValue([{ createdAt: now }, { createdAt: now }]);
    prisma.opportunityStageHistory = { ...prisma.opportunityStageHistory, findMany: vi.fn().mockResolvedValue([{ changedAt: now }]) };
    const out = await svc.evolution('t1', 4, 's1');
    expect(out).toHaveLength(4);
    const thisWeek = out[out.length - 1];
    expect(thisWeek.received).toBe(2);
    expect(thisWeek.won).toBe(1);
    expect(prisma.opportunity.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', assignedSellerId: 's1' });
  });
});
