import { Module } from '@nestjs/common';
import { PageviewService } from './pageview.service';
import { PageviewStatsService } from './pageview-stats.service';
import { SiteDigestCron } from './site-digest.cron';
import { AnalyticsController } from '@/presentation/http/analytics/analytics.controller';
import { MonitorModule } from '@/application/monitor/monitor.module';
import { RedisLockModule } from '@/shared/lock/redis-lock.module';
import { TrackingController } from '@/presentation/http/analytics/tracking.controller';

/**
 * Analytics de audiência do site (FASE 1 — ingest).
 *
 * O painel e o resumo diário no WhatsApp entram depois, no mesmo módulo. O ingest
 * vem primeiro porque é o que destrava o time do TMS: eles não implementam o disparo
 * até o endpoint existir em produção (ordem obrigatória do contrato — receptor
 * primeiro, emissor depois).
 */
@Module({
  imports: [MonitorModule, RedisLockModule],
  controllers: [TrackingController, AnalyticsController],
  providers: [PageviewService, PageviewStatsService, SiteDigestCron],
  exports: [PageviewService, PageviewStatsService],
})
export class AnalyticsModule {}
