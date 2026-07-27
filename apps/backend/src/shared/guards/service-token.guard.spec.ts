import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ServiceTokenGuard } from './service-token.guard';

// ─── ServiceTokenGuard — auth server-to-server (TMS → Nexa) ──────────────────
// Auditoria 2026-07-26: comparação passou a ser timing-safe (safeEqual).

function ctxWith(authHeader?: string) {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    __req: req,
  } as any;
}

describe('ServiceTokenGuard', () => {
  const orig = { ...process.env };
  let guard: ServiceTokenGuard;

  beforeEach(() => {
    delete process.env.TMS_SERVICE_TOKEN;
    delete process.env.NEXA_SERVICE_TOKEN;
    guard = new ServiceTokenGuard();
    vi.spyOn(guard['logger'], 'error').mockImplementation(() => undefined);
    vi.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = { ...orig };
  });

  it('sem env configurada → fail-closed (503, não deixa passar)', () => {
    expect(() => guard.canActivate(ctxWith('Bearer qualquer'))).toThrow(ServiceUnavailableException);
  });

  it('token correto → autoriza e marca o cliente de serviço', () => {
    process.env.TMS_SERVICE_TOKEN = 'segredo-forte-123';
    const ctx = ctxWith('Bearer segredo-forte-123');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx.__req.serviceClient?.name).toBe('tms');
  });

  it('token errado → 401', () => {
    process.env.TMS_SERVICE_TOKEN = 'segredo-forte-123';
    expect(() => guard.canActivate(ctxWith('Bearer errado'))).toThrow(UnauthorizedException);
  });

  it('token de mesmo tamanho mas diferente → 401 (safeEqual não confunde)', () => {
    process.env.TMS_SERVICE_TOKEN = 'aaaaaaaaaaaa';
    expect(() => guard.canActivate(ctxWith('Bearer bbbbbbbbbbbb'))).toThrow(UnauthorizedException);
  });

  it('sem header Authorization → 401', () => {
    process.env.TMS_SERVICE_TOKEN = 'segredo-forte-123';
    expect(() => guard.canActivate(ctxWith())).toThrow(UnauthorizedException);
  });

  it('header sem prefixo Bearer → 401', () => {
    process.env.TMS_SERVICE_TOKEN = 'segredo-forte-123';
    expect(() => guard.canActivate(ctxWith('segredo-forte-123'))).toThrow(UnauthorizedException);
  });

  it('alias legado NEXA_SERVICE_TOKEN ainda autentica (com warning) — remover após migração do TMS', () => {
    process.env.NEXA_SERVICE_TOKEN = 'legado-456';
    const ctx = ctxWith('Bearer legado-456');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard['logger'].warn).toHaveBeenCalled();
  });
});
