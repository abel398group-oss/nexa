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
    const phone = await this.resolvePhone(tenantId);
    if (!phone) {
      this.logger.warn(`WahaNotification: sem número configurado para tenant ${tenantId} — use ALERT_ADMIN_PHONE`);
      return;
    }

    const result = await this.waha.sendText(phone, message);
    if (!result.sent) {
      throw new Error(`WAHA: ${result.reason}`);
    }
  }

  private async resolvePhone(tenantId: string): Promise<string | null> {
    // Fase 1: usa env global. Fase 2: buscar no config do tenant.
    const env = (process.env.ALERT_ADMIN_PHONE ?? '').replace(/\D/g, '');
    if (env) return env;

    // Fallback: primeiro seller ativo do tenant como destinatário (melhor que nada)
    const seller = await this.prisma.seller.findFirst({
      where: { tenantId, active: true },
      select: { phone: true },
      orderBy: { createdAt: 'asc' },
    });
    return seller?.phone?.replace(/\D/g, '') ?? null;
  }
}
