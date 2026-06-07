import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PERM_KEY = 'required_perm';
// @RequirePerm('campaigns') → exige a permissão (admin sempre passa)
export const RequirePerm = (perm: string) => SetMetadata(PERM_KEY, perm);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const perm = this.reflector.getAllAndOverride<string>(PERM_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!perm) return true; // rota sem exigência
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('não autenticado');
    if (user.role === 'admin') return true; // admin acessa tudo
    if ((user.permissions ?? []).includes(perm)) return true;
    throw new ForbiddenException(`sem permissão: ${perm}`);
  }
}
