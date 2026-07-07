import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { KnowledgeService } from './knowledge.service';

// Executa import + reindex do KB automaticamente a cada startup do backend.
// Assim não é necessário disparar manualmente "Importar da integração" após deploy.
//
// Fluxo:
//   1. Aguarda 5s para o app estar 100% pronto (conexões DB, modules, etc.)
//   2. Busca todos os tenants que já possuem KB ou PlanLimit cadastrado
//   3. Para cada tenant: importFromConnector (idempotente) + reindex (só itens sem vetor)
//
// É seguro rodar a qualquer momento:
//   - importFromConnector pula artigos que já existem com mesmo título/conteúdo
//   - reindex(force=false) só processa artigos sem embedding — não regenera o que já tem
@Injectable()
export class KnowledgeBootstrapService implements OnModuleInit {
  private readonly logger = new Logger('KnowledgeBootstrap');

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  onModuleInit() {
    // Delay para garantir que todas as conexões estejam prontas
    setTimeout(() => this.run().catch((e) => this.logger.warn(`Bootstrap KB falhou: ${e?.message}`)), 5_000);
  }

  private async run() {
    // Coleta tenantIds de duas fontes e deduplica:
    // - PlanLimit: todos os tenants ativos com plano registrado
    // - ai_knowledge_base: tenants que já têm KB (cobre caso sem PlanLimit ainda)
    const [planLimits, kbRows] = await Promise.all([
      this.prisma.planLimit.findMany({ select: { tenantId: true } }),
      this.prisma.$queryRawUnsafe<{ tenant_id: string }[]>(
        `SELECT DISTINCT tenant_id FROM ai_knowledge_base`,
      ).catch(() => [] as { tenant_id: string }[]),
    ]);

    const tenantIds = [
      ...new Set([
        ...planLimits.map((p) => p.tenantId),
        ...kbRows.map((r) => r.tenant_id),
      ]),
    ];

    if (tenantIds.length === 0) {
      this.logger.log('Bootstrap KB: nenhum tenant encontrado, pulando.');
      return;
    }

    this.logger.log(`Bootstrap KB: sincronizando ${tenantIds.length} tenant(s)...`);

    for (const tenantId of tenantIds) {
      try {
        const imported = await this.knowledge.importFromConnector(tenantId, 'hipertms');
        if (imported.created > 0 || imported.updated > 0) {
          this.logger.log(`[${tenantId}] import: +${imported.created} novos, ~${imported.updated} atualizados`);
        }

        const indexed = await this.knowledge.reindex(tenantId, false);
        if (indexed.indexed > 0) {
          this.logger.log(`[${tenantId}] reindex: ${indexed.indexed} item(s) vetorizados`);
        }
      } catch (e: any) {
        this.logger.warn(`[${tenantId}] Bootstrap KB falhou: ${e?.message}`);
      }
    }

    this.logger.log('Bootstrap KB: concluído.');
  }
}
