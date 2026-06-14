import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { PortalSessionGuard } from './portal-session.guard';

const ctx = (cookies: any, req: any = { cookies }) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) } as any);

describe('PortalSessionGuard', () => {
  it('sem cookie -> 401', async () => {
    const g = new PortalSessionGuard({ verify: vi.fn() } as any);
    await expect(g.canActivate(ctx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cookie invalido -> 401', async () => {
    const g = new PortalSessionGuard({ verify: vi.fn().mockResolvedValue(null) } as any);
    await expect(g.canActivate(ctx({ portal_session: 'x' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('valido -> popula req.portalCustomer', async () => {
    const customer = { externalId: 'e', tenantId: 't', name: 'A' };
    const req: any = { cookies: { portal_session: 'good' } };
    const g = new PortalSessionGuard({ verify: vi.fn().mockResolvedValue(customer) } as any);
    expect(await g.canActivate(ctx(req.cookies, req))).toBe(true);
    expect(req.portalCustomer).toEqual(customer);
  });
});
