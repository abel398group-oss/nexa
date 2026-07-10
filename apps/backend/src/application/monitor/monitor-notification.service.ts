/**
 * MonitorNotificationService — orquestra o envio por canal configurado.
 *
 * A2: a resolução de DESTINATÁRIOS vive aqui (não no canal); o ENVIO passa
 * sempre pelo MonitorDispatchService (fila com retry/rate-limit — A4), que por
 * sua vez usa o NotificationChannel injetado (WAHA ou Cloud API — A5).
 *
 * Dois modos:
 *  - notify(tenantId, content)              → resolve destinatários do config (legado)
 *  - notifyPhone(tenantId, phone, content)  → telefone específico (per-sector)
 *
 * Logs de envio são persistidos pelo dispatcher em notificationLog.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { normalizePhone } from '@/shared/utils/phone.util';
import { MonitorDispatchService } from './monitor-dispatch.service';

@Injectable()
export class MonitorNotificationService {
  private readonly logger = new Logger('MonitorNotification');

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: MonitorDispatchService,
  ) {}

  async notify(tenantId: string, content: string, channelOverride?: string): Promise<void> {
    const config = await this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });

    // Determina os tipos de canal ativos (mesma lógica de antes).
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
      if (c !== 'whatsapp') {
        this.logger.warn(`Canal "${c}" ainda não implementado no notify legado — Fase 2`);
        continue;
      }
      const phones = await this.resolveLegacyPhones(tenantId);
      if (!phones.length) {
        this.logger.warn(`notify: sem número configurado para tenant ${tenantId} — use ALERT_ADMIN_PHONE`);
        continue;
      }
      for (const phone of phones) {
        this.dispatch.enqueue({ tenantId, to: phone, message: content, origin: 'legacy' });
      }
    }
  }

  /**
   * Enfileira envio para um telefone específico (dispatch per-sector).
   * jitterMs espalha horários populares (ex: todo mundo às 8h) — A4.
   */
  async notifyPhone(tenantId: string, rawPhone: string, content: string, jitterMs = 0): Promise<void> {
    const phone = normalizePhone(rawPhone);
    if (phone.length < 12) {
      this.logger.warn(`notifyPhone: telefone inválido "${rawPhone}" para tenant ${tenantId}`);
      return;
    }
    this.dispatch.enqueue({ tenantId, to: phone, message: content, origin: 'sector' }, jitterMs);
  }

  /**
   * Resolução de destinatários do modo LEGADO (movida do WahaNotificationChannel — A2).
   * Prioridade: recipients[] (channel=whatsapp) → notificationPhone (CSV) →
   * ALERT_ADMIN_PHONE (env) → primeiro seller ativo.
   */
  private async resolveLegacyPhones(tenantId: string): Promise<string[]> {
    const config = await this.prisma.tenantNotificationConfig.findUnique({
      where: { tenantId },
      select: { notificationPhone: true, recipients: true },
    });

    const recipients = (config?.recipients as Array<{ label: string; contact: string; channel: string }> | null) ?? [];
    if (recipients.length > 0) {
      const phones = recipients
        .filter((r) => r.channel === 'whatsapp' && r.contact)
        .map((r) => normalizePhone(r.contact))
        .filter((p) => p.length >= 12);
      if (phones.length) return phones;
    }

    if (config?.notificationPhone) {
      const phones = config.notificationPhone
        .split(',')
        .map((p) => normalizePhone(p))
        .filter((p) => p.length >= 12);
      if (phones.length) return phones;
    }

    const env = process.env.ALERT_ADMIN_PHONE ?? '';
    const envPhones = env.split(',').map((p) => normalizePhone(p)).filter((p) => p.length >= 12);
    if (envPhones.length) return envPhones;

    const seller = await this.prisma.seller.findFirst({
      where: { tenantId, active: true },
      select: { phone: true },
      orderBy: { createdAt: 'asc' },
    });
    const sellerPhone = seller?.phone ? normalizePhone(seller.phone) : '';
    return sellerPhone.length >= 12 ? [sellerPhone] : [];
  }
}
