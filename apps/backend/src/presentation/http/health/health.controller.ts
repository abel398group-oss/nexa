import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      aiAutonomyEnabled: process.env.AI_AUTONOMY_ENABLED === 'true', // kill switch (ADR 012)
      ts: new Date().toISOString(),
    };
  }
}
