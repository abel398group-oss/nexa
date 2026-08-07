import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';
import { CaseClassifierAgentService } from './case-classifier-agent.service';
import { DiagnosticAgentService } from './diagnostic-agent.service';
import { ResolutionAgentService } from './resolution-agent.service';
import { EscalationAgentService } from './escalation-agent.service';
import { TicketIntelligenceService } from './ticket-intelligence.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { TicketSyncService } from '@/application/connectors/ticket-sync.service';
import { SUPPORT_SCRIPTS } from './support-scripts.const';

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
  /**
   * O draft é um literal do catálogo (`support-scripts.const.ts`) — texto que nós
   * escrevemos, sem nada gerado pela IA. O ConversationAgent usa isso para pular a
   * Supervisora (auditar um literal nosso não protege de nada e custa ~2s por
   * mensagem). A flag é CONFERIDA contra o catálogo antes de valer.
   */
  scripted?: boolean;
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
    private readonly ticketSync: TicketSyncService,
  ) {}

  async ask(
    tenantId: string,
    input: {
      question: string;
      conversationId?: string;
      tmsCustomer?: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean; plan?: string; page?: string | null } | null;
    },
  ): Promise<AgentReply> {

    // ── N2: CONFIRMAÇÃO DE RESOLUÇÃO ─────────────────────────────────────────
    // Se a conversa já tem resolvedAt + autoCloseAt e ainda está open/escalated,
    // estamos aguardando a confirmação do cliente ("Isso resolveu?").
    // A resposta atual é classificada como positiva/negativa/neutra.
    if (input.conversationId) {
      const conv = await this.prisma.aiConversation
        .findUnique({
          where: { id: input.conversationId },
          select: { resolvedAt: true, autoCloseAt: true, status: true, outcome: true, csatToken: true, csatScore: true },
        })
        .catch(() => null);

      // C1: CSAT intake via WhatsApp — ticket fechado com token + score ainda nulo + mensagem é "1"-"5"
      if (conv?.status === 'closed' && conv?.csatToken && (conv?.csatScore === null || conv?.csatScore === undefined)) {
        const score = parseInt(input.question.trim(), 10);
        if (!isNaN(score) && score >= 1 && score <= 5) {
          try {
            await this.prisma.aiConversation.update({
              where: { id: input.conversationId },
              data: { csatScore: score } as any,
            });
            this.logger.log(`C1 [CSAT-WA] conv=${input.conversationId} score=${score}`);
          } catch (e: any) {
            this.logger.warn(`C1 CSAT-WA update falhou: ${e?.message}`);
          }
          const draft =
            score >= 4 ? SUPPORT_SCRIPTS.csatAgradecimentoBom : SUPPORT_SCRIPTS.csatAgradecimentoRuim;
          return this.buildReply(draft, [], '', 'high', false, { category: 'suporte', priority: 'low' }, null, true, { scripted: true });
        }
      }

      const pendingConfirmation =
        !!conv?.resolvedAt && !!conv?.autoCloseAt && !conv?.outcome &&
        (conv?.status === 'open' || conv?.status === 'escalated');
      if (pendingConfirmation) {
        return this.handleCsatConfirmation(tenantId, input.conversationId, input.question);
      }
    }

    // Histórico recente
    const history = input.conversationId
      ? (await this.conversations.getMessages(tenantId, input.conversationId))
          .slice(-10)  // suporte precisa de mais contexto que vendas (conversas mais longas)
          .map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Lia'}: ${m.content}`)
          .join('\n')
      : '';

    // ── 0. SMALL TALK — curto-circuita o pipeline p/ saudações ─────────────
    if (this.isSmallTalk(input.question)) {
      await this.persistTicketFields(input.conversationId, 'treinamento', 'low', null);
      // Cumprimentar de novo numa conversa em andamento soa robótico. O corte de
      // saudação do ConversationAgent não roda em texto roteirizado (quebraria a
      // conferência do catálogo), então a escolha é feita aqui.
      return this.buildReply(
        history ? SUPPORT_SCRIPTS.saudacaoRepetida : SUPPORT_SCRIPTS.saudacao,
        [], '', 'high', false,
        { category: 'treinamento', priority: 'low' },
        null, true, { scripted: true },
      );
    }

    // A busca de KB depende só da mensagem — não da categoria nem do diagnóstico.
    // Disparada aqui, o embedding + a query pgvector correm em paralelo com as duas
    // chamadas de IA seguintes em vez de entrarem em série depois delas.
    const kbPromise = this.resolution.prefetchKnowledge(tenantId, input.question);

    // ── 1. CLASSIFICAÇÃO ────────────────────────────────────────────────────
    const classification = await this.classifier.classify(input.question, history);
    this.logger.debug(`[Support] classificação: ${classification.category}/${classification.priority}`);

    // ── 2. DIAGNÓSTICO ──────────────────────────────────────────────────────
    const tmsForDiag = input.tmsCustomer?.externalId
      ? { externalId: input.tmsCustomer.externalId, name: input.tmsCustomer.name, plan: input.tmsCustomer.plan, page: input.tmsCustomer.page }
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
      tmsCustomer: input.tmsCustomer ? { name: input.tmsCustomer.name, page: input.tmsCustomer.page } : null,
      knowledge: await kbPromise,
    });

    // ── 4. ESCALONAMENTO ────────────────────────────────────────────────────
    const escalationDecision = this.escalation.decide({
      message: input.question,
      category: classification.category,
      priority: classification.priority,
      diagnostic: diag,
      resolution: resol,
      requiresHumanFromClassifier: classification.requiresHuman,
    });

    // Escalar NÃO pode apagar a resposta.
    //
    // Incidente do CT-e 519 (2026-08-07): o diagnóstico achou o código na tabela do
    // connector, a Resolução montou a orientação a partir do artigo de KB e marcou
    // resolved=true — e a matriz escalou assim mesmo (o classificador pediu humano).
    // Como o aviso de transbordo SUBSTITUÍA o draft, a orientação foi parar só no
    // resumo do chamado: visível para o atendente, nunca para quem perguntou. O
    // cliente ouviu "não consegui identificar a solução" com a solução pronta.
    //
    // Agora, caso resolvido que escala mesmo assim entrega a solução E o aviso.
    // Quando NÃO houve resolução, o draft do ResolutionAgent já diz que vai
    // encaminhar — e escalationDecision.message vem vazio ('unresolved_no_kb_match').
    let draft: string;
    let scripted = false;
    if (escalationDecision.escalate && escalationDecision.message) {
      if (resol.resolved && resol.draft.trim()) {
        draft = `${resol.draft}\n\n${escalationDecision.message}`;
      } else {
        draft = escalationDecision.message;
        scripted = true; // literal do catálogo, sem texto gerado junto
      }
    } else {
      draft = resol.draft;
    }
    const needsHuman = escalationDecision.escalate;

    // Notifica a equipe quando há escalonamento (ADR 015 D6 + docs/features/escalation-notifications)
    if (needsHuman) {
      const link = input.conversationId ? `/inbox/${input.conversationId}` : undefined;
      await this.notifications.create(tenantId, {
        type: 'escalation',
        title: '🔴 Escalonamento — atendimento humano necessário',
        body: escalationDecision.summary
          ?? `Categoria: ${classification.category} · Prioridade: ${classification.priority} · Motivo: ${escalationDecision.reason ?? 'não especificado'}`,
        link,
      });
      // Persiste o resumo no ticket para o card do Inbox (não depende da notificação
      // ainda existir/não ter sido descartada — a fonte de verdade é a conversa).
      if (input.conversationId && escalationDecision.summary) {
        await this.prisma.aiConversation
          .update({ where: { id: input.conversationId }, data: { escalationSummary: escalationDecision.summary } as any })
          .catch((e: any) => this.logger.warn(`Falha ao gravar escalationSummary: ${e?.message}`));
      }
    }

    // N2: Se IA resolveu → agenda autoCloseAt (+48h) e ACRESCENTA a pergunta de
    // confirmação ao final da resposta. O fechamento real só ocorre quando o cliente
    // confirmar (ou o janitor fechar por silêncio).
    //
    // 2026-08-07: este bloco SUBSTITUÍA o draft pela pergunta — o cliente recebia
    // "Fico feliz em ter ajudado! Isso resolveu seu problema?" sem nunca ter recebido
    // a solução. O N2 (docs/features/support-portal/plano-implementacao-suporte-2026-07.md)
    // pede que a Lia *pergunte* ao marcar resolvido, não que ela troque a resposta pela
    // pergunta. Mesmo defeito do caminho de escalação logo acima.
    if (!needsHuman && resol.resolved) {
      await this.markResolved(input.conversationId);
      if (draft.trim()) {
        draft = `${draft}\n\n${SUPPORT_SCRIPTS.confirmaResolucao}`;
      } else {
        draft = SUPPORT_SCRIPTS.confirmaResolucao;
        scripted = true; // só o literal do catálogo — não há texto gerado junto
      }
      // Dispara análise de inteligência em background
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
      { scripted },
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
    opts: { scripted?: boolean } = {},
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
      scripted: opts.scripted === true,
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
      // N3: atribui ticketNumber sequencial por tenant na primeira vez que a categoria é definida.
      await this.assignTicketNumberIfNeeded(conversationId).catch((e: any) =>
        this.logger.warn(`N3: assignTicketNumber falhou: ${e?.message}`),
      );
    } catch (e: any) {
      this.logger.warn(`persistTicketFields falhou: ${e?.message}`);
    }
  }

  // C2: atribui ticketNumber via TicketCounter atômico — INSERT ... ON CONFLICT DO UPDATE RETURNING.
  // Sem race condition sob concorrência ou múltiplas réplicas (substitui MAX+1).
  private async assignTicketNumberIfNeeded(conversationId: string): Promise<void> {
    const conv = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: { tenantId: true, ticketNumber: true, ticketCategory: true },
    });
    if (!conv || conv.ticketNumber !== null || !conv.ticketCategory) return;

    // C2: operação atômica — o banco retorna o próximo número já reservado
    const rows = await this.prisma.$queryRaw<{ last_number: number }[]>`
      INSERT INTO ticket_counters (tenant_id, last_number, updated_at)
      VALUES (${conv.tenantId}, 1, now())
      ON CONFLICT (tenant_id) DO UPDATE
        SET last_number = ticket_counters.last_number + 1,
            updated_at  = now()
      RETURNING last_number
    `;
    const next = Number(rows[0].last_number);

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { ticketNumber: next } as any,
    });
    this.logger.log(`C2: ticketNumber=${next} conv=${conversationId}`);
    // F9: nasceu o ticket → TMS fica sabendo. Nunca lança (ver markPending).
    await this.ticketSync.markPending(conversationId);
  }

  // Detecta saudações e mensagens de small talk para curto-circuitar o pipeline.
  // Evita que "oi", "bom dia", "obrigado" escalem desnecessariamente.
  private isSmallTalk(message: string): boolean {
    const norm = message
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[!?.]+$/, '') // remove pontuação final
      .trim();

    const exact = new Set([
      'oi', 'ola', 'hello', 'hi', 'hey', 'e ai', 'eai',
      'bom dia', 'boa tarde', 'boa noite',
      'tudo bem', 'tudo bom', 'tudo certo',
      'obrigado', 'obrigada', 'valeu', 'vlw',
      'ok', 'certo', 'entendido', 'entendi', 'perfeito',
      'ate logo', 'ate mais', 'tchau', 'flw',
    ]);
    if (exact.has(norm)) return true;

    return false;
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

  // N2: Classifica a resposta do cliente à pergunta de confirmação ("Isso resolveu?")
  // e age conforme o resultado: fecha, reescala ou aguarda o janitor.
  private async handleCsatConfirmation(
    tenantId: string,
    conversationId: string,
    message: string,
  ): Promise<AgentReply> {
    const sentiment = this.classifyConfirmation(message);
    this.logger.log(`N2 [CSAT] conv=${conversationId} sentiment=${sentiment}`);

    if (sentiment === 'positive') {
      // Fecha imediatamente + gera token de CSAT
      const csatToken = randomBytes(24).toString('hex');
      try {
        await this.prisma.aiConversation.update({
          where: { id: conversationId },
          data: { status: 'closed' as any, outcome: 'resolved', outcomeAt: new Date(), endedAt: new Date(), autoCloseAt: null, csatToken } as any,
        });
        await this.prisma.conversationStageHistory.create({
          data: { conversationId, fromStatus: 'open', toStatus: 'closed', toOutcome: 'resolved', reason: 'confirmado_cliente' },
        });
        // F9: fechou → TMS fica sabendo (fora do try teria efeito colateral se
        // o fechamento falhasse; dentro, só sincroniza o que de fato fechou).
        await this.ticketSync.markPending(conversationId);
      } catch (e: any) {
        this.logger.warn(`N2: fechamento confirmado falhou: ${e?.message}`);
      }
      return this.buildReply(
        SUPPORT_SCRIPTS.chamadoEncerrado, [], '', 'high', false,
        { category: 'suporte', priority: 'low' }, null, true, { scripted: true },
      );
    }

    if (sentiment === 'negative') {
      // Reescala: limpa resolvedAt/autoCloseAt e volta ao escalado
      try {
        await this.prisma.aiConversation.update({
          where: { id: conversationId },
          data: { status: 'escalated' as any, resolvedAt: null, autoCloseAt: null } as any,
        });
        await this.prisma.conversationStageHistory.create({
          data: { conversationId, fromStatus: 'open', toStatus: 'escalated', reason: 'nao_resolvido_confirmacao' },
        });
        await this.notifications.create(tenantId, {
          type: 'escalation',
          title: '🟠 Reescalonamento — cliente negou resolução',
          body: `Cliente informou que o problema não foi resolvido. Chamado ${conversationId} voltou para atendimento humano.`,
          link: `/inbox/${conversationId}`,
        });
      } catch (e: any) {
        this.logger.warn(`N2: reescalonamento falhou: ${e?.message}`);
      }
      return this.buildReply(
        SUPPORT_SCRIPTS.naoResolvido, [], '', 'high', true,
        { category: 'suporte', priority: 'high' }, null, false, { scripted: true },
      );
    }

    // Neutro/silêncio: mantém o autoCloseAt atual, responde gentilmente
    return this.buildReply(
      SUPPORT_SCRIPTS.aguardandoRetorno, [], '', 'high', false,
      { category: 'suporte', priority: 'low' }, null, false, { scripted: true },
    );
  }

  // Classifica mensagem curta como positiva, negativa ou neutra para o fluxo CSAT.
  private classifyConfirmation(message: string): 'positive' | 'negative' | 'neutral' {
    const norm = message
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[!?.]+$/, '')
      .trim();

    const positives = new Set([
      'sim', 's', 'yes', 'yep', 'ok', 'certo', 'correto', 'resolveu', 'funcionou',
      'deu certo', 'perfeito', 'obrigado', 'obrigada', 'valeu', 'otimo', 'excelente',
      'resolvido', 'esta ok', 'esta certo', 'confirmado', 'tudo certo', 'tudo ok',
    ]);
    const negatives = new Set([
      'nao', 'n', 'no', 'nope', 'nada', 'negativo', 'ainda nao', 'ainda com problema',
      'nao resolveu', 'nao funcionou', 'continua', 'persiste', 'o problema continua',
      'ainda tenho duvida', 'nao deu certo', 'nao esta ok',
    ]);

    if (positives.has(norm)) return 'positive';
    if (negatives.has(norm)) return 'negative';

    // Verifica prefixos (para frases mais longas)
    for (const p of ['sim ', 'nao ', 'n ', 's ']) {
      if (norm.startsWith(p)) return p.trim() === 'sim' || p.trim() === 's' ? 'positive' : 'negative';
    }

    return 'neutral';
  }
}
