/**
 * WahaNotificationChannel — Fase 1 do canal agnóstico.
 *
 * Envia notificações via WhatsApp usando o WahaClientService já existente.
 * O número de destino por tenant é resolvido assim (em ordem):
 *   1. Env ALERT_ADMIN_PHONE (global — fallback seguro para Fase 1)
 *   2. Futuro: campo phone na TenantNotificationConfig (Fase 2)
 *
 * Fase 2: substituir/complementar por WhatsAppBusinessChannel (Z-API/Twilio).
 */
import { Injectable, Logger } from '@nestjs/common';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationChannel } from './notification-channel.interface';

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
    // Prioridade 1: telefone configurado na tela do tenant (TenantNotificationConfig.notificationPhone)
    const config = await this.prisma.tenantNotificationConfig.findUnique({
      where: { tenantId },
      select: { notificationPhone: true },
    });
    if (config?.notificationPhone) {
      const phones = config.notificationPhone
        .split(',')
        .map((p) => p.replace(/\D/g, ''))
        .filter(Boolean);
      if (phones.length) return phones;
    }

    // Prioridade 2: ALERT_ADMIN_PHONE global (fallback operacional)
    const env = process.env.ALERT_ADMIN_PHONE ?? '';
    const envPhones = env.split(',').map((p) => p.replace(/\D/g, '')).filter(Boolean);
    if (envPhones.length) return envPhones;

    // Prioridade 3: primeiro seller ativo do tenant
    const seller = await this.prisma.seller.findFirst({
      where: { tenantId, active: true },
      select: { phone: true },
      orderBy: { createdAt: 'asc' },
    });
    const sellerPhone = seller?.phone?.replace(/\D/g, '');
    return sellerPhone ? [sellerPhone] : [];
  }
}
