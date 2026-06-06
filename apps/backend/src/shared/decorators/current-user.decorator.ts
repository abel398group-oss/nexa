import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// @CurrentUser() → { userId, tenantId, role }
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);

// @CurrentTenant() → tenantId (derivado do token, nunca do body — ADR 005)
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user?.tenantId ?? null;
  },
);
