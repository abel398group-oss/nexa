import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SellerActivityService } from './seller-activity.service';

function makePrisma() {
  return {
    sellerActivity: {
      create: vi.fn(), findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
    },
  } as any;
}

describe('SellerActivityService', () => {
  let prisma: any;
  let svc: SellerActivityService;
  beforeEach(() => { prisma = makePrisma(); svc = new SellerActivityService(prisma); });

  it('create: grava atividade do tipo valido', async () => {
    prisma.sellerActivity.create.mockResolvedValue({ id: 'a1', type: 'call' });
    const out = await svc.create('t1', { sellerId: 's1', type: 'call', result: 'atendeu' });
    expect(out).toMatchObject({ id: 'a1' });
    expect(prisma.sellerActivity.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 't1', sellerId: 's1', type: 'call', result: 'atendeu',
    });
  });

  it('create: tipo invalido -> BadRequest', async () => {
    await expect(
      svc.create('t1', { sellerId: 's1', type: 'whatsapp' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sellerActivity.create).not.toHaveBeenCalled();
  });

  it('findAll: escopa por tenant', async () => {
    prisma.sellerActivity.findMany.mockResolvedValue([]); prisma.sellerActivity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any);
    expect(prisma.sellerActivity.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1' });
  });

  it('findAll com sellerScope: filtra sellerId', async () => {
    prisma.sellerActivity.findMany.mockResolvedValue([]); prisma.sellerActivity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, undefined, 's1');
    expect(prisma.sellerActivity.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', sellerId: 's1' });
  });

  it('findAll com sellerScope __none__ (vendedor sem sellerId): nunca vaza', async () => {
    prisma.sellerActivity.findMany.mockResolvedValue([]); prisma.sellerActivity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, undefined, '__none__');
    expect(prisma.sellerActivity.findMany.mock.calls[0][0].where.sellerId).toBe('__never__');
  });

  it('findAll com opportunityId: filtra pela oportunidade', async () => {
    prisma.sellerActivity.findMany.mockResolvedValue([]); prisma.sellerActivity.count.mockResolvedValue(0);
    await svc.findAll('t1', { limit: 50, offset: 0 } as any, 'op1');
    expect(prisma.sellerActivity.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', opportunityId: 'op1' });
  });

  it('summary: agrupa contagem por vendedor e tipo', async () => {
    prisma.sellerActivity.groupBy.mockResolvedValue([
      { sellerId: 's1', type: 'call', _count: 3 },
      { sellerId: 's1', type: 'email', _count: 2 },
      { sellerId: 's2', type: 'note', _count: 1 },
    ]);
    const out = await svc.summary('t1');
    expect(out).toEqual(expect.arrayContaining([
      { sellerId: 's1', calls: 3, emails: 2, notes: 0 },
      { sellerId: 's2', calls: 0, emails: 0, notes: 1 },
    ]));
  });
});
