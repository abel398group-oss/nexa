import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PartnersService } from './partners.service';

function makePrisma() {
  return {
    partner: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(),
    },
  } as any;
}

describe('PartnersService', () => {
  let prisma: any;
  let svc: PartnersService;
  beforeEach(() => { prisma = makePrisma(); svc = new PartnersService(prisma); });

  it('list: escopa por tenant', async () => {
    prisma.partner.findMany.mockResolvedValue([]);
    await svc.list('t1');
    expect(prisma.partner.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1' });
  });

  it('findOne: 404 quando nao e do tenant', async () => {
    prisma.partner.findFirst.mockResolvedValue(null);
    await expect(svc.findOne('t1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.partner.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'x', tenantId: 't1' });
  });

  it('create: grava tenantId + dados do parceiro', async () => {
    prisma.partner.create.mockResolvedValue({ id: 'p1', name: 'Pneus X' });
    await svc.create('t1', { name: 'Pneus X', type: 'pneus' });
    expect(prisma.partner.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', name: 'Pneus X', type: 'pneus' });
  });

  it('setActive: 404 se nao pertence ao tenant, sem chamar update', async () => {
    prisma.partner.findFirst.mockResolvedValue(null);
    await expect(svc.setActive('t1', 'x', false)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.partner.update).not.toHaveBeenCalled();
  });

  it('setActive: desativa parceiro existente', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    prisma.partner.update.mockResolvedValue({ id: 'p1', active: false });
    await svc.setActive('t1', 'p1', false);
    expect(prisma.partner.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p1' }, data: { active: false } });
  });
});
