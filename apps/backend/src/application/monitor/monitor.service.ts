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
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { HiperTmsConnector, TmsProactivityEvent } from '@/application/connectors/hipertms.connector';
import { NOTIFICATION_CHANNEL, NotificationChannel } from './notification-channel.interface';
import {
  extractUniqueWaNumbers,
  isPlanAllowed,
  monitorWaLimit,
  MONITOR_WA_INCLUDED,
  maxContactTimes,
} from './monitor-plan-limits.const';
import {
  sanitizeContacts,
  deriveSectorConfigFallback,
  validateContactSendTimesLimit,
  type ContactRecipient,
} from './contact-recipient.types';

/** Campos de configuração expostos ao TMS (subset seguro — sem ids/timestamps internos). */
const EXTERNAL_CONFIG_SELECT = {
  enabled: true,
  sendHour: true,
  sendMinute: true,
  sendWeekends: true,
  fiscalEnabled: true,
  logisticEnabled: true,
  frotaEnabled: true,
  financeEnabled: true,
  sectorConfig: true,
  immediateSeverity: true,
  // T6: novo modelo por contato — mesmo campo do painel próprio do Nexa.
  contacts: true,
} as const;

/** G4: severidades que disparam WhatsApp imediato. 'CRITICAL' = default conservador.
 *  'all' = comportamento legado (todo evento novo notifica). */
const IMMEDIATE_SEVERITY_DEFAULT = 'CRITICAL';
const IMMEDIATE_ALL_SEVERITIES = new Set(['CRITICAL', 'OVERDUE', 'DUE_SOON', 'INFO']);

/**
 * T6: shape de entrada de `contacts` antes de `sanitizeContacts()` normalizar —
 * tipagem propositalmente frouxa (sectors/sendDays como tipos largos, id/emails/sendDays
 * opcionais) para bater estruturalmente tanto com `ContactRecipientDto` (monitor.controller.ts,
 * campo de contatos do painel próprio) quanto com o `ContactRecipient` já saneado
 * (contact-recipient.types.ts), sem precisar importar nenhum dos dois — evita import
 * circular entre este arquivo e os controllers que o injetam.
 */
interface ContactRecipientInput {
  id?: string;
  whatsapp?: string;
  emails?: string[];
  sectors: string[];
  sendTimes: Array<{ hour: number; minute: number }>;
  sendDays?: number[];
  /** T8: mesmo campo do painel próprio (ContactRecipientDto) — paridade TMS↔Nexa. */
  closingReport?: string;
  /** T8.6: idem. */
  cashView?: string;
}

export interface ExternalMonitorConfigInput {
  enabled?: boolean;
  sendHour?: number;
  sendMinute?: number;
  fiscalEnabled?: boolean;
  logisticEnabled?: boolean;
  frotaEnabled?: boolean;
  financeEnabled?: boolean;
  sectorConfig?: Record<
    string,
    {
      phone?: string;
      email?: string;
      /** A1: lista de destinatários (até 10) — prioridade sobre phone/email. */
      recipients?: Array<{ label?: string; contact: string; channel: 'whatsapp' | 'email' }>;
      sendHour?: number;
      sendMinute?: number;
      sendDays?: number[];
    }
  >;
  /** G4: qual severidade mínima dispara WhatsApp imediato.
   *  'CRITICAL' (default) = só alertas CRITICAL notificam imediatamente;
   *  'all' = todo evento novo notifica (comportamento pré-G4). */
  immediateSeverity?: 'CRITICAL' | 'all';
  /** T6: novo modelo por contato — mesmo shape do painel próprio do Nexa. */
  contacts?: ContactRecipientInput[];
}

/** A1: saneia o sectorConfig antes de persistir — cap de 10 destinatários,
 *  descarta entradas sem contato ou com canal desconhecido. Shape legado passa intacto. */
function sanitizeSectorConfig(
  sc: ExternalMonitorConfigInput['sectorConfig'],
): ExternalMonitorConfigInput['sectorConfig'] {
  if (!sc) return sc;
  const out: NonNullable<ExternalMonitorConfigInput['sectorConfig']> = {};
  for (const [key, cfg] of Object.entries(sc)) {
    if (!cfg || typeof cfg !== 'object') continue;
    const recipients = Array.isArray(cfg.recipients)
      ? cfg.recipients
          .filter(
            (r) =>
              r &&
              typeof r.contact === 'string' &&
              r.contact.trim().length > 0 &&
              (r.channel === 'whatsapp' || r.channel === 'email'),
          )
          .slice(0, 10)
          .map((r) => ({ label: r.label?.slice(0, 60), contact: r.contact.trim(), channel: r.channel }))
      : undefined;
    out[key] = { ...cfg, ...(recipients !== undefined ? { recipients } : {}) };
  }
  return out;
}

@Injectable()
export class MonitorService implements OnModuleInit {
  private readonly logger = new Logger('MonitorService');
  private static readonly DEGRADATION_THRESHOLD = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tms: HiperTmsConnector,
    // A2: canal agnóstico de provedor — sendAlertsToAdmins usa o channel, não o WAHA direto
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  /**
   * Agendamento automático de reconciliação (configura um setInterval no boot).
   * Intervalo: MONITOR_SYNC_INTERVAL_MIN minutos (default 60).
   * Só ativo quando MONITOR_ENABLED=true.
   */
  onModuleInit(): void {
    if ((process.env.MONITOR_ENABLED ?? '').toLowerCase() !== 'true') return;
    const intervalMin = Math.max(1, Number(process.env.MONITOR_SYNC_INTERVAL_MIN ?? 60));
    setInterval(
      () =>
        this.runReconciliation().catch((e: any) =>
          this.logger.warn(`Monitor: erro inesperado na reconciliação: ${e?.message}`),
        ),
      intervalMin * 60 * 1000,
    );
    this.logger.log(`Monitor: reconciliação automática agendada a cada ${intervalMin}min`);
  }

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
    const notified = await this.sendAlertsToAdmins(tenant.id, newEvents);

    return { synced, resolved, notified };
  }

  /**
   * Força uma sincronização imediata para um tenant.
   * Usado pelo controller (debug/manual) e internamente pela reconciliação automática.
   * Passa novos eventos pelo MESMO fluxo de imediatos do ingest (sendAlertsToAdmins).
   */
  async syncNow(tenantId: string): Promise<{ synced: number; resolved: number; notified: number; newEventsCount: number }> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, status: 'active' } });
    if (!tenant) return { synced: 0, resolved: 0, notified: 0, newEventsCount: 0 };

    const events = await this.tms.getProactivityEvents(this.resolveTmsTenantId(tenant.slug));
    const { synced, resolved, newEvents } = await this.syncAlertStates(tenantId, events);
    const notified = await this.sendAlertsToAdmins(tenantId, newEvents);
    return { synced, resolved, notified, newEventsCount: newEvents.length };
  }

  /**
   * Reconciliação pull para todos os tenants com monitor habilitado.
   *
   * Chamado pelo setInterval configurado em onModuleInit (default 60min) e pode
   * ser chamado diretamente (ex: testes, endpoint de admin).
   *
   * Comportamentos:
   *  1. Itera todos os TenantNotificationConfig com enabled=true.
   *  2. Por tenant: syncNow → sendAlertsToAdmins (mesmo fluxo do ingest).
   *  3. Try/catch por tenant — falha de um não para os demais.
   *  4. Se newEventsCount > DEGRADATION_THRESHOLD → warn "push TMS→Nexa possivelmente degradado".
   *  5. Log resumido ao final: "reconciliação: N tenant(s), X synced, Y resolved, Z notified".
   */
  async runReconciliation(): Promise<{ tenants: number; synced: number; resolved: number; notified: number }> {
    const configs = await this.prisma.tenantNotificationConfig.findMany({
      where: { enabled: true },
      select: { tenantId: true },
    });

    let totalSynced = 0;
    let totalResolved = 0;
    let totalNotified = 0;

    for (const { tenantId } of configs) {
      try {
        const { synced, resolved, notified, newEventsCount } = await this.syncNow(tenantId);
        totalSynced   += synced;
        totalResolved += resolved;
        totalNotified += notified;

        if (newEventsCount > MonitorService.DEGRADATION_THRESHOLD) {
          this.logger.warn(
            `Monitor: push TMS→Nexa possivelmente degradado — ` +
            `${newEventsCount} eventos novos descobertos pela reconciliação (tenant=${tenantId})`,
          );
        }
      } catch (e: any) {
        this.logger.warn(`Monitor: reconciliação falhou para tenant ${tenantId}: ${e?.message}`);
      }
    }

    this.logger.log(
      `reconciliação: ${configs.length} tenant(s), ${totalSynced} synced, ${totalResolved} resolved, ${totalNotified} notified`,
    );

    return { tenants: configs.length, synced: totalSynced, resolved: totalResolved, notified: totalNotified };
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

  /** tmsTenantId → tenant Nexa via env TMS_TENANT_ID_<SLUG> (fonte única do mapeamento). */
  async resolveTenantByTmsId(tmsTenantId: string): Promise<string | null> {
    const tenants = await this.getActiveTenants();
    const match = tenants.find((t) => {
      const key = `TMS_TENANT_ID_${t.slug.toUpperCase().replace(/-/g, '_')}`;
      return process.env[key] === tmsTenantId;
    });
    return match?.id ?? null;
  }

  // ─── Config externa (ADR 022 — o painel do TMS edita a config via proxy) ─────

  /**
   * Config de notificação exposta ao TMS. Defaults quando o tenant nunca configurou.
   *
   * Paridade com MonitorController.getConfig() (painel próprio do Nexa): também
   * devolve `waNumbersUsed`/`waNumbersLimit`, calculados a partir do PlanLimit do
   * tenant — sem isso o contador exibido na tela de Automação do TMS nunca refletia
   * o uso real (ver docs/monitor/ajuste-limites-planos-v2-2026-07-14.md).
   */
  async getExternalConfig(tmsTenantId: string) {
    const tenantId = await this.resolveTenantByTmsId(tmsTenantId);
    if (!tenantId) throw new NotFoundException(`tmsTenantId "${tmsTenantId}" não mapeado`);

    const [config, planLimit] = await Promise.all([
      this.prisma.tenantNotificationConfig.findUnique({
        where: { tenantId },
        select: { ...EXTERNAL_CONFIG_SELECT, notificationPhone: true, monitorOverride: true },
      }),
      this.prisma.planLimit.findUnique({
        where: { tenantId },
        select: { plan: true, monitorExtraNumbers: true },
      }),
    ]);

    const monitorOverride = config?.monitorOverride ?? false;
    const sectorCfg = (config?.sectorConfig as Record<string, any> | null) ?? null;
    const contacts = (config?.contacts as ContactRecipient[] | null) ?? null;
    const waNumbersUsed = extractUniqueWaNumbers(sectorCfg, config?.notificationPhone ?? null, contacts).size;
    const waNumbersLimit = monitorWaLimit(
      planLimit?.plan,
      planLimit?.monitorExtraNumbers ?? 0,
      monitorOverride,
    );

    if (!config) {
      return {
        enabled: false,
        sendHour: 18,
        sendMinute: 0,
        sendWeekends: false,
        fiscalEnabled: true,
        logisticEnabled: true,
        frotaEnabled: true,
        financeEnabled: true,
        sectorConfig: null,
        contacts: [],
        waNumbersUsed: 0,
        waNumbersLimit,
      };
    }

    // notificationPhone/monitorOverride foram buscados só para o cálculo acima —
    // não fazem parte do shape exposto ao TMS (EXTERNAL_CONFIG_SELECT).
    const { notificationPhone: _notificationPhone, monitorOverride: _monitorOverride, ...rest } = config;
    return { ...rest, waNumbersUsed, waNumbersLimit };
  }

  /**
   * Upsert da config vinda do TMS. Mesma tabela usada pelo painel do Nexa — fonte única.
   *
   * Paridade com MonitorController.updateConfig(): replica o Gate 1 (plano permite
   * Monitor) e o Gate 2 (limite de números WhatsApp, com grandfathering em downgrade).
   * Sem isso, um tenant conseguia cadastrar números além do limite do plano pela tela
   * do TMS mesmo com a trava já aplicada no painel do Nexa (bug de paridade — ver
   * docs/monitor/ajuste-limites-planos-v2-2026-07-14.md).
   */
  async updateExternalConfig(tmsTenantId: string, input: ExternalMonitorConfigInput) {
    const tenantId = await this.resolveTenantByTmsId(tmsTenantId);
    if (!tenantId) throw new NotFoundException(`tmsTenantId "${tmsTenantId}" não mapeado`);

    const [planLimit, existing] = await Promise.all([
      this.prisma.planLimit.findUnique({
        where: { tenantId },
        select: { plan: true, monitorExtraNumbers: true },
      }),
      this.prisma.tenantNotificationConfig.findUnique({
        where: { tenantId },
        select: { monitorOverride: true, sectorConfig: true, notificationPhone: true, contacts: true },
      }),
    ]);

    const override = existing?.monitorOverride ?? false;
    const existingContacts = (existing?.contacts as ContactRecipient[] | null) ?? null;

    // T7.2: mesma validação de teto de horários do painel próprio (paridade com
    // MonitorController.updateConfig) — ver comentário lá e em contact-recipient.types.ts.
    if (input.contacts !== undefined) {
      const sendTimesError = validateContactSendTimesLimit(input.contacts, maxContactTimes(planLimit?.plan));
      if (sendTimesError) throw new BadRequestException(sendTimesError);
    }

    // T6: saneia contacts (gera id, cap 3 horários, preserva lastDigestDate em edições)
    // antes de qualquer gate — mesmo padrão de MonitorController.updateConfig.
    const sanitizedContacts = input.contacts !== undefined
      ? sanitizeContacts(input.contacts, existingContacts)
      : undefined;

    // ── Gate 1: plano precisa permitir Monitor (paridade com MonitorController) ──
    if (input.enabled && !isPlanAllowed(planLimit?.plan) && !override) {
      throw new ForbiddenException(
        'Monitor Proativo requer uma assinatura ativa do HiperTMS. ' +
        'Ative um plano (Básico ou superior) para usar os alertas.',
      );
    }

    // ── Gate 2: limite de números WhatsApp (paridade com MonitorController) ──────
    // Grandfathering: só bloqueia quando o save AUMENTA a contagem além do limite.
    // ExternalConfigDto não tem notificationPhone (raiz) — só sectorConfig/contacts são
    // enviados pelo proxy do TMS, então o rootPhone usado é sempre o existente.
    if (input.sectorConfig !== undefined || input.contacts !== undefined) {
      const limit = monitorWaLimit(planLimit?.plan, planLimit?.monitorExtraNumbers ?? 0, override);

      const existingSectorConfig = (existing?.sectorConfig as Record<string, any> | null) ?? null;
      const existingPhone = existing?.notificationPhone ?? null;
      const previousCount = extractUniqueWaNumbers(existingSectorConfig, existingPhone, existingContacts).size;

      const mergedSectorConfig =
        input.sectorConfig !== undefined ? (input.sectorConfig as Record<string, any>) : existingSectorConfig;
      const mergedContacts = sanitizedContacts !== undefined ? sanitizedContacts : existingContacts;
      const uniqueNumbers = extractUniqueWaNumbers(mergedSectorConfig, existingPhone, mergedContacts);
      const newCount = uniqueNumbers.size;

      if (newCount > limit && newCount > previousCount) {
        const planKey = (planLimit?.plan ?? 'free').toLowerCase();
        const included = MONITOR_WA_INCLUDED[planKey] ?? 0;
        const extras = planLimit?.monitorExtraNumbers ?? 0;
        throw new BadRequestException(
          `Limite de números WhatsApp atingido. ` +
          `Seu plano "${planLimit?.plan ?? 'atual'}" inclui ${included} número(s)` +
          (extras > 0 ? ` + ${extras} adicional(is)` : '') +
          ` = ${limit} no total. ` +
          `A configuração enviada usa ${newCount} número(s) únicos. ` +
          `Para adicionar mais números, contrate licenças adicionais em ` +
          `Configurações → Assinatura no HiperTMS (R$ 29,90/número/mês).`,
        );
      }
    }

    // Remove chaves undefined para não sobrescrever campos não enviados.
    // A1: saneia recipients do sectorConfig (cap 10, entradas válidas).
    // T6: quando contacts é enviado, grava a versão saneada e deriva o fallback
    // sectorConfig[setor].phone/.email (1º contato de cada canal) — mesmo padrão
    // de MonitorController.updateConfig, mantém consumidores legados funcionando.
    const sanitized: ExternalMonitorConfigInput = {
      ...input,
      ...(input.sectorConfig !== undefined
        ? { sectorConfig: sanitizeSectorConfig(input.sectorConfig) }
        : {}),
      ...(sanitizedContacts !== undefined
        ? {
            contacts: sanitizedContacts,
            sectorConfig: deriveSectorConfigFallback(
              sanitizedContacts,
              input.sectorConfig !== undefined
                ? sanitizeSectorConfig(input.sectorConfig)
                : (existing?.sectorConfig as Record<string, any> | null),
            ),
          }
        : {}),
    };
    const data = Object.fromEntries(
      Object.entries(sanitized).filter(([, v]) => v !== undefined),
    );

    const updated = await this.prisma.tenantNotificationConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
      select: EXTERNAL_CONFIG_SELECT,
    });
    this.logger.log(`external-config atualizada via TMS para tenant ${tenantId}`);
    return updated;
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

    // UUID pattern — tmsEventIds created by push before dedupeKey was mapped
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const event of filtered) {
      // Verifica se já existe para saber se é novo ou reabertura
      let existing = await this.prisma.alertState.findUnique({
        where: { tenantId_tmsEventId: { tenantId, tmsEventId: event.id } },
        select: { status: true },
      });

      // Soft migration: if not found by dedupeKey, look for an open alert with a
      // UUID-shaped tmsEventId and same category+title (created by push before
      // dedupeKey was mapped on the pull side). Renaming the key prevents a
      // spurious resolve+recreate cycle on the first pull after the deploy.
      if (!existing) {
        const uuidAlias = await this.prisma.alertState.findFirst({
          where: {
            tenantId,
            status: 'open',
            category: event.category,
            title: event.title,
            tmsEventId: { not: event.id },
          },
          select: { tmsEventId: true },
        });
        if (uuidAlias && UUID_RE.test(uuidAlias.tmsEventId)) {
          await this.prisma.alertState.update({
            where: { tenantId_tmsEventId: { tenantId, tmsEventId: uuidAlias.tmsEventId } },
            data: { tmsEventId: event.id, updatedAt: new Date() },
          });
          this.logger.log(
            `Monitor: migrado alertState ${uuidAlias.tmsEventId} → ${event.id} (tenant=${tenantId})`,
          );
          // Treat as existing — not new, no re-notification
          existing = { status: 'open' };
        }
      }

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
   * Envia WhatsApp imediato para os destinatários de cada evento novo/CRITICAL.
   *
   * G4: filtra por immediateSeverity (config do tenant, default 'CRITICAL').
   *     Eventos que não passam no filtro aguardam o digest do horário configurado.
   * G3: resolve destinatários de sectorConfig[category].recipients[] (whatsapp);
   *     fallback para sectorConfig[category].phone; fallback final para adminPhone.
   * G2: buildAlertMessage tem teto de 10 itens + nota de overflow.
   * A2: envio via canal agnóstico (channel.sendTo), nunca waha direto.
   *
   * Retorna o número de phones notificados com sucesso.
   */
  private async sendAlertsToAdmins(tenantId: string, events: TmsProactivityEvent[]): Promise<number> {
    if (!events.length) return 0;

    const config = await this.getConfig(tenantId);

    // G4 — filtro por severidade imediata
    const immediacy: string = (config as any)?.immediateSeverity ?? IMMEDIATE_SEVERITY_DEFAULT;
    const toSend =
      immediacy === 'all'
        ? events
        : events.filter((e) => e.severity === 'CRITICAL');

    if (!toSend.length) {
      this.logger.debug(
        `Monitor: ${events.length} evento(s) novo(s) mas nenhum atinge immediateSeverity="${immediacy}" — aguardam digest (tenant=${tenantId})`,
      );
      return 0;
    }

    // G3 — resolve destinatários por setor
    const sectorCfg = config?.sectorConfig as Record<string, any> | null | undefined;

    // H1: agrupa por (telefone, setor) — não só por telefone — para que cada
    // mensagem imediata fale de UM setor só e o título "⚡ Alerta imediato · {Setor}"
    // nunca fique ambíguo. Antes agrupava só por telefone e misturava categorias
    // na mesma mensagem (buildAlertMessage genérico); agora cada (telefone,setor)
    // vira uma mensagem própria, no mesmo formato do digest agendado.
    const byPhoneSector = new Map<string, { phone: string; category: string; events: TmsProactivityEvent[] }>();
    for (const e of toSend) {
      const sector = sectorCfg?.[e.category];

      // Prioridade: recipients[].whatsapp → sector.phone → adminPhone (payload TMS)
      let phones: string[] = [];

      const recipients: Array<{ contact: string; channel: string }> = sector?.recipients ?? [];
      const waRecipients = recipients.filter(
        (r) => r.channel === 'whatsapp' && typeof r.contact === 'string' && r.contact.trim(),
      );
      if (waRecipients.length > 0) {
        phones = waRecipients.map((r) => r.contact.trim());
      } else if (sector?.phone) {
        phones = [sector.phone];
      } else if (e.adminPhone) {
        phones = [e.adminPhone];
      }

      if (!phones.length) {
        this.logger.warn(
          `Monitor: evento "${e.id}" (${e.category}) sem destinatário WhatsApp — não será notificado`,
        );
        continue;
      }

      for (const phone of phones) {
        const key = `${phone}::${e.category}`;
        const entry = byPhoneSector.get(key) ?? { phone, category: e.category, events: [] };
        entry.events.push(e);
        byPhoneSector.set(key, entry);
      }
    }

    let notified = 0;
    for (const { phone, category, events: sectorEvents } of byPhoneSector.values()) {
      // H1: mesmo corpo do digest agendado (severidade agrupada + link do painel),
      // só o título de topo muda para "⚡ Alerta imediato · {Setor}".
      const msg = this.buildImmediateMessage(category, sectorEvents);
      const r = await this.channel.sendTo(tenantId, phone, msg);
      if (r.sent) {
        this.logger.log(`Monitor: ${sectorEvents.length} alerta(s) imediato(s) enviado(s) para ${phone} (tenant=${tenantId})`);
        notified++;
      } else {
        this.logger.warn(`Monitor: falha ao notificar ${phone}: ${r.reason}`);
      }
    }

    return notified;
  }

  /** Rótulo e emoji por setor — mesmo vocabulário usado no digest agendado (ConsolidationService.SECTORS). */
  private readonly SECTOR_LABEL: Record<string, string> = {
    fiscal: 'Fiscal', logistic: 'Logística', frota: 'Frota', finance: 'Financeiro',
  };

  /**
   * H1 — Monta a mensagem de alerta IMEDIATO (evento CRÍTICO notificado fora do
   * ciclo agendado do setor). Mesmo corpo do digest agendado — severidade
   * agrupada com contagem, bullets, link do painel — construído com
   * ConsolidationService.buildSectorMessage; só o título de topo muda para deixar
   * explícito, só de olhar a mensagem, que ela chegou fora do horário fixo:
   *   imediato → "⚡ Alerta imediato · {Setor}"
   *   agendado → "Alertas {Setor} — {data}" (inalterado, ver ConsolidationService)
   */
  buildImmediateMessage(category: string, events: TmsProactivityEvent[]): string {
    const SEV_ORDER = ['CRITICAL', 'OVERDUE', 'DUE_SOON', 'INFO'];
    const SEV_ICON: Record<string, string> = {
      CRITICAL: '🔴',
      OVERDUE:  '🟠',
      DUE_SOON: '🟡',
      INFO:     '🔵',
    };
    const SEV_LABEL_PT: Record<string, string> = {
      CRITICAL: 'CRÍTICO',
      OVERDUE:  'VENCIDO',
      DUE_SOON: 'A VENCER',
      INFO:     'INFO',
    };

    const label = this.SECTOR_LABEL[category] ?? category;
    const lines: string[] = [`⚡ *Alerta imediato · ${label}*\n`];

    const grouped = SEV_ORDER.reduce<Record<string, TmsProactivityEvent[]>>((acc, s) => {
      acc[s] = events.filter((e) => e.severity === s);
      return acc;
    }, {});

    for (const sev of SEV_ORDER) {
      const group = grouped[sev];
      if (!group.length) continue;
      lines.push(`${SEV_ICON[sev]} *${SEV_LABEL_PT[sev] ?? sev}* (${group.length})`);
      group.slice(0, 5).forEach((e) => lines.push(`  • ${e.title}`));
      if (group.length > 5) lines.push(`  … e mais ${group.length - 5} item(ns)`);
    }

    lines.push('\nAcesse o painel do HiperTMS para mais detalhes: https://www.hipertms.com.br');
    return lines.join('\n');
  }

  /**
   * G2 — Monta mensagem consolidada com teto de 10 itens por severidade.
   * Ordena CRITICAL → OVERDUE → DUE_SOON → INFO.
   * Se eventos.length > 10: exibe top 10 e nota de overflow em vez de lista infinita.
   *
   * LEGADO: não é mais chamado por sendAlertsToAdmins desde H1 (substituído por
   * buildImmediateMessage, que usa o mesmo corpo do digest agendado). Mantido
   * público — testes existentes (G2) chamam diretamente.
   */
  buildAlertMessage(events: TmsProactivityEvent[]): string {
    const CAP = 10;
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
    const shown    = sorted.slice(0, CAP);
    const overflow = sorted.length - CAP;

    const lines = shown.map((e) => {
      const icon   = SEV_ICON[e.severity] ?? '⚪';
      const detail = e.description ? `\n   ${e.description}` : '';
      return `${icon} ${e.title}${detail}`;
    });

    const greeting = adminName ? `Olá *${adminName}*` : 'Olá';
    const company  = companyName ? ` (${companyName})` : '';
    const plural   = events.length > 1 ? 'alertas' : 'alerta';
    const footer   =
      overflow > 0
        ? `\n\n… e mais ${overflow} pendência(s), veja o painel.`
        : `\n\nAcesse o sistema para verificar e resolver cada item.`;

    return (
      `${greeting}${company}! ⚠️\n\n` +
      `*${events.length} ${plural} no HiperTMS:*\n\n` +
      lines.join('\n\n') +
      footer
    );
  }

  async getConfig(tenantId: string) {
    return this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });
  }
}
