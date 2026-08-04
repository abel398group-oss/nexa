import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { AiCostService } from './ai-cost.service';
import { MetricsController } from '@/presentation/http/metrics/metrics.controller';
import { AiCostController } from '@/presentation/http/metrics/ai-cost.controller';
// Reaproveita o canal de aviso ao admin (WhatsApp + e-mail já configurados) em vez
// de criar um segundo caminho de notificação só para custo.
import { MonitorModule } from '@/application/monitor/monitor.module';

@Module({
  imports: [MonitorModule],
  controllers: [MetricsController, AiCostController],
  providers: [MetricsService, AiCostService],
})
export class MetricsModule {}
