import { Controller, Get, HttpException, HttpStatus, OnModuleDestroy } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { AnthropicService } from '@/shared/ai/anthropic.service';

@ApiTags('health')
@Controller('health')
export class HealthController implements OnModuleDestroy {
  private readonly redis: Redis | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly autonomy: AutonomyService,
    private readonly anthropic: AnthropicService,
  ) {
    const url = process.env.REDIS_URL;
    this.redis = url ? new Redis(url, { lazyConnect: true }) : null;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => null);
  }

  private async dbOk(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async redisOk(): Promise<boolean> {
    if (!this.redis) return true; // Redis não configurado — não bloqueia
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  // Health geral (compat) — db + redis + kill switch + ai stats
  @Get()
  async check() {
    const [db, redis] = await Promise.all([this.dbOk(), this.redisOk()]);
    const ok = db && redis;
    return {
      status: ok ? 'ok' : 'degraded',
      db: db ? 'ok' : 'down',
      redis: redis ? 'ok' : 'down',
      aiAutonomyEnabled: this.autonomy.isEnabled(),
      ai: this.anthropic.getStats(),
      ts: new Date().toISOString(),
    };
  }

  // Liveness: o processo está de pé? (não checa dependências) — p/ orquestradores
  @Get('live')
  live() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  // Readiness: pronto p/ receber tráfego? (checa DB + Redis) → 503 se dependência crítica caiu
  @Get('ready')
  async ready() {
    const [db, redis] = await Promise.all([this.dbOk(), this.redisOk()]);
    if (!db || !redis) {
      throw new HttpException(
        { status: 'not_ready', db: db ? 'ok' : 'down', redis: redis ? 'ok' : 'down' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ready', db: 'ok', redis: 'ok', ts: new Date().toISOString() };
  }
}
