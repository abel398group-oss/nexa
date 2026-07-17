/**
 * ConsolidationService — agrupa alertas abertos e dispara resumos diários.
 *
 * Três modos de operação, verificados nesta ordem de prioridade:
 *
 * ── MODO PER-CONTATO (contacts preenchido — T6 2026-07, unificado em T7 2026-07-16) ──
 *   Cada contato (não mais cada setor) tem:
 *     - até 3 horários de envio próprios (sendTimes), independentes entre si
 *     - lista de setores que assina (sectors[])
 *     - 1 WhatsApp e/ou N e-mails
 *   T7: cada horário do contato dispara UMA mensagem só, consolidando os alertas
 *   de TODOS os setores assinados (em vez de 1 mensagem por setor — decisão de
 *   negócio aprovada pelo Abel em 2026-07-16: com 4 setores × 3 horários eram até
 *   12 msgs/dia; agora no máx. 3/dia). Setor sem alerta no slot simplesmente não
 *   aparece na mensagem; setor desabilitado no tenant fica fora do relatório.
 *   Deduplicação por chave `tenantId:contact:{id}:{HH:MM}` (por horário, não mais
 *   por setor+horário) — ver `unifiedDigestSlotKey` em contact-recipient.types.ts.
 *
 * ── MODO PER-SECTOR (sectorConfig preenchido, sem contacts) ────────────────
 *   Cada setor (fiscal, logistic, frota, finance) tem:
 *     - sendHour / sendMinute próprios
 *     - telefone WhatsApp próprio
 *   O serviço itera os setores ativos, verifica a janela de tempo de cada um
 *   e envia somente os alertas daquele setor para aquele telefone.
 *   Deduplicação por chave `tenantId:sector`.
 *
 * ── MODO LEGADO (sem sectorConfig nem contacts) ────────────────────────────
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
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { HiperTmsConnector, type TmsCashView } from '@/application/connectors/hipertms.connector';
import { resolveTmsTenantId } from './tms-tenant-id.util';
import { formatBRL } from './money-format.util';
import {
  CONTACT_SECTOR_KEYS,
  DEFAULT_SEND_DAYS,
  DEFAULT_SEND_TIMES,
  digestSlotKey,
  unifiedDigestSlotKey,
  effectiveDelivery,
  cashViewIsOn,
  type ContactRecipient,
  type ContactSendTime,
} from './contact-recipient.types';
import {
  isWithinSendWindow,
  DEFAULT_SEND_WINDOW_START,
  DEFAULT_SEND_WINDOW_END,
} from './send-window.util';

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
  /**
   * ISO date (YYYY-MM-DD, fuso do servidor) do último digest enviado com sucesso para
   * este setor. Gravado no DB após cada envio para sobreviver a restarts.
   * Usado pelo mecanismo de catch-up: se o backend reiniciou durante a janela de 5 min
   * e o alerta do dia se perdeu, o próximo tick reenvia (até 2h após o horário configurado).
   */
  lastDigestDate?: string;
}

/** A1: máximo de destinatários por setor. */
const MAX_RECIPIENTS_PER_SECTOR = 10;

interface SectorMeta {
  key: string;
  enabledField: string;
  label: string;
  emoji: string;
}

/**
 * T7: alertas de UM setor já filtrados (sem CRITICAL) e ordenados por
 * gravidade pro relatório unificado — `shown` é o que entra na mensagem
 * (cap `MAX_ITEMS_PER_SECTOR_UNIFIED`), `total` é a contagem real (usada no
 * cabeçalho da seção e no cálculo do "… e mais N").
 */
interface UnifiedSectorAlerts {
  shown: Array<{ severity: string; title: string; description?: string | null }>;
  total: number;
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
/**
 * T7 (2026-07-16, formato aprovado pelo Abel): níveis de gravidade do relatório
 * UNIFICADO por contato — só 3, não os 4 do modo por setor legado. CRITICAL
 * fica de fora de propósito: já sai pelo canal imediato (ver MonitorService/
 * buildImmediateMessage), então não duplica aqui. Cores e rótulos são
 * PRÓPRIOS deste relatório — não usar SEVERITY_EMOJI/SEVERITY_LABEL_PT (legado,
 * usado pelo modo por setor, que continua com os 4 níveis originais e INTOCADO).
 */
const UNIFIED_SEVERITY_ORDER = ['OVERDUE', 'DUE_SOON', 'INFO'];
const UNIFIED_SEVERITY_EMOJI: Record<string, string> = {
  OVERDUE:  '🔴', // vencidas
  DUE_SOON: '🟠', // a vencer
  INFO:     '🟡', // avisos
};
/** Máximo de pendências listadas por setor no relatório unificado — acima disso, "… e mais N". */
const MAX_ITEMS_PER_SECTOR_UNIFIED = 6;

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

  /** T8.6: cache em memória da visão do caixa por tenant — 1 chamada TMS/tenant/dia. */
  private readonly cashViewCache = new Map<string, { date: string; value: TmsCashView | null }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: MonitorNotificationService,
    private readonly emailReply: EmailReplyService,
    private readonly lock: RedisLockService,
    private readonly tms: HiperTmsConnector,
  ) {}

  private get enabled(): boolean {
    return (process.env.MONITOR_ENABLED ?? '').toLowerCase() === 'true';
  }

  @Interval(5 * 60 * 1000)
  async runConsolidation(): Promise<void> {
    // Multi-instance guard: only one replica runs the consolidation at a time.
    const release = await this.lock.acquire('lock:consolidation:run', 240);
    if (!release) return;
    try {
      await this.runConsolidationLocked();
    } finally {
      await release();
    }
  }

  private async runConsolidationLocked(): Promise<void> {
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

    // T6: modo per-contato tem prioridade quando há ao menos 1 contato com canal + setor.
    const contacts = config?.contacts as ContactRecipient[] | null | undefined;
    const hasContacts =
      Array.isArray(contacts) &&
      contacts.some((c) => (c?.whatsapp || (Array.isArray(c?.emails) && c.emails.length > 0)) && Array.isArray(c?.sectors) && c.sectors.length > 0);

    if (hasContacts) {
      return this.processPerContact(tenantId, config as any, contacts!, now, currentHour, currentMinute, force);
    }

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

  /**
   * Janela máxima de catch-up (em minutos) após o horário configurado.
   * Se o backend reiniciou e o tick caiu dentro desta janela → envia com atraso.
   * Após este limite → logger.warn e desiste (não envia).
   */
  private static readonly CATCHUP_WINDOW_MINUTES = 120;

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
    const todayStr = this.toDateStr(now);

    /**
     * Skip reasons acumulados por sector.key durante o loop.
     * Emitidos em UMA linha de log ao final — evita spam e mantém rastreabilidade.
     */
    const skipReasons: Record<string, string> = {};

    for (const sector of SECTORS) {
      // Usa spread para manter o tipo correto; sc pode ser undefined se o setor nunca foi configurado.
      const sc: SectorCfg = sectorConfig[sector.key] ?? {};

      // A1: resolve a lista de destinatários (recipients[] > phone/email legados)
      const { phones, emails } = this.resolveSectorRecipients(sc);
      if (!phones.length && !emails.length) {
        skipReasons[sector.key] = 'sem_destinatario';
        continue;
      }

      // Verifica se o setor está habilitado
      if (!config[sector.enabledField]) {
        skipReasons[sector.key] = 'desabilitado';
        continue;
      }

      const sectorHour = sc.sendHour ?? globalHour;
      const sectorMinute = sc.sendMinute ?? globalMinute;
      const sendDays = this.resolveSendDays(sc, config);
      let isCatchUp = false;

      if (!force) {
        if (!sendDays.includes(now.getDay())) {
          skipReasons[sector.key] = 'fora_do_dia';
          continue;
        }

        const inWindow =
          currentHour === sectorHour &&
          currentMinute >= sectorMinute &&
          currentMinute < sectorMinute + 5;

        const alreadySentToday = sc.lastDigestDate === todayStr;

        if (inWindow) {
          // Janela normal: dedup in-memory + lastDigestDate impedem duplo envio.
          const dedupKey = `${tenantId}:${sector.key}`;
          const slotKey = this.makeSlotKey(now, sectorHour, currentMinute);
          if (this.sentThisHour.get(dedupKey) === slotKey || alreadySentToday) {
            skipReasons[sector.key] = 'ja_enviado';
            continue;
          }
        } else if (!alreadySentToday) {
          // Fora da janela de 5 min mas ainda não enviou hoje → avaliar catch-up.
          const nowMins = currentHour * 60 + currentMinute;
          const scheduledMins = sectorHour * 60 + sectorMinute;
          const diffMins = nowMins - scheduledMins;

          if (diffMins >= 0 && diffMins < ConsolidationService.CATCHUP_WINDOW_MINUTES) {
            // Dentro da janela de catch-up: backend provavelmente reiniciou durante o alvo.
            isCatchUp = true;
            this.logger.log(
              `[${tenantId}] setor ${sector.key}: catch-up (${diffMins}min após ${sectorHour}h${String(sectorMinute).padStart(2, '0')} — possível restart durante janela)`,
            );
          } else if (diffMins >= ConsolidationService.CATCHUP_WINDOW_MINUTES) {
            // Passou da janela de 2h → desiste e avisa.
            this.logger.warn(
              `[${tenantId}] setor ${sector.key}: janela de catch-up expirada ` +
              `(${diffMins}min após ${sectorHour}h${String(sectorMinute).padStart(2, '0')}) — digest do dia perdido`,
            );
            skipReasons[sector.key] = 'catch_up_expirado';
            continue;
          } else {
            // diffMins < 0: horário ainda não chegou hoje.
            skipReasons[sector.key] = 'fora_da_hora';
            continue;
          }
        } else {
          // alreadySentToday && !inWindow: envio diário já registrado → skip normal.
          skipReasons[sector.key] = 'ja_enviado_hoje';
          continue;
        }
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
        skipReasons[sector.key] = 'sem_alertas';
        continue;
      }

      const message = this.buildSectorMessage(sector, alerts, now);
      const catchUpSuffix = isCatchUp ? ' (catch-up)' : '';

      // BUG FIX (2026-07-14): reivindica o slot ANTES de enviar, não depois.
      // Antes, o marcador "já enviado hoje" (in-memory + lastDigestDate no banco) só
      // era gravado DEPOIS do loop de envio. Se o backend reiniciasse (deploy/crash)
      // entre o envio e essa gravação — algo comum em dias com deploys frequentes —
      // o marcador se perdia e o próximo tick de catch-up reenviava o MESMO digest
      // (visto em produção em 14/07/2026: mesmo alerta fiscal reenviado 5x no dia).
      // Gravar o claim primeiro troca "duplicidade" por, na pior hipótese, um envio
      // perdido e recuperável pela janela de catch-up — trade-off correto para um
      // sistema de notificação.
      if (!force) {
        const dedupKey = `${tenantId}:${sector.key}`;
        const slotKey = this.makeSlotKey(now, sectorHour, currentMinute);
        this.sentThisHour.set(dedupKey, slotKey);
        // Persiste lastDigestDate no JSON do banco para sobreviver a restarts futuros.
        sectorConfig[sector.key] = { ...sc, lastDigestDate: todayStr };
        await this.persistLastDigestDate(tenantId, sectorConfig);
      }

      // WhatsApp — A1: todos os destinatários do canal; jitter de até 2min (força = sem jitter).
      for (const phone of phones) {
        await this.notification.notifyPhone(tenantId, phone, message, force ? 0 : 120_000);
        this.logger.log(
          `[${tenantId}] setor ${sector.key}: ${alerts.length} alerta(s) → WhatsApp ${phone}${catchUpSuffix} (enfileirado)`,
        );
      }

      // E-mail — A1: todos os destinatários do canal (dual)
      if (emails.length) {
        // H1: mesmo nome do título do WhatsApp — "🕐 Alerta programado" no assunto.
        const subject = `🕐 Alerta programado · ${sector.label} — ${now.toLocaleDateString('pt-BR')}`;
        const html = this.buildSectorEmailHtml(sector, alerts, now);
        for (const email of emails) {
          const result = await this.emailReply.sendAlertEmail(email, subject, message, tenantId, html);
          if (result.sent) {
            this.logger.log(
              `[${tenantId}] setor ${sector.key}: ${alerts.length} alerta(s) → e-mail ${email}${catchUpSuffix}`,
            );
          } else {
            this.logger.warn(
              `[${tenantId}] setor ${sector.key}: falha e-mail → ${email}: ${result.reason}`,
            );
          }
        }
      }

      const alertIds = alerts.map((a) => a.id);
      await this.persistAlertUpdates(alertIds, now);

      totalSent += alerts.length;
    }

    // ── Observabilidade: uma linha de log por tenant com todos os setores que não enviaram ──
    const skipped = Object.entries(skipReasons);
    if (skipped.length > 0) {
      const summary = skipped.map(([k, v]) => `${k}=${v}`).join(', ');
      this.logger.log(`[${tenantId}] setores sem envio neste tick: ${summary}`);
    }

    return totalSent;
  }

  // ─── Modo per-contato (T6, unificado em T7) ────────────────────────────────

  /**
   * T7 (2026-07-16, decisão de negócio do Abel): varre CONTATOS em vez de setores,
   * e para cada um dos até 3 horários próprios do contato dispara UMA mensagem só,
   * consolidando os alertas de TODOS os setores que ele assina — antes disso era
   * 1 mensagem por (setor, horário), então 4 setores × 3 horários chegava a
   * 12 msgs/dia; agora é no máx. 3/dia. Setor sem alerta no slot não aparece na
   * mensagem; setor desabilitado no tenant fica fora do relatório inteiro.
   *
   * Laço invertido (T7): contato → horário → junta os setores habilitados numa
   * query só. Dedup por `tenantId:contact:{id}:{HH:MM}` (não mais por setor).
   *
   * Isolamento: um contato NUNCA recebe alerta de um setor que não está em
   * `contact.sectors`, e cada horário só dispara na sua própria janela — os
   * outros horários daquele contato ficam ociosos até baterem a janela deles.
   */
  private async processPerContact(
    tenantId: string,
    config: Record<string, any>,
    contacts: ContactRecipient[],
    now: Date,
    currentHour: number,
    currentMinute: number,
    force: boolean,
  ): Promise<number> {
    let totalSent = 0;
    const todayStr = this.toDateStr(now);

    // T9: janela geral de envio — digest e caixa (T8.6) NUNCA disparam fora dela,
    // nem em catch-up (doc T9: "inclusive catch-up"). `force` (envio manual de
    // teste/admin) segue bypassando, mesmo princípio dos outros gates de `force`
    // já existentes neste método.
    const windowStart = config?.sendWindowStart ?? DEFAULT_SEND_WINDOW_START;
    const windowEnd = config?.sendWindowEnd ?? DEFAULT_SEND_WINDOW_END;
    const inSendWindow = isWithinSendWindow(now, windowStart, windowEnd);

    const skipReasons: Record<string, string> = {};

    for (const contact of contacts) {
      const hasChannel = !!contact.whatsapp || (Array.isArray(contact.emails) && contact.emails.length > 0);
      if (!hasChannel) continue;

      const sendDays = Array.isArray(contact.sendDays) && contact.sendDays.length ? contact.sendDays : DEFAULT_SEND_DAYS;
      if (!force && !sendDays.includes(now.getDay())) {
        skipReasons[`contato:${contact.id}`] = 'fora_do_dia';
        continue;
      }

      const sendTimes = (Array.isArray(contact.sendTimes) && contact.sendTimes.length
        ? contact.sendTimes
        : DEFAULT_SEND_TIMES
      ).slice(0, 3);

      // Setores que o contato assina, filtrados pelos que o tenant tem habilitados
      // globalmente — um setor desabilitado fica fora do relatório inteiro, não só
      // "sem alertas".
      const enabledSectors = (contact.sectors ?? [])
        .filter((sectorKey) => CONTACT_SECTOR_KEYS.includes(sectorKey))
        .map((sectorKey) => SECTORS.find((s) => s.key === sectorKey))
        .filter((s): s is SectorMeta => !!s && !!config[s.enabledField]);

      if (enabledSectors.length === 0) {
        skipReasons[`contato:${contact.id}`] = 'sem_setor_habilitado';
        continue;
      }

      for (const t of sendTimes) {
        const slotLabel = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
        const skipKey = `contato:${contact.id}@${slotLabel}`;
        const digestKey = unifiedDigestSlotKey(t);

        // T7 compat (dia do deploy): se QUALQUER setor assinado já tinha uma chave
        // antiga (pré-T7, `${sector}|HH:MM`) marcada como enviada hoje pra este
        // horário, trata o slot unificado como já enviado — evita duplicar o que
        // o código antigo já mandou por setor antes do redeploy (ver comentário
        // em ContactRecipient.lastDigestDate). Só é lido, nunca mais escrito.
        const alreadySentUnified = contact.lastDigestDate?.[digestKey] === todayStr;
        const alreadySentLegacyCompat = enabledSectors.some(
          (sector) => contact.lastDigestDate?.[digestSlotKey(sector.key, t)] === todayStr,
        );
        const alreadySentToday = alreadySentUnified || alreadySentLegacyCompat;

        let isCatchUp = false;

        if (!force) {
          if (alreadySentToday) {
            skipReasons[skipKey] = 'ja_enviado_hoje';
            continue;
          }

          // T9-FIX (2026-07-17): fora da janela geral de envio → nada dispara, nem
          // catch-up. Antes só entrava no resumo agregado no fim da função (uma
          // linha só, no fim do tick) — log explícito e imediato aqui, no formato
          // pedido pelo Abel, pra aparecer na hora do skip e não só num resumo.
          if (!inSendWindow) {
            skipReasons[skipKey] = `fora_da_janela_de_envio(${windowStart}h-${windowEnd}h)`;
            this.logger.log(
              `Monitor: slot ${slotLabel} pulado — fora da janela de envio (${windowStart}-${windowEnd}h) tenant=${tenantId} contato=${contact.id}`,
            );
            continue;
          }

          const inWindow = currentHour === t.hour && currentMinute >= t.minute && currentMinute < t.minute + 5;

          if (!inWindow) {
            const nowMins = currentHour * 60 + currentMinute;
            const scheduledMins = t.hour * 60 + t.minute;
            const diffMins = nowMins - scheduledMins;
            if (diffMins >= 0 && diffMins < ConsolidationService.CATCHUP_WINDOW_MINUTES) {
              isCatchUp = true;
            } else {
              // diffMins < 0: horário ainda não chegou hoje. diffMins >= janela: expirou —
              // desiste em silêncio (sem warn por slot pra não gerar spam por contato).
              skipReasons[skipKey] = 'fora_da_hora';
              continue;
            }
          }

          const dedupKey = `${tenantId}:contact:${contact.id}:${slotLabel}`;
          const slotKeyNum = this.makeSlotKey(now, t.hour, currentMinute);
          if (this.sentThisHour.get(dedupKey) === slotKeyNum) {
            skipReasons[skipKey] = 'ja_enviado';
            continue;
          }
        }

        // T7: uma query só, com TODOS os setores habilitados do contato — antes
        // era 1 query por (setor, horário). CRITICAL fica de fora do relatório
        // programado (já foi mandado pelo canal imediato) — filtro no `where`
        // como otimização, e repetido em memória logo abaixo porque o mock de
        // Prisma dos testes não interpreta o `where`, só o `.filter()` real.
        const alerts = await this.prisma.alertState.findMany({
          where: {
            tenantId,
            category: { in: enabledSectors.map((s) => s.key) },
            status: 'open',
            severity: { notIn: ['CRITICAL'] },
            OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
          },
          orderBy: [{ severity: 'asc' }, { category: 'asc' }],
        });

        const nonCriticalAlerts = alerts.filter((a) => a.severity !== 'CRITICAL');

        if (!nonCriticalAlerts.length) {
          skipReasons[skipKey] = 'sem_alertas';
          continue;
        }

        // Agrupa por setor e monta o formato aprovado: ordenado por gravidade
        // (UNIFIED_SEVERITY_ORDER), cap de MAX_ITEMS_PER_SECTOR_UNIFIED itens
        // exibidos + total pro "… e mais N pendências". Setor sem alerta
        // simplesmente não entra no Map (ver buildUnifiedMessage/buildUnifiedEmailHtml).
        const alertsBySector = new Map<string, UnifiedSectorAlerts>();
        for (const sector of enabledSectors) {
          const sectorAlerts = nonCriticalAlerts
            .filter((a) => a.category === sector.key)
            .sort((a, b) => UNIFIED_SEVERITY_ORDER.indexOf(a.severity) - UNIFIED_SEVERITY_ORDER.indexOf(b.severity));
          if (!sectorAlerts.length) continue;
          alertsBySector.set(sector.key, {
            shown: sectorAlerts.slice(0, MAX_ITEMS_PER_SECTOR_UNIFIED),
            total: sectorAlerts.length,
          });
        }

        // T9-ADENDO (2026-07-17): bloco "💰 SEU CAIXA" entra em TODOS os horários
        // do contato quando ligado (`cashViewIsOn` — 'on' ou o alias legado
        // 'lastSlot'), não só no último (supera o T8.6 original). NÃO cria um
        // novo gatilho de envio — só decora um digest que já ia sair (não mexe
        // no fluxo de pendências/T7). Cache de 1 chamada TMS/tenant/dia continua
        // valendo (getCashViewForTenant), mesmo com múltiplos slots no dia.
        const cashView = cashViewIsOn(contact.cashView)
          ? await this.getCashViewForTenant(tenantId, now)
          : null;

        // T9: matriz efetiva de entrega — único ponto de derivação (nunca
        // reimplementar, ver `effectiveDelivery`). Gate por canal: WhatsApp e
        // e-mail podem receber conteúdo diferente (digest ligado/desligado
        // independente do bloco de caixa) — cada builder recebe só o cashView
        // que o canal em questão está autorizado a ver.
        const delivery = effectiveDelivery(contact);
        const cashViewForWa = delivery.cash.whatsapp ? cashView : null;
        const cashViewForEmail = delivery.cash.email ? cashView : null;

        // T9-FIX (2026-07-17): trava defensiva encontrada na investigação do bug
        // "envios parados" — SEM esta trava, um contato com `delivery.digest`
        // zerado nos dois canais (ex.: JSON salvo com o digest desligado por
        // engano, ou uma regressão futura em `effectiveDelivery`) ainda assim
        // reivindicava o slot (dedupKey + lastDigestDate) e contava os alertas
        // como "enviados" em `totalSent` MAIS ABAIXO, sem nenhum canal de fato
        // notificado e só um log em nível debug (invisível no log level padrão
        // de produção) — silêncio total, o pior cenário pra debugar. Agora o
        // slot NÃO é reivindicado (fica disponível pro próximo tick/catch-up
        // assim que a matriz de entrega for corrigida) e o log é warn (visível).
        if (!delivery.digest.whatsapp && !delivery.digest.email) {
          skipReasons[skipKey] = 'delivery_sem_canal_habilitado';
          this.logger.warn(
            `Monitor: slot ${slotLabel} pulado — delivery.digest sem canal habilitado (WhatsApp e e-mail desligados) ` +
            `tenant=${tenantId} contato=${contact.id}, ${nonCriticalAlerts.length} alerta(s) pendente(s) NÃO enviado(s)`,
          );
          continue;
        }

        const message = this.buildUnifiedMessage(enabledSectors, alertsBySector, now, slotLabel, cashViewForWa);
        const catchUpSuffix = isCatchUp ? ' (catch-up)' : '';

        // Mesmo princípio do BUG FIX per-sector (2026-07-14): reivindica o slot e
        // PERSISTE no banco ANTES de enviar — se o processo cair no meio do envio
        // (WhatsApp + N e-mails do mesmo contato, por exemplo), o pior cenário é um
        // envio perdido (recuperável pela janela de catch-up), nunca um duplicado.
        if (!force) {
          const dedupKey = `${tenantId}:contact:${contact.id}:${slotLabel}`;
          const slotKeyNum = this.makeSlotKey(now, t.hour, currentMinute);
          this.sentThisHour.set(dedupKey, slotKeyNum);
          contact.lastDigestDate = { ...(contact.lastDigestDate ?? {}), [digestKey]: todayStr };
          await this.persistContacts(tenantId, contacts);
        }

        // T9: digest via WhatsApp só se a matriz efetiva permitir para este canal.
        if (contact.whatsapp && delivery.digest.whatsapp) {
          await this.notification.notifyPhone(tenantId, contact.whatsapp, message, force ? 0 : 120_000);
          this.logger.log(
            `[${tenantId}] contato ${contact.id}@${slotLabel}: ${nonCriticalAlerts.length} alerta(s) em ${enabledSectors.length} setor(es) → WhatsApp ${contact.whatsapp}${catchUpSuffix} (enfileirado)`,
          );
        } else if (contact.whatsapp) {
          this.logger.debug(
            `[${tenantId}] contato ${contact.id}@${slotLabel}: digest via WhatsApp desligado na matriz de entrega — não enviado`,
          );
        }

        // T9: digest via e-mail só se a matriz efetiva permitir para este canal.
        if (contact.emails?.length && delivery.digest.email) {
          const subject = `⚠️ HiperTMS — Pendências · ${now.toLocaleDateString('pt-BR')} ${slotLabel}`;
          const html = this.buildUnifiedEmailHtml(enabledSectors, alertsBySector, now, slotLabel, cashViewForEmail);
          for (const email of contact.emails) {
            const result = await this.emailReply.sendAlertEmail(email, subject, message, tenantId, html);
            if (result.sent) {
              this.logger.log(
                `[${tenantId}] contato ${contact.id}@${slotLabel}: ${nonCriticalAlerts.length} alerta(s) em ${enabledSectors.length} setor(es) → e-mail ${email}${catchUpSuffix}`,
              );
            } else {
              this.logger.warn(
                `[${tenantId}] contato ${contact.id}@${slotLabel}: falha e-mail → ${email}: ${result.reason}`,
              );
            }
          }
        }

        const alertIds = nonCriticalAlerts.map((a) => a.id);
        await this.persistAlertUpdates(alertIds, now);

        totalSent += nonCriticalAlerts.length;
      }
    }

    const skipped = Object.entries(skipReasons);
    if (skipped.length > 0) {
      const summary = skipped.map(([k, v]) => `${k}=${v}`).join(', ');
      this.logger.log(`[${tenantId}] contatos sem envio neste tick: ${summary}`);
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
    // Claim antes de enviar (mesmo motivo do modo per-sector — ver comentário lá).
    if (!force) this.sentThisHour.set(tenantId, slotKey);
    await this.notification.notify(tenantId, message);

    const alertIds = alerts.map((a) => a.id);
    await this.persistAlertUpdates(alertIds, now);

    this.logger.log(`[${tenantId}] legado: ${alerts.length} alerta(s) notificado(s)`);
    return alerts.length;
  }

  // ─── Builders de mensagem ───────────────────────────────────────────────────

  /**
   * Miolo compartilhado de formatação (texto WhatsApp) de um grupo de alertas,
   * agrupado por severidade — extraído em T7 pra ser reaproveitado tanto pelo
   * modo per-sector legado (`buildSectorMessage`, formato INTOCADO) quanto pelo
   * modo per-contato unificado (`buildUnifiedMessage`, uma seção por setor).
   */
  private buildSeverityLines(alerts: Array<{ severity: string; title: string }>): string[] {
    const lines: string[] = [];
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
    return lines;
  }

  private buildSectorMessage(
    sector: SectorMeta,
    alerts: Array<{ severity: string; title: string }>,
    now: Date,
  ): string {
    const date = now.toLocaleDateString('pt-BR');
    // H1: título nomeado, simétrico ao imediato (MonitorService.buildImmediateMessage)
    // — "🕐 Alerta programado" vs "⚡ Alerta imediato" — pra dar pra saber de cara,
    // só de olhar o topo da mensagem, qual dos dois disparou.
    const lines: string[] = [
      `🕐 *Alerta programado · ${sector.label} — ${date}*\n`,
      ...this.buildSeverityLines(alerts),
    ];

    lines.push('\nAcesse o painel do HiperTMS para mais detalhes: https://www.hipertms.com.br');
    return lines.join('\n');
  }

  /**
   * T7 (formato aprovado pelo Abel, 2026-07-16): mensagem única do modo
   * per-contato, consolidando os alertas de TODOS os setores habilitados que o
   * contato assina num só envio. Setor sem pendência não gera seção. Lista
   * plana por setor (sem subtítulo por severidade, diferente do modo legado) —
   * ordenada por gravidade, cap de `MAX_ITEMS_PER_SECTOR_UNIFIED` itens com
   * "… e mais N pendências" acima disso. CRITICAL não aparece aqui (ver
   * `UNIFIED_SEVERITY_ORDER`) — já foi no canal imediato.
   *
   * `slotLabel` é o horário AGENDADO do contato (ex. "08:00"), não o horário
   * real do tick — importa pro cabeçalho refletir "seu relatório das 08h"
   * mesmo quando o envio efetivo é um catch-up alguns minutos depois.
   */
  private buildUnifiedMessage(
    sectors: SectorMeta[],
    alertsBySector: Map<string, UnifiedSectorAlerts>,
    now: Date,
    slotLabel: string,
    cashView?: TmsCashView | null,
  ): string {
    const dateShort = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lines: string[] = [`⚠️ *HiperTMS — Pendências · ${dateShort} ${slotLabel}*\n`];

    // T8.6: bloco do caixa vai ACIMA dos blocos de setor (formato aprovado).
    if (cashView) {
      lines.push(this.buildCashViewBlock(cashView));
    }

    for (const sector of sectors) {
      const entry = alertsBySector.get(sector.key);
      if (!entry || entry.total === 0) continue;
      lines.push(`${sector.emoji} *${sector.label} (${entry.total})*`);
      entry.shown.forEach((a) => lines.push(`${UNIFIED_SEVERITY_EMOJI[a.severity] ?? '⚪'} ${a.title}`));
      const overflow = entry.total - entry.shown.length;
      if (overflow > 0) lines.push(`… e mais ${overflow} pendência${overflow !== 1 ? 's' : ''}`);
      lines.push('');
    }

    lines.push('Acesse o painel do HiperTMS para mais detalhes: https://www.hipertms.com.br');
    return lines.join('\n');
  }

  /**
   * T8.6 (opção 1 aprovada, seguir à risca) — bloco "💰 SEU CAIXA" anexado à
   * última mensagem de pendências do dia. Saldo (inflow − outflow) derivado
   * aqui — NÃO vem no payload do TMS.
   */
  private buildCashViewBlock(cash: TmsCashView): string {
    const balance = cash.inflow15d.amount - cash.outflow15d.amount;
    const balanceLine =
      balance >= 0
        ? `✅ Sobra: ${formatBRL(balance)}`
        : `🔴 Falta: ${formatBRL(Math.abs(balance))}`;

    // T9-ADENDO (2026-07-17) item B: resumo do DIA, logo após o cabeçalho,
    // antes de "Entra/Sai". Campos opcionais no contrato — TMS antigo não
    // manda, cada linha é omitida independentemente (nunca quebra).
    const todayLines: string[] = [];
    if (cash.invoicedToday) {
      todayLines.push(
        `🧾 Faturado hoje: ${formatBRL(cash.invoicedToday.amount)} (${cash.invoicedToday.count} fatura${cash.invoicedToday.count !== 1 ? 's' : ''})`,
      );
    }
    if (cash.paidToday) {
      todayLines.push(
        `💸 Gasto hoje: ${formatBRL(cash.paidToday.amount)} (${cash.paidToday.count} pagamento${cash.paidToday.count !== 1 ? 's' : ''})`,
      );
    }

    return [
      '💰 *SEU CAIXA — próximos 15 dias*',
      ...todayLines,
      `⬇️ Entra: ${formatBRL(cash.inflow15d.amount)} (${cash.inflow15d.count} conta${cash.inflow15d.count !== 1 ? 's' : ''} a receber)`,
      `⬆️ Sai: ${formatBRL(cash.outflow15d.amount)} (${cash.outflow15d.count} conta${cash.outflow15d.count !== 1 ? 's' : ''} a pagar)`,
      '━━━━━━━━━━━━━━━',
      balanceLine,
      `⚠️ Vencido sem receber: ${formatBRL(cash.overdueReceivable.amount)} (${cash.overdueReceivable.count} cliente${cash.overdueReceivable.count !== 1 ? 's' : ''})`,
      `🍯 CT-e emitidos sem faturar: ${formatBRL(cash.unbilledCte.amount)} (${cash.unbilledCte.count} CT-e)`,
      `🧾 Faturado no mês: ${formatBRL(cash.invoicedMonth.amount)}`,
      '',
    ].join('\n');
  }

  /** T8.6 — versão HTML do bloco "💰 SEU CAIXA", inserida acima das seções de setor no e-mail. */
  private buildCashViewSectionHtml(cash: TmsCashView): string {
    const balance = cash.inflow15d.amount - cash.outflow15d.amount;
    const balanceLine =
      balance >= 0
        ? `✅ Sobra: ${formatBRL(balance)}`
        : `🔴 Falta: ${formatBRL(Math.abs(balance))}`;
    const cashAccent = '#10b981';

    // T9-ADENDO (2026-07-17) item B: resumo do DIA, logo após o cabeçalho,
    // antes de "Entra/Sai". Cada linha omitida independentemente se o campo
    // não vier do TMS (graceful degradation, nunca quebra).
    const todayRowsHtml: string[] = [];
    if (cash.invoicedToday) {
      todayRowsHtml.push(
        `<tr><td style="padding:2px 0">🧾 Faturado hoje: ${formatBRL(cash.invoicedToday.amount)} (${cash.invoicedToday.count} fatura${cash.invoicedToday.count !== 1 ? 's' : ''})</td></tr>`,
      );
    }
    if (cash.paidToday) {
      todayRowsHtml.push(
        `<tr><td style="padding:2px 0">💸 Gasto hoje: ${formatBRL(cash.paidToday.amount)} (${cash.paidToday.count} pagamento${cash.paidToday.count !== 1 ? 's' : ''})</td></tr>`,
      );
    }

    return `
    <!-- T8.6: Visão do caixa -->
    <tr>
      <td style="padding:16px 28px 4px">
        <p style="margin:0 0 8px;padding-left:10px;border-left:4px solid ${cashAccent};color:#18181b;font-size:15px;font-weight:700">
          💰 SEU CAIXA &nbsp;<span style="color:#71717a;font-weight:400;font-size:12px">(próximos 15 dias)</span>
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#3f3f46">
          ${todayRowsHtml.join('\n          ')}
          <tr><td style="padding:2px 0">⬇️ Entra: ${formatBRL(cash.inflow15d.amount)} (${cash.inflow15d.count} conta${cash.inflow15d.count !== 1 ? 's' : ''} a receber)</td></tr>
          <tr><td style="padding:2px 0">⬆️ Sai: ${formatBRL(cash.outflow15d.amount)} (${cash.outflow15d.count} conta${cash.outflow15d.count !== 1 ? 's' : ''} a pagar)</td></tr>
          <tr><td style="padding:4px 0;font-weight:700">${balanceLine}</td></tr>
          <tr><td style="padding:2px 0">⚠️ Vencido sem receber: ${formatBRL(cash.overdueReceivable.amount)} (${cash.overdueReceivable.count} cliente${cash.overdueReceivable.count !== 1 ? 's' : ''})</td></tr>
          <tr><td style="padding:2px 0">🍯 CT-e emitidos sem faturar: ${formatBRL(cash.unbilledCte.amount)} (${cash.unbilledCte.count} CT-e)</td></tr>
          <tr><td style="padding:2px 0">🧾 Faturado no mês: ${formatBRL(cash.invoicedMonth.amount)}</td></tr>
        </table>
      </td>
    </tr>`;
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
   * Miolo compartilhado (HTML) — chips de resumo por severidade. Extraído em T7
   * pra ser reaproveitado pelo modo per-sector legado (`buildSectorEmailHtml`,
   * saída INTOCADA) e pelo modo per-contato unificado (`buildUnifiedEmailHtml`).
   */
  private buildSeverityChipsHtml(alerts: Array<{ severity: string; title: string }>): string {
    return SEVERITY_ORDER.map((sev) => {
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
  }

  /**
   * Miolo compartilhado (HTML) — linhas da tabela de alertas. Ver
   * `buildSeverityChipsHtml` acima (mesmo motivo da extração).
   */
  private buildAlertsTableRowsHtml(
    alerts: Array<{ severity: string; title: string; description?: string | null }>,
  ): string {
    return alerts.map((a) => {
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
  }

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
    const chipRows = this.buildSeverityChipsHtml(alerts);
    const tableRows = this.buildAlertsTableRowsHtml(alerts);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alerta programado · ${sector.label} — HiperTMS</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 16px">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">

    <!-- Cabeçalho -->
    <tr>
      <td style="background:#18181b;padding:24px 28px;border-bottom:4px solid ${accent}">
        <p style="margin:0;color:#a1a1aa;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase">MONITOR PROATIVO · HIPERTMS</p>
        <p style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.2">🕐 Alerta programado · ${sector.label}</p>
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

  /** Accent neutro do cabeçalho do e-mail consolidado (T7) — não é de nenhum setor específico. */
  private readonly UNIFIED_ACCENT = '#3b82f6';

  /**
   * T7: e-mail único do modo per-contato, com uma seção (subcabeçalho + chips +
   * tabela) por setor habilitado que tem pendência no slot — mesmo formato
   * aprovado do WhatsApp (`buildUnifiedMessage`): setor sem pendência não gera
   * seção, e cada setor mostra no máximo `MAX_ITEMS_PER_SECTOR_UNIFIED` linhas
   * na tabela + uma nota de overflow "… e mais N pendências" quando o total
   * excede o exibido. Nota: a paleta de cores/emoji da tabela HTML permanece a
   * legada (`SEVERITY_COLOR`/`SEVERITY_LABEL_PT`/`SEVERITY_EMOJI`, 4 níveis) —
   * o "formato aprovado" com 3 níveis (🔴🟠🟡) era especificado só pro texto
   * WhatsApp; CRITICAL já não aparece aqui de qualquer forma (filtrado antes,
   * ver `processPerContact`), então a diferença é só nos rótulos/cores visuais.
   */
  private buildUnifiedEmailHtml(
    sectors: SectorMeta[],
    alertsBySector: Map<string, UnifiedSectorAlerts>,
    now: Date,
    slotLabel: string,
    cashView?: TmsCashView | null,
  ): string {
    const date = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const totalAlerts = [...alertsBySector.values()].reduce((sum, entry) => sum + entry.total, 0);
    const cashSection = cashView ? this.buildCashViewSectionHtml(cashView) : '';

    const sections = sectors
      .map((sector) => {
        const entry = alertsBySector.get(sector.key);
        if (!entry || entry.total === 0) return '';
        const accent = this.SECTOR_ACCENT[sector.key] ?? this.UNIFIED_ACCENT;
        const chipRows = this.buildSeverityChipsHtml(entry.shown);
        const tableRows = this.buildAlertsTableRowsHtml(entry.shown);
        const overflow = entry.total - entry.shown.length;
        const overflowRow =
          overflow > 0
            ? `<tr><td colspan="2" style="padding:8px 12px;font-size:12px;color:#71717a;font-style:italic;border-top:1px solid #e4e4e7">… e mais ${overflow} pendência${overflow !== 1 ? 's' : ''}</td></tr>`
            : '';
        return `
    <!-- Seção: ${sector.label} -->
    <tr>
      <td style="padding:16px 28px 4px">
        <p style="margin:0 0 8px;padding-left:10px;border-left:4px solid ${accent};color:#18181b;font-size:15px;font-weight:700">
          ${sector.emoji} ${sector.label} &nbsp;<span style="color:#71717a;font-weight:400;font-size:12px">(${entry.total} pendência${entry.total !== 1 ? 's' : ''})</span>
        </p>
        <table cellpadding="0" cellspacing="0"><tr>${chipRows}</tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 4px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden">
          <tr style="background:#f4f4f5">
            <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1px;width:110px;border-bottom:1px solid #e4e4e7">Severidade</th>
            <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e4e4e7">Ocorrência</th>
          </tr>
          ${tableRows}
          ${overflowRow}
        </table>
      </td>
    </tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HiperTMS — Pendências</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 16px">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">

    <!-- Cabeçalho -->
    <tr>
      <td style="background:#18181b;padding:24px 28px;border-bottom:4px solid ${this.UNIFIED_ACCENT}">
        <p style="margin:0;color:#a1a1aa;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase">MONITOR PROATIVO · HIPERTMS</p>
        <p style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.2">⚠️ HiperTMS — Pendências</p>
        <p style="margin:6px 0 0;color:#a1a1aa;font-size:13px">${date} · ${slotLabel} &nbsp;·&nbsp; ${totalAlerts} pendência${totalAlerts !== 1 ? 's' : ''} em ${sectors.filter((s) => (alertsBySector.get(s.key)?.total ?? 0) > 0).length} setor(es)</p>
      </td>
    </tr>

    ${cashSection}
    ${sections}

    <!-- CTA -->
    <tr>
      <td style="padding:16px 28px 24px;text-align:center">
        <a href="https://www.hipertms.com.br" style="display:inline-block;background:${this.UNIFIED_ACCENT};color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:700">Ver no HiperTMS →</a>
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

  // ─── Helpers ────────────────────────────────────────────────────────────────────────────

  /**
   * T8.6: busca a visão do caixa no TMS, cacheada em memória por tenant+dia —
   * 1 chamada TMS por tenant por dia, disparada pelo primeiro contato elegível
   * do dia (os demais reaproveitam o cache, mesmo tenant nunca chama de novo).
   * TMS null/erro também é cacheado (evita repetir a chamada o resto do dia) —
   * o digest sai normal sem o bloco (ver `buildUnifiedMessage`).
   */
  private async getCashViewForTenant(tenantId: string, now: Date): Promise<TmsCashView | null> {
    const todayStr = this.toDateStr(now);
    const cached = this.cashViewCache.get(tenantId);
    if (cached && cached.date === todayStr) return cached.value;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    if (!tenant) {
      this.cashViewCache.set(tenantId, { date: todayStr, value: null });
      return null;
    }

    const externalTenantId = resolveTmsTenantId(tenant.slug);
    const value = await this.tms.getCashView(externalTenantId);
    this.cashViewCache.set(tenantId, { date: todayStr, value });
    return value;
  }

  /**
   * Retorna a data como string 'YYYY-MM-DD' no fuso local do servidor.
   * Usado pelo mecanismo de catch-up (lastDigestDate) para detectar se o digest
   * já foi enviado hoje sem depender do Map em memória (que é limpo no restart).
   */
  toDateStr(d: Date): string {
    return (
      `${d.getFullYear()}-` +
      `${String(d.getMonth() + 1).padStart(2, '0')}-` +
      `${String(d.getDate()).padStart(2, '0')}`
    );
  }

  /**
   * Persiste o sectorConfig atualizado (com lastDigestDate por setor) de volta
   * ao banco para que o catch-up sobreviva a reinicializações do container.
   * Escreve o JSON completo — chamado após cada envio bem-sucedido de setor.
   */
  private async persistLastDigestDate(
    tenantId: string,
    sectorConfig: Record<string, SectorCfg>,
  ): Promise<void> {
    await this.prisma.tenantNotificationConfig.update({
      where: { tenantId },
      data: { sectorConfig: sectorConfig as any },
    });
  }

  /**
   * T6: persiste a lista de contatos atualizada (com lastDigestDate por setor)
   * de volta ao banco — mesmo papel de persistLastDigestDate, mas para o
   * modo per-contato. Escreve o array completo — chamado só quando algo mudou.
   */
  private async persistContacts(tenantId: string, contacts: ContactRecipient[]): Promise<void> {
    await this.prisma.tenantNotificationConfig.update({
      where: { tenantId },
      data: { contacts: contacts as any },
    });
  }

  /** Gera chave numérica única por janela de 5 min (para deduplicaCao). */
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
