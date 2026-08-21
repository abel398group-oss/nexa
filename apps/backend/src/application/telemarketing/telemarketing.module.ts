import { Module } from '@nestjs/common';
import { LeadImportService } from './lead-import.service';
import { SdrService } from './sdr.service';
import { CloserService } from './closer.service';
import { SalesScriptService } from './sales-script.service';
import { SalesScriptController } from '@/presentation/http/telemarketing/sales-script.controller';
import { TelemarketingReportService } from './report.service';
import { TelemarketingReportController } from '@/presentation/http/telemarketing/report.controller';
import { LeadBatchesController } from '@/presentation/http/telemarketing/lead-batches.controller';
import { SdrController } from '@/presentation/http/telemarketing/sdr.controller';
import { CloserController } from '@/presentation/http/telemarketing/closer.controller';
import { MarketScopeService } from '@/shared/auth/market-scope.service';
import { MarketsModule } from '@/application/markets/markets.module';
// A cadência automática precisa parar quando o SDR assume o lead (20/08/2026).
// `FollowUpModule` importa só `ConversationsModule`, que não conhece telemarketing —
// sem ciclo.
import { FollowUpModule } from '@/application/followup/followup.module';

/**
 * Módulo 1 do telemarketing (docs/features/telemarketing/prd.md).
 *
 * Import próprio, o único: `MarketsModule`, só para ler `MarketAssetsService` (material
 * aprovado que SDR e closer passam a enxergar — 19/08/2026). Sem ciclo: `MarketsModule`
 * só importa `EmailModule`, que não depende de telemarketing.
 *
 * Fora isso, tudo de que este módulo depende é global — Prisma e, desde 16/08/2026, o
 * TmsLookupService (`TmsModule`). Antes o lookup era provider próprio aqui, no
 * `SenderModule` e no `AgentsModule` justamente para não importar módulo de aplicação e
 * fechar ciclo; o preço eram três instâncias, cada uma com seu pool contra o banco do
 * TMS. Módulo folha e global resolve os dois lados.
 *
 * Ciclo de módulo aqui custaria o boot, não a compilação (aconteceu em 11/08 com
 * SellersModule → EmailModule → AgentsModule).
 */
@Module({
  imports: [MarketsModule, FollowUpModule],
  controllers: [
    LeadBatchesController,
    SdrController,
    CloserController,
    SalesScriptController,
    TelemarketingReportController,
  ],
  providers: [
    LeadImportService,
    SdrService,
    CloserService,
    SalesScriptService,
    TelemarketingReportService,
    // Provider próprio: só depende do Prisma (global), então não traz módulo de
    // aplicação junto nem risco de ciclo.
    MarketScopeService,
  ],
})
export class TelemarketingModule {}
