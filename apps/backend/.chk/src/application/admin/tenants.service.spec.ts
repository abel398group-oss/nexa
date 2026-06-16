import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AuditService } from '@/shared/audit/audit.service';

function makePrisma() {
  return {
    tenant: { findMany: vi.fn(), findUnique: vi.fn() },
  } as unknown as PrismaService & any;
}
function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService & any;
}

describe('TenantsService', () => {
  let prisma: any;
  let audit: any;
  let svc: TenantsService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    svc = new TenantsService(prisma, audit);
  });

  it('list: retorna os clientes para o seletor', async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: 'default', name: 'HiperTMS', slug: 'hipertms', status: 'active' }]);
    const out = await svc.list();
    expect(out).toHaveLength(1);
    expect(prisma.tenant.findMany).toHaveBeenCalled();
  });

  it('getOne: lanca NotFound quando o cliente nao existe', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(svc.getOne('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enter: tenant ativo -> registra AuditLog e devolve o cliente', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'default', name: 'HiperTMS', slug: 'hipertms', status: 'active' });
    const out = await svc.enter('default', { userId: 'admin1', role: 'admin' }, 'corr-1');
    expect(out).toMatchObject({ id: 'default', name: 'HiperTMS', status: 'active' });
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      action: 'platform_admin.enter_tenant',
      userId: 'admin1',
      tenantId: 'default',
      resource: 'tenant',
      correlationId: 'corr-1',
    });
  });

  it('enter: tenant inexistente -> NotFound e NAO audita', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(svc.enter('nao-existe', { userId: 'a' })).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('enter: tenant suspenso -> NotFound e NAO audita', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'x', name: 'X', slug: 'x', status: 'suspended' });
    await expect(svc.enter('x', { userId: 'a' })).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
