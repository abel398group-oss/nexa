/**
 * DevWatchService — vigia 4 falhas silenciosas que hoje só iam pro LOG e avisa
 * o DESENVOLVEDOR (ALERT_ADMIN_PHONE + ALERT_ADMIN_EMAIL via AdminAlertService).
 *
 * NÃO substitui nada: os warns de log continuam iguais nos serviços de origem.
 * Este verificador só LÊ contadores/timestamps que os serviços já publicam e
 * promove pra alerta de dev. Roda de hora em hora, dedup 1x/dia por sinal.
 *
 * Os 4 sinais (docs/infra/monitoramento-gargalos-2026-07.md, seção dev):
 *   1. TMS parou de empurrar eventos (reconciliação achou muita coisa)
 *   2. Lia lenta (p95 acima do threshold)
 *   3. Queries lentas acumulando
 *   4. Cron parado (scheduler de digest / janitor / proactive sem rodar)
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AdminAlertService } from './admin-alert.service';
import { MonitorService } from './monitor.service';
import { ConsolidationService } from './consolidation.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { ConversationJanitorService } from '@/application/conversations/conversation-janitor.service';
import { ProactiveEngineCron } from '@/application/proactive-engine/proactive-engine.cron';
import { PrismaService } from '@/infra/prisma/prisma.service';

const MIN = 60 * 1000;

export interface AiCostSnapshot {
  today: { costUsd: number; tokensIn: number; tokensOut: number; budgetUsd: number; pct: number };
  month: { costUsd: number; tokensIn: number; tokensOut: number };
  ts: string;
}

@Injectable()
export class DevWatchService {
  private readonly logger = new Logger('DevWatch');
  private readonly lastWarned = new Map<string, string>(); // sinal → dia (dedup 1x/dia)
  private lastSlowQueryCount = 0; // baseline p/ medir o delta por janela

  constructor(
    private readonly adminAlert: AdminAlertService,
    private readonly prisma: PrismaService,
  ) {}

  private get dailyBudget(): number {
    return Number(process.env.AI_BUDGET_DAILY_USD ?? 0); // 0 = sem alerta de orçamento
  }

  /** Gasto/tokens da Anthropic (mensagens da Lia) hoje e no mês. Só leitura. */
  async aiCostSnapshot(): Promise<AiCostSnapshot> {
    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sum = async (since: Date) => {
      const agg = await this.prisma.aiMessage.aggregate({
        _sum: { estimatedCostUsd: true, tokensIn: true, tokensOut: true },
        where: { createdAt: { gte: since } },
      });
      return {
        costUsd: Number(agg._sum.estimatedCostUsd ?? 0),
        tokensIn: Number(agg._sum.tokensIn ?? 0),
        tokensOut: Number(agg._sum.tokensOut ?? 0),
      };
    };
    const [today, month] = await Promise.all([sum(startDay), sum(startMonth)]);
    const budget = this.dailyBudget;
    return {
      today: { ...today, budgetUsd: budget, pct: budget > 0 ? Math.round((today.costUsd / budget) * 100) : 0 },
      month,
      ts: now.toISOString(),
    };
  }

  private get enabled(): boolean {
    return (process.env.DEV_WATCH_ENABLED ?? 'true').toLowerCase() === 'true';
  }

  /** Idade em minutos de um timestamp; null → Infinity (nunca rodou). */
  private ageMin(ts: Date | null): number {
    return ts ? (Date.now() - ts.getTime()) / MIN : Infinity;
  }

  @Interval(60 * MIN)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    const today = new Date().toISOString().slice(0, 10);
    const alerts: string[] = [];
    const once = (key: string, msg: string) => {
      if (this.lastWarned.get(key) === today) return;
      alerts.push(msg);
      this.lastWarned.set(key, today);
    };

    // 1. TMS parou de empurrar — degradação detectada na última hora.
    if (this.ageMin(MonitorService.lastDegradedAt) < 65) {
      once(
        'tms_degraded',
        `📡 TMS→Nexa possivelmente degradado: a reconciliação achou eventos que o push não trouxe. ` +
          `Verificar se o TMS está enviando pro /monitor/ingest.`,
      );
    }

    // 2. Lia lenta — p95 acima do threshold.
    const warnMs = Number(process.env.LIA_LATENCY_WARN_MS ?? 15_000);
    const { p95Ms, samples } = ConversationAgentService.latency.percentiles();
    if (p95Ms !== null && samples >= 10 && p95Ms > warnMs) {
      once('lia_latency', `🐢 Lia lenta: p95 ${Math.round(p95Ms)}ms (acima de ${warnMs}ms) nas últimas ${samples} respostas.`);
    }

    // 3. Queries lentas acumulando — delta desde o último tick.
    const slowDelta = PrismaService.slowQueryCount - this.lastSlowQueryCount;
    this.lastSlowQueryCount = PrismaService.slowQueryCount;
    const slowWarn = Number(process.env.DEV_SLOW_QUERY_WARN ?? 20);
    if (slowDelta >= slowWarn) {
      once('slow_query', `🗄️ ${slowDelta} query(ies) lenta(s) na última hora (limiar ${slowWarn}). Possível índice faltando / N+1.`);
    }

    // 4. Cron parado — o mais crítico é o scheduler de digest (5 min): se parar,
    //    os alertas morrem em silêncio. Também janitor (1h) e proactive (15 min).
    const crons: Array<{ key: string; label: string; ts: Date | null; maxMin: number }> = [
      { key: 'cron_digest', label: 'scheduler de digest (5 min)', ts: ConsolidationService.lastTickAt, maxMin: 15 },
      { key: 'cron_janitor', label: 'janitor de conversas (1h)', ts: ConversationJanitorService.lastRunAt, maxMin: 150 },
      { key: 'cron_proactive', label: 'proactive engine (15 min)', ts: ProactiveEngineCron.lastRunAt, maxMin: 45 },
    ];
    for (const c of crons) {
      // Só alerta se JÁ rodou alguma vez (evita falso-positivo no boot) e passou do teto.
      if (c.ts !== null && this.ageMin(c.ts) > c.maxMin) {
        once(c.key, `⏰ Cron parado: ${c.label} sem rodar há ${Math.round(this.ageMin(c.ts))} min. Verificar o backend.`);
      }
    }

    // 5. Gasto da Anthropic hoje passou do orçamento diário (AI_BUDGET_DAILY_USD).
    if (this.dailyBudget > 0) {
      const cost = await this.aiCostSnapshot();
      if (cost.today.costUsd >= this.dailyBudget) {
        once(
          'ai_budget',
          `💸 Gasto Anthropic hoje: US$ ${cost.today.costUsd.toFixed(2)} ` +
            `(orçamento US$ ${this.dailyBudget.toFixed(2)}, ${cost.today.pct}%). ` +
            `${(cost.today.tokensIn + cost.today.tokensOut).toLocaleString('pt-BR')} tokens.`,
        );
      }
    }

    if (!alerts.length) return;
    const sent = await this.adminAlert.notifyAdmin('Nexa — atenção do dev', alerts.join('\n\n'));
    if (!sent.whatsapp && !sent.email) {
      this.logger.warn(`DevWatch: ${alerts.length} sinal(is) mas nenhum canal de admin — só log. ${alerts.join(' | ')}`);
      return;
    }
    this.logger.log(`DevWatch: aviso de dev enviado (wa=${sent.whatsapp} email=${sent.email}, ${alerts.length} sinal(is))`);
  }
}
