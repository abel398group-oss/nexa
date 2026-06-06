import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/infra/prisma/prisma.service';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // Valida credenciais e cria sessão (com refresh token revogável)
  async login(email: string, password: string, ctx: { userAgent?: string; ip?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Credenciais inválidas');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    return this.issueTokens(user.id, user.tenantId, user.role, ctx);
  }

  // Gera access (JWT curto) + refresh (longo, hash salvo na sessão)
  private async issueTokens(
    userId: string,
    tenantId: string | null,
    role: string,
    ctx: { userAgent?: string; ip?: string },
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, tenantId, role },
      { expiresIn: ACCESS_TTL },
    );

    const refreshRaw = uuidv4() + uuidv4();
    const refreshHash = await bcrypt.hash(refreshRaw, 10);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: refreshHash,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt,
      },
    });

    // refresh token = sessionId.refreshRaw (para localizar a sessão no refresh)
    const refreshToken = `${session.id}.${refreshRaw}`;
    return { accessToken, refreshToken, userId, tenantId, role };
  }

  // Renova tokens validando o refresh contra a sessão (e checando revogação)
  async refresh(refreshToken: string, ctx: { userAgent?: string; ip?: string }) {
    const [sessionId, raw] = (refreshToken ?? '').split('.');
    if (!sessionId || !raw) throw new UnauthorizedException('Refresh inválido');

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão inválida/expirada');
    }

    const ok = await bcrypt.compare(raw, session.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Refresh inválido');

    // rotação: revoga a sessão antiga e cria nova
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(session.userId, session.user.tenantId, session.user.role, ctx);
  }

  // Logout = revogar a sessão
  async logout(refreshToken: string) {
    const [sessionId] = (refreshToken ?? '').split('.');
    if (sessionId) {
      await this.prisma.session
        .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
    }
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
  }
}
