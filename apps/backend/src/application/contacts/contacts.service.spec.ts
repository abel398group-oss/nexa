import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { PrismaService } from '@/infra/prisma/prisma.service';

// Mock minimo do PrismaService: so os metodos usados pelo service.
function makePrisma() {
  return {
    $queryRaw: vi.fn(),
    contact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    campaignTarget: {
      findMany: vi.fn(),
    },
  } as unknown as PrismaService & any;
}

describe('ContactsService', () => {
  let prisma: any;
  let svc: ContactsService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new ContactsService(prisma);
  });

  describe('listTags', () => {
    it('conta tags distintas e ordena por contagem desc', async () => {
      // listTags usa $queryRaw (SQL unnest) — o banco agrega; simulamos a resposta agregada
      prisma.$queryRaw.mockResolvedValue([
        { tag: 'vip', count: 3 },
        { tag: 'sp', count: 2 },
      ]);
      const out = await svc.listTags('t1');
      expect(out).toEqual([
        { tag: 'vip', count: 3 },
        { tag: 'sp', count: 2 },
      ]);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('retorna vazio quando nao ha contatos', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      expect(await svc.listTags('t1')).toEqual([]);
    });
  });

  describe('bulkTag', () => {
    it('no-op quando tag vazia ou sem ids', async () => {
      expect(await svc.bulkTag('t1', [], 'vip')).toEqual({ updated: 0 });
      expect(await svc.bulkTag('t1', ['a'], '   ')).toEqual({ updated: 0 });
      expect(prisma.contact.findMany).not.toHaveBeenCalled();
    });

    it('adiciona tag sem duplicar e busca apenas contatos do tenant', async () => {
      prisma.contact.findMany.mockResolvedValue([
        { id: 'a', tags: ['vip'] }, // ja tem -> nao duplica
        { id: 'b', tags: [] },
      ]);
      const out = await svc.bulkTag('t1', ['a', 'b'], 'vip', 'add');
      expect(out).toEqual({ updated: 2 });
      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] }, tenantId: 't1' },
        select: { id: true, tags: true },
      });
      expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { tags: ['vip'] } });
      expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { tags: ['vip'] } });
    });

    it('remove tag existente', async () => {
      prisma.contact.findMany.mockResolvedValue([{ id: 'a', tags: ['vip', 'sp'] }]);
      await svc.bulkTag('t1', ['a'], 'vip', 'remove');
      expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { tags: ['sp'] } });
    });
  });

  describe('importMany', () => {
    it('faz upsert por (tenant, phone) e conta os importados', async () => {
      prisma.contact.upsert.mockResolvedValue({});
      const out = await svc.importMany('t1', [
        { phone: '5511999998888', name: 'A' } as any,
        { phone: '5511988887777' } as any,
      ]);
      expect(out).toEqual({ imported: 2 });
      expect(prisma.contact.upsert).toHaveBeenCalledTimes(2);
      // a chave de upsert usa tenantId_phone (idempotente, nao duplica)
      const firstCall = prisma.contact.upsert.mock.calls[0][0];
      expect(firstCall.where.tenantId_phone.tenantId).toBe('t1');
      expect(firstCall.create.tenantId).toBe('t1');
    });
  });

  describe('findAll', () => {
    it('filtra por tenant + tag + busca', async () => {
      prisma.contact.findMany.mockResolvedValue([{ id: 'a' }]);
      prisma.contact.count.mockResolvedValue(1);
      const out = await svc.findAll('t1', { limit: 50, offset: 0, search: 'joao' } as any, 'vip');
      expect(out).toEqual({ items: [{ id: 'a' }], total: 1 });
      const where = prisma.contact.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.tags).toEqual({ has: 'vip' });
      expect(where.OR).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('lanca NotFound quando o contato nao e do tenant', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(svc.findOne('t1', 'x')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.contact.findFirst).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1' } });
    });
  });

  describe('campaignsForContact', () => {
    it('mapeia o historico via CampaignTarget (escopo tenant + phone)', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'c1', phone: '5511999998888' });
      prisma.campaignTarget.findMany.mockResolvedValue([
        {
          campaignId: 'camp1',
          status: 'sent',
          sentAt: new Date('2026-06-01'),
          createdAt: new Date('2026-06-01'),
          campaign: { id: 'camp1', name: 'Promo', channel: 'email', createdAt: new Date('2026-06-01') },
        },
      ]);
      const out = await svc.campaignsForContact('t1', 'c1');
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ campaignId: 'camp1', name: 'Promo', channel: 'email', status: 'sent' });
      expect(prisma.campaignTarget.findMany.mock.calls[0][0].where).toMatchObject({
        tenantId: 't1',
        phone: '5511999998888',
      });
    });

    it('propaga NotFound se o contato nao existe no tenant', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(svc.campaignsForContact('t1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
