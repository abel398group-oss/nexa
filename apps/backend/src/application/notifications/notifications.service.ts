import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface CreateNotification {
  type: 'hot_lead' | 'complaint' | 'opt_out' | 'info' | 'escalation';
  title: string;
  body?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService) {}

  // cria uma notificação (nunca derruba o fluxo chamador se falhar)
  async create(tenantId: string, n: CreateNotification) {
    try {
      return await this.prisma.notification.create({
        data: { tenantId, type: n.type, title: n.title, body: n.body ?? '', link: n.link ?? null },
      });
    } catch (e: any) {
      this.logger.warn(`Falha ao criar notificação: ${e?.message}`);
      return null;
    }
  }

  async list(tenantId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.notification.count({ where: { tenantId, read: false } }),
    ]);
    return { items, unread };
  }

  async markAllRead(tenantId: string) {
    await this.prisma.notification.updateMany({ where: { tenantId, read: false }, data: { read: true } });
    return { ok: true };
  }

  async markRead(tenantId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, tenantId }, data: { read: true } });
    return { ok: true };
  }
}
