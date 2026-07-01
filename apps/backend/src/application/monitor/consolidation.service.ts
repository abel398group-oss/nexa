/**
 * ConsolidationService — agrupa alertas abertos e dispara 1 mensagem por dia.
 *
 * Roda a cada 15 minutos (@Interval) mas só envia quando a hora local bater
 * com o `sendHour` configurado pelo tenant (padrão: 7h). Isso evita precisar
 * de um cron com tz — basta verificar se a hora atual == sendHour.
 *
 * Lógica de envio:
 *   - Agrupa AlertState abertos por severidade: CRITICAL → OVERDUE → DUE_SOON → INFO
 *   - Monta texto consolidado com emojis por severidade
 *   - Chama MonitorNotificationService.notify()
 *   - Atualiza notifiedAt + notifyCount em cada alerta enviado
 *   - Arquiva alertas com notifyCount >= 2 e sem resolução em 48h
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { MonitorNotificationService } from './monitor-notification.service';

const SEVERITY_ORDER = ['CRITICAL', 'OVERDUE', 'DUE_SOON', 'INFO'];
const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🔴',
  OVERDUE:  '🟠',
  DUE_SOON: '🟡',
  INFO:     '🔵',
};
const ARCHIVE_AFTER_NOTIFICATIONS = 2;
const ARCHIVE_AFTER_HOURS = 48;

@Injectable()
export class ConsolidationService {
  private readonly logger = new Logger('ConsolidationService');
  // Controle de envio: evita disparar mais de 1x na mesma hora
  private readonly sentThisHour = new Map<string, number>(); // tenantId → hora do último envio

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: MonitorNotificationService,
  ) {}

  private get enabled(): boolean {
    return (process.env.MONITOR_ENABLED ?? '').toLowerCase() === 'true';
  }

  @Interval(5 * 60 * 1000) // verifica a cada 5 minutos (permite granularidade de 5min no horário)
  async runConsolidation(): Promise<void> {
    if (!this.enabled) {
      this.logger.debug('tick pulado — MONITOR_ENABLED != true');
      return;
    }

    // ROOT-CAUSE FIX: a fonte da verdade é QUEM configurou notificação
    // (tenant_notification_configs.enabled=true), NÃO a tabela platform-admin
    // `tenants`. Os alertas usam tenantId cru (ex.: 'default'), que pode não ter
    // linha correspondente em `tenants` (seed-tenants é manual/SÓ ABEL e pode
    // nunca ter rodado no Postgres gerenciado). Quando não tinha, o loop iterava
    // vazio e o serviço ficava 100% silencioso — nenhum log, nenhum envio.
    const configs = await this.prisma.tenantNotificationConfig.findMany({
      where: { enabled: true },
      select: { tenantId: true },
    });

    // log em nível INFO (visível em produção): confirma que o @Interval está vivo
    // e quantos tenants estão elegíveis a cada tick.
    this.logger.log(`tick — ${configs.length} tenant(s) com notificação habilitada`);

    for (const { tenantId } of configs) {
      try {
        await this.processForTenant(tenantId);
      } catch (e: any) {
        this.logger.warn(`Consolidation falhou para tenant ${tenantId}: ${e?.message}`);
      }
    }
  }

  /** Força o envio imediato para um tenant, ignorando hora e deduplicação (debug/teste). */
  async forceForTenant(tenantId: string): Promise<{ sent: boolean; alerts: number }> {
    const count = await this.processForTenant(tenantId, true);
    return { sent: count > 0, alerts: count };
  }

  private async processForTenant(tenantId: string, force = false): Promise<number> {
    const config = await this.prisma.tenantNotificationConfig.findUnique({ where: { tenantId } });

    // Tenant precisa ter habilitado explicitamente as notificações
    if (!force && !config?.enabled) return 0;

    const sendHour = config?.sendHour ?? Number(process.env.MONITOR_DEFAULT_SEND_HOUR ?? 7);
    const sendWeekends = config?.sendWeekends ?? false;

    const sendMinute = config?.sendMinute ?? 0;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0=dom 6=sáb
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (!force) {
      // ATENÇÃO TZ: getHours()/getMinutes() usam o fuso do processo (env TZ).
      // Em produção o container sobe em UTC (compose não define TZ) → sendHour é
      // interpretado como UTC. Se algum dia definirem TZ=America/Sao_Paulo, o
      // sendHour passa a ser horário de Brasília. O log abaixo torna isso explícito.
      if (currentHour !== sendHour) {
        this.logger.debug(
          `[${tenantId}] fora da hora (agora=${currentHour}h alvo=${sendHour}h TZ=${process.env.TZ ?? 'UTC(default)'})`,
        );
        return 0;
      }
      // Verifica se estamos na janela de 5 min do minuto configurado
      if (currentMinute < sendMinute || currentMinute >= sendMinute + 5) {
        this.logger.debug(
          `[${tenantId}] fora da janela (min=${currentMinute} alvo=${sendMinute}-${sendMinute + 5})`,
        );
        return 0;
      }
      if (isWeekend && !sendWeekends) {
        this.logger.debug(`[${tenantId}] fim de semana e sendWeekends=false — pulando`);
        return 0;
      }
    }

    // Evita reenviar na mesma janela (chave inclui hora+minuto arredondado p/ 15min)
    const lastSentHour = this.sentThisHour.get(tenantId);
    const slotMinute = Math.floor(currentMinute / 5) * 5;
    const currentHourKey = now.getFullYear() * 10000000 + now.getMonth() * 100000 + now.getDate() * 1000 + currentHour * 100 + slotMinute / 5;
    if (!force && lastSentHour === currentHourKey) return 0;

    const alerts = await this.prisma.alertState.findMany({
      where: {
        tenantId,
        status: 'open',
        OR: [
          { snoozedUntil: null },
          { snoozedUntil: { lt: now } },
        ],
      },
    });

    if (alerts.length === 0) return 0;

    // Agrupa por severidade
    const grouped = SEVERITY_ORDER.reduce<Record<string, typeof alerts>>((acc, s) => {
      acc[s] = alerts.filter((a: (typeof alerts)[number]) => a.severity === s);
      return acc;
    }, {});

    const lines: string[] = [`*📊 Resumo de Alertas — ${now.toLocaleDateString('pt-BR')}*\n`];
    for (const sev of SEVERITY_ORDER) {
      const group = grouped[sev];
      if (!group.length) continue;
      lines.push(`${SEVERITY_EMOJI[sev]} *${sev}* (${group.length})`);
      group.slice(0, 5).forEach((a) => lines.push(`  • ${a.title}`));
      if (group.length > 5) lines.push(`  … e mais ${group.length - 5} itens`);
    }
    lines.push('\nAcesse o painel do Nexa para mais detalhes.');

    const message = lines.join('\n');
    await this.notification.notify(tenantId, message);
    if (!force) this.sentThisHour.set(tenantId, currentHourKey);

    // Atualiza notifiedAt e notifyCount
    const alertIds = alerts.map((a) => a.id);
    await this.prisma.alertState.updateMany({
      where: { id: { in: alertIds } },
      data: { notifiedAt: now, notifyCount: { increment: 1 } },
    });

    // Arquiva alertas notificados >= 2x e sem resolução em 48h
    const archiveCutoff = new Date(now.getTime() - ARCHIVE_AFTER_HOURS * 60 * 60 * 1000);
    await this.prisma.alertState.updateMany({
      where: {
        id: { in: alertIds },
        notifyCount: { gte: ARCHIVE_AFTER_NOTIFICATIONS },
        createdAt: { lt: archiveCutoff },
      },
      data: { status: 'archived' },
    });

    this.logger.log(`Consolidation: ${alerts.length} alerta(s) notificado(s) para tenant ${tenantId}`);
    return alerts.length;
  }
}
