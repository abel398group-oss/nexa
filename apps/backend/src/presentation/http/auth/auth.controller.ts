import { BadRequestException, Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from '@/application/auth/auth.service';
import { PasswordResetService } from '@/application/auth/password-reset.service';
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
    private readonly reset: PasswordResetService,
  ) {}

  // ─── SETUP: cria o primeiro admin ────────────────────────────────────────────
  // Só funciona se NÃO existir nenhum usuário com role=admin no banco.
  // Depois que o admin existir, este endpoint retorna 400 e fica bloqueado.
  // Uso: POST /auth/setup  { "email": "...", "password": "...", "name": "..." }
  // Rate-limit agressivo: 3 tentativas por hora (evita brute-force pré-setup).
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
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

  /**
   * Troca a senha do PRÓPRIO usuário logado. Exige a senha atual — sem isso, um
   * navegador esquecido aberto viraria sequestro de conta.
   *
   * Existe porque não havia NENHUM caminho para trocar senha na interface: a tela
   * de Usuários lista por tenant, e o platform admin (tenantId = null) não aparece
   * nem para si mesmo. Resultado: a senha padrão do seed (pública no Git) não
   * tinha como ser trocada sem mexer no banco.
   *
   * Rate-limit apertado: 5 tentativas por 15 min (a senha atual é adivinhável a
   * força bruta se não limitar).
   */
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('password')
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body() body: { currentPassword?: string; newPassword?: string },
    @Req() req: Request,
  ) {
    const atual = (body?.currentPassword ?? '').trim();
    const nova = (body?.newPassword ?? '').trim();
    if (!atual || !nova) throw new BadRequestException('Informe a senha atual e a nova senha.');
    if (nova.length < 8) throw new BadRequestException('A nova senha precisa ter pelo menos 8 caracteres.');
    if (nova === atual) throw new BadRequestException('A nova senha precisa ser diferente da atual.');

    await this.auth.changeOwnPassword(user.userId, atual, nova);
    // (audit abaixo)
    await this.audit.log({
      tenantId: null,
      actorId: user.userId,
      action: 'auth.password_changed',
      // sem conteúdo de senha no log, só o rastro de quem trocou e de onde
      metadata: { ip: req.ip },
    } as any).catch(() => undefined);
    return { ok: true };
  }

  // ─── Esqueceu a senha ────────────────────────────────────────────────────────
  // Público (sem auth) e por isso com rate-limit apertado. A resposta é SEMPRE a
  // mesma, exista o e-mail ou não: senão a tela vira um oráculo para descobrir
  // quem tem conta no sistema.
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email?: string }) {
    const base = process.env.APP_BASE_URL ?? 'http://localhost:5174';
    await this.reset.request(body?.email ?? '', base);
    return { ok: true, message: 'Se houver uma conta com esse e-mail, o link de redefinição foi enviado.' };
  }

  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('reset-password')
  async resetPassword(@Body() body: { token?: string; newPassword?: string }) {
    return this.reset.reset(body?.token ?? '', body?.newPassword ?? '');
  }
}
