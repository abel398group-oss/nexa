import {
  Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { HandoffService, TOKEN_TTL_MS_WEBCHAT } from '@/application/handoff/handoff.service';
import { HiperTmsConnector } from '@/application/connectors/hipertms.connector';
import { PortalSessionService } from '@/application/portal/portal-session.service';
import { PortalSessionGuard } from '@/application/portal/portal-session.guard';
import { PortalTicketsService } from '@/application/portal/portal-tickets.service';

class SessionDto {
  @IsString() @MinLength(4) token!: string;
}

// ADR 027 D3 — token server-to-server para o widget web_chat embutido no TMS.
// O TMS autentica com Bearer TMS_SERVICE_TOKEN e passa o userId do usuário logado.
class WebChatTokenDto {
  @IsString() tmsUserId!: string;
  @IsOptional() @IsString() name?: string;
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

// N2: Nota CSAT enviada via token público (sem sessão de portal necessária).
class CsatDto {
  @IsInt() @Min(1) @Max(5) score!: number;
  @IsOptional() @IsString() comment?: string;
}

class TicketsQueryDto {
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @Type(() => Number) offset?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() scope?: string; // 'company' = todos os chamados do tenant (gestores)
}

const COOKIE = 'portal_session';
const SESSION_TTL_MS = 45 * 60 * 1000;
const isProd = () => process.env.NODE_ENV === 'production';

// Adapta a shape interna do Nexa para o contrato esperado pelo TMS.
// N3: expõe subject (campo próprio) e ticketNumber; mantém rootCause para compatibilidade.
function mapTicket(t: any) {
  return {
    id:           t.id,
    ticketNumber: t.ticketNumber ?? null,  // N3: número sequencial (null até ser classificado)
    subject:      t.subject ?? t.rootCause ?? null, // N3: subject próprio; fallback rootCause para legado
    status:       t.status,
    createdAt:    t.createdAt,
    updatedAt:    t.lastActivityAt ?? t.createdAt,
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
// Limite mais restritivo que o global (30 req/min vs 100) — canal externo/não-operador.
@Throttle({ default: { limit: 30, ttl: 60000 } })
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
      isManager:  ctx.isManager ?? false,
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

  // POST /portal/web-chat-token — ADR 027 D3
  // Endpoint server-to-server: TMS obtém token de curta duração (15 min) para o widget.
  // Autenticação: Authorization: Bearer <TMS_SERVICE_TOKEN>
  // O widget recebe SOMENTE o token opaco e o usa no handshake do Socket.IO.
  // TMS_SERVICE_TOKEN nunca chega ao browser — permanece server-to-server.
  @Post('web-chat-token')
  @HttpCode(201)
  async webChatToken(
    @Body() dto: WebChatTokenDto,
    @Headers('authorization') auth: string,
  ) {
    const serviceToken = auth?.replace(/^Bearer\s+/i, '');
    const nexaTenantId = process.env.NEXA_DEFAULT_TENANT_ID ?? 'default';
    return this.handoff.create({
      externalId: dto.tmsUserId,
      tenantId: nexaTenantId,
      name: dto.name,
      serviceToken,
      ttlMs: TOKEN_TTL_MS_WEBCHAT,
    });
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
  // ?scope=company → todos os chamados do tenant (somente gestores).
  @UseGuards(PortalSessionGuard)
  @Get('tickets')
  async listTickets(@Req() req: any, @Query() q: TicketsQueryDto) {
    const customer = req.portalCustomer;
    const pagination = { limit: q.limit ?? 50, offset: q.offset ?? 0 } as any;
    const filters = { status: q.status, category: q.category };

    if (q.scope === 'company') {
      if (!customer.isManager) throw new ForbiddenException('Acesso restrito a gestores.');
      const result = await this.tickets.listByTenant(customer, pagination, filters);
      return result.items.map(mapTicket);
    }

    const result = await this.tickets.list(customer, pagination, filters);
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

  // POST /portal/csat/:token — N2: registra nota de satisfação via token público (1x por chamado).
  // Sem autenticação de sessão — o token já identifica o chamado de forma única.
  @Post('csat/:token')
  @HttpCode(200)
  async submitCsat(@Param('token') token: string, @Body() dto: CsatDto) {
    return this.tickets.submitCsat(token, dto.score, dto.comment);
  }
}
