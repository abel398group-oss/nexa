import { Injectable, Logger } from '@nestjs/common';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';
import { CaseClassifierAgentService } from './case-classifier-agent.service';
import { DiagnosticAgentService } from './diagnostic-agent.service';
import { ResolutionAgentService } from './resolution-agent.service';
import { EscalationAgentService } from './escalation-agent.service';
import { TicketIntelligenceService } from './ticket-intelligence.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationsService } from '@/application/notifications/notifications.service';

const MODEL = AI_MODEL;

export interface AgentReply {
  draft: string;
  usedKnowledge: { id: string; title: string; score: number }[];
  allowedFacts: string;
  confidence: 'high' | 'low';
  needsHuman: boolean;
  model: string;
  autonomyEnabled: boolean;
  autoSent: boolean;
  usage?: { tokensIn: number; tokensOut: number; costUsd: number };
  // suporte extra
  ticketCategory?: string;
  ticketPriority?: string;
  rootCause?: string | null;
  resolved?: boolean;
}

@Injectable()
export class SupportAgentService {
  private readonly logger = new Logger('SupportAgent');

  constructor(
    private readonly conversations: ConversationsService,
    private readonly ai: AnthropicService,
    private readonly classifier: CaseClassifierAgentService,
    private readonly diagnostic: DiagnosticAgentService,
    private readonly resolution: ResolutionAgentService,
    private readonly escalation: EscalationAgentService,
    private readonly intelligence: TicketIntelligenceService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async ask(
    tenantId: string,
    input: {
      question: string;
      conversationId?: string;
      tmsCustomer?: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean; plan?: string } | null;
    },
  ): Promise<AgentReply> {

    // Histórico recente
    const history = input.conversationId
      ? (await this.conversations.getMessages(tenantId, input.conversationId))
          .slice(-10)  // suporte precisa de mais contexto que vendas (conversas mais longas)
          .map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Lia'}: ${m.content}`)
          .join('\n')
      : '';

    // ── 1. CLASSIFICAÇÃO ────────────────────────────────────────────────────
    const classification = await this.classifier.classify(input.question, history);
    this.logger.debug(`[Support] classificação: ${classification.category}/${classification.priority}`);

    // ── 2. DIAGNÓSTICO ──────────────────────────────────────────────────────
    const tmsForDiag = input.tmsCustomer?.externalId
      ? { externalId: input.tmsCustomer.externalId, name: input.tmsCustomer.name, plan: input.tmsCustomer.plan }
      : null;

    const diag = await this.diagnostic.diagnose({
      message: input.question,
      category: classification.category,
      history,
      tmsCustomer: tmsForDiag,
    });

    // Se diagnóstico precisa de mais info → retorna perguntas
    if (diag.needsMoreInfo && diag.questionsToAsk.length > 0) {
      const draft = diag.questionsToAsk.join('\n');
      await this.persistTicketFields(input.conversationId, classification.category, classification.priority, null);
      return this.buildReply(draft, [], '', 'high', false, classification, null, false);
    }

    // ── 3. RESOLUÇÃO ────────────────────────────────────────────────────────
    const resol = await this.resolution.resolve({
      tenantId,
      message: input.question,
      category: classification.category,
      priority: classification.priority,
      diagnostic: diag,
      history,
      tmsCustomer: input.tmsCustomer ? { name: input.tmsCustomer.name } : null,
    });

    // ── 4. ESCALONAMENTO ────────────────────────────────────────────────────
    const escalationDecision = this.escalation.decide({
      category: classification.category,
      priority: classification.priority,
      diagnostic: diag,
      resolution: resol,
      requiresHumanFromClassifier: classification.requiresHuman,
    });

    // Se escalate=true mas message='' (ex.: unresolved_no_kb_match), usa o draft do ResolutionAgent
    // que já explica ao cliente que vai encaminhar para um especialista.
    let draft = escalationDecision.escalate && escalationDecision.message
      ? escalationDecision.message
      : resol.draft;
    const needsHuman = escalationDecision.escalate;

    // Notifica a equipe quando há escalonamento (ADR 015 D6 + docs/features/escalation-notifications)
    if (needsHuman) {
      const link = input.conversationId ? `/inbox/${input.conversationId}` : undefined;
      await this.notifications.create(tenantId, {
        type: 'escalation',
        title: '🔴 Escalonamento — atendimento humano necessário',
        body: `Categoria: ${classification.category} · Prioridade: ${classification.priority} · Motivo: ${escalationDecision.reason ?? 'não especificado'}`,
        link,
      });
    }

    // Se IA resolveu → marca resolvedAt e agenda autoCloseAt (+48h)
    // Dispara Lúcio (TicketIntelligence) imediatamente — sem esperar o @Interval de 30min
    if (!needsHuman && resol.resolved) {
      await this.markResolved(input.conversationId);
      if (input.conversationId) {
        const conv = await this.prisma.aiConversation
          .findUnique({
            where: { id: input.conversationId },
            select: { id: true, tenantId: true, ticketCategory: true, ticketPriority: true, rootCause: true, outcome: true, resolvedAt: true, stageHistory: { where: { toStatus: 'escalated' }, select: { id: true }, take: 1 } },
          })
          .catch(() => null);
        if (conv) {
          this.intelligence.analyze(conv as any).catch((e: any) =>
            this.logger.warn(`TicketIntelligence.analyze falhou: ${e?.message}`),
          );
        }
      }
    }

    // Persistir campos de ticket na conversa
    await this.persistTicketFields(
      input.conversationId,
      classification.category,
      classification.priority,
      diag.rootCause ?? null,
    );

    return this.buildReply(
      draft,
      resol.usedKnowledge,
      resol.allowedFacts,   // KB usado → Supervisora pode auditar alucinações
      resol.confidence,
      needsHuman,
      classification,
      diag.rootCause ?? null,
      resol.resolved,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildReply(
    draft: string,
    usedKnowledge: AgentReply['usedKnowledge'],
    allowedFacts: string,
    confidence: 'high' | 'low',
    needsHuman: boolean,
    classification: { category: string; priority: string },
    rootCause: string | null,
    resolved: boolean,
  ): AgentReply {
    return {
      draft,
      usedKnowledge,
      allowedFacts,
      confidence,
      needsHuman,
      model: MODEL,
      autonomyEnabled: false,
      autoSent: false,
      ticketCategory: classification.category,
      ticketPriority: classification.priority,
      rootCause,
      resolved,
    };
  }

  private async persistTicketFields(
    conversationId: string | undefined,
    category: string,
    priority: string,
    rootCause: string | null,
  ) {
    if (!conversationId) return;
    try {
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: {
          ticketCategory: category,
          ticketPriority: priority,
          ...(rootCause ? { rootCause } : {}),
        },
      });
    } catch (e: any) {
      this.logger.warn(`persistTicketFields falhou: ${e?.message}`);
    }
  }

  private async markResolved(conversationId: string | undefined) {
    if (!conversationId) return;
    try {
      const now = new Date();
      const autoCloseAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // +48h
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { resolvedAt: now, autoCloseAt },
      });
    } catch (e: any) {
      this.logger.warn(`markResolved falhou: ${e?.message}`);
    }
  }
}
