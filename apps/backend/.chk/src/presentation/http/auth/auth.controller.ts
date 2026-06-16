import { BadRequestException, Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '@/application/auth/auth.service';
import { AuditService } from '@/shared/audit/audit.service';
import { UsersService } from '@/application/users/users.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentUser } from '@/shared/decorators/current-user.decorator';

const isProd = process.env.NODE_ENV === 'production';
const cookieBase = {
  httpOnly: true,
  secure: isProd, // HTTPS em produção
  sameSite: 'lax' as const,
  path: '/',
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, {
    ...cookieBase,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── SETUP: cria o primeiro admin ────────────────────────────────────────────
  // Só funciona se NÃO existir nenhum usuário com role=admin no banco.
  // Depois que o admin existir, este endpoint retorna 400 e fica bloqueado.
  // Uso: POST /auth/setup  { "email": "...", "password": "...", "name": "..." }
  @Post('setup')
  async setup(@Body() body: { email: string; password: string; name?: string }) {
    const adminExists = await this.prisma.user.findFirst({ where: { role: 'admin' } });
    if (adminExists) throw new BadRequestException('Setup já realizado — admin já existe.');
    if (!body.email || !body.password || body.password.length < 6) {
      throw new BadRequestException('Email e senha (mín. 6 chars) são obrigatórios.');
    }
    const user = await this.users.create('default', {
      email: body.email,
      password: body.password,
      name: body.name ?? 'Administrador',
      role: 'admin',
    });
    return { ok: true, message: 'Admin criado com sucesso. Use /auth/login para entrar.', email: user.email };
  }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = { userAgent: req.headers['user-agent'], ip: req.ip };
    const result = await this.auth.login(body.email, body.password, ctx);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    await this.audit.log({
      action: 'auth.login',
      userId: result.userId,
      tenantId: result.tenantId,
      correlationId: (req as any).correlationId,
    });
    return { userId: result.userId, role: result.role };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.['refresh_token'];
    const ctx = { userAgent: req.headers['user-agent'], ip: req.ip };
    const result = await this.auth.refresh(token, ctx);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return { ok: true };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.['refresh_token']);
    res.clearCookie('access_token', cookieBase);
    res.clearCookie('refresh_token', cookieBase);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { userId: string }) {
    return this.auth.me(user.userId);
  }
}
