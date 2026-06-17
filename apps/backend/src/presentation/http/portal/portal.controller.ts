import {
  Body, Controller, Get, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { HandoffService } from '@/application/handoff/handoff.service';
import { HiperTmsConnector } from '@/application/connectors/hipertms.connector';
import { PortalSessionService } from '@/application/portal/portal-session.service';
import { PortalSessionGuard } from '@/application/portal/portal-session.guard';
import { PortalTicketsService } from '@/application/portal/portal-tickets.service';

class SessionDto {
  @IsString() @MinLength(4) token!: string;
}

class TicketMessageDto {
  @IsString() @MinLength(1) message!: string;
}

class OpenTicketDto {
  @IsString() @MinLength(1) message!: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() phone?: string;
}

class TicketsQueryDto {
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @Type(() => Number) offset?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() category?: string;
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
    private readonly tickets: PortalTicketsService,
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
    // session: o MESMO JWT no corpo, para o embed NATIVO no TMS usar como
    // Authorization: Bearer (cross-subdominio, sem depender de cookie). O portal-pagina
    // standalone continua usando o cookie acima. Ver docs/features/tms-native-support.
    return { ok: true, name: ctx.name ?? null, session: jwt };
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
      contract = null;
    }
    return { externalId: c.externalId, tenantId: c.tenantId, name: c.name, contract };
  }

  // Lista os chamados do cliente (escopo por externalId da sessao).
  @UseGuards(PortalSessionGuard)
  @Get('tickets')
  listTickets(@Req() req: any, @Query() q: TicketsQueryDto) {
    const page = { limit: q.limit ?? 50, offset: q.offset ?? 0 } as any;
    return this.tickets.list(req.portalCustomer, page, { status: q.status, category: q.category });
  }

  // Detalhe + mensagens de um chamado (404 se nao for do cliente).
  @UseGuards(PortalSessionGuard)
  @Get('tickets/:id')
  getTicket(@Req() req: any, @Param('id') id: string) {
    return this.tickets.detail(req.portalCustomer, id);
  }

  // Abre um novo chamado (entra no pipeline da Lia).
  @UseGuards(PortalSessionGuard)
  @Post('tickets')
  openTicket(@Req() req: any, @Body() dto: OpenTicketDto) {
    return this.tickets.open(req.portalCustomer, {
      message: dto.message,
      subject: dto.subject,
      category: dto.category,
      phone: dto.phone,
    });
  }

  // Cliente responde num chamado existente.
  @UseGuards(PortalSessionGuard)
  @Post('tickets/:id/messages')
  replyTicket(@Req() req: any, @Param('id') id: string, @Body() dto: TicketMessageDto) {
    return this.tickets.reply(req.portalCustomer, id, dto.message);
  }

  @Post('session/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/api/portal' });
    return { ok: true };
  }
}
