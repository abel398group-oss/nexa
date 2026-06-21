/**
 * MonitorNotificationService — orquestra o envio por canal configurado.
 *
 * Recebe a mensagem pronta do ConsolidationService, escolhe o(s) canal(is)
 * com base no `TenantNotificationConfig.channel` e persiste o log.
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationChannel, NOTIFICATION_CHANNEL } from './notification-channel.interface';

@Injectable()
export class MonitorNotificationService {
  private readonly logger = new Logger('MonitorNotification');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  async notify(tenantId: string, content: string, channelOverride?: string): Promise<void> {
    const config = await this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });
    const ch = channelOverride ?? config?.channel ?? 'whatsapp';

    const channels: string[] = ch === 'both' ? ['whatsapp', 'email'] : [ch];

    for (const c of channels) {
      let success = false;
      let error: string | undefined;
      try {
        // Fase 1: só WAHA. Fase 2: switch por canal.
        if (c === 'whatsapp') {
          await this.channel.send(tenantId, content);
        } else {
          this.logger.warn(`Canal "${c}" ainda não implementado — Fase 2`);
        }
        success = true;
      } catch (e: any) {
        error = e?.message?.slice(0, 500);
        this.logger.warn(`Notificação falhou (tenant=${tenantId} canal=${c}): ${error}`);
      }

      await this.prisma.notificationLog.create({
        data: { tenantId, channel: c, content, success, error: error ?? null },
      }).catch((e: any) => this.logger.warn(`Log de notificação falhou: ${e?.message}`));
    }
  }
}
