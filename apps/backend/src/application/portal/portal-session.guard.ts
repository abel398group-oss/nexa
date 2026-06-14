import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PortalSessionService } from './portal-session.service';

// Aceita SOMENTE a sessao do portal (cookie 'portal_session', audience 'portal').
// Popula req.portalCustomer. Nao tem relacao com o JWT interno (isolamento total).
@Injectable()
export class PortalSessionGuard implements CanActivate {
  constructor(private readonly session: PortalSessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.['portal_session'];
    if (!token) throw new UnauthorizedException('Sessao do portal ausente.');
    const customer = await this.session.verify(token);
    if (!customer) throw new UnauthorizedException('Sessao do portal invalida ou expirada.');
    req.portalCustomer = customer;
    return true;
  }
}
