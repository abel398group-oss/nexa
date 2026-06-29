/**
 * MonitorService — sincroniza eventos de proatividade do TMS → AlertState local
 * e notifica o admin de cada sub-cliente via WhatsApp.
 *
 * Fluxo principal (webhook): o TMS empurra eventos via POST /monitor/ingest.
 *   → ingestFromTms() mapeia tmsTenantId → Nexa tenantId via env TMS_TENANT_ID_<SLUG>.
 *   → syncAlertStates() faz upsert no AlertState e devolve os eventos NOVOS.
 *   → sendAlertsToAdmins() agrupa os novos eventos por adminPhone e envia uma
 *     mensagem WhatsApp consolidada para cada admin de sub-cliente afetado.
 *
 * Regra de notificação: só envia WhatsApp para eventos realmente novos (recém-criados)
 * ou alertas CRITICAL que estavam resolvidos e foram reabertos — evita spam.
 *
 * Debug manual: POST /monitor/sync chama syncNow() sob demanda.
 * Notificação manual: POST /monitor/notify-now dispara ConsolidationService (legado).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { HiperTmsConnector, TmsProactivityEvent } from '@/application/connectors/hipertms.connector';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger('MonitorService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tms: HiperTmsConnector,
    private readonly waha: WahaClientService,
  ) {}

  /**
   * Recebe eventos empurrados pelo TMS (webhook push).
   *
   * Mapeia tmsTenantId → Nexa tenantId, sincroniza AlertState e notifica
   * imediatamente os admins dos sub-clientes cujos eventos são novos.
   * Se `events` vier vazio, fecha todos os alertas abertos do tenant.
   */
  async ingestFromTms(
    tmsTenantId: string,
    events: TmsProactivityEvent[],
  ): Promise<{ synced: number; resolved: number; notified: number }> {
    const tenants = await this.getActiveTenants();

    const tenant = tenants.find((t) => {
      const key = `TMS_TENANT_ID_${t.slug.toUpperCase().replace(/-/g, '_')}`;
      return process.env[key] === tmsTenantId;
    });

    if (!tenant) {
      this.logger.warn(`ingestFromTms: tmsTenantId "${tmsTenantId}" não mapeado para nenhum tenant ativo`);
      return { synced: 0, resolved: 0, notified: 0 };
    }

    this.logger.log(`ingestFromTms: ${events.length} evento(s) recebido(s) do TMS para tenant ${tenant.id}`);
    const { synced, resolved, newEvents } = await this.syncAlertStates(tenant.id, events);

    // Notifica apenas eventos novos (ou CRITICAL reaberto) — evita spam em re-envios
    const notified = await this.sendAlertsToAdmins(newEvents);

    return { synced, resolved, notified };
  }

  /** Força uma sincronização imediata para um tenant (usado pelo controller p/ debug). */
  async syncNow(tenantId: string): Promise<{ synced: number; resolved: number }> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, status: 'active' } });
    if (!tenant) return { synced: 0, resolved: 0 };

    const events = await this.tms.getProactivityEvents(this.resolveTmsTenantId(tenant.slug));
    const { synced, resolved } = await this.syncAlertStates(tenantId, events);
    return { synced, resolved };
  }

  /**
   * Mapeia o slug do Nexa para o UUID interno do TMS.
   * Ex.: TMS_TENANT_ID_HIPERTMS=d5c61faf-9fdd-46e6-bb18-3ace59188e1c
   */
  private resolveTmsTenantId(slug: string): string {
    const key = `TMS_TENANT_ID_${slug.toUpperCase().replace(/-/g, '_')}`;
    const override = process.env[key];
    if (override) {
      this.logger.debug(`Monitor: usando TMS UUID override para slug "${slug}" → ${override}`);
      return override;
    }
    this.logger.warn(`Monitor: sem override para slug "${slug}" (${key} não definida) — passando slug direto`);
    return slug;
  }

  private async getActiveTenants() {
    return this.prisma.tenant.findMany({ where: { status: 'active' }, select: { id: true, slug: true } });
  }

  /**
   * Faz upsert de cada evento no AlertState e resolve os que sumiram do TMS.
   * Retorna também `newEvents`: somente os eventos recém-criados ou CRITICAL reabertos,
   * que são os únicos que devem gerar notificação imediata via WhatsApp.
   */
  private async syncAlertStates(
    tenantId: string,
    events: TmsProactivityEvent[],
  ): Promise<{ synced: number; resolved: number; newEvents: TmsProactivityEvent[] }> {
    const config = await this.getConfig(tenantId);

    // Filtra categorias desabilitadas pelo tenant
    const filtered = events.filter((e) => {
      if (e.category === 'fiscal' && config && !config.fiscalEnabled) return false;
      if (e.category === 'logistic' && config && !config.logisticEnabled) return false;
      if (e.category === 'frota' && config && !config.frotaEnabled) return false;
      if (e.category === 'finance' && config && !config.financeEnabled) return false;
      return true;
    });

    const newEvents: TmsProactivityEvent[] = [];

    for (const event of filtered) {
      // Verifica se já existe para saber se é novo ou reabertura
      const existing = await this.prisma.alertState.findUnique({
        where: { tenantId_tmsEventId: { tenantId, tmsEventId: event.id } },
        select: { status: true },
      });

      const isNew = !existing;
      const isReopenedCritical = existing?.status === 'resolved' && event.severity === 'CRITICAL';

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
          // Re-abre se estava resolvido/snoozed e voltou CRITICAL
          ...(isReopenedCritical ? { status: 'open', snoozedUntil: null } : {}),
          updatedAt: new Date(),
        },
      });

      if (isNew || isReopenedCritical) {
        newEvents.push(event);
      }
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

    return { synced: filtered.length, resolved: stale.count, newEvents };
  }

  /**
   * Envia WhatsApp para o admin de cada sub-cliente com seus alertas consolidados.
   *
   * Agrupa eventos por adminPhone para que o admin receba UMA mensagem com todos
   * os alertas de uma vez, em vez de uma mensagem por alerta.
   * Eventos sem adminPhone são ignorados (logados como warning).
   *
   * Retorna o número de phones notificados com sucesso.
   */
  private async sendAlertsToAdmins(events: TmsProactivityEvent[]): Promise<number> {
    if (!events.length) return 0;

    // Agrupa por phone
    const byPhone = new Map<string, TmsProactivityEvent[]>();
    for (const e of events) {
      if (!e.adminPhone) {
        this.logger.warn(`Monitor: evento "${e.id}" sem adminPhone — não será notificado via WhatsApp`);
        continue;
      }
      const list = byPhone.get(e.adminPhone) ?? [];
      list.push(e);
      byPhone.set(e.adminPhone, list);
    }

    let notified = 0;
    for (const [phone, phoneEvents] of byPhone) {
      const msg = this.buildAlertMessage(phoneEvents);
      const r = await this.waha.sendText(phone, msg);
      if (r.sent) {
        this.logger.log(`Monitor: ${phoneEvents.length} alerta(s) enviado(s) para ${phone}`);
        notified++;
      } else {
        this.logger.warn(`Monitor: falha ao notificar ${phone}: ${r.reason}`);
      }
    }

    return notified;
  }

  /**
   * Monta a mensagem consolidada de alertas para um admin.
   * Ordena por severidade (CRITICAL primeiro) e formata com emojis.
   */
  private buildAlertMessage(events: TmsProactivityEvent[]): string {
    const SEV_ORDER = ['CRITICAL', 'OVERDUE', 'DUE_SOON', 'INFO'];
    const SEV_ICON: Record<string, string> = {
      CRITICAL: '🔴',
      OVERDUE:  '🟠',
      DUE_SOON: '🟡',
      INFO:     '🔵',
    };

    const adminName   = events[0]?.adminName;
    const companyName = events[0]?.companyName;

    const sorted = [...events].sort(
      (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity),
    );

    const lines = sorted.map((e) => {
      const icon = SEV_ICON[e.severity] ?? '⚪';
      const detail = e.description ? `\n   ${e.description}` : '';
      return `${icon} ${e.title}${detail}`;
    });

    const greeting = adminName ? `Olá *${adminName}*` : 'Olá';
    const company  = companyName ? ` (${companyName})` : '';
    const plural   = events.length > 1 ? 'alertas' : 'alerta';

    return (
      `${greeting}${company}! ⚠️\n\n` +
      `*${events.length} ${plural} no HiperTMS:*\n\n` +
      lines.join('\n\n') +
      `\n\nAcesse o sistema para verificar e resolver cada item.`
    );
  }

  async getConfig(tenantId: string) {
    return this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });
  }
}
