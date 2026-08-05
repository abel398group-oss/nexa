import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { StaleLeadService } from './stale-lead.service';
import { OpportunitiesController } from '@/presentation/http/opportunities/opportunities.controller';
import { NotificationsModule } from '@/application/notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService, StaleLeadService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
