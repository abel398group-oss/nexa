/**
 * ScaleWatchService — termômetro dos 3 gargalos de escala conhecidos
 * (docs/infra/monitoramento-gargalos-2026-07.md). SÓ LEITURA + 1 aviso; não
 * toca em regra de negócio.
 *
 * Mede: conexões do banco (vs max_connections), profundidade da fila de
 * dispatch e alertas na última hora. Quando uma métrica cruza o AMARELO (bem
 * antes do vermelho), avisa o admin no WhatsApp — no máximo 1x/dia por métrica.
 *
 * Objetivo: puxar os itens 2 e 3 do plano de escala NA HORA CERTA, com folga.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { MonitorDispatchService } from './monitor-dispatch.service';
import { AdminAlertService } from './admin-alert.service';

export type ScaleLevel = 'green' | 'yellow';

export interface ScaleMetric {
  value: number;
  limit: number;
  pct: number;
  level: ScaleLevel;
}

export interface ScaleSnapshot {
  db: ScaleMetric;
  dispatchQueue: ScaleMetric;
  alertsLastHour: ScaleMetric;
  overall: ScaleLevel;
  ts: string;
}

const pct = (v: number, limit: number) => (limit > 0 ? Math.round((v / limit) * 100) : 0);

@Injectable()
export class ScaleWatchService {
  private readonly logger = new Logger('ScaleWatch');
  /** Último dia (YYYY-MM-DD) em que cada métrica já avisou — dedup 1x/dia. */
  private readonly lastWarned = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: MonitorDispatchService,
    private readonly adminAlert: AdminAlertService,
  ) {}

  private get enabled(): boolean {
    return (process.env.SCALE_WATCH_ENABLED ?? 'true').toLowerCase() === 'true';
  }

  private get dbWarnPct(): number {
    return Number(process.env.SCALE_DB_WARN_PCT ?? 70);
  }

  private get queueWarn(): number {
    return Number(process.env.SCALE_QUEUE_WARN ?? 50);
  }

  private get alertsHourWarn(): number {
    const env = process.env.SCALE_ALERTS_HOUR_WARN;
    if (env) return Number(env);
    // auto: 70% do teto teórico (DISPATCH_MAX_PER_MINUTE × 60)
    const perMin = Number(process.env.DISPATCH_MAX_PER_MINUTE ?? 30);
    return Math.round(perMin * 60 * 0.7);
  }

  /** Conexões ativas no cluster vs max_connections. Best-effort — erro → 0/limite. */
  private async dbConnections(): Promise<{ used: number; max: number }> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ used: bigint; max: string }>>(
        `SELECT (SELECT count(*) FROM pg_stat_activity) AS used,
                current_setting('max_connections') AS max`,
      );
      const row = rows?.[0];
      return { used: Number(row?.used ?? 0), max: Number(row?.max ?? 0) };
    } catch (e: any) {
      this.logger.warn(`dbConnections falhou: ${e?.message}`);
      return { used: 0, max: 0 };
    }
  }

  private async alertsLastHour(): Promise<number> {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      return await this.prisma.notificationLog.count({ where: { sentAt: { gte: since } } });
    } catch (e: any) {
      this.logger.warn(`alertsLastHour falhou: ${e?.message}`);
      return 0;
    }
  }

  /** Foto atual dos 3 gargalos — usada pelo endpoint /health/scale e pelo tick. */
  async snapshot(): Promise<ScaleSnapshot> {
    const [{ used, max }, alerts] = await Promise.all([this.dbConnections(), this.alertsLastHour()]);
    const queue = this.dispatch.pending;

    const db: ScaleMetric = {
      value: used,
      limit: max,
      pct: pct(used, max),
      level: max > 0 && pct(used, max) >= this.dbWarnPct ? 'yellow' : 'green',
    };
    const dispatchQueue: ScaleMetric = {
      value: queue,
      limit: this.queueWarn,
      pct: pct(queue, this.queueWarn),
      level: queue >= this.queueWarn ? 'yellow' : 'green',
    };
    const alertsLastHour: ScaleMetric = {
      value: alerts,
      limit: this.alertsHourWarn,
      pct: pct(alerts, this.alertsHourWarn),
      level: alerts >= this.alertsHourWarn ? 'yellow' : 'green',
    };
    const overall: ScaleLevel =
      db.level === 'yellow' || dispatchQueue.level === 'yellow' || alertsLastHour.level === 'yellow'
        ? 'yellow'
        : 'green';

    return { db, dispatchQueue, alertsLastHour, overall, ts: new Date().toISOString() };
  }

  /** Verificador horário — avisa o admin quando algo entra no amarelo (1x/dia/métrica). */
  @Interval(60 * 60 * 1000)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    const snap = await this.snapshot();
    if (snap.overall !== 'yellow') return;

    const today = new Date().toISOString().slice(0, 10);
    const warnings: string[] = [];

    if (snap.db.level === 'yellow' && this.lastWarned.get('db') !== today) {
      warnings.push(
        `Conexões do banco em ${snap.db.value}/${snap.db.limit} (${snap.db.pct}%). ` +
          `Avaliar o pool — docs/infra/item1-pool-conexoes-2026-07.md.`,
      );
      this.lastWarned.set('db', today);
    }
    if (snap.dispatchQueue.level === 'yellow' && this.lastWarned.get('queue') !== today) {
      warnings.push(
        `Fila de alertas em ${snap.dispatchQueue.value} jobs (limiar ${snap.dispatchQueue.limit}). ` +
          `Avaliar a fila BullMQ — docs/infra/item2-fila-alerta-bullmq-2026-07.md.`,
      );
      this.lastWarned.set('queue', today);
    }
    if (snap.alertsLastHour.level === 'yellow' && this.lastWarned.get('alerts') !== today) {
      warnings.push(
        `${snap.alertsLastHour.value} alerta(s) na última hora (limiar ${snap.alertsLastHour.limit}). ` +
          `Aproximando do teto de envio — avaliar itens 2/3 do plano de escala.`,
      );
      this.lastWarned.set('alerts', today);
    }
    if (!warnings.length) return; // tudo já avisado hoje

    // Avisa nos DOIS canais (WhatsApp + e-mail) via AdminAlertService.
    const sent = await this.adminAlert.notifyAdmin('Nexa — atenção de escala', warnings.join('\n\n'));
    if (!sent.whatsapp && !sent.email) {
      this.logger.warn(`ScaleWatch amarelo mas nenhum canal de admin configurado — só log. ${warnings.join(' | ')}`);
      return;
    }
    this.logger.log(
      `ScaleWatch: aviso de escala enviado (wa=${sent.whatsapp} email=${sent.email}, ${warnings.length} métrica(s) no amarelo)`,
    );
  }
}
