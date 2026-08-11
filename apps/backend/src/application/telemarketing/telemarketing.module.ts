import { Module } from '@nestjs/common';
import { LeadImportService } from './lead-import.service';
import { LeadBatchesController } from '@/presentation/http/telemarketing/lead-batches.controller';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';

/**
 * Módulo 1 do telemarketing (docs/features/telemarketing/prd.md).
 *
 * Sem `imports`: PrismaService é global e o TmsLookupService entra como provider
 * próprio — é o padrão do `SenderModule`, e mantém este módulo sem depender de
 * nenhum outro módulo de aplicação. Ciclo de módulo aqui custaria o boot, não a
 * compilação (aconteceu em 11/08 com SellersModule → EmailModule → AgentsModule).
 */
@Module({
  controllers: [LeadBatchesController],
  providers: [LeadImportService, TmsLookupService],
})
export class TelemarketingModule {}
