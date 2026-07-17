/**
 * ClosingReportService — T8 (2026-07-16): resumo de fechamento quinzenal/mensal
 * por contato (receita × custo × margem, vendas e caixa, comparado ao período
 * anterior).
 *
 * Contrato: docs/monitor/t8-fechamento-scheduler-2026-07.md (Nexa) +
 * hipertms_v12/docs/features/automation/t8-fechamento-endpoint-2026-07.md (TMS).
 *
 * Cron diário às 07:00 America/Sao_Paulo — só roda se `MONITOR_ENABLED=true`.
 *   - Dia 16   → só contatos com `closingReport='biweekly'`.
 *   - Dia 1º   → contatos 'biweekly' (mensagem única: fechamento da 2ª quinzena
 *                + bloco do mês, via `monthSummary`) E 'monthly' (mês completo).
 *   - Qualquer outro dia → no-op (log debug, sem tocar no TMS).
 *
 * UMA chamada ao TMS por (tenant, kind) — nunca uma por contato (T8.3). Dedup
 * por `contact.lastClosingDate` (YYYY-MM-DD), claim-before-send: persiste ANTES
 * de enviar (mesmo padrão do digest T7 — ver
 * `ConsolidationService.processPerContact`, "copiar, não recriar").
 *
 * Envio pelos MESMOS canais do digest T7: `MonitorNotificationService.notifyPhone`
 * (WhatsApp) e `EmailReplyService.sendAlertEmail` (e-mails) — nenhum canal novo.
 *
 * NÃO mexe no fluxo de pendências (T7), imediatos CRITICAL, nem no modo por
 * setor legado — arquivo inteiramente novo e isolado.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { HiperTmsConnector, type TmsClosingReport } from '@/application/connectors/hipertms.connector';
import { MonitorNotificationService } from './monitor-notification.service';
import { EmailReplyService } from '@/application/email/email-reply.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { resolveTmsTenantId } from './tms-tenant-id.util';
import { formatBRL, formatPct, variationPct, variationPts } from './money-format.util';
import { effectiveDelivery, type ContactRecipient, type ClosingReportKind } from './contact-recipient.types';
import { isWithinSendWindow, DEFAULT_SEND_WINDOW_START, DEFAULT_SEND_WINDOW_END } from './send-window.util';

@Injectable()
export class ClosingReportService {
  private readonly logger = new Logger('ClosingReportService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tms: HiperTmsConnector,
    private readonly notification: MonitorNotificationService,
    private readonly emailReply: EmailReplyService,
    private readonly lock: RedisLockService,
  ) {}

  private get enabled(): boolean {
    return (process.env.MONITOR_ENABLED ?? '').toLowerCase() === 'true';
  }

  /** Cron real — multi-instance guard via RedisLockService (mesmo padrão do tick de 5min do T7). */
  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async runDaily(): Promise<void> {
    const release = await this.lock.acquire('lock:closing-report:run', 20 * 60);
    if (!release) return;
    try {
      await this.runDailyLocked(new Date());
    } finally {
      await release();
    }
  }

  /**
   * Core testável — separado do decorator @Cron pra não depender de mockar
   * agendamento nos testes unitários. Recebe `now` explícito (mesmo padrão de
   * ConsolidationService.processForTenant).
   */
  async runDailyLocked(now: Date): Promise<{ tenants: number; sent: number }> {
    if (!this.enabled) {
      this.logger.debug('closing-report: tick pulado — MONITOR_ENABLED != true');
      return { tenants: 0, sent: 0 };
    }

    const day = now.getDate();
    if (day !== 1 && day !== 16) {
      this.logger.debug(`closing-report: dia ${day} não é 1º nem 16 — nada a fazer`);
      return { tenants: 0, sent: 0 };
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, slug: true },
    });
    const configs = await this.prisma.tenantNotificationConfig.findMany({
      where: { enabled: true },
      select: { tenantId: true, contacts: true, sendWindowStart: true, sendWindowEnd: true },
    });

    let sentTotal = 0;
    let tenantsWithSend = 0;
    const kinds: ClosingReportKind[] = day === 16 ? ['biweekly'] : ['biweekly', 'monthly'];

    for (const cfg of configs) {
      try {
        const tenant = tenants.find((t) => t.id === cfg.tenantId);
        if (!tenant) continue; // tenant existe na config mas não está mais ativo

        const allContacts = (cfg.contacts as ContactRecipient[] | null) ?? [];
        if (!allContacts.length) continue;

        // T9: janela geral de envio — fechamento NUNCA dispara fora dela (mesmo
        // princípio do digest T7/T8.6 em ConsolidationService), mesmo que o cron
        // rode fixo às 07:00 — um tenant pode ter configurado janela diferente.
        const windowStart = (cfg as any).sendWindowStart ?? DEFAULT_SEND_WINDOW_START;
        const windowEnd = (cfg as any).sendWindowEnd ?? DEFAULT_SEND_WINDOW_END;
        if (!isWithinSendWindow(now, windowStart, windowEnd)) {
          this.logger.log(
            `closing-report: tenant ${cfg.tenantId} fora da janela de envio (${windowStart}h-${windowEnd}h) — pulando`,
          );
          continue;
        }

        let tenantSent = 0;
        for (const kind of kinds) {
          if (kind === 'monthly' && day !== 1) continue; // segurança extra — monthly só no dia 1º
          const eligible = allContacts.filter((c) => c.closingReport === kind);
          if (!eligible.length) continue; // sem contato pra este kind → nunca chama o TMS
          tenantSent += await this.processTenantKind(cfg.tenantId, tenant.slug, allContacts, eligible, kind, now);
        }

        if (tenantSent > 0) tenantsWithSend++;
        sentTotal += tenantSent;
      } catch (e: any) {
        this.logger.warn(`closing-report: falhou para tenant ${cfg.tenantId}: ${e?.message}`);
      }
    }

    this.logger.log(`closing-report: dia ${day} — ${tenantsWithSend} tenant(s) com envio, ${sentTotal} envio(s) no total`);
    return { tenants: tenantsWithSend, sent: sentTotal };
  }

  /** Processa 1 (tenant, kind): 1 chamada ao TMS, N contatos elegíveis. */
  private async processTenantKind(
    tenantId: string,
    slug: string,
    allContacts: ContactRecipient[],
    eligible: ContactRecipient[],
    kind: ClosingReportKind,
    now: Date,
  ): Promise<number> {
    const todayStr = this.toDateStr(now);

    // Dedup ANTES de chamar o TMS — se todos os elegíveis já foram hoje (ex.: tick
    // rerodou após restart), nem gasta a chamada.
    const pending = eligible.filter((c) => c.lastClosingDate !== todayStr);
    if (!pending.length) return 0;

    const externalTenantId = resolveTmsTenantId(slug);
    const report = await this.tms.getClosingReport(externalTenantId, kind === 'biweekly' ? 'biweekly' : 'monthly', todayStr);
    if (!report) {
      this.logger.warn(
        `closing-report: TMS retornou null pra tenant ${tenantId} (kind=${kind}, refDate=${todayStr}) — nenhum envio`,
      );
      return 0;
    }

    const message = this.buildClosingMessage(report, kind, now);
    let sentCount = 0;

    for (const contact of pending) {
      try {
        // Claim-before-send — persiste ANTES de enviar (mesmo padrão do T7):
        // pior cenário de queda no meio do envio é 1 envio perdido (recuperável
        // no próximo dia 1º/16), nunca um duplicado.
        contact.lastClosingDate = todayStr;
        await this.persistContacts(tenantId, allContacts);

        // T9: matriz efetiva de entrega — único ponto de derivação (nunca
        // reimplementar, ver `effectiveDelivery`). Ex. do doc: closing com
        // whatsapp=false e email=true → só e-mails.
        const delivery = effectiveDelivery(contact);

        if (contact.whatsapp && delivery.closing.whatsapp) {
          await this.notification.notifyPhone(tenantId, contact.whatsapp, message);
          this.logger.log(`closing-report: contato ${contact.id} (kind=${kind}) → WhatsApp ${contact.whatsapp}`);
        } else if (contact.whatsapp) {
          this.logger.debug(
            `closing-report: contato ${contact.id} (kind=${kind}) — WhatsApp desligado na matriz de entrega, não enviado`,
          );
        }
        if (contact.emails?.length && delivery.closing.email) {
          const subject = `📊 HiperTMS — Fechamento ${report.period.label}`;
          for (const email of contact.emails) {
            const result = await this.emailReply.sendAlertEmail(email, subject, message, tenantId);
            if (result.sent) {
              this.logger.log(`closing-report: contato ${contact.id} (kind=${kind}) → e-mail ${email}`);
            } else {
              this.logger.warn(`closing-report: falha e-mail contato ${contact.id} → ${email}: ${result.reason}`);
            }
          }
        }
        sentCount++;
      } catch (e: any) {
        this.logger.warn(`closing-report: falha ao processar contato ${contact.id} (tenant=${tenantId}): ${e?.message}`);
      }
    }

    return sentCount;
  }

  // ─── Formato da mensagem (T8.4 — mockup aprovado, seguir à risca) ───────────

  private buildClosingMessage(report: TmsClosingReport, kind: ClosingReportKind, now: Date): string {
    const margem = report.revenue.current - report.costs.current;
    const margemPct = report.revenue.current !== 0 ? margem / report.revenue.current : 0;
    const prevMargem = report.revenue.previous - report.costs.previous;
    const prevMargemPct = report.revenue.previous ? prevMargem / report.revenue.previous : undefined;

    const overdueCountLabel = `${report.cash.overdueOpenCount} conta${report.cash.overdueOpenCount !== 1 ? 's' : ''}`;

    const lines: string[] = [
      `📊 HiperTMS — Fechamento ${report.period.label}`,
      `${report.period.start} a ${report.period.end}`,
      '',
      '📈 RECEITA × CUSTO',
      `• Receita: ${formatBRL(report.revenue.current)}${variationPct(report.revenue.current, report.revenue.previous)}`,
      `• Custos: ${formatBRL(report.costs.current)}${variationPct(report.costs.current, report.costs.previous)}`,
      `• Margem: ${formatBRL(margem)} · ${formatPct(margemPct, 1)}${variationPts(margemPct, prevMargemPct)}`,
      '',
      '🤝 VENDAS',
      `• ${report.sales.quotesCreated} cotações · ${report.sales.quotesConverted} fechadas (${formatPct(report.sales.conversionRate)})`,
      `• Ticket médio: ${formatBRL(report.sales.avgTicket.current)}${variationPct(report.sales.avgTicket.current, report.sales.avgTicket.previous)}`,
      `• ${report.sales.shipmentsCompleted} embarques concluídos`,
      '',
      '💳 CAIXA',
      `• Recebido no período: ${formatBRL(report.cash.receivedInPeriod)}`,
      `• Vencido em aberto: ${formatBRL(report.cash.overdueOpenAmount)} (${overdueCountLabel})`,
      // TMS não envia `previous` pra cash — sem base de comparação, nunca mostra seta aqui.
      `• Inadimplência: ${formatPct(report.cash.delinquencyRate, 1)}`,
    ];

    // T8.4: no dia 1º pro quinzenal, a mensagem é ÚNICA — fechamento da 2ª
    // quinzena + linha do resultado do mês. `monthSummary` só existe no contrato
    // do TMS pro caso kind=biweekly+refDate dia 1º — usar a PRESENÇA do campo
    // como gatilho (contrato-driven), não recalcular "dia===1" aqui de novo.
    if (kind === 'biweekly' && report.monthSummary) {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthLabel = prevMonth.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
      const monthMargem = report.monthSummary.revenue - report.monthSummary.costs;
      lines.push(
        '',
        `📅 MÊS DE ${monthLabel}: Receita ${formatBRL(report.monthSummary.revenue)} · ` +
          `Custos ${formatBRL(report.monthSummary.costs)} · Margem ${formatBRL(monthMargem)}`,
      );
    }

    // Mesmo template pro mensal — se vier highlights (qualquer kind), acrescenta o bloco.
    if (report.highlights?.topCustomer) {
      lines.push('', '🏆 DESTAQUES', `• Top cliente: ${report.highlights.topCustomer.name} — ${formatBRL(report.highlights.topCustomer.revenue)}`);
    }

    lines.push('', 'Relatório completo: app.hipertms.com.br');
    return lines.join('\n');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private toDateStr(d: Date): string {
    return (
      `${d.getFullYear()}-` +
      `${String(d.getMonth() + 1).padStart(2, '0')}-` +
      `${String(d.getDate()).padStart(2, '0')}`
    );
  }

  private async persistContacts(tenantId: string, contacts: ContactRecipient[]): Promise<void> {
    await this.prisma.tenantNotificationConfig.update({
      where: { tenantId },
      data: { contacts: contacts as any },
    });
  }
}
