/**
 * TicketIntelligenceService — ADR 019
 *
 * Analisa tickets de suporte fechados e gera inteligência:
 *
 *   D1-A  Recorrência  — mesma causa-raiz aparece N vezes em 30 dias → notifica + sugere playbook
 *   D1-B  Bug provável — categoria "erro_sistema" → alerta p/ time TMS investigar
 *   D1-C  Candidato KB — resolvido sem escalonamento → sugere documentar na Base de Conhecimento
 *
 * Roda via @Interval a cada 30 min (janela de 2h para pegar tickets recém-fechados).
 * Dedup interno: evita notificações duplicadas via findFirst antes de criar.
 *
 * Sem nova tabela — usa modelos já existentes (AiConversation + Notification).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationsService } from '@/application/notifications/notifications.service';

// Quantas ocorrências do mesmo rootCause (nos últimos WINDOW_DAYS) disparam o alerta.
const RECURRENCE_THRESHOLD = Number(process.env.TICKET_RECURRENCE_THRESHOLD ?? 3);
const RECURRENCE_WINDOW_DAYS = Number(process.env.TICKET_RECURRENCE_WINDOW_DAYS ?? 30);

// Janela retrospectiva de busca de tickets fechados (para não reprocessar o histórico inteiro).
const LOOK_BACK_HOURS = 2;

type TicketRow = {
  id: string;
  tenantId: string;
  ticketCategory: string | null;
  ticketPriority: string | null;
  rootCause: string | null;
  outcome: string | null;
  resolvedAt: Date | null;
  stageHistory: { id: string }[];
};

@Injectable()
export class TicketIntelligenceService {
  private readonly logger = new Logger('TicketIntelligence');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── @Interval: analisa tickets fechados nas últimas LOOK_BACK_HOURS ────────
  @Interval(30 * 60 * 1000)
  async runIntelligence(): Promise<void> {
    const windowStart = new Date(Date.now() - LOOK_BACK_HOURS * 60 * 60 * 1000);

    const recentlyClosed = await this.prisma.aiConversation.findMany({
      where: {
        status: 'closed' as any,
        ticketCategory: { not: null },
        endedAt: { gte: windowStart },
      } as any,
      select: {
        id: true,
        tenantId: true,
        ticketCategory: true,
        ticketPriority: true,
        rootCause: true,
        outcome: true,
        resolvedAt: true,
        stageHistory: {
          where: { toStatus: 'escalated' },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!recentlyClosed.length) return;
    this.logger.debug(`Analisando ${recentlyClosed.length} ticket(s) fechado(s) na janela`);

    for (const ticket of recentlyClosed) {
      await this.analyze(ticket as TicketRow).catch((err: any) =>
        this.logger.warn(`Intelligence falhou para ${ticket.id}: ${err?.message}`),
      );
    }
  }

  // ── Análise individual (também chamável externamente) ───────────────────────
  async analyze(ticket: TicketRow): Promise<void> {
    if (!ticket.ticketCategory) return;

    const wasEscalated = ticket.stageHistory.length > 0;
    const wasResolved  = ticket.outcome === 'resolved' || !!ticket.resolvedAt;

    // D1-A: Recorrência
    if (ticket.rootCause) {
      await this.detectRecurrence(
        ticket.tenantId,
        ticket.id,
        ticket.rootCause,
        ticket.ticketCategory,
      );
    }

    // D1-B: Bug provável
    if (ticket.ticketCategory === 'erro_sistema') {
      await this.alertBugProbable(ticket.tenantId, ticket.id, ticket.rootCause);
    }

    // D1-C: Candidato a artigo de KB (resolvido pela IA sem precisar de humano)
    if (wasResolved && !wasEscalated && ticket.rootCause) {
      await this.suggestKbArticle(
        ticket.tenantId,
        ticket.id,
        ticket.ticketCategory,
        ticket.rootCause,
      );
    }
  }

  // ── D1-A: Recorrência ───────────────────────────────────────────────────────
  private async detectRecurrence(
    tenantId: string,
    conversationId: string,
    rootCause: string,
    category: string | null,
  ): Promise<void> {
    const windowStart = new Date(
      Date.now() - RECURRENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    // Conta quantas outras conversas com a mesma causa-raiz foram fechadas na janela
    const count = await this.prisma.aiConversation.count({
      where: {
        tenantId,
        rootCause,
        id: { not: conversationId },
        ticketCategory: { not: null },
        createdAt: { gte: windowStart },
      } as any,
    });

    // Inclui o ticket atual: se total >= THRESHOLD, alerta
    if (count + 1 < RECURRENCE_THRESHOLD) return;

    const title = `🔁 Recorrência detectada (${count + 1}× em ${RECURRENCE_WINDOW_DAYS}d)`;

    // Dedup: não cria se já existe notificação com o mesmo título nas últimas 24h
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenantId,
        type: 'recurrence',
        title,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) return;

    await this.notifications.create(tenantId, {
      type: 'recurrence',
      title,
      body: `Causa: "${rootCause.slice(0, 120)}" · Categoria: ${category ?? 'n/a'}. Considere criar um playbook ou artigo de KB para automatizar a resolução.`,
      link: '/support',
    });

    this.logger.log(
      `Recorrência: ${count + 1}× "${rootCause.slice(0, 60)}" (tenant=${tenantId})`,
    );
  }

  // ── D1-B: Bug provável ──────────────────────────────────────────────────────
  private async alertBugProbable(
    tenantId: string,
    conversationId: string,
    rootCause: string | null,
  ): Promise<void> {
    // Dedup por conversationId: só 1 alerta por ticket
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenantId,
        type: 'bug_probable',
        body: { contains: conversationId.slice(0, 8) },
      },
    });
    if (existing) return;

    await this.notifications.create(tenantId, {
      type: 'bug_probable',
      title: '🐛 Bug provável no HiperTMS',
      body: `Chamado ${conversationId.slice(0, 8)} (categoria: erro_sistema) — Causa: "${(rootCause ?? 'não identificada').slice(0, 120)}". Verifique se é reproduzível e reporte ao time TMS.`,
      link: `/inbox/${conversationId}`,
    });

    this.logger.log(
      `Bug provável: conv ${conversationId.slice(0, 8)} (tenant=${tenantId})`,
    );
  }

  // ── D1-C: Candidato a KB ────────────────────────────────────────────────────
  private async suggestKbArticle(
    tenantId: string,
    conversationId: string,
    category: string | null,
    rootCause: string,
  ): Promise<void> {
    // Dedup por conversationId
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenantId,
        type: 'kb_candidate',
        body: { contains: conversationId.slice(0, 8) },
      },
    });
    if (existing) return;

    await this.notifications.create(tenantId, {
      type: 'kb_candidate',
      title: '📝 Candidato a artigo de KB',
      body: `Chamado ${conversationId.slice(0, 8)} resolvido pela IA sem escalonamento (${category ?? 'n/a'}): "${rootCause.slice(0, 120)}". Considere documentar na Base de Conhecimento.`,
      link: '/knowledge',
    });

    this.logger.log(
      `KB candidate: conv ${conversationId.slice(0, 8)} (tenant=${tenantId})`,
    );
  }
}
