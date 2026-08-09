import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { ConsolidationService } from './consolidation.service';
import { ClosingReportService } from './closing-report.service';
import { MonitorNotificationService } from './monitor-notification.service';
import { MonitorDispatchService } from './monitor-dispatch.service';
import { WahaNotificationChannel } from './waha-notification-channel';
import { WhatsAppCloudChannel } from './whatsapp-cloud-channel';
import { ScaleWatchService } from './scale-watch.service';
import { DevWatchService } from './dev-watch.service';
import { EmailDeliverabilityWatchService } from './email-deliverability-watch.service';
import { AdminAlertService } from './admin-alert.service';
import { MonitorController } from './monitor.controller';
import { MonitorIngestController } from './monitor-ingest.controller';
import { ScaleHealthController } from '@/presentation/http/health/scale-health.controller';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ConnectorsModule } from '@/application/connectors/connectors.module';
import { WahaModule } from '@/shared/waha/waha.module';
import { EmailModule } from '@/application/email/email.module';
import { EmailCryptoModule } from '@/shared/email-crypto/email-crypto.module';
import { NOTIFICATION_CHANNEL } from './notification-channel.interface';

@Module({
  imports: [PrismaModule, ConnectorsModule, WahaModule, EmailModule, EmailCryptoModule],
  providers: [
    MonitorService,
    ConsolidationService,
    ClosingReportService,
    MonitorNotificationService,
    MonitorDispatchService, // A4: fila com retry/rate-limit
    ScaleWatchService, // termômetro de gargalos (docs/infra/monitoramento-gargalos)
    DevWatchService, // 4 falhas silenciosas → alerta de dev (WhatsApp + e-mail)
    // Termômetro de reputação do remetente: devolução e descadastro dos últimos
    // 7 dias. O disparo tinha travas de ritmo e nenhuma de resultado — a resposta
    // para "estamos queimando o domínio?" só chegaria pela entrega parar.
    EmailDeliverabilityWatchService,
    AdminAlertService, // aviso admin nos 2 canais (WhatsApp + e-mail)
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
  controllers: [MonitorController, MonitorIngestController, ScaleHealthController],
  // AdminAlertService exportado para o relatório de custo de IA (metrics/ai-cost)
  // usar o MESMO canal de aviso ao admin — WhatsApp + e-mail já configurados.
  exports: [MonitorService, AdminAlertService],
})
export class MonitorModule {}
