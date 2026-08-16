import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { satisfazPerm, type Perm } from './perms';

export const PERM_KEY = 'required_perm';
/**
 * @RequirePerm('campaigns') → exige a permissão (admin sempre passa).
 *
 * O parâmetro é `Perm`, não `string`: antes um erro de digitação compilava e a rota
 * negava para todo mundo que não fosse admin, silenciosamente. Permissão nova precisa
 * entrar em `perms.ts` para ser usada aqui.
 */
export const RequirePerm = (perm: Perm) => SetMetadata(PERM_KEY, perm);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const perm = this.reflector.getAllAndOverride<Perm>(PERM_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!perm) return true; // rota sem exigência
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('não autenticado');
    if (user.role === 'admin') return true; // admin acessa tudo
    // `satisfazPerm` e não `includes`: durante a transição, a permissão antiga ainda
    // vale pela nova (telemarketing → sdr/closer, inbox → support). Sem isso, separar
    // as permissões tiraria o acesso de quem está trabalhando no momento do deploy —
    // inclusive de quem tem um token já emitido com a lista antiga.
    if (satisfazPerm(user.permissions ?? [], perm)) return true;
    throw new ForbiddenException(`sem permissão: ${perm}`);
  }
}
