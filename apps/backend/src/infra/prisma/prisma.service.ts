import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const SLOW_QUERY_MS = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 500);

// Serviço Prisma compartilhado (infra). Injetado nos módulos de feature.
// Log de queries lentas (>PRISMA_SLOW_QUERY_MS ms) ativo em todos os ambientes
// para detectar N+1 e scans sem índice antes de virarem problema em produção.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('query', (e: { query: string; duration: number }) => {
      if (e.duration >= SLOW_QUERY_MS) {
        this.logger.warn(`[slow-query] ${e.duration}ms — ${e.query.slice(0, 200)}`);
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
