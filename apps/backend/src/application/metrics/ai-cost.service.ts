/**
 * ai-cost.service.ts — quanto de IA cada cliente consome, e aviso quando foge do normal.
 *
 * ## Por que existe
 *
 * O custo por mensagem já era gravado (`aiMessage.estimatedCostUsd`), mas ninguém
 * olhava: não havia relatório, nem alerta, nem forma de responder "qual cliente está
 * caro?". Sem esse número, otimizar vira chute — você não sabe se o gasto vem de um
 * cliente grande (saudável) ou de uma conversa em loop (desperdício).
 *
 * O teto diário (`AI_DAILY_COST_CAP_USD`, no ConversationAgent) já impedia o estrago,
 * mas só avisa quando JÁ estourou. Este serviço serve para ver antes.
 *
 * ## O que ele NÃO faz
 *
 * Não cobra, não bloqueia e não decide nada. Só mede e avisa. O bloqueio continua
 * sendo do teto diário — misturar as duas coisas faria um relatório derrubar conversa.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AdminAlertService } from '@/application/monitor/admin-alert.service';

/** Gasto de um tenant numa janela. */
export interface TenantCost {
  tenantId: string;
  tenantName: string;
  messages: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** Custo médio por mensagem — o número que denuncia conversa em loop. */
  costPerMessageUsd: number;
}

export interface CostReport {
  since: Date;
  until: Date;
  totalUsd: number;
  tenants: TenantCost[];
}

/** Acima disto no dia, o admin é avisado mesmo sem o teto ter estourado. */
const ALERT_TENANT_USD = Number(process.env.AI_COST_ALERT_TENANT_USD ?? 15);
/** Custo médio por mensagem acima disto indica conversa anormal (loop, prompt gigante). */
const ALERT_PER_MESSAGE_USD = Number(process.env.AI_COST_ALERT_PER_MSG_USD ?? 0.05);

@Injectable()
export class AiCostService {
  private readonly logger = new Logger('AiCost');

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAlert: AdminAlertService,
  ) {}

  /**
   * Gasto por tenant numa janela.
   *
   * Agrupa no banco (`groupBy`) em vez de trazer as mensagens: a tabela cresce sem
   * teto e um relatório jamais pode virar o motivo de o backend cair.
   */
  async report(since: Date, until: Date = new Date()): Promise<CostReport> {
    const linhas = await this.prisma.aiMessage.groupBy({
      by: ['tenantId'],
      where: { createdAt: { gte: since, lte: until } },
      _sum: { estimatedCostUsd: true, tokensIn: true, tokensOut: true },
      _count: { _all: true },
    });

    const nomes = await this.tenantNames(linhas.map((l: any) => l.tenantId));

    const tenants: TenantCost[] = linhas
      .map((l: any) => {
        const messages = l._count?._all ?? 0;
        const costUsd = Number(l._sum?.estimatedCostUsd ?? 0);
        return {
          tenantId: l.tenantId,
          tenantName: nomes.get(l.tenantId) ?? l.tenantId,
          messages,
          tokensIn: Number(l._sum?.tokensIn ?? 0),
          tokensOut: Number(l._sum?.tokensOut ?? 0),
          costUsd,
          costPerMessageUsd: messages > 0 ? costUsd / messages : 0,
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd); // mais caro primeiro — é o que se quer ver

    return {
      since,
      until,
      totalUsd: tenants.reduce((s, t) => s + t.costUsd, 0),
      tenants,
    };
  }

  /** Atalho: hoje (desde 00:00 UTC). */
  today(): Promise<CostReport> {
    const d = new Date();
    return this.report(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
  }

  /** Atalho: mês corrente. */
  thisMonth(): Promise<CostReport> {
    const d = new Date();
    return this.report(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  }

  /**
   * Resumo diário no WhatsApp e no e-mail do admin, 23h UTC (20h no BR).
   *
   * No fim do dia de propósito: um resumo pela manhã falaria de um dia que ainda não
   * aconteceu. Silencioso quando não houve gasto — alerta que chega todo dia sem
   * novidade é alerta que ninguém lê.
   */
  @Cron('0 23 * * *')
  async dailyDigest(): Promise<void> {
    try {
      const [dia, mes] = await Promise.all([this.today(), this.thisMonth()]);
      if (dia.totalUsd <= 0) return;

      const linhas = dia.tenants
        .map(
          (t) =>
            `• ${t.tenantName}: US$ ${t.costUsd.toFixed(2)} ` +
            `(${t.messages} msgs · US$ ${t.costPerMessageUsd.toFixed(4)}/msg)`,
        )
        .join('\n');

      await this.adminAlert.notifyAdmin(
        `Custo de IA — hoje US$ ${dia.totalUsd.toFixed(2)}`,
        `Gasto de IA por cliente HOJE:\n\n${linhas}\n\n` +
          `Total do dia: US$ ${dia.totalUsd.toFixed(2)}\n` +
          `Total do mês: US$ ${mes.totalUsd.toFixed(2)}`,
      );
    } catch (e: any) {
      // Relatório nunca pode derrubar o scheduler — os outros jobs seguem.
      this.logger.error(`Resumo diário de custo falhou: ${e?.message}`);
    }
  }

  /**
   * Vigia de hora em hora: avisa ANTES de o teto diário cortar o cliente.
   *
   * Dois sinais diferentes, de propósito:
   *  - **gasto alto**: pode ser cliente grande e saudável — é informação;
   *  - **custo por mensagem alto**: quase nunca é saudável. Poucas conversas
   *    queimando muito é o padrão de bot-vs-bot ou de contexto inflado.
   */
  @Cron('0 * * * *')
  async checkSpikes(): Promise<void> {
    try {
      const dia = await this.today();
      for (const t of dia.tenants) {
        const caro = t.costUsd >= ALERT_TENANT_USD;
        const porMsg = t.messages >= 20 && t.costPerMessageUsd >= ALERT_PER_MESSAGE_USD;
        if (!caro && !porMsg) continue;
        if (this.jaAvisou(t.tenantId)) continue;

        const motivo = porMsg
          ? `custo por mensagem alto (US$ ${t.costPerMessageUsd.toFixed(4)}) — possível conversa em loop`
          : `gasto do dia acima de US$ ${ALERT_TENANT_USD}`;

        this.logger.warn(`Pico de custo: ${t.tenantName} — ${motivo}`);
        await this.adminAlert.notifyAdmin(
          `Custo de IA acima do normal — ${t.tenantName}`,
          `${t.tenantName} gastou US$ ${t.costUsd.toFixed(2)} hoje em ${t.messages} mensagens.\n\n` +
            `Motivo do aviso: ${motivo}.\n\n` +
            `O corte automático só acontece em US$ ${process.env.AI_DAILY_COST_CAP_USD ?? 25} ` +
            `(AI_DAILY_COST_CAP_USD). Este é um aviso ANTES disso.`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Vigia de custo falhou: ${e?.message}`);
    }
  }

  // ── internos ───────────────────────────────────────────────────────────────

  /** tenantId → dia do último alerta. Evita repetir o mesmo aviso a cada hora. */
  private readonly avisados = new Map<string, string>();

  private jaAvisou(tenantId: string): boolean {
    const hoje = new Date().toISOString().slice(0, 10);
    if (this.avisados.get(tenantId) === hoje) return true;
    this.avisados.set(tenantId, hoje);
    return false;
  }

  private async tenantNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.tenant
      .findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      .catch(() => [] as { id: string; name: string }[]);
    return new Map(rows.map((r: any) => [r.id, r.name]));
  }
}
