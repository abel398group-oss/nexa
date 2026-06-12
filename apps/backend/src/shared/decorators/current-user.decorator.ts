import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

// @CurrentUser() -> { userId, tenantId, role }
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

// @CurrentTenant() -> TENANT EFETIVO (resolvido pelo EffectiveTenantInterceptor).
// - cliente comum: o tenant do token (header X-Acting-Tenant-Id e ignorado);
// - platform admin com cliente selecionado: o tenant validado do header;
// - platform admin SEM cliente selecionado: bloqueia (403 "Selecione um cliente").
// Nunca vem do body (ADR 005). Rotas publicas/webhooks (sem req.user) seguem
// retornando null e usam o fallback do proprio controller.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const resolved = req.effectiveTenantId ?? req.user?.tenantId ?? null;

    if (resolved === null && req.user) {
      const isPlatformAdmin =
        req.user.tenantId === null || req.user.tenantId === undefined;
      if (isPlatformAdmin) {
        throw new ForbiddenException('Selecione um cliente para continuar.');
      }
    }
    return resolved;
  },
);
