import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { satisfazPerm, type Perm } from './perms';

export const PERM_KEY = 'required_perm';
/**
 * @RequirePerm('campaigns') → exige a permissão (admin sempre passa).
 *
 * Aceita MAIS DE UMA, com semântica "qualquer uma": há rota que serve a dois públicos
 * legítimos — a lista de mercados é lida por quem dispara (`campaigns`) e por quem
 * configura a operação (`settings`). Com uma permissão só, quem tinha a outra recebia
 * 403 e a tela mostrava lista vazia, dizendo que não havia mercado cadastrado.
 *
 * O parâmetro é `Perm`, não `string`: antes um erro de digitação compilava e a rota
 * negava para todo mundo que não fosse admin, silenciosamente. Permissão nova precisa
 * entrar em `perms.ts` para ser usada aqui.
 */
export const RequirePerm = (...perms: Perm[]) => SetMetadata(PERM_KEY, perms);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<Perm | Perm[]>(PERM_KEY, [ctx.getHandler(), ctx.getClass()]);
    // Aceita o formato antigo (string) e o novo (array): `getAllAndOverride` também lê
    // metadata de classe, e um decorator de classe antigo continuaria valendo.
    const perms = (Array.isArray(meta) ? meta : meta ? [meta] : []) as Perm[];
    if (!perms.length) return true; // rota sem exigência
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('não autenticado');
    if (user.role === 'admin') return true; // admin acessa tudo
    // `satisfazPerm` e não `includes`: uma permissão antiga ainda pode valer pela nova
    // durante a transição (hoje só `inbox → support`). Sem isso, separar permissões
    // tiraria o acesso de quem está trabalhando no momento do deploy — inclusive de quem
    // tem um token já emitido com a lista antiga. Ver `PERM_LEGADA`.
    const concedidas = user.permissions ?? [];
    if (perms.some((p) => satisfazPerm(concedidas, p))) return true;
    throw new ForbiddenException(`sem permissão: ${perms.join(' ou ')}`);
  }
}
