/**
 * WahaNotificationChannel — canal WhatsApp via WAHA (não-oficial).
 *
 * A2: o canal é "burro" — só envia para o destinatário informado. A resolução
 * de destinatários (recipients por setor, legado, ALERT_ADMIN_PHONE, seller)
 * vive no MonitorNotificationService.
 */
import { Injectable, Logger } from '@nestjs/common';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { NotificationChannel } from './notification-channel.interface';

@Injectable()
export class WahaNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger('WahaNotificationChannel');

  constructor(private readonly waha: WahaClientService) {}

  async sendTo(tenantId: string, to: string, message: string): Promise<{ sent: boolean; reason?: string }> {
    const result = await this.waha.sendText(to, message);
    if (!result.sent) {
      this.logger.warn(`WAHA: falha ao enviar para ${to} (tenant=${tenantId}): ${result.reason}`);
      return { sent: false, reason: result.reason ?? 'waha_send_failed' };
    }
    this.logger.debug(`WAHA: enviado para ${to} (tenant=${tenantId})`);
    return { sent: true };
  }
}
