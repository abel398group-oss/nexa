/**
 * MonitorService — sincroniza eventos de proatividade do TMS → AlertState local.
 *
 * Roda a cada 30 minutos (@Interval). Para cada tenant ativo com produto TMS:
 *  1. Chama GET /api/nexa/proactivity/events no TMS
 *  2. Faz upsert no AlertState (severity/title podem mudar)
 *  3. Resolve alertas que o TMS não retornou mais (fechados lá → resolved aqui)
 *
 * Feature flag: MONITOR_ENABLED=true. Se ausente/false, o ciclo não roda.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { HiperTmsConnector, TmsProactivityEvent } from '@/application/connectors/hipertms.connector';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger('MonitorService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tms: HiperTmsConnector,
  ) {}

  private get enabled(): boolean {
    return (process.env.MONITOR_ENABLED ?? '').toLowerCase() === 'true';
  }

  @Interval(Number(process.env.MONITOR_SYNC_INTERVAL_MS ?? 30 * 60 * 1000)) // padrão 30min; teste: 600000 (10min)
  async runCycle(): Promise<void> {
    if (!this.enabled) return;

    const tenants = await this.getActiveTenants();
    for (const tenant of tenants) {
      try {
        const events = await this.tms.getProactivityEvents(tenant.slug);
        await this.syncAlertStates(tenant.id, events);
      } catch (err: any) {
        this.logger.warn(`Monitor ciclo falhou para tenant ${tenant.id}: ${err?.message}`);
      }
    }
  }

  /** Força uma sincronização imediata para um tenant (usado pelo controller p/ debug). */
  async syncNow(tenantId: string): Promise<{ synced: number; resolved: number }> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, status: 'active' } });
    if (!tenant) return { synced: 0, resolved: 0 };

    const events = await this.tms.getProactivityEvents(tenant.slug);
    return this.syncAlertStates(tenantId, events);
  }

  private async getActiveTenants() {
    return this.prisma.tenant.findMany({ where: { status: 'active' }, select: { id: true, slug: true } });
  }

  private async syncAlertStates(
    tenantId: string,
    events: TmsProactivityEvent[],
  ): Promise<{ synced: number; resolved: number }> {
    const config = await this.getConfig(tenantId);

    // Filtra categorias desabilitadas pelo tenant
    const filtered = events.filter((e) => {
      if (e.category === 'fiscal' && config && !config.fiscalEnabled) return false;
      if (e.category === 'logistic' && config && !config.logisticEnabled) return false;
      if (e.category === 'frota' && config && !config.frotaEnabled) return false;
      if (e.category === 'finance' && config && !config.financeEnabled) return false;
      return true;
    });

    for (const event of filtered) {
      await this.prisma.alertState.upsert({
        where: { tenantId_tmsEventId: { tenantId, tmsEventId: event.id } },
        create: {
          tenantId,
          tmsEventId: event.id,
          severity: event.severity,
          category: event.category,
          title: event.title,
          description: event.description ?? null,
          status: 'open',
        },
        update: {
          severity: event.severity,
          title: event.title,
          description: event.description ?? null,
          // Re-abre se estava snoozed/archived e voltou crítico
          ...(event.severity === 'CRITICAL' ? { status: 'open', snoozedUntil: null } : {}),
          updatedAt: new Date(),
        },
      });
    }

    // Resolve alertas que o TMS não retornou mais (evento fechado no TMS)
    const activeIds = filtered.map((e) => e.id);
    const stale = await this.prisma.alertState.updateMany({
      where: {
        tenantId,
        status: 'open',
        tmsEventId: { notIn: activeIds },
      },
      data: { status: 'resolved', updatedAt: new Date() },
    });

    if (stale.count > 0) {
      this.logger.log(`Monitor: ${stale.count} alerta(s) resolvido(s) automaticamente (tenant=${tenantId})`);
    }

    return { synced: filtered.length, resolved: stale.count };
  }

  async getConfig(tenantId: string) {
    return this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });
  }
}
