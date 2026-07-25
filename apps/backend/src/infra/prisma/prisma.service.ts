import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const SLOW_QUERY_MS = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 500);

// Cap máximo de conexões simultâneas no pool do Prisma.
// O PostgreSQL gerenciado DO tem max_connections=25 compartilhado entre todos os apps.
// Manter baixo (≤5) para não esgotar o pool e causar P2037.
// Sobrescrever via PRISMA_CONNECTION_LIMIT se necessário.
const CONNECTION_LIMIT = Number(process.env.PRISMA_CONNECTION_LIMIT ?? 3);

/** Injeta connection_limit + pool_timeout na DATABASE_URL sem modificar o .env. */
function buildDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? '';
  const [base, qs] = raw.split('?');
  const params = new URLSearchParams(qs ?? '');
  if (!params.has('connection_limit')) params.set('connection_limit', String(CONNECTION_LIMIT));
  if (!params.has('pool_timeout')) params.set('pool_timeout', '10');
  return `${base}?${params.toString()}`;
}

// Serviço Prisma compartilhado (infra). Injetado nos módulos de feature.
// Log de queries lentas (>PRISMA_SLOW_QUERY_MS ms) ativo em todos os ambientes
// para detectar N+1 e scans sem índice antes de virarem problema em produção.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');
  /** Contador acumulado de queries lentas (>SLOW_QUERY_MS). Lido pelo DevWatchService. */
  static slowQueryCount = 0;

  constructor() {
    super({
      log: [{ emit: 'event', level: 'query' }],
      datasources: { db: { url: buildDatabaseUrl() } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).$on('query', (e: { query: string; duration: number }) => {
      if (e.duration >= SLOW_QUERY_MS) {
        PrismaService.slowQueryCount++;
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
