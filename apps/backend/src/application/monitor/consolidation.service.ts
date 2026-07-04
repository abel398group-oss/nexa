/**
 * ConsolidationService — agrupa alertas abertos e dispara resumos diários.
 *
 * Dois modos de operação:
 *
 * ── MODO PER-SECTOR (sectorConfig preenchido) ──────────────────────────────
 *   Cada setor (fiscal, logistic, frota, finance) tem:
 *     - sendHour / sendMinute próprios
 *     - telefone WhatsApp próprio
 *   O serviço itera os setores ativos, verifica a janela de tempo de cada um
 *   e envia somente os alertas daquele setor para aquele telefone.
 *   Deduplicação por chave `tenantId:sector`.
 *
 * ── MODO LEGADO (sem sectorConfig) ────────────────────────────────────────
 *   Comportamento anterior: um digest global com todos os alertas, enviado no
 *   sendHour global para todos os destinatários do config.
 *
 * Roda a cada 5 minutos (@Interval). Granularidade de 5 min no horário.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { MonitorNotificationService } from './monitor-notification.service';
import { EmailReplyService } from '@/application/email/email-reply.service';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SectorCfg {
  phone?: string;
  /** E-mail do responsável pelo setor (opcional — canal dual). */
  email?: string;
  sendHour?: number;
  sendMinute?: number;
  /** Dias da semana de envio (0=dom … 6=sáb). Ausente → deriva do sendWeekends global. */
  sendDays?: number[];
}

interface SectorMeta {
  key: string;
  enabledField: string;
  label: string;
  emoji: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const SECTORS: SectorMeta[] = [
  { key: 'fiscal',   enabledField: 'fiscalEnabled',   label: 'Fiscal',     emoji: '📄' },
  { key: 'logistic', enabledField: 'logisticEnabled', label: 'Logística',  emoji: '🚚' },
  { key: 'frota',    enabledField: 'frotaEnabled',    label: 'Frota',      emoji: '🔧' },
  { key: 'finance',  enabledField: 'financeEnabled',  label: 'Financeiro', emoji: '💰' },
];

const SEVERITY_ORDER = ['CRITICAL', 'OVERDUE', 'DUE_SOON', 'INFO'];
const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🔴',
  OVERDUE:  '🟠',
  DUE_SOON: '🟡',
  INFO:     '🔵',
};
const ARCHIVE_AFTER_NOTIFICATIONS = 2;
const ARCHIVE_AFTER_HOURS = 48;

// ─── Serviço ─────────────────────────────────────────────────────────────────

@Injectable()
export class ConsolidationService {
  private readonly logger = new Logger('ConsolidationService');

  // Dedup de envio: chave → `tenantId` (legado) ou `tenantId:sector` (per-sector)
  // Valor → slot numérico único para a janela de 5 min (evita reenvio no mesmo slot)
  private readonly sentThisHour = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: MonitorNotificationService,
    private readonly emailReply: EmailReplyService,
  ) {}

  private get enabled(): boolean {
    return (process.env.MONITOR_ENABLED ?? '').toLowerCase() === 'true';
  }

  @Interval(5 * 60 * 1000)
  async runConsolidation(): Promise<void> {
    if (!this.enabled) {
      this.logger.debug('tick pulado — MONITOR_ENABLED != true');
      return;
    }

    const configs = await this.prisma.tenantNotificationConfig.findMany({
      where: { enabled: true },
      select: { tenantId: true },
    });

    this.logger.log(`tick — ${configs.length} tenant(s) com notificação habilitada`);

    for (const { tenantId } of configs) {
      try {
        await this.processForTenant(tenantId);
      } catch (e: any) {
        this.logger.warn(`Consolidation falhou para tenant ${tenantId}: ${e?.message}`);
      }
    }
  }

  /** Força envio imediato para um tenant, ignorando hora e deduplicação. */
  async forceForTenant(tenantId: string): Promise<{ sent: boolean; alerts: number }> {
    const count = await this.processForTenant(tenantId, true);
    return { sent: count > 0, alerts: count };
  }

  // ─── Core ───────────────────────────────────────────────────────────────────

  private async processForTenant(tenantId: string, force = false): Promise<number> {
    const config = await this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });
    if (!force && !config?.enabled) return 0;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const sectorConfig = config?.sectorConfig as Record<string, SectorCfg> | null | undefined;
    const hasSectorConfig = sectorConfig && Object.values(sectorConfig).some((sc) => sc?.phone);

    if (hasSectorConfig) {
      // Modo per-sector: cada setor decide seus dias via sendDays (fallback: sendWeekends global).
      return this.processPerSector(tenantId, config as any, sectorConfig!, now, currentHour, currentMinute, force);
    }

    // Modo legado: mantém o comportamento global de fim de semana.
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const sendWeekends = config?.sendWeekends ?? false;
    if (!force && isWeekend && !sendWeekends) {
      this.logger.debug(`[${tenantId}] fim de semana e sendWeekends=false — pulando`);
      return 0;
    }
    return this.processLegacy(tenantId, config as any, now, currentHour, currentMinute, force);
  }

  /**
   * Dias de envio efetivos do setor (0=dom … 6=sáb).
   * Prioridade: sendDays do setor → derivado do sendWeekends global
   * (true = todos os dias; false = dias úteis) — compatível com configs antigas.
   */
  private resolveSendDays(sc: SectorCfg, config: Record<string, any>): number[] {
    if (Array.isArray(sc.sendDays) && sc.sendDays.length > 0) {
      return sc.sendDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    }
    return (config?.sendWeekends ?? false) ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  }

  // ─── Modo per-sector ────────────────────────────────────────────────────────

  private async processPerSector(
    tenantId: string,
    config: Record<string, any>,
    sectorConfig: Record<string, SectorCfg>,
    now: Date,
    currentHour: number,
    currentMinute: number,
    force: boolean,
  ): Promise<number> {
    let totalSent = 0;
    const globalHour = config?.sendHour ?? Number(process.env.MONITOR_DEFAULT_SEND_HOUR ?? 7);
    const globalMinute = config?.sendMinute ?? 0;

    for (const sector of SECTORS) {
      const sc = sectorConfig[sector.key];
      if (!sc?.phone && !sc?.email) {
        this.logger.debug(`[${tenantId}] setor ${sector.key}: sem telefone nem e-mail configurado — pulando`);
        continue;
      }

      // Verifica se o setor está habilitado
      if (!config[sector.enabledField]) {
        this.logger.debug(`[${tenantId}] setor ${sector.key}: desabilitado — pulando`);
        continue;
      }

      const sectorHour = sc.sendHour ?? globalHour;
      const sectorMinute = sc.sendMinute ?? globalMinute;
      const sendDays = this.resolveSendDays(sc, config);

      if (!force && !sendDays.includes(now.getDay())) {
        this.logger.debug(
          `[${tenantId}] setor ${sector.key}: hoje (dia ${now.getDay()}) fora dos dias de envio [${sendDays.join(',')}] — pulando`,
        );
        continue;
      }

      if (!force) {
        if (currentHour !== sectorHour) {
          this.logger.debug(
            `[${tenantId}] setor ${sector.key}: fora da hora (agora=${currentHour}h alvo=${sectorHour}h)`,
          );
          continue;
        }
        if (currentMinute < sectorMinute || currentMinute >= sectorMinute + 5) {
          this.logger.debug(
            `[${tenantId}] setor ${sector.key}: fora da janela (min=${currentMinute} alvo=${sectorMinute}-${sectorMinute + 5})`,
          );
          continue;
        }
      }

      // Dedup por tenant:sector
      const dedupKey = `${tenantId}:${sector.key}`;
      const slotKey = this.makeSlotKey(now, sectorHour, currentMinute);
      if (!force && this.sentThisHour.get(dedupKey) === slotKey) {
        this.logger.debug(`[${tenantId}] setor ${sector.key}: já enviado neste slot — pulando`);
        continue;
      }

      // Busca alertas do setor
      const alerts = await this.prisma.alertState.findMany({
        where: {
          tenantId,
          category: sector.key,
          status: 'open',
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
        },
        orderBy: { severity: 'asc' },
      });

      if (!alerts.length) {
        this.logger.debug(`[${tenantId}] setor ${sector.key}: sem alertas abertos`);
        continue;
      }

      const message = this.buildSectorMessage(sector, alerts, now);

      // WhatsApp — envia se telefone configurado
      if (sc.phone) {
        await this.notification.notifyPhone(tenantId, sc.phone, message);
        this.logger.log(`[${tenantId}] setor ${sector.key}: ${alerts.length} alerta(s) → WhatsApp ${sc.phone}`);
      }

      // E-mail — envia se endereço configurado (canal dual)
      if (sc.email) {
        const subject = `${sector.emoji} Alertas ${sector.label} — ${now.toLocaleDateString('pt-BR')}`;
        const result = await this.emailReply.sendAlertEmail(sc.email, subject, message, tenantId);
        if (result.sent) {
          this.logger.log(`[${tenantId}] setor ${sector.key}: ${alerts.length} alerta(s) → e-mail ${sc.email}`);
        } else {
          this.logger.warn(`[${tenantId}] setor ${sector.key}: falha e-mail → ${sc.email}: ${result.reason}`);
        }
      }

      if (!force) this.sentThisHour.set(dedupKey, slotKey);

      const alertIds = alerts.map((a) => a.id);
      await this.persistAlertUpdates(alertIds, now);

      totalSent += alerts.length;
    }

    return totalSent;
  }

  // ─── Modo legado (global) ───────────────────────────────────────────────────

  private async processLegacy(
    tenantId: string,
    config: Record<string, any> | null,
    now: Date,
    currentHour: number,
    currentMinute: number,
    force: boolean,
  ): Promise<number> {
    const sendHour = config?.sendHour ?? Number(process.env.MONITOR_DEFAULT_SEND_HOUR ?? 7);
    const sendMinute = config?.sendMinute ?? 0;

    if (!force) {
      if (currentHour !== sendHour) {
        this.logger.debug(
          `[${tenantId}] fora da hora (agora=${currentHour}h alvo=${sendHour}h TZ=${process.env.TZ ?? 'UTC'})`,
        );
        return 0;
      }
      if (currentMinute < sendMinute || currentMinute >= sendMinute + 5) {
        this.logger.debug(
          `[${tenantId}] fora da janela (min=${currentMinute} alvo=${sendMinute}-${sendMinute + 5})`,
        );
        return 0;
      }
    }

    const slotKey = this.makeSlotKey(now, sendHour, currentMinute);
    if (!force && this.sentThisHour.get(tenantId) === slotKey) return 0;

    const alerts = await this.prisma.alertState.findMany({
      where: {
        tenantId,
        status: 'open',
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
      },
      orderBy: { severity: 'asc' },
    });

    if (!alerts.length) return 0;

    const message = this.buildGlobalMessage(alerts, now);
    await this.notification.notify(tenantId, message);
    if (!force) this.sentThisHour.set(tenantId, slotKey);

    const alertIds = alerts.map((a) => a.id);
    await this.persistAlertUpdates(alertIds, now);

    this.logger.log(`[${tenantId}] legado: ${alerts.length} alerta(s) notificado(s)`);
    return alerts.length;
  }

  // ─── Builders de mensagem ───────────────────────────────────────────────────

  private buildSectorMessage(
    sector: SectorMeta,
    alerts: Array<{ severity: string; title: string }>,
    now: Date,
  ): string {
    const date = now.toLocaleDateString('pt-BR');
    const lines: string[] = [
      `${sector.emoji} *Alertas ${sector.label} — ${date}*\n`,
    ];

    const grouped = SEVERITY_ORDER.reduce<Record<string, typeof alerts>>((acc, s) => {
      acc[s] = alerts.filter((a) => a.severity === s);
      return acc;
    }, {});

    for (const sev of SEVERITY_ORDER) {
      const group = grouped[sev];
      if (!group.length) continue;
      lines.push(`${SEVERITY_EMOJI[sev]} *${sev}* (${group.length})`);
      group.slice(0, 5).forEach((a) => lines.push(`  • ${a.title}`));
      if (group.length > 5) lines.push(`  … e mais ${group.length - 5} item(ns)`);
    }

    lines.push('\nAcesse o painel da Hipervias para mais detalhes: https://www.hipertms.com.br');
    return lines.join('\n');
  }

  private buildGlobalMessage(
    alerts: Array<{ severity: string; title: string }>,
    now: Date,
  ): string {
    const date = now.toLocaleDateString('pt-BR');
    const lines: string[] = [`*📊 Resumo de Alertas — ${date}*\n`];

    const grouped = SEVERITY_ORDER.reduce<Record<string, typeof alerts>>((acc, s) => {
      acc[s] = alerts.filter((a) => a.severity === s);
      return acc;
    }, {});

    for (const sev of SEVERITY_ORDER) {
      const group = grouped[sev];
      if (!group.length) continue;
      lines.push(`${SEVERITY_EMOJI[sev]} *${sev}* (${group.length})`);
      group.slice(0, 5).forEach((a) => lines.push(`  • ${a.title}`));
      if (group.length > 5) lines.push(`  … e mais ${group.length - 5} item(ns)`);
    }

    lines.push('\nAcesse o painel da Hipervias para mais detalhes: https://www.hipertms.com.br');
    return lines.join('\n');
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Gera chave numérica única por janela de 5 min (para deduplicação). */
  private makeSlotKey(now: Date, hour: number, minute: number): number {
    const slot5 = Math.floor(minute / 5);
    return (
      now.getFullYear() * 100_000_000 +
      now.getMonth() * 1_000_000 +
      now.getDate() * 10_000 +
      hour * 100 +
      slot5
    );
  }

  /** Atualiza notifiedAt, incrementa notifyCount e arquiva alertas antigos. */
  private async persistAlertUpdates(alertIds: string[], now: Date): Promise<void> {
    await this.prisma.alertState.updateMany({
      where: { id: { in: alertIds } },
      data: { notifiedAt: now, notifyCount: { increment: 1 } },
    });

    const archiveCutoff = new Date(now.getTime() - ARCHIVE_AFTER_HOURS * 60 * 60 * 1000);
    await this.prisma.alertState.updateMany({
      where: {
        id: { in: alertIds },
        notifyCount: { gte: ARCHIVE_AFTER_NOTIFICATIONS },
        createdAt: { lt: archiveCutoff },
      },
      data: { status: 'archived' },
    });
  }
}
