/**
 * ConversationJanitorService
 *
 * Regras automáticas de fechamento — roda a cada hora (@Interval).
 *
 * ── Módulo Comercial (leads) ────────────────────────────────────────────────
 *   Regra 1 — opt_out      → fechamento imediato (whatsapp.service.ts)
 *   Regra 3 — WON          → fechamento imediato (conversations.service.ts)
 *   Regra 4 — LOST         → fechamento imediato (conversations.service.ts)
 *   Regra 2 — Inatividade  → 7 dias sem mensagem → CLOSED (no_response)  ← closeInactiveLeads
 *
 * ── Módulo Suporte (ADR 015 D5) ────────────────────────────────────────────
 *   Regra S1 — Resolvido pela IA + 48h sem retorno → CLOSED (resolved)    ← closeResolvedSupport
 *   Regra S2 — Ticket aberto + 48h sem resposta    → CLOSED (no_response) ← closeNoResponseSupport
 *   (Escalado a humano → humano fecha manualmente — fora do escopo do janitor)
 *
 * Filtros aplicados em todos os branches:
 *   • Nunca fecha waiting_internal nem escalated (responsabilidade da equipe)
 *   • Branch comercial: só customerStage='lead'
 *   • Branch suporte:   só customerStage in ['cliente_ativo', 'cliente_novo']
 *                       E ticketCategory NOT NULL (ticket classificado)
 *
 * TODO: substituir check de customerStage por HiperTmsConnector.getCustomerStatus()
 *   quando subir para DigitalOcean — hoje usa campo local para evitar loop no TMS DB.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';

const INACTIVITY_DAYS = Number(process.env.CONVERSATION_INACTIVITY_DAYS ?? 7);
// Suporte: ticket sem resposta do cliente após N horas → fecha com no_response (ADR 015 D5)
const SUPPORT_INACTIVITY_HOURS = Number(process.env.SUPPORT_INACTIVITY_HOURS ?? 48);

@Injectable()
export class ConversationJanitorService {
  private readonly logger = new Logger('ConversationJanitor');

  constructor(private readonly prisma: PrismaService) {}

  @Interval(60 * 60 * 1000) // roda a cada hora
  async closeInactiveConversations() {
    // ── Suporte: RESOLVED → 48h → CLOSED (ADR 015 D5) ────────────────────
    await this.closeResolvedSupport();
    // ── Suporte: ticket aberto sem resposta do cliente → 48h → CLOSED ────
    await this.closeNoResponseSupport();
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

  // Branch de suporte: fecha tickets com clienteStage ativo que ficaram abertos sem
  // resposta do cliente por mais de SUPPORT_INACTIVITY_HOURS horas (ADR 015 D5 — 3ª regra).
  // Diferente do branch "resolved" (que usa autoCloseAt), aqui o cliente NÃO respondeu
  // às perguntas da Lia — o ticket fica parado em open/waiting_customer.
  private async closeNoResponseSupport() {
    const cutoff = new Date(Date.now() - SUPPORT_INACTIVITY_HOURS * 60 * 60 * 1000);
    const now = new Date();

    const candidates = await this.prisma.aiConversation.findMany({
      where: {
        customerStage: { in: ['cliente_ativo', 'cliente_novo'] as any },
        status: { in: ['open', 'waiting_customer'] as any },
        ticketCategory: { not: null },   // tem que ser um ticket de suporte classificado
        lastActivityAt: { lt: cutoff },
        resolvedAt: null,                // não fechar tickets que já foram resolvidos (usam autoCloseAt)
      } as any,
      select: { id: true },
    });

    if (!candidates.length) return;

    const ids = candidates.map((c: any) => c.id);

    await this.prisma.$transaction([
      this.prisma.aiConversation.updateMany({
        where: { id: { in: ids } },
        data: { status: 'closed' as any, outcome: 'no_response', outcomeAt: now, endedAt: now },
      }),
      this.prisma.conversationStageHistory.createMany({
        data: ids.map((id: any) => ({
          conversationId: id,
          fromStatus: 'open',
          toStatus: 'closed',
          toOutcome: 'no_response',
          reason: `suporte_sem_resposta_${SUPPORT_INACTIVITY_HOURS}h`,
          changedAt: now,
        })),
      }),
    ]);

    this.logger.log(
      `Suporte: ${candidates.length} ticket(s) sem resposta >${SUPPORT_INACTIVITY_HOURS}h → CLOSED (outcome=no_response)`,
    );
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
