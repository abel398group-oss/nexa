import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { ConversationsService } from '@/application/conversations/conversations.service';

/**
 * Intent da mensagem automática de "estamos vendo o seu caso".
 *
 * É a chave de idempotência: a regra de SLA redispara a cada ciclo enquanto ninguém
 * atender, e a existência de UMA mensagem com este intent é o que impede o cliente
 * de receber o mesmo aviso repetidamente.
 */
const SLA_ACK_INTENT = 'sla_ack';

@Injectable()
export class ProactiveExecutorService {
  private readonly logger = new Logger(ProactiveExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly autonomy: AutonomyService,
    private readonly notifications: NotificationsService,
    private readonly conversations: ConversationsService,
  ) {}

  /** Processes all OPEN events and dispatches L1/L2/L3 actions. */
  async executeAll(): Promise<void> {
    const events = await this.prisma.pendingConversationEvent.findMany({
      where: { status: 'OPEN', level: { in: ['L1', 'L2', 'L3'] } },
      orderBy: { createdAt: 'asc' },
      take: 200, // safety cap per cycle
    });

    for (const ev of events) {
      try {
        await this.dispatch(ev);
      } catch (err) {
        this.logger.error(`[executor] error on event ${ev.id} (${ev.ruleId}): ${(err as Error).message}`);
      }
    }
  }

  // ─── Dispatcher ────────────────────────────────────────────────────────────

  private async dispatch(ev: {
    id: string;
    tenantId: string;
    ruleId: string;
    subjectId: string;
    level: string;
    severity: string;
    metadata: any;
  }): Promise<void> {
    switch (ev.ruleId) {
      case 'conversation.stale_open':    await this.handleStaleOpen(ev);    break;
      case 'conversation.lead_no_reply': await this.handleLeadNoReply(ev);  break;
      case 'conversation.sla_breach':    await this.handleSlaBreach(ev);    break;
      case 'campaign.followup_due':      await this.handleCampaignFollowup(ev); break;
      case 'ticket.auto_close':          await this.handleAutoClose(ev);    break;
      case 'conversation.digest':        await this.handleDigest(ev);       break;
      default:
        this.logger.warn(`[executor] unknown ruleId: ${ev.ruleId}`);
    }
  }

  // ─── Rule handlers ─────────────────────────────────────────────────────────

  /** L1 — notify operator of a stale open conversation. */
  private async handleStaleOpen(ev: any): Promise<void> {
    const idleMin: number = ev.metadata?.idleMin ?? 0;
    await this.notifications.create(ev.tenantId, {
      type: 'info',
      title: `Conversa parada há ${Math.floor(idleMin / 60)}h ${idleMin % 60}min`,
      body: 'Nenhuma mensagem enviada ou recebida desde então.',
      link: `/inbox/${ev.subjectId}`,
    });
    await this.resolveEvent(ev.id, 'RESOLVED');
  }

  /** L2 — suggest follow-up; if autonomy is on, fires the follow-up automatically. */
  private async handleLeadNoReply(ev: any): Promise<void> {
    if (ev.level === 'L2' && this.autonomy.isEnabled('whatsapp')) {
      // L2 auto-execute: flag conversation for Lia follow-up on next processing cycle.
      await this.prisma.aiConversation.updateMany({
        where: { id: ev.subjectId, tenantId: ev.tenantId },
        data: { status: 'open' as any }, // ensure it stays open so Lia can process it
      });
      // Emit follow-up event for ConversationAgent to pick up on next tick.
      await this.notifications.create(ev.tenantId, {
        type: 'info',
        title: 'Follow-up automático agendado',
        body: 'A Lia enviará uma mensagem de acompanhamento ao lead.',
        link: `/inbox/${ev.subjectId}`,
      });
      await this.resolveEvent(ev.id, 'AUTO_EXECUTED');
    } else {
      // L1 fallback — just notify.
      await this.notifications.create(ev.tenantId, {
        type: 'info',
        title: 'Lead parou de responder',
        body: `Sem retorno do lead há mais de ${Math.floor((ev.metadata?.idleMin ?? 0) / 60)}h.`,
        link: `/inbox/${ev.subjectId}`,
      });
      await this.resolveEvent(ev.id, 'RESOLVED');
    }
  }

  /**
   * L1 — SLA estourado num ticket escalado.
   *
   * Alerta o time E avisa o CLIENTE. Antes só existia o alerta interno: quem foi
   * escalado às 18h de sexta ficava sem nenhuma resposta até segunda, sem saber se
   * alguém tinha visto. A pessoa não sabe que existe fila — do lado dela é silêncio.
   *
   * O aviso é deliberadamente modesto: reconhece a espera e NÃO promete prazo, porque
   * o backend não tem como saber quando um humano vai pegar. Prometer "retorno em 1h"
   * e não cumprir é pior que o silêncio — vira a segunda quebra de confiança.
   */
  private async handleSlaBreach(ev: any): Promise<void> {
    await this.notifications.create(ev.tenantId, {
      type: 'escalation',
      title: '🚨 SLA em risco — ticket escalado sem atendimento',
      body: `Ticket escalado aguardando resposta humana além do prazo.`,
      link: `/inbox/${ev.subjectId}`,
    });

    await this.ackCustomerWaiting(ev.tenantId, ev.subjectId);
    await this.resolveEvent(ev.id, 'RESOLVED');
  }

  /**
   * Manda UMA mensagem de reconhecimento ao cliente que espera atendimento humano.
   *
   * Idempotente por conversa: a regra de SLA volta a disparar a cada ciclo enquanto
   * ninguém atender, e sem esta trava o cliente receberia "já estamos vendo" de
   * 15 em 15 minutos — o que irrita mais que o silêncio. A marca fica no metadata da
   * própria mensagem, então não precisa de coluna nova nem de estado em memória
   * (que se perderia no restart).
   *
   * Não depende do kill switch: isto não é a IA opinando, é aviso operacional de que
   * a mensagem foi recebida. Com a autonomia desligada o cliente continua merecendo
   * saber que não foi esquecido.
   */
  private async ackCustomerWaiting(tenantId: string, conversationId: string): Promise<void> {
    const jaAvisou = await this.prisma.aiMessage.findFirst({
      where: {
        tenantId,
        conversationId,
        direction: 'outbound' as any,
        intent: SLA_ACK_INTENT,
      },
      select: { id: true },
    });
    if (jaAvisou) return;

    try {
      await this.conversations.addMessage(tenantId, conversationId, {
        direction: 'outbound',
        content:
          'Oi! Só passando para dizer que sua mensagem está com a nossa equipe e ' +
          'ainda estamos cuidando dela. Assim que tivermos a resposta, retornamos por aqui.',
        intent: SLA_ACK_INTENT,
        metadata: { aiGenerated: false, automated: 'sla_ack' },
      });
      this.logger.log(`[executor] cliente avisado da espera (conv=${conversationId})`);
    } catch (err) {
      // O alerta interno já saiu; falhar aqui não pode impedir o evento de ser resolvido,
      // senão a fila de eventos entope e o time para de receber alerta de SLA.
      this.logger.warn(
        `[executor] não foi possível avisar o cliente (conv=${conversationId}): ${(err as Error).message}`,
      );
    }
  }

  /** L2 — campaign follow-up due. */
  private async handleCampaignFollowup(ev: any): Promise<void> {
    // Just notify for now; actual follow-up message requires SenderService integration.
    await this.notifications.create(ev.tenantId, {
      type: 'info',
      title: 'Follow-up de campanha pendente',
      body: 'Contato da campanha não respondeu após 48h.',
      link: `/campaigns`,
    });
    await this.resolveEvent(ev.id, 'RESOLVED');
  }

  /** L3 — auto-close resolved ticket with no new activity. */
  private async handleAutoClose(ev: any): Promise<void> {
    if (!this.autonomy.isEnabled()) {
      // Kill switch is off — skip autonomous action.
      await this.resolveEvent(ev.id, 'DISMISSED');
      return;
    }

    const now = new Date();
    await this.prisma.aiConversation.updateMany({
      where: { id: ev.subjectId, tenantId: ev.tenantId, status: { notIn: ['closed', 'opt_out'] as any[] } },
      data: { status: 'closed' as any, outcome: 'resolved', outcomeAt: now, endedAt: now },
    });

    this.logger.log(`[executor] auto-closed ticket ${ev.subjectId} (tenant ${ev.tenantId})`);
    await this.resolveEvent(ev.id, 'AUTO_EXECUTED');
  }

  /** L1 — end-of-day digest. */
  private async handleDigest(ev: any): Promise<void> {
    const count = await this.prisma.aiConversation.count({
      where: { tenantId: ev.tenantId, status: { in: ['open', 'escalated'] as any[] } },
    });
    if (count > 0) {
      await this.notifications.create(ev.tenantId, {
        type: 'info',
        title: `Digest diário: ${count} ticket(s) em aberto`,
        body: `${count} conversas ainda abertas ou escaladas no fim do dia.`,
        link: '/inbox',
      });
    }
    await this.resolveEvent(ev.id, 'RESOLVED');
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  private async resolveEvent(id: string, status: 'RESOLVED' | 'AUTO_EXECUTED' | 'DISMISSED'): Promise<void> {
    await this.prisma.pendingConversationEvent.update({
      where: { id },
      data: { status, resolvedAt: new Date() },
    });
  }
}
