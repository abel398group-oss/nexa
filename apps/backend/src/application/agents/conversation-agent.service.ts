import { Injectable, Logger } from '@nestjs/common';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { SellersService } from '@/application/sellers/sellers.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { RouterAgentService, RouteDecision } from './router-agent.service';
import { SalesAgentService } from './sales-agent.service';
import { SupportAgentService } from './support-agent.service';
import { SupervisorAgentService, SupervisorVerdict } from './supervisor-agent.service';
import { NotificationsService } from '@/application/notifications/notifications.service';

export interface HandleResult {
  route: RouteDecision;
  draft: string;
  suggestedAction: string;
  usedKnowledge: { id: string; title: string }[];
  confidence: 'high' | 'low';
  needsHuman: boolean;
  supervisor: SupervisorVerdict | null;
  autonomyEnabled: boolean;
  autoSent: boolean;
  blockedReason?: string;
  handoff?: { assigned: boolean; sellerName?: string; reason?: string };
}

// lead quente → vai pro vendedor
const HOT_LEAD_SCORE = 70;
// humanização: espera alguns segundos antes de auto-responder (parecer humano) — G5
const HUMANIZE_MIN_MS = Number(process.env.HUMANIZE_MIN_MS ?? 3000);
const HUMANIZE_MAX_MS = Number(process.env.HUMANIZE_MAX_MS ?? 6000);

@Injectable()
export class ConversationAgentService {
  private readonly logger = new Logger('ConversationAgent');

  constructor(
    private readonly router: RouterAgentService,
    private readonly sales: SalesAgentService,
    private readonly support: SupportAgentService,
    private readonly supervisor: SupervisorAgentService,
    private readonly conversations: ConversationsService,
    private readonly sellers: SellersService,
    private readonly prisma: PrismaService,
    private readonly autonomy: AutonomyService,
    private readonly notifications: NotificationsService,
  ) {}

  // Pipeline completo: classifica → roteia → responde → SUPERVISIONA → (auto-envia se autorizado).
  async handle(
    tenantId: string,
    input: { message: string; conversationId?: string; productCode?: string },
  ): Promise<HandleResult> {
    const route = await this.router.route(input.message);
    const msgs = input.conversationId ? await this.conversations.getMessages(tenantId, input.conversationId) : [];
    // a Lia já respondeu nesta conversa? (se sim, NÃO cumprimenta de novo)
    const liaAlreadyTalked = msgs.some((m: any) => m.direction === 'outbound');
    const history = msgs
      .slice(-6)
      .map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Lia'}: ${m.content}`)
      .join('\n');

    let draft = '';
    let suggestedAction = 'none';
    let usedKnowledge: { id: string; title: string }[] = [];
    let confidence: 'high' | 'low' = 'high';
    let needsHuman = false;
    let allowedFacts = '';
    let scripted = false; // respostas fixas (optout/human) não precisam de supervisora IA
    let usage: { tokensIn: number; tokensOut: number; costUsd: number } | undefined;

    switch (route.agent) {
      case 'optout':
        draft = 'Pronto, você não receberá mais mensagens nossas. Se mudar de ideia, é só chamar. Obrigada! 🙏';
        suggestedAction = 'handoff_human';
        scripted = true;
        break;

      case 'human':
        draft = 'Entendi! Vou te conectar agora com um dos nossos especialistas pra te atender melhor. 🙂';
        suggestedAction = 'handoff_human';
        needsHuman = true;
        scripted = true;
        break;

      case 'sales': {
        const r = await this.sales.sell(tenantId, {
          question: input.message,
          productCode: input.productCode,
          history,
          leadScore: route.leadScore,
          ongoing: liaAlreadyTalked,
        });
        draft = r.draft;
        suggestedAction = r.suggestedAction;
        usedKnowledge = r.usedKnowledge;
        confidence = r.confidence;
        needsHuman = r.suggestedAction === 'handoff_human';
        allowedFacts = r.allowedFacts;
        usage = r.usage;
        break;
      }

      case 'support':
      default: {
        const r = await this.support.ask(tenantId, { question: input.message, conversationId: undefined });
        draft = r.draft;
        usedKnowledge = r.usedKnowledge;
        confidence = r.confidence;
        needsHuman = r.needsHuman;
        allowedFacts = r.allowedFacts;
        usage = r.usage;
        break;
      }
    }

    // NUNCA cumprimentar 2x (vale p/ QUALQUER agente — sales, support): se a Lia já falou nesta
    // conversa, remove uma saudação no início do rascunho (o modelo às vezes insiste).
    if (liaAlreadyTalked && draft && !scripted) {
      const before = draft;
      draft = draft
        .replace(/^[^a-zA-ZÀ-ÿ]*(bom dia|boa tarde|boa noite|ol[áa]|oi)[^a-zA-ZÀ-ÿ]*?(tudo bem\??|tudo certo\??)?[^a-zA-ZÀ-ÿ]*/i, '')
        .trimStart();
      if (draft && draft !== before) draft = draft.charAt(0).toUpperCase() + draft.slice(1);
    }

    // SUPERVISORA: audita rascunhos gerados por IA (gate de qualidade/segurança — ADR 012).
    let supervisor: SupervisorVerdict | null = null;
    if (!scripted) {
      supervisor = await this.supervisor.review({
        customerMessage: input.message,
        draft,
        allowedFacts,
        history,
      });
    }

    // AUTO-ENVIO: com a autonomia LIGADA, a Lia NUNCA fica em silêncio (é um bot de vendas).
    // - kill switch OFF → não envia (rascunho aguarda humano).
    // - rascunho reprovado pela supervisora OU confiança baixa → envia um ACENO SEGURO
    //   (nunca o conteúdo suspeito, mas também nunca silêncio).
    // - needsHuman NÃO bloqueia: manda a mensagem de handoff E o vendedor é avisado adiante.
    let autoSent = false;
    let blockedReason: string | undefined;
    const supervisorOk = scripted || supervisor?.approved === true;
    // aceno seguro quando não dá pra confiar no rascunho gerado — mantém a conversa andando,
    // SEM prometer um retorno que talvez não venha (a IA continua dona da conversa).
    const SAFE_FALLBACK =
      'Posso te explicar como o HiperTMS organiza documentos, emissão de CT-e/MDF-e, precificação e financeiro — e te indicar o plano ideal pro seu porte. O que você quer ver primeiro? 🙂';

    if (input.conversationId) {
      if (!this.autonomy.isEnabled()) {
        blockedReason = 'autonomia desligada (kill switch) — rascunho aguardando humano';
      } else {
        let outbound = draft;
        if (!supervisorOk) {
          outbound = SAFE_FALLBACK;
          blockedReason = `rascunho reprovado pela supervisora (enviado aceno seguro): ${supervisor?.issues.join(', ') || 'reprovado'}`;
        } else if (confidence !== 'high') {
          outbound = SAFE_FALLBACK;
          blockedReason = 'confiança baixa (enviado aceno seguro)';
        }
        // humanização: pequena pausa antes de enviar (G5) — varia pelo tamanho do texto
        const jitter = HUMANIZE_MIN_MS + (outbound.length % Math.max(1, HUMANIZE_MAX_MS - HUMANIZE_MIN_MS));
        await new Promise((r) => setTimeout(r, Math.min(HUMANIZE_MAX_MS, jitter)));
        await this.conversations.addMessage(tenantId, input.conversationId, {
          direction: 'outbound',
          content: outbound,
          intent: route.intent,
          metadata: { aiGenerated: true, agent: route.agent, supervisorRisk: supervisor?.risk, fallback: outbound !== draft },
          tokensIn: usage?.tokensIn,
          tokensOut: usage?.tokensOut,
          estimatedCostUsd: usage?.costUsd,
        });
        autoSent = true;
      }
    }

    // MONITORAMENTO INTERNO DE RECLAMAÇÕES (G4) — só registra, não muda a resposta ao cliente.
    if (input.conversationId && route.isComplaint) {
      const conv = await this.conversations.findOne(tenantId, input.conversationId).catch(() => null);
      if (conv) {
        await this.prisma.complaint.create({
          data: {
            tenantId,
            conversationId: input.conversationId,
            phone: conv.phone,
            topic: route.complaintTopic ?? 'outro',
            excerpt: input.message.slice(0, 200),
          },
        }).catch(() => null);
        await this.notifications.create(tenantId, {
          type: 'complaint',
          title: `😠 Reclamação (${route.complaintTopic ?? 'outro'})`,
          body: `${conv.phone}: "${input.message.slice(0, 80)}"`,
          link: '/inbox',
        });
      }
    }

    // HANDOFF: lead quente (sales + score alto) OU pediu humano → atribui + notifica vendedor.
    // Dedup interno (1 notificação por conversa). Acontece independente da autonomia.
    let handoff: HandleResult['handoff'];
    const isHot = route.agent === 'sales' && route.leadScore >= HOT_LEAD_SCORE;
    if (input.conversationId && (isHot || route.agent === 'human')) {
      const conv = await this.conversations.findOne(tenantId, input.conversationId).catch(() => null);
      if (conv) {
        handoff = await this.sellers.handoff(tenantId, {
          conversationId: input.conversationId,
          contactPhone: conv.phone,
          leadScore: route.leadScore,
          summary: input.message.slice(0, 120),
        });
        await this.notifications.create(tenantId, {
          type: isHot ? 'hot_lead' : 'info',
          title: isHot ? `🔥 Lead quente (score ${route.leadScore})` : '🙋 Lead pediu atendente',
          body: `${conv.phone}${handoff?.sellerName ? ` → ${handoff.sellerName}` : ''}: "${input.message.slice(0, 80)}"`,
          link: '/inbox',
        });
      }
    }

    return {
      route,
      draft,
      suggestedAction,
      usedKnowledge,
      confidence,
      needsHuman,
      supervisor,
      autonomyEnabled: this.autonomy.isEnabled(),
      autoSent,
      blockedReason,
      handoff,
    };
  }
}
