import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PortalTicketsService } from './portal-tickets.service';

function makePrisma() {
  return {
    aiConversation: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    aiMessage: { findMany: vi.fn() },
    conversationStageHistory: { create: vi.fn() },
  } as any;
}
const customer = { externalId: 'ext1', tenantId: 't1', name: 'Ana' };

describe('PortalTicketsService — isolamento do cliente', () => {
  let prisma: any;
  let svc: PortalTicketsService;
  beforeEach(() => {
    prisma = makePrisma();
    svc = new PortalTicketsService(prisma, {} as any, {} as any);
  });

  it('list: escopa SEMPRE por tenantId + externalId', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([]);
    prisma.aiConversation.count.mockResolvedValue(0);
    await svc.list(customer, { limit: 50, offset: 0 } as any, {});
    expect(prisma.aiConversation.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      externalId: 'ext1',
    });
  });

  it('list: aplica filtros status/category', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([]);
    prisma.aiConversation.count.mockResolvedValue(0);
    await svc.list(customer, { limit: 50, offset: 0 } as any, { status: 'open', category: 'cte' });
    const where = prisma.aiConversation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'open', ticketCategory: 'cte' });
  });

  it('detail: 404 quando o chamado nao e do cliente', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);
    await expect(svc.detail(customer, 'alheio')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.aiConversation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'alheio', tenantId: 't1', externalId: 'ext1',
    });
  });

  it('detail: retorna chamado + mensagens quando e do cliente', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'c1', status: 'open' });
    prisma.aiMessage.findMany.mockResolvedValue([{ id: 'm1', direction: 'inbound', content: 'oi' }]);
    const out = await svc.detail(customer, 'c1');
    expect(out.id).toBe('c1');
    expect(out.messages).toHaveLength(1);
  });

  it('reply: 404 quando o chamado nao e do cliente (ownership)', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);
    await expect(svc.re