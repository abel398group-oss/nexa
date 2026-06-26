/**
 * MonitorService — sincroniza eventos de proatividade do TMS → AlertState local.
 *
 * Fluxo principal (webhook): o TMS empurra eventos via POST /monitor/ingest.
 *   → ingestFromTms() faz o mapeamento tmsTenantId → Nexa tenantId e chama syncAlertStates().
 *
 * Debug manual: POST /monitor/sync chama syncNow(), que ainda usa polling sob demanda.
 *
 * Feature flag: MONITOR_ENABLED=true (ainda lido pelo ConsolidationService para notificações).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { HiperTmsConnector, TmsProactivityEvent } from '@/application/connectors/hipertms.connector';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger('MonitorService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tms: HiperTmsConnector,
  ) {}

  /**
   * Recebe eventos empurrados pelo TMS (webhook push).
   *
   * Faz o reverse lookup tmsTenantId (UUID TMS) → Nexa tenantId usando as envs
   * TMS_TENANT_ID_<SLUG>. Se não encontrar mapeamento, loga e descarta.
   * Se `events` vier vazio, fecha todos os alertas abertos do tenant.
   */
  async ingestFromTms(
    tmsTenantId: string,
    events: TmsProactivityEvent[],
  ): Promise<{ synced: number; resolved: number }> {
    const tenants = await this.getActiveTenants();

    const tenant = tenants.find((t) => {
      const key = `TMS_TENANT_ID_${t.slug.toUpperCase().replace(/-/g, '_')}`;
      return process.env[key] === tmsTenantId;
    });

    if (!tenant) {
      this.logger.warn(`ingestFromTms: tmsTenantId "${tmsTenantId}" não mapeado para nenhum tenant ativo`);
      return { synced: 0, resolved: 0 };
    }

    this.logger.log(`ingestFromTms: ${events.length} evento(s) recebido(s) do TMS para tenant ${tenant.id}`);
    return this.syncAlertStates(tenant.id, events);
  }

  /** Força uma sincronização imediata para um tenant (usado pelo controller p/ debug). */
  async syncNow(tenantId: string): Promise<{ synced: number; resolved: number }> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, status: 'active' } });
    if (!tenant) return { synced: 0, resolved: 0 };

    const events = await this.tms.getProactivityEvents(this.resolveTmsTenantId(tenant.slug));
    return this.syncAlertStates(tenantId, events);
  }

  /**
   * Mapeia o slug do Nexa para o UUID interno do TMS.
   *
   * O TMS usa UUIDs como tenantId; o Nexa usa slugs legíveis ("hipertms").
   * Para cada tenant, define a env TMS_TENANT_ID_<SLUG_UPPER> com o UUID correto.
   * Ex.: TMS_TENANT_ID_HIPERTMS=a1b2c3d4-...
   *
   * Solução de longo prazo: adicionar campo `tmsId` no schema Tenant (ver backlog).
   */
  private resolveTmsTenantId(slug: string): string {
    const key = `TMS_TENANT_ID_${slug.toUpperCase().replace(/-/g, '_')}`;
    const override = process.env[key];
    if (override) {
      this.logger.debug(`Monitor: usando TMS UUID override para slug "${slug}" → ${override}`);
      return override;
    }
    this.logger.warn(`Monitor: sem override para slug "${slug}" (${key} não definida) — passando slug direto, TMS pode não encontrar`);
    return slug;
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
