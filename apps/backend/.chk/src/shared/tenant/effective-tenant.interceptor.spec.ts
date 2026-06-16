import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { EffectiveTenantInterceptor } from './effective-tenant.interceptor';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AuditService } from '@/shared/audit/audit.service';

const next = { handle: vi.fn(() => of('ok')) };

function makeCtx(req: any) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

function makePrisma(tenant: any): PrismaService {
  return { tenant: { findUnique: vi.fn().mockResolvedValue(tenant) } } as unknown as PrismaService;
}

function makeAudit() {
  return { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

// Consome o Observable retornado para disparar o tap (auditoria).
async function run(interceptor: EffectiveTenantInterceptor, req: any) {
  const obs = await interceptor.intercept(makeCtx(req), next as any);
  await new Promise<void>((resolve) => obs.subscribe({ complete: () => resolve() }));
}

describe('EffectiveTenantInterceptor (Fase 2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cliente comum: IGNORA o header e usa o tenant do token', async () => {
    const prisma = makePrisma(null);
    const req: any = { user: { tenantId: 't1' }, headers: { 'x-acting-tenant-id': 'outro' }, method: 'GET' };
    await run(new EffectiveTenantInterceptor(prisma, makeAudit()), req);
    expect(req.effectiveTenantId).toBe('t1');
    expect(req.isActingAsTenant).toBe(false);
    expect(prisma.tenant.findUnique as any).not.toHaveBeenCalled();
  });

  it('platform admin + tenant ativo (GET): define o tenant efetivo, sem auditar', async () => {
    const audit = makeAudit();
    const req: any = { user: { tenantId: null, userId: 'a1' }, headers: { 'x-acting-tenant-id': 'default' }, method: 'GET' };
    await run(new EffectiveTenantInterceptor(makePrisma({ id: 'default', status: 'active' }), audit), req);
    expect(req.effectiveTenantId).toBe('default');
    expect(req.isActingAsTenant).toBe(true);
    expect(audit.log as any).not.toHaveBeenCalled();
  });

  it('platform admin SEM header: tenant efetivo null', async () => {
    const req: any = { user: { tenantId: null }, headers: {}, method: 'GET' };
    await run(new EffectiveTenantInterceptor(makePrisma(null), makeAudit()), req);
    expect(req.effectiveTenantId).toBeNull();
  });

  it('rejeita tenant inexistente (403)', async () => {
    const req: any = { user: { tenantId: null }, headers: { 'x-acting-tenant-id': 'nao-existe' }, method: 'GET' };
    await expect(new EffectiveTenantInterceptor(makePrisma(null), makeAudit()).intercept(makeCtx(req), next as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeita tenant suspenso (403)', async () => {
    const req: any = { user: { tenantId: null }, headers: { 'x-acting-tenant-id': 'x' }, method: 'GET' };
    await expect(new EffectiveTenantInterceptor(makePrisma({ id: 'x', status: 'suspended' }), makeAudit()).intercept(makeCtx(req), next as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Fase 2: escrita NAO destrutiva (POST contato) e PERMITIDA e AUDITADA', async () => {
    const audit = makeAudit();
    const req: any = { user: { tenantId: null, userId: 'a1' }, headers: { 'x-acting-tenant-id': 'default' }, method: 'POST', originalUrl: '/api/contacts', correlationId: 'c1' };
    await run(new EffectiveTenantInterceptor(makePrisma({ id: 'default', status: 'active' }), audit), req);
    expect(audit.log as any).toHaveBeenCalledTimes(1);
    expect((audit.log as any).mock.calls[0][0]).toMatchObject({ action: 'platform_admin.acting_write', tenantId: 'default', userId: 'a1' });
  });

  it('Fase 2: acao irreversivel (DELETE) SEM override -> 403 com codigo', async () => {
    const req: any = { user: { tenantId: null }, headers: { 'x-acting-tenant-id': 'default' }, method: 'DELETE', originalUrl: '/api/contacts/123' };
    try {
      await new EffectiveTenantInterceptor(makePrisma({ id: 'default', status: 'active' }), makeAudit()).intercept(makeCtx(req), next as any);
      throw new Error('deveria ter lancado');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getResponse()).toMatchObject({ code: 'acting_destructive_blocked' });
    }
  });

  it('Fase 2: acao irreversivel (DELETE) COM override -> executa e audita override', async () => {
    const audit = makeAudit();
    const req: any = { user: { tenantId: null, userId: 'a1' }, headers: { 'x-acting-tenant-id': 'default', 'x-acting-override': 'true' }, method: 'DELETE', originalUrl: '/api/contacts/123' };
    await run(new EffectiveTenantInterceptor(makePrisma({ id: 'default', status: 'active' }), audit), req);
    expect((audit.log as any).mock.calls[0][0]).toMatchObject({ action: 'platform_admin.override_destructive' });
  });

  it('disparar campanha (POST .../start) e tratado como irreversivel', async () => {
    const req: any = { user: { tenantId: null }, headers: { 'x-acting-tenant-id': 'default' }, method: 'POST', originalUrl: '/api/campaigns/9/start' };
    await expect(new EffectiveTenantInterceptor(makePrisma({ id: 'default', status: 'active' }), makeAudit()).intercept(makeCtx(req), next as any)).rejects.toBeInstanceOf(HttpException);
  });

  it('isenta /api/admin do bloqueio e da auditoria de escrita', async () => {
    const audit = makeAudit();
    const req: any = { user: { tenantId: null }, headers: { 'x-acting-tenant-id': 'default' }, method: 'POST', originalUrl: '/api/admin/tenants/default/enter' };
    await run(new EffectiveTenantInterceptor(makePrisma({ id: 'default', status: 'active' }), audit), req);
    expect(req.effectiveTenantId).toBe('default');
    expect(audit.log as any).not.toHaveBeenCalled();
  });

  it('rota publica (sem user): tenant efetivo null, nao bloqueia', async () => {
    const req: any = { headers: {}, method: 'POST', originalUrl: '/api/webhooks/waha' };
    await run(new EffectiveTenantInterceptor(makePrisma(null), makeAudit()), req);
    expect(req.effectiveTenantId).toBeNull();
  });
});
