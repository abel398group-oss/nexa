import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PortalSessionService } from './portal-session.service';

// Aceita a sessao do portal por COOKIE ('portal_session') OU por
// Authorization: Bearer <jwt> (audience 'portal'). O Bearer e usado pelo embed
// nativo no TMS (cross-subdominio), o cookie pelo portal-pagina standalone.
// Popula req.portalCustomer. Nao tem relacao com o JWT interno (isolamento total).
@Injectable()
export class PortalSessionGuard implements CanActivate {
  constructor(private readonly session: PortalSessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = (req.headers?.authorization as string | undefined) ?? '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const token = req.cookies?.['portal_session'] || bearer;
    if (!token) throw new UnauthorizedException('Sessao do portal ausente.');
    const customer = await this.session.verify(token);
    if (!customer) throw new UnauthorizedException('Sessao do portal invalida ou expirada.');
    req.portalCustomer = customer;
    return true;
  }
}
