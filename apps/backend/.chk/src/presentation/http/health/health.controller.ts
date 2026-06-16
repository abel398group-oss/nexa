import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autonomy: AutonomyService,
  ) {}

  private async dbOk(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // Health geral (compat) — db + kill switch
  @Get()
  async check() {
    const db = (await this.dbOk()) ? 'ok' : 'down';
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      aiAutonomyEnabled: this.autonomy.isEnabled(), // kill switch (ADR 012) — reflete o toggle em runtime
      ts: new Date().toISOString(),
    };
  }

  // Liveness: o processo está de pé? (não checa dependências) — p/ orquestradores
  @Get('live')
  live() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  // Readiness: pronto p/ receber tráfego? (checa DB) → 503 se dependência crítica caiu
  @Get('ready')
  async ready() {
    const ok = await this.dbOk();
    if (!ok) {
      throw new HttpException({ status: 'not_ready', db: 'down' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ready', db: 'ok', ts: new Date().toISOString() };
  }
}
