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

/** A1: destinatário individual de um setor (canal por destinatário). */
interface SectorRecipient {
  label?: string;
  contact: string;
  channel: 'whatsapp' | 'email';
}

interface SectorCfg {
  /** LEGADO: telefone único do setor — aceito na leitura, prioridade menor que recipients. */
  phone?: string;
  /** LEGADO: e-mail único do responsável pelo setor (canal dual). */
  email?: string;
  /** A1: lista de destinatários (até 10), cada um com seu canal. Prioridade sobre phone/email. */
  recipients?: SectorRecipient[];
  sendHour?: number;
  sendMinute?: number;
  /** Dias da semana de envio (0=dom … 6=sáb). Ausente → deriva do sendWeekends global. */
  sendDays?: number[];
}

/** A1: máximo de destinatários por setor. */
const MAX_RECIPIENTS_PER_SECTOR = 10;

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

const SEVERITY_LABEL_PT: Record<string, string> = {
  CRITICAL: 'CRÍTICO',
  OVERDUE:  'VENCIDO',
  DUE_SOON: 'A VENCER',
  INFO:     'INFO',
};
const ARCHIVE_AFTER_NOTIFICATIONS = 2;
const ARCHIVE_AFTER_HOURS = 48;

/** Escapes special HTML characters to prevent injection in the email template. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
    // A1: modo per-sector ativa com phone legado OU recipients[]
    const hasSectorConfig =
      sectorConfig &&
      Object.values(sectorConfig).some((sc) => sc?.phone || (Array.isArray(sc?.recipients) && sc.recipients.length > 0));

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
   * A1: resolve os destinatários efetivos de um setor.
   * recipients[] tem prioridade; phone/email legados são o fallback.
   * Cap de MAX_RECIPIENTS_PER_SECTOR; normalização de telefone fica no notifyPhone.
   */
  private resolveSectorRecipients(sc: SectorCfg | undefined): { phones: string[]; emails: string[] } {
    if (!sc) return { phones: [], emails: [] };
    const rec = Array.isArray(sc.recipients) ? sc.recipients.slice(0, MAX_RECIPIENTS_PER_SECTOR) : [];
    if (rec.length > 0) {
      const phones = rec
        .filter((r) => r?.channel === 'whatsapp' && typeof r.contact === 'string' && r.contact.trim())
        .map((r) => r.contact.trim());
      const emails = rec
        .filter((r) => r?.channel === 'email' && typeof r.contact === 'string' && r.contact.includes('@'))
        .map((r) => r.contact.trim());
      if (phones.length || emails.length) return { phones, emails };
    }
    return {
      phones: sc.phone?.trim() ? [sc.phone.trim()] : [],
      emails: sc.email?.trim() ? [sc.email.trim()] : [],
    };
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
      // A1: resolve a lista de destinatários (recipients[] > phone/email legados)
      const { phones, emails } = this.resolveSectorRecipients(sc);
      if (!phones.length && !emails.length) {
        this.logger.debug(`[${tenantId}] setor ${sector.key}: sem destinatário configurado — pulando`);
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

      // WhatsApp — A1: todos os destinatários do canal; A4: enfileira com jitter
      // de até 2min (força = sem jitter, o admin está esperando na tela).
      for (const phone of phones) {
        await this.notification.notifyPhone(tenantId, phone, message, force ? 0 : 120_000);
        this.logger.log(`[${tenantId}] setor ${sector.key}: ${alerts.length} alerta(s) → WhatsApp ${phone} (enfileirado)`);
      }

      // E-mail — A1: todos os destinatários do canal (dual)
      if (emails.length) {
        const subject = `${sector.emoji} Alertas ${sector.label} — ${now.toLocaleDateString('pt-BR')}`;
        const html = this.buildSectorEmailHtml(sector, alerts, now);
        for (const email of emails) {
          const result = await this.emailReply.sendAlertEmail(email, subject, message, tenantId, html);
          if (result.sent) {
            this.logger.log(`[${tenantId}] setor ${sector.key}: ${alerts.length} alerta(s) → e-mail ${email}`);
          } else {
            this.logger.warn(`[${tenantId}] setor ${sector.key}: falha e-mail → ${email}: ${result.reason}`);
          }
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
      lines.push(`${SEVERITY_EMOJI[sev]} *${SEVERITY_LABEL_PT[sev] ?? sev}* (${group.length})`);
      group.slice(0, 5).forEach((a) => lines.push(`  • ${a.title}`));
      if (group.length > 5) lines.push(`  … e mais ${group.length - 5} item(ns)`);
    }

    lines.push('\nAcesse o painel do HiperTMS para mais detalhes: https://www.hipertms.com.br');
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
      lines.push(`${SEVERITY_EMOJI[sev]} *${SEVERITY_LABEL_PT[sev] ?? sev}* (${group.length})`);
      group.slice(0, 5).forEach((a) => lines.push(`  • ${a.title}`));
      if (group.length > 5) lines.push(`  … e mais ${group.length - 5} item(ns)`);
    }

    lines.push('\nAcesse o painel do HiperTMS para mais detalhes: https://www.hipertms.com.br');
    return lines.join('\n');
  }

  // ─── Email HTML (Opção 1 — Executivo com tabela) ────────────────────────────

  private readonly SEVERITY_BG: Record<string, string> = {
    CRITICAL: '#fef2f2',
    OVERDUE:  '#fff7ed',
    DUE_SOON: '#fefce8',
    INFO:     '#eff6ff',
  };

  private readonly SEVERITY_COLOR: Record<string, string> = {
    CRITICAL: '#dc2626',
    OVERDUE:  '#ea580c',
    DUE_SOON: '#ca8a04',
    INFO:     '#2563eb',
  };

  private readonly SECTOR_ACCENT: Record<string, string> = {
    fiscal:   '#3b82f6',
    logistic: '#f97316',
    frota:    '#a855f7',
    finance:  '#10b981',
  };

  /**
   * Monta o template HTML "Executivo com tabela" para e-mails de alerta.
   * Usa somente estilos inline e layout table-based para máxima compatibilidade
   * com clientes de e-mail corporativo (Outlook, Apple Mail, Gmail).
   */
  private buildSectorEmailHtml(
    sector: SectorMeta,
    alerts: Array<{ severity: string; title: string; description?: string | null }>,
    now: Date,
  ): string {
    const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const accent = this.SECTOR_ACCENT[sector.key] ?? '#3b82f6';

    // ── Chips de resumo por severidade ────────────────────────────────────────
    const chipRows = SEVERITY_ORDER.map((sev) => {
      const count = alerts.filter((a) => a.severity === sev).length;
      if (!count) return '';
      const color = this.SEVERITY_COLOR[sev] ?? '#71717a';
      const label = SEVERITY_LABEL_PT[sev] ?? sev;
      return `
        <td style="padding:0 6px 0 0">
          <span style="display:inline-block;background:${color}1a;color:${color};border:1px solid ${color}40;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">
            ${SEVERITY_EMOJI[sev]} ${label} &nbsp;${count}
          </span>
        </td>`;
    }).join('');

    // ── Linhas da tabela de alertas ───────────────────────────────────────────
    const tableRows = alerts.map((a) => {
      const bg = this.SEVERITY_BG[a.severity] ?? '#ffffff';
      const color = this.SEVERITY_COLOR[a.severity] ?? '#71717a';
      const label = SEVERITY_LABEL_PT[a.severity] ?? a.severity;
      const descHtml = a.description
        ? `<br><span style="font-size:12px;color:#71717a">${escapeHtml(a.description)}</span>`
        : '';
      return `
        <tr style="background:${bg}">
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;white-space:nowrap;vertical-align:top">
            <span style="color:${color};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">
              ${SEVERITY_EMOJI[a.severity]} ${label}
            </span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;color:#18181b;font-size:13px">
            ${escapeHtml(a.title)}${descHtml}
          </td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alertas ${sector.label} — HiperTMS</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 16px">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">

    <!-- Cabeçalho -->
    <tr>
      <td style="background:#18181b;padding:24px 28px;border-bottom:4px solid ${accent}">
        <p style="margin:0;color:#a1a1aa;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase">MONITOR PROATIVO · HIPERTMS</p>
        <p style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.2">${sector.emoji} Alertas ${sector.label}</p>
        <p style="margin:6px 0 0;color:#a1a1aa;font-size:13px">${date} &nbsp;·&nbsp; ${alerts.length} ocorrência${alerts.length !== 1 ? 's' : ''}</p>
      </td>
    </tr>

    <!-- Resumo de severidades -->
    <tr>
      <td style="padding:14px 28px;background:#fafafa;border-bottom:1px solid #e4e4e7">
        <table cellpadding="0" cellspacing="0"><tr>${chipRows}</tr></table>
      </td>
    </tr>

    <!-- Tabela de alertas -->
    <tr>
      <td style="padding:20px 28px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden">
          <tr style="background:#f4f4f5">
            <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1px;width:110px;border-bottom:1px solid #e4e4e7">Severidade</th>
            <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e4e4e7">Ocorrência</th>
          </tr>
          ${tableRows}
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding:4px 28px 24px;text-align:center">
        <a href="https://www.hipertms.com.br" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:700">Ver no HiperTMS →</a>
      </td>
    </tr>

    <!-- Rodapé -->
    <tr>
      <td style="padding:14px 28px;background:#fafafa;border-top:1px solid #e4e4e7">
        <p style="margin:0;color:#a1a1aa;font-size:11px">Lia · Monitor Proativo HiperTMS &nbsp;|&nbsp; <a href="https://www.hipertms.com.br" style="color:#a1a1aa;text-decoration:none">hipertms.com.br</a></p>
        <p style="margin:4px 0 0;color:#a1a1aa;font-size:11px">Este e-mail foi gerado automaticamente. Gerencie suas notificações no painel do HiperTMS.</p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;
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
