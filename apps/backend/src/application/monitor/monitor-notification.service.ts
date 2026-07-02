/**
 * MonitorNotificationService — orquestra o envio por canal configurado.
 *
 * Dois modos de envio:
 *  - notify(tenantId, content)       → resolve destinatários do config (legado)
 *  - notifyPhone(tenantId, phone, content) → envia para telefone específico (per-sector)
 *
 * Ambos persistem log em notificationLog.
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { normalizePhone } from '@/shared/utils/phone.util';
import { NotificationChannel, NOTIFICATION_CHANNEL } from './notification-channel.interface';

@Injectable()
export class MonitorNotificationService {
  private readonly logger = new Logger('MonitorNotification');

  constructor(
    private readonly prisma: PrismaService,
    private readonly waha: WahaClientService,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  async notify(tenantId: string, content: string, channelOverride?: string): Promise<void> {
    const config = await this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });

    // Determine which channel types to activate.
    // If a recipients list exists, derive channel types from it (each recipient declares its own channel).
    // Otherwise fall back to the legacy config.channel field.
    let channels: string[];
    if (channelOverride) {
      channels = channelOverride === 'both' ? ['whatsapp', 'email'] : [channelOverride];
    } else {
      const recipients = (config?.recipients as Array<{ channel: string }> | null) ?? [];
      if (recipients.length > 0) {
        const types = new Set(recipients.map((r) => r.channel));
        channels = Array.from(types);
      } else {
        const ch = config?.channel ?? 'whatsapp';
        channels = ch === 'both' ? ['whatsapp', 'email'] : [ch];
      }
    }

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

  /**
   * Envia para um telefone específico (usado no dispatch per-sector).
   * Normaliza o número, envia via WAHA e persiste log — mesmo padrão do notify().
   */
  async notifyPhone(tenantId: string, rawPhone: string, content: string): Promise<void> {
    const phone = normalizePhone(rawPhone);
    if (phone.length < 12) {
      this.logger.warn(`notifyPhone: telefone inválido "${rawPhone}" para tenant ${tenantId}`);
      return;
    }
    let success = false;
    let error: string | undefined;
    try {
      const result = await this.waha.sendText(phone, content);
      if (!result.sent) throw new Error(result.reason ?? 'WAHA send falhou');
      success = true;
      this.logger.debug(`notifyPhone: enviado para ${phone} (tenant=${tenantId})`);
    } catch (e: any) {
      error = e?.message?.slice(0, 500);
      this.logger.warn(`notifyPhone: falha para ${phone} (tenant=${tenantId}): ${error}`);
    }
    await this.prisma.notificationLog.create({
      data: { tenantId, channel: 'whatsapp', content, success, error: error ?? null },
    }).catch((e: any) => this.logger.warn(`Log de notificação falhou: ${e?.message}`));
  }
}
