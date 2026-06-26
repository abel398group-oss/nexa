import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { ConsolidationService } from './consolidation.service';
import { MonitorNotificationService } from './monitor-notification.service';
import { WahaNotificationChannel } from './waha-notification-channel';
import { MonitorController } from './monitor.controller';
import { MonitorIngestController } from './monitor-ingest.controller';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ConnectorsModule } from '@/application/connectors/connectors.module';
import { WahaModule } from '@/shared/waha/waha.module';
import { NOTIFICATION_CHANNEL } from './notification-channel.interface';

@Module({
  imports: [PrismaModule, ConnectorsModule, WahaModule],
  providers: [
    MonitorService,
    ConsolidationService,
    MonitorNotificationService,
    {
      provide: NOTIFICATION_CHANNEL,
      useClass: WahaNotificationChannel,
    },
    WahaNotificationChannel,
  ],
  controllers: [MonitorController, MonitorIngestController],
  exports: [MonitorService],
})
export class MonitorModule {}
