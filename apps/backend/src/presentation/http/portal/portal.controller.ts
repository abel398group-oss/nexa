import {
  Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards,
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

class OpenTicketDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() body?: string;     // campo do TMS
  @IsOptional() @IsString() message?: string;  // alias interno
}

class ReplyDto {
  @IsOptional() @IsString() body?: string;     // campo do TMS
  @IsOptional() @IsString() message?: string;  // alias interno
}

class TicketsQueryDto {
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @Type(() => Number) offset?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() category?: string;
}

const COOKIE = 'portal_session';
const SESSION_TTL_MS = 45 * 60 * 1000;
const isProd = () => process.env.NODE_ENV === 'production';

// Adapta a shape interna do Nexa para o contrato esperado pelo TMS.
function mapTicket(t: any) {
  return {
    id:        t.id,
    subject:   t.rootCause ?? null,
    status:    t.status,
    createdAt: t.createdAt,
    updatedAt: t.lastActivityAt ?? t.createdAt,
  };
}

function mapMessage(m: any) {
  return {
    id:        m.id,
    author:    m.direction === 'outbound' ? 'agent' : 'customer',
    body:      m.content,
    createdAt: m.createdAt,
    isAgent:   m.direction === 'outbound',
  };
}

// Rotas voltadas ao CLIENTE final (portal de suporte). Auth própria (sessão do portal).
@Controller('portal')
export class PortalController {
  constructor(
    private readonly handoff: HandoffService,
    private readonly session: PortalSessionService,
    private readonly connector: HiperTmsConnector,
    private readonly tickets: PortalTicketsService,
  ) {}

  // POST /portal/session — troca token de handoff por JWT.
  // Retorna { jwt, expiresAt, name } conforme contrato TMS.
  @Post('session')
  async createSession(@Body() dto: SessionDto, @Res({ passthrough: true }) res: Response) {
    const ctx = await this.handoff.consume(dto.token);
    if (!ctx) throw new UnauthorizedException('Token de entrada inválido ou expirado.');

    const jwt = await this.session.sign({
      externalId: ctx.externalId,
      tenantId:   ctx.tenantId,
      name:       ctx.name ?? null,
    });
    res.cookie(COOKIE, jwt, {
      httpOnly: true,
      secure:   isProd(),
      sameSite: isProd() ? 'none' : 'lax',
      maxAge:   SESSION_TTL_MS,
      path:     '/api/portal',
    });
    return {
      jwt,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      name: ctx.name ?? null,
    };
  }

  // DELETE /portal/session — encerra sessão (contrato TMS: 204 No Content).
  @Delete('session')
  @HttpCode(204)
  @UseGuards(PortalSessionGuard)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/api/portal' });
  }

  // POST /portal/session/logout — mantido para compatibilidade.
  @Post('session/logout')
  logoutLegacy(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: '/api/portal' });
    return { ok: true };
  }

  // GET /portal/me — perfil do cliente + dados do contrato.
  @UseGuards(PortalSessionGuard)
  @Get('me')
  async me(@Req() req: any) {
    const c = req.portalCustomer;
    let contract: unknown = null;
    try { contract = await this.connector.getContractStatus(c.externalId); } catch { contract = null; }
    return { externalId: c.externalId, tenantId: c.tenantId, name: c.name, contract };
  }

  // GET /portal/tickets — lista chamados. Retorna array plano conforme contrato TMS.
  @UseGuards(PortalSessionGuard)
  @Get('tickets')
  async listTickets(@Req() req: any, @Query() q: TicketsQueryDto) {
    const result = await this.tickets.list(
      req.portalCustomer,
      { limit: q.limit ?? 50, offset: q.offset ?? 0 } as any,
      { status: q.status, category: q.category },
    );
    return result.items.map(mapTicket);
  }

  // GET /portal/tickets/:id — detalhe + mensagens mapeadas para o contrato TMS.
  @UseGuards(PortalSessionGuard)
  @Get('tickets/:id')
  async getTicket(@Req() req: any, @Param('id') id: string) {
    const ticket = await this.tickets.detail(req.portalCustomer, id);
    return { ...mapTicket(ticket), messages: (ticket.messages ?? []).map(mapMessage) };
  }

  // POST /portal/tickets — abre chamado. TMS envia { subject, body, category }.
  @UseGuards(PortalSessionGuard)
  @Post('tickets')
  async openTicket(@Req() req: any, @Body() dto: OpenTicketDto) {
    const ticket = await this.tickets.open(req.portalCustomer, {
      message:  dto.body ?? dto.message ?? '',
      subject:  dto.subject,
      category: dto.category,
      phone:    dto.phone,
    });
    return { ...mapTicket(ticket), messages: (ticket.messages ?? []).map(mapMessage) };
  }

  // POST /portal/tickets/:id/replies — resposta do cliente (contrato TMS).
  // TMS envia { body }; retorna a mensagem recém-criada.
  @UseGuards(PortalSessionGuard)
  @Post('tickets/:id/replies')
  async replyTicket(@Req() req: any, @Param('id') id: string, @Body() dto: ReplyDto) {
    const message = dto.body ?? dto.message ?? '';
    const ticket = await this.tickets.reply(req.portalCustomer, id, message);
    const msgs: any[] = ticket.messages ?? [];
    const last = [...msgs].reverse().find((m: any) => m.direction === 'inbound') ?? msgs[msgs.length - 1];
    return last
      ? mapMessage(last)
      : { id: null, author: 'customer', body: message, createdAt: new Date().toISOString(), isAgent: false };
  }

  // POST /portal/tickets/:id/messages — mantido para compatibilidade interna/testes.
  @UseGuards(PortalSessionGuard)
  @Post('tickets/:id/messages')
  async replyTicketLegacy(@Req() req: any, @Param('id') id: string, @Body() dto: ReplyDto) {
    const message = dto.body ?? dto.message ?? '';
    return this.tickets.reply(req.portalCustomer, id, message);
  }
}
