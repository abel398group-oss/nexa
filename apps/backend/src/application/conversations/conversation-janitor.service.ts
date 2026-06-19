/**
 * ConversationJanitorService
 *
 * Aplica as regras automáticas de fechamento do módulo COMERCIAL:
 *
 *   Regra 1 — opt_out   → fechamento imediato (feito em whatsapp.service.ts)
 *   Regra 3 — WON       → fechamento imediato (feito em conversations.service.ts setOutcome)
 *   Regra 4 — LOST      → fechamento imediato (feito em conversations.service.ts setOutcome)
 *   Regra 2 — Inatividade → 7 dias sem mensagem → CLOSED com outcome=no_response  ← aqui
 *
 * Roda a cada hora.
 *
 * Ajuste 1: não fechar waiting_internal nem escalated.
 *   waiting_internal = aguardando AÇÃO DA EQUIPE, não inércia do lead.
 *   escalated        = em tratamento humano ativo.
 *   Fechamento nesses casos é responsabilidade da equipe/vendedor.
 *   Janitor age apenas sobre: open | waiting_customer.
 *
 * Ajuste 3: não fechar clientes ativos com no_response.
 *   cliente_ativo/cliente_novo usam lógica de suporte (RESOLVED→48h→CLOSED).
 *   Janitor filtra apenas conversas de leads/prospects (customerStage = lead).
 *
 * TODO (débito técnico): substituir check de customerStage por
 *   HiperTmsConnector.getCustomerStatus() quando subir para DigitalOcean.
 *   Hoje usa o campo local customerStage para não bater no banco do TMS em loop.
 *
 * NOTA FUTURA — Módulo de Suporte (quando for iniciar):
 *   Suporte usa fluxo diferente: RESOLVED → aguarda 48h → AUTO CLOSED.
 *   Adicionar branch aqui usando status 'resolved' (a criar no enum).
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';

const INACTIVITY_DAYS = Number(process.env.CONVERSATION_INACTIVITY_DAYS ?? 7);

@Injectable()
export class ConversationJanitorService {
  private readonly logger = new Logger('ConversationJanitor');

  constructor(private readonly prisma: PrismaService) {}

  @Interval(60 * 60 * 1000) // roda a cada hora
  async closeInactiveConversations() {
    // ── Suporte: RESOLVED → 48h → CLOSED (ADR 015 D5) ────────────────────
    await this.closeResolvedSupport();
    // ── Comercial: lead inativo → 7 dias → CLOSED (no_response) ──────────
    await this.closeInactiveLeads();
  }

  // Branch de suporte: fecha conversas marcadas como resolvidas (resolvedAt set)
  // há mais de 48h sem nova mensagem do cliente.
  private async closeResolvedSupport() {
    const now = new Date();
    const resolved = await this.prisma.aiConversation.findMany({
      where: {
        customerStage: { in: ['cliente_ativo', 'cliente_novo'] as any },
        status: { notIn: ['closed', 'opt_out'] as any },
        autoCloseAt: { lte: now },
      } as any,
      select: { id: true },
    });

    if (!resolved.length) return;

    const ids = resolved.map((c: any) => c.id);
    await this.prisma.$transaction([
      this.prisma.aiConversation.updateMany({
        where: { id: { in: ids } },
        data: { status: 'closed' as any, outcome: 'resolved', outcomeAt: now, endedAt: now },
      }),
      this.prisma.conversationStageHistory.createMany({
        data: ids.map((id: any) => ({
          conversationId: id,
          fromStatus: 'open',
          toStatus: 'closed',
          fromOutcome: null,
          toOutcome: 'resolved',
          reason: 'resolvido_48h',
          changedAt: now,
        })),
      }),
    ]);

    this.logger.log(`Suporte: ${resolved.length} conversa(s) resolvida(s) → CLOSED (outcome=resolved)`);
  }

  // Branch comercial original (leads)
  private async closeInactiveLeads() {
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    // Ajuste 1: só fecha open e waiting_customer.
    //   waiting_internal = equipe deve agir (não o janitor)
    //   escalated        = em atendimento humano ativo
    //   opt_out/closed   = já encerrado
    //
    // Ajuste 3: só leads (customerStage = lead).
    //   cliente_ativo/cliente_novo usam lógica de suporte (RESOLVED→48h)
    const candidates = await this.prisma.aiConversation.findMany({
      where: {
        status: { in: ['open', 'waiting_customer'] as any },
        customerStage: 'lead',
        lastActivityAt: { lt: cutoff },
      },
      select: { id: true, phone: true },
    });

    if (!candidates.length) return;

    const ids = candidates.map((c: any) => c.id);
    const now = new Date();

    await this.prisma.$transaction([
      // Fecha as conversas
      this.prisma.aiConversation.updateMany({
        where: { id: { in: ids } },
        data: { status: 'closed' as any, outcome: 'no_response', outcomeAt: now, endedAt: now },
      }),
      // Grava histórico de stage para cada conversa fechada
      this.prisma.conversationStageHistory.createMany({
        data: ids.map((id: any) => ({
          conversationId: id,
          fromStatus: 'open', // pode ser open ou waiting_customer — histórico aproximado
          toStatus: 'closed',
          fromOutcome: null,
          toOutcome: 'no_response',
          reason: `inatividade_${INACTIVITY_DAYS}d`,
          changedAt: now,
        })),
      }),
    ]);

    this.logger.log(
      `Auto-fechamento: ${candidates.length} lead(s) inativo(s) há >${INACTIVITY_DAYS} dias → CLOSED (outcome=no_response)`,
    );
  }
}
