/**
 * WahaNotificationChannel — canal WhatsApp via WAHA.
 *
 * Resolução de destinatários (em ordem de prioridade):
 *   1. `TenantNotificationConfig.recipients` (array) — filtra channel === 'whatsapp'
 *   2. `TenantNotificationConfig.notificationPhone` (legado, campo único/CSV)
 *   3. Env ALERT_ADMIN_PHONE (fallback global)
 *   4. Primeiro seller ativo do tenant
 */
import { Injectable, Logger } from '@nestjs/common';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationChannel } from './notification-channel.interface';
import { normalizePhone } from '@/shared/utils/phone.util';

@Injectable()
export class WahaNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger('WahaNotificationChannel');

  constructor(
    private readonly waha: WahaClientService,
    private readonly prisma: PrismaService,
  ) {}

  async send(tenantId: string, message: string): Promise<void> {
    const phones = await this.resolvePhones(tenantId);
    if (!phones.length) {
      this.logger.warn(`WahaNotification: sem número configurado para tenant ${tenantId} — use ALERT_ADMIN_PHONE`);
      return;
    }

    for (const phone of phones) {
      const result = await this.waha.sendText(phone, message);
      if (!result.sent) {
        this.logger.warn(`WAHA: falha ao enviar para ${phone}: ${result.reason}`);
      } else {
        this.logger.debug(`WahaNotification: enviado para ${phone} (tenant=${tenantId})`);
      }
    }
  }

  private async resolvePhones(tenantId: string): Promise<string[]> {
    const config = await this.prisma.tenantNotificationConfig.findUnique({
      where: { tenantId },
      select: { notificationPhone: true, recipients: true },
    });

    // Prioridade 1: lista de destinatários (recipients) — filtra canal whatsapp
    const recipients = (config?.recipients as Array<{ label: string; contact: string; channel: string }> | null) ?? [];
    if (recipients.length > 0) {
      const phones = recipients
        .filter((r) => r.channel === 'whatsapp' && r.contact)
        .map((r) => normalizePhone(r.contact))
        .filter((p) => p.length >= 12);
      if (phones.length) return phones;
    }

    // Prioridade 2: campo legado notificationPhone (string única ou CSV)
    if (config?.notificationPhone) {
      const phones = config.notificationPhone
        .split(',')
        .map((p) => normalizePhone(p))
        .filter((p) => p.length >= 12);
      if (phones.length) return phones;
    }

    // Prioridade 3: ALERT_ADMIN_PHONE global (fallback operacional)
    const env = process.env.ALERT_ADMIN_PHONE ?? '';
    const envPhones = env.split(',').map((p) => normalizePhone(p)).filter((p) => p.length >= 12);
    if (envPhones.length) return envPhones;

    // Prioridade 4: primeiro seller ativo do tenant
    const seller = await this.prisma.seller.findFirst({
      where: { tenantId, active: true },
      select: { phone: true },
      orderBy: { createdAt: 'asc' },
    });
    const sellerPhone = seller?.phone ? normalizePhone(seller.phone) : '';
    return sellerPhone.length >= 12 ? [sellerPhone] : [];
  }
}
