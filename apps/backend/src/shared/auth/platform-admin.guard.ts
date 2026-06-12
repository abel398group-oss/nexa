import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Libera apenas o admin da plataforma (User.tenantId === null). Demais -> 403.
// docs/features/platform-admin sec 6 (regra 3).
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('nao autenticado');
    const isPlatformAdmin = user.tenantId === null || user.tenantId === undefined;
    if (!isPlatformAdmin) {
      throw new ForbiddenException('acesso restrito ao admin da plataforma');
    }
    return true;
  }
}
