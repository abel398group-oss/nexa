import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import type { Response } from 'express';
import { HandoffService } from '@/application/handoff/handoff.service';
import { HiperTmsConnector } from '@/application/connectors/hipertms.connector';
import { PortalSessionService } from '@/application/portal/portal-session.service';
import { PortalSessionGuard } from '@/application/portal/portal-session.guard';

class SessionDto {
  @IsString() @MinLength(4) token!: string;
}

const COOKIE = 'portal_session';
const MAX_AGE_MS = 45 * 60 * 1000; // 45 min
const isProd = () => process.env.NODE_ENV === 'production';

// Rotas voltadas ao CLIENTE final (portal de suporte). Auth propria (sessao do portal).
@Controller('portal')
export class PortalController {
  constructor(
    private readonly handoff: HandoffService,
    private readonly session: PortalSessionService,
    private readonly connector: HiperTmsConnector,
  ) {}

  // Troca o token de entrada (gerado pelo TMS) por um cookie de sessao do portal.
  @Post('session')
  async createSession(@Body() dto: SessionDto, @Res({ passthrough: true }) res: Response) {
    const ctx = await this.handoff.consume(dto.token);
    if (!ctx) throw new UnauthorizedException('Token de entrada invalido ou expirado.');

    const jwt = await this.session.sign({
      externalId: ctx.externalId,
      tenantId: ctx.tenantId,
      name: ctx.name ?? null,
    });
    res.cookie(COOKIE, jwt, {
      httpOnly: true,
      secure: isProd(),
      sameSite: isProd() ? 'none' : 'lax', // 'none' p/ embed em iframe do TMS (exige secure)
      maxAge: MAX_AGE_MS,
      path: '/api/portal',
    });
    return { ok: true, name: ctx.name ?? null };
  }

  // Perfil do cliente logado + dados read-only do TMS (degrada se o connector cair).
  @UseGuards(PortalSessionGuard)
  @Get('me')
  async me(@Req() req: any) {
    const c = req.portalCustomer;
    let contract: unknown = null;
    try {
      contract = await this.connector.getContractStatus(c.externalId);
    } catch {
      contract = null; // degrada: mostra so a identidade
    }
    return { externalId: c.externalId, tenantId: c.tenantId, name: c.name, contract };
  }

  @Post('session/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/api/portal' });
    return { ok: true };
  }
}
