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
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { HandoffService } from '@/application/handoff/handoff.service';
import { OpportunitiesService } from '@/application/opportunities/opportunities.service';

// Detecta marcador do botão TMS (Modalidade A — ADR 022)
const VIA_PANEL_MARKER = /\[via-painel-tms\]/i;
// Detecta token de handoff (Modalidade B — ADR 022)
const HANDOFF_TOKEN_RE = /\bHANDOFF:([a-z0-9]{6,12})\b/i;

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

// lead quente → vai pro vendedor (IA-3). Configurável via env.
const HOT_LEAD_SCORE = Number(process.env.HOT_LEAD_SCORE ?? 70);
// humanização: espera alguns segundos antes de auto-responder (parecer humano) — G5
const HUMANIZE_MIN_MS = Number(process.env.HUMANIZE_MIN_MS ?? 3000);
const HUMANIZE_MAX_MS = Number(process.env.HUMANIZE_MAX_MS ?? 6000);
// anti-loop (ia-autonoma §9.8): nº de perguntas seguidas da Lia antes de parar e escalar p/ humano.
const MAX_AI_QUESTIONS = Number(process.env.MAX_AI_QUESTIONS ?? 3);

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
    private readonly tmsLookup: TmsLookupService,
    private readonly handoff: HandoffService,
    private readonly opportunities: OpportunitiesService,
  ) {}

  // Pipeline completo: classifica → roteia → responde → SUPERVISIONA → (auto-envia se autorizado).
  async handle(
    tenantId: string,
    input: { message: string; conversationId?: string; productCode?: string; portalIdentity?: { externalId: string; name?: string | null } },
  ): Promise<HandleResult> {
    let route = await this.router.route(input.message);
    const msgs = input.conversationId ? await this.conversations.getMessages(tenantId, input.conversationId) : [];

    // Sempre busca a conversa anterior mais relevante do mesmo número para manter contexto entre sessões.
    // Usa a conversa prévia com mais dados reais (≥2 msgs inbound com conteúdo de negócio).
    let priorHistory = '';
    if (input.conversationId) {
      const convPhone = await this.prisma.aiConversation
        .findUnique({ where: { id: input.conversationId }, select: { phone: true } })
        .catch(() => null);
      if (convPhone?.phone) {
        // Busca conversas anteriores com mensagens suficientes (descarta testes/conversas vazias)
        const priorConvs = await this.prisma.aiConversation.findMany({
          where: { tenantId, phone: convPhone.phone, id: { not: input.conversationId } },
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: { id: true },
        }).catch(() => []);

        for (const pc of priorConvs) {
          const pcMsgs = await this.prisma.aiMessage.findMany({
            where: { conversationId: pc.id },
            orderBy: { createdAt: 'asc' },
            select: { direction: true, content: true },
          }).catch(() => []);

          // Só aproveita conversa com ≥2 inbound com conteúdo real (>10 chars, sem palavrão/teste)
          const realInbound = pcMsgs.filter((m: any) =>
            m.direction === 'inbound' &&
            m.content.length > 10 &&
            !/puteiro|vaca|puta|traveco/i.test(m.content),
          );
          if (realInbound.length < 2) continue;

          const filtered = pcMsgs.filter((m: any) =>
            !m.content.startsWith('Pronto! ✅') &&
            !/puteiro|vaca|puta|traveco/i.test(m.content),
          );
          priorHistory =
            '[Contexto de conversa anterior — use estes dados sem repetir as perguntas já respondidas]\n' +
            filtered
              .map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Lia'}: ${m.content.slice(0, 200)}`)
              .join('\n') +
            '\n[Fim do contexto anterior]\n';
          this.logger.log(`Contexto anterior carregado para ${convPhone.phone}: conv ${pc.id.slice(0, 8)}, ${filtered.length} msgs`);
          break; // usa só a conversa anterior mais recente com dados reais
        }
      }
    }

    // ── ADR 022: detecção de marcador e token de handoff ───────────────────
    // Modalidade A: [via-painel-tms] → vai direto para suporte sem lookup
    const hasPanel = VIA_PANEL_MARKER.test(input.message);
    // Modalidade B: HANDOFF:token → resolve contexto rico e vai direto para suporte
    const handoffMatch = input.message.match(HANDOFF_TOKEN_RE);
    let handoffContext: { externalId: string; tenantId: string; name?: string | null; page?: string | null; errorCode?: string | null } | null = null;
    // Identidade do cliente — nome vem do TMS (token de handoff ou lookup por telefone), NUNCA do que a pessoa digita.
    let tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean } | undefined;

    if (handoffMatch) {
      handoffContext = await this.handoff.consume(handoffMatch[1]);
      if (handoffContext) {
        route = { ...route, agent: 'support' };
        // identidade segura: o nome vem do token (TMS autenticado), então a Lia já sabe quem é
        if (handoffContext.name) {
          tmsCustomer = { externalId: handoffContext.externalId, name: handoffContext.name, isAdmin: false };
        }
        this.logger.log(`HANDOFF token resolvido: ext=${handoffContext.externalId} nome=${handoffContext.name ?? '-'} page=${handoffContext.page ?? '-'}`);
      } else {
        this.logger.warn(`HANDOFF token inválido/expirado: ${handoffMatch[1]}`);
      }
    } else if (hasPanel) {
      route = { ...route, agent: 'support' };
      this.logger.log('Marcador [via-painel-tms] detectado → rota suporte direto');
    }
    // Portal do cliente: identidade vem da SESSAO (token), nao do telefone -> forca suporte.
    if (input.portalIdentity) {
      route = { ...route, agent: 'support' };
      tmsCustomer = { externalId: input.portalIdentity.externalId, name: input.portalIdentity.name ?? 'Cliente', isAdmin: false };
      this.logger.log(`Portal: identidade da sessao ext=${input.portalIdentity.externalId} -> rota suporte`);
    }
    // Remove marcadores da mensagem antes de processar (não aparecem na resposta)
    const cleanMessage = input.message
      .replace(VIA_PANEL_MARKER, '')
      .replace(HANDOFF_TOKEN_RE, '')
      .trim();
    // Mensagem que os agentes "leem": sem marcador/token. Se sobrar vazio (ex.: o cliente
    // só clicou no botão e mandou apenas "HANDOFF:token"), usa uma saudação neutra para a Lia
    // cumprimentar e perguntar a dúvida — em vez de processar o token cru.
    const agentMessage = cleanMessage || 'Olá, preciso de ajuda com o HiperTMS.';

    // ── TMS lookup: se o remetente já é cliente HiperTMS → rota suporte (não vendas) ──
    // Busca o telefone da conversa para consultar o TMS antes de rotear
    // Roda tanto p/ 'sales' (redireciona cliente → suporte) quanto p/ 'support'
    // (precisamos saber se é cliente DE VERDADE; se não for, é prospect e tratamos abaixo).
    if (input.conversationId && !handoffContext && !hasPanel && !input.portalIdentity && (route.agent === 'sales' || route.agent === 'support')) {
      const convForPhone = await this.conversations.findOne(tenantId, input.conversationId).catch(() => null);
      if (convForPhone?.phone) {
        const tmsMap = await this.tmsLookup.batchLookup([convForPhone.phone]);
        const tmsInfo = tmsMap.get(TmsLookupService.normalize(convForPhone.phone));
        if (tmsInfo) {
          // É cliente TMS: garante rota suporte + identidade
          route = { ...route, agent: 'support' };
          tmsCustomer = {
            name: tmsInfo.name,
            role: tmsInfo.role,
            tenantName: tmsInfo.tenantName,
            isAdmin: tmsInfo.role?.toUpperCase() === 'ADMIN',
          };
          this.logger.log(`TMS customer detected (${convForPhone.phone} → ${tmsInfo.name}) — roteado para suporte`);
        }
      }
    }
    // Omnichannel (portal S5): persiste o externalId na conversa quando a identidade e
    // conhecida (handoff/portal), para o chamado aparecer no portal do cliente.
    const knownExternalId = handoffContext?.externalId ?? input.portalIdentity?.externalId ?? null;
    if (input.conversationId && knownExternalId) {
      await this.prisma.aiConversation
        .update({ where: { id: input.conversationId }, data: { externalId: knownExternalId } })
        .catch(() => null);
    }

    // a Lia já respondeu nesta conversa? (se sim, NÃO cumprimenta de novo)
    const liaAlreadyTalked = msgs.some((m: any) => m.direction === 'outbound');
    const history = priorHistory + msgs
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

    // ── ANTI-LOOP (ia-autonoma §9.8): se a Lia já fez MAX_AI_QUESTIONS perguntas seguidas
    // (cada turno dela terminando em "?") e o lead não esquentou, para de reperguntar e
    // escala para um humano — evita o cliente preso num ciclo de perguntas.
    const recentOutbound = msgs.filter((m: any) => m.direction === 'outbound');
    const lastAiTurns = recentOutbound.slice(-MAX_AI_QUESTIONS);
    const aiLoop =
      lastAiTurns.length >= MAX_AI_QUESTIONS &&
      lastAiTurns.every((m: any) => /\?\s*$/.test((m.content || '').trim())) &&
      route.leadScore < HOT_LEAD_SCORE;
    if (aiLoop && (route.agent === 'sales' || route.agent === 'support')) {
      route = { ...route, agent: 'human', intent: 'human_needed', reason: 'anti-loop: reperguntas sem avanço' };
      this.logger.log('Anti-loop acionado → escalando para humano');
    }

    // ── GATE DE CONFIANÇA (ADR 003 / guardrails §5): em 1º contato ambíguo (router com
    // baixa confiança), pedir esclarecimento em vez de assumir a intenção e despejar pitch.
    const clarify =
      route.needsClarification === true &&
      !liaAlreadyTalked &&
      (route.agent === 'sales' || route.agent === 'support');

    if (clarify) {
      draft =
        `${SalesAgentService.greeting()}! Aqui é a Lia, do HiperTMS. ` +
        `Para eu te direcionar do jeito certo: você quer conhecer o sistema e os planos, ou já é cliente e precisa de suporte?`;
      suggestedAction = 'none';
      scripted = true;
      this.logger.log(`Gate de confiança acionado (confidence=${route.confidence}) → pedindo esclarecimento`);
    } else {
    switch (route.agent) {
      case 'optout':
        draft = 'Pronto! ✅ Você não receberá mais mensagens nossas. Se mudar de ideia, é só chamar por aqui. Obrigada! 🙏';
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
          question: agentMessage,
          productCode: input.productCode,
          history,
          leadScore: route.leadScore,
          ongoing: liaAlreadyTalked,
          hasPriorContext: priorHistory.length > 0,
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
        // PROSPECT (não é cliente do TMS) pedindo suporte → suporte é pós-venda:
        // a Lia orienta a se cadastrar em vez de atender. Cliente (tmsCustomer / painel /
        // handoff) segue pro suporte normal. Pré-venda já fica em 'sales' (não cai aqui).
        if (!tmsCustomer && !hasPanel && !handoffContext) {
          const pb = await this.prisma.salesPlaybook.findUnique({ where: { tenantId } }).catch(() => null);
          const signup = pb?.signupUrl?.trim();
          draft = signup
            ? `Pra usar nosso suporte é só ter uma conta — leva 2 minutos: ${signup}\n\nDepois disso você tem o chat de suporte direto por aqui. Quer que eu te ajude a começar agora?`
            : `Nosso suporte é exclusivo pra clientes. Criar sua conta é rapidinho — quer que eu te ajude a começar agora?`;
          suggestedAction = 'none';
          scripted = true;
          this.logger.log('Prospect pediu suporte sem ser cliente → orientação de cadastro');
          break;
        }
        // Passa conversationId para que o SupportAgent recupere o histórico da conversa
        const r = await this.support.ask(tenantId, { question: agentMessage, conversationId: input.conversationId, tmsCustomer });
        draft = r.draft;
        usedKnowledge = r.usedKnowledge;
        confidence = r.confidence;
        needsHuman = r.needsHuman;
        allowedFacts = r.allowedFacts;
        usage = r.usage;
        break;
      }
    }
    } // fim do else do gate de confiança

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
        customerMessage: agentMessage,
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
    // No suporte: fallback diferente — avisa que vai escalar (não manda pitch de vendas).
    const SAFE_FALLBACK_SALES =
      'Posso te explicar como o HiperTMS organiza documentos, emissão de CT-e/MDF-e, precificação e financeiro — e te indicar o plano ideal pro seu porte. O que você quer ver primeiro? 🙂';
    const SAFE_FALLBACK_SUPPORT =
      'Não consegui identificar a solução para o seu problema. Vou encaminhar para um atendente da nossa equipe, que vai entrar em contato com você em breve. 🙏';
    const SAFE_FALLBACK = route.agent === 'support' ? SAFE_FALLBACK_SUPPORT : SAFE_FALLBACK_SALES;

    if (input.conversationId) {
      if (!this.autonomy.isEnabled()) {
        blockedReason = 'autonomia desligada (kill switch) — rascunho aguardando humano';
      } else {
        let outbound = draft;
        if (!supervisorOk) {
          outbound = SAFE_FALLBACK;
          if (route.agent === 'support') needsHuman = true;
          blockedReason = `rascunho reprovado pela supervisora (enviado aceno seguro): ${supervisor?.issues.join(', ') || 'reprovado'}`;
        } else if (confidence !== 'high') {
          outbound = SAFE_FALLBACK;
          if (route.agent === 'support') needsHuman = true;
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

    // BUG-08 fix: busca a conversa UMA vez e reutiliza nos três blocos abaixo.
    // Antes havia 3 findOne independentes para o mesmo conversationId (3 queries extras por mensagem).
    const conv = input.conversationId
      ? await this.conversations.findOne(tenantId, input.conversationId).catch(() => null)
      : null;

    // MONITORAMENTO INTERNO DE RECLAMAÇÕES (G4) — só registra, não muda a resposta ao cliente.
    if (conv && route.isComplaint) {
      await this.prisma.complaint.create({
        data: {
          tenantId,
          conversationId: input.conversationId!,
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

    // OPT-OUT detectado pela IA (ex.: "exit", "me remove daqui") → persiste o descadastro (LGPD).
    if (conv && route.agent === 'optout') {
      await this.prisma.contact
        .updateMany({ where: { tenantId, phone: conv.phone }, data: { status: 'opted_out', interestScore: 0, optOutAt: new Date() } })
        .catch(() => null);
      await this.notifications.create(tenantId, { type: 'opt_out', title: '🚫 Opt-out', body: `${conv.phone} pediu para sair.`, link: '/contacts' });
    }

    // HANDOFF: lead quente (sales + score alto) OU pediu humano → atribui + notifica vendedor.
    // Dedup interno (1 notificação por conversa). Acontece independente da autonomia.
    let handoff: HandleResult['handoff'];
    // IA-3: lead de vendas com score alto OU que pediu reunião → escala pro vendedor.
    const isHot =
      route.agent === 'sales' &&
      (route.leadScore >= HOT_LEAD_SCORE || route.intent === 'meeting_request');
    if (conv && (isHot || route.agent === 'human')) {
      if (isHot) {
        await this.opportunities
          .createFromLead(tenantId, {
            conversationId: input.conversationId,
            contactId: conv.contactId,
            phone: conv.phone,
            interestScore: route.leadScore,
            intent: route.intent,
            summary: input.message.slice(0, 120),
          })
          .catch(() => null);
      }
      handoff = await this.sellers.handoff(tenantId, {
        conversationId: input.conversationId ?? '',
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

    // SUPORTE: a Lia tentou e NÃO resolveu (needsHuman) → marca o chamado p/ humano e avisa
    // o time. O humano assume no inbox e liga pro cliente (modelo de callback do suporte).
    // Dedup: só escala uma vez por conversa (não renotifica a cada mensagem).
    if (conv && needsHuman && route.agent === 'support' && (conv.status as string) !== 'escalated') {
      await this.prisma.aiConversation
        .update({ where: { id: conv.id }, data: { status: 'escalated' as any } })
        .catch(() => null);
      await this.notifications.create(tenantId, {
        type: 'info',
        title: '🆘 Chamado precisa de atendente',
        body: `${conv.phone}: "${input.message.slice(0, 80)}"`,
        link: '/inbox',
      });
      this.logger.log(`Suporte escalado p/ humano: conv=${conv.id} tel=${conv.phone}`);
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

  // IA-3 (complemento): com a autonomia OFF, a Lia NÃO responde, mas ainda escala
  // leads quentes / pedidos de humano pro vendedor — classificação leve, sem gerar rascunho.
  async escalateOnly(tenantId: string, input: { message: string; conversationId: string }) {
    const route = await this.router.route(input.message);
    const conv = await this.conversations.findOne(tenantId, input.conversationId).catch(() => null);
    let handoff: HandleResult['handoff'];
    if (!conv) return { route, handoff };
    const isHot =
      route.agent === 'sales' &&
      (route.leadScore >= HOT_LEAD_SCORE || route.intent === 'meeting_request');
    if (isHot || route.agent === 'human') {
      handoff = await this.sellers.handoff(tenantId, {
        conversationId: input.conversationId,
        contactPhone: conv.phone,
        leadScore: route.leadScore,
        summary: input.message.slice(0, 120),
      });
      await this.notifications.create(tenantId, {
        type: isHot ? 'hot_lead' : 'info',
        title: isHot ? `🔥 Lead quente (score ${route.leadScore})` : '🙋 Lead pediu atendente',
        body: `${conv.phone}${handoff?.sellerName ? ` → ${handoff.sellerName}` : ''}: "${input.message.slice(0, 80)}" (IA off)`,
        link: '/inbox',
      });
    }
    return { route, handoff };
  }
}
