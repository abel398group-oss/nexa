import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { ConsolidationService } from './consolidation.service';
import { MonitorNotificationService } from './monitor-notification.service';
import { MonitorDispatchService } from './monitor-dispatch.service';
import { WahaNotificationChannel } from './waha-notification-channel';
import { WhatsAppCloudChannel } from './whatsapp-cloud-channel';
import { MonitorController } from './monitor.controller';
import { MonitorIngestController } from './monitor-ingest.controller';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ConnectorsModule } from '@/application/connectors/connectors.module';
import { WahaModule } from '@/shared/waha/waha.module';
import { EmailModule } from '@/application/email/email.module';
import { NOTIFICATION_CHANNEL } from './notification-channel.interface';

@Module({
  imports: [PrismaModule, ConnectorsModule, WahaModule, EmailModule],
  providers: [
    MonitorService,
    ConsolidationService,
    MonitorNotificationService,
    MonitorDispatchService, // A4: fila com retry/rate-limit
    WahaNotificationChannel,
    WhatsAppCloudChannel,
    {
      // A5: provedor selecionável — MONITOR_WA_PROVIDER=waha|cloud (default waha).
      // 'cloud' exige WA_CLOUD_TOKEN / WA_CLOUD_PHONE_ID / WA_CLOUD_TEMPLATE_DIGEST.
      provide: NOTIFICATION_CHANNEL,
      inject: [WahaNotificationChannel, WhatsAppCloudChannel],
      useFactory: (waha: WahaNotificationChannel, cloud: WhatsAppCloudChannel) =>
        (process.env.MONITOR_WA_PROVIDER ?? 'waha').toLowerCase() === 'cloud' ? cloud : waha,
    },
  ],
  controllers: [MonitorController, MonitorIngestController],
  exports: [MonitorService],
})
export class MonitorModule {}
