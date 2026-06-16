import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

function makeCtx(user: any) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('permite o admin da plataforma (tenantId null)', () => {
    expect(guard.canActivate(makeCtx({ tenantId: null, userId: 'u1' }))).toBe(true);
  });

  it('bloqueia usuario de cliente (tenantId definido) com 403', () => {
    expect(() => guard.canActivate(makeCtx({ tenantId: 't1' }))).toThrow(ForbiddenException);
  });

  it('bloqueia sem autenticacao (403)', () => {
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(ForbiddenException);
  });
});
