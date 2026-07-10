import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RollingStats } from '@/shared/utils/rolling-stats';
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
import { WahaClientService } from '@/shared/waha/waha-client.service';

// Detecta marcador do botão TMS (Modalidade A — ADR 022)
const VIA_PANEL_MARKER = /\[via-painel-tms\]/i;
// Detecta token de handoff (Modalidade B — ADR 022)
const HANDOFF_TOKEN_RE = /\bHANDOFF:([a-z0-9]{6,12})\b/i;

// QUAL-005: mensagens de fallback seguro extraídas como constantes de módulo
// (evita string literals duplicadas no meio de método crítico).
const SAFE_FALLBACK_SALES =
  'Posso te explicar como o HiperTMS organiza documentos, emissão de CT-e/MDF-e, precificação e financeiro — e te indicar o plano ideal pro seu porte. O que você quer ver primeiro? 🙂';
const SAFE_FALLBACK_SUPPORT =
  'Não consegui identificar a solução para o seu problema. Vou encaminhar para um atendente da nossa equipe, que vai entrar em contato com você em breve. 🙏';

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

// MON-009: p95 > este threshold gera log warn para detectar degradação da Lia.
const LATENCY_WARN_MS = Number(process.env.LIA_LATENCY_WARN_MS ?? 15_000);

// lead quente → vai pro vendedor (IA-3). Configurável via env.
const HOT_LEAD_SCORE = Number(process.env.HOT_LEAD_SCORE ?? 70);
// humanização: espera alguns segundos antes de auto-responder (parecer humano) — G5
const HUMANIZE_MIN_MS = Number(process.env.HUMANIZE_MIN_MS ?? 3000);
const HUMANIZE_MAX_MS = Number(process.env.HUMANIZE_MAX_MS ?? 6000);
// anti-loop (ia-autonoma §9.8): nº de perguntas seguidas da Lia antes de parar e escalar p/ humano.
const MAX_AI_QUESTIONS = Number(process.env.MAX_AI_QUESTIONS ?? 3);
// Filtro de conteúdo ofensivo/teste — usado ao reaproveitar contexto de conversas anteriores.
// B3: configurável via env PROFANITY_WORDS (lista separada por vírgula); default abaixo.
const PROFANITY_RE = new RegExp(
  (process.env.PROFANITY_WORDS ?? 'puteiro,vaca,puta,traveco')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .join('|'),
  'i',
);

@Injectable()
export class ConversationAgentService {
  private readonly logger = new Logger('ConversationAgent');

  // MON-009: latência ponta a ponta (entrada da mensagem → resposta persistida).
  // Estático para acessar de HealthController sem acoplamento de DI.
  static readonly latency = new RollingStats(100);

  // A6: dedup do alerta de limite de plano — notifica o time uma vez por mês por tenant.
  // Key: tenantId, Value: 'YYYY-MM' já notificado.
  private planLimitNotified = new Map<string, string>();

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
    private readonly waha: WahaClientService,
    private readonly events: EventEmitter2,
  ) {}

  // Pipeline completo: classifica → roteia → responde → SUPERVISIONA → (auto-envia se autorizado).
  async handle(
    tenantId: string,
    input: { message: string; conversationId?: string; productCode?: string; portalIdentity?: { externalId: string; name?: string | null } },
  ): Promise<HandleResult> {
    const _t0 = Date.now(); // MON-009: início da medição
    let route = await this.router.route(input.message);
    const msgs = input.conversationId ? await this.conversations.getMessages(tenantId, input.conversationId) : [];

    // Contexto de conversas anteriores do mesmo número (mantém memória entre sessões).
    const priorHistory = await this.loadPriorHistory(tenantId, input.conversationId);

    // Resolve a identidade do remetente (handoff token / marcador de painel / portal /
    // lookup no TMS), podendo forçar rota 'support', e limpa a mensagem dos marcadores (A3).
    const identity = await this.resolveIdentity(tenantId, input, route);
    route = identity.route;
    const { handoffContext, tmsCustomer, hasPanel, agentMessage } = identity;

    // a Lia já respondeu nesta conversa? (se sim, NÃO cumprimenta de novo)
    const liaAlreadyTalked = msgs.some((m: any) => m.direction === 'outbound');
    const history = priorHistory + msgs
      .slice(-6)
      .map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Lia'}: ${m.content}`)
      .join('\n');

    // Gera o rascunho: anti-loop → gate de confiança → despacho ao agente (optout/human/
    // sales/support) → limpeza de saudação repetida. Pode ajustar a rota (anti-loop). (A3)
    const resp = await this.generateResponse(tenantId, input, route, {
      agentMessage,
      history,
      priorHistory,
      msgs,
      liaAlreadyTalked,
      handoffContext,
      tmsCustomer,
      hasPanel,
    });
    route = resp.route;
    const { draft, suggestedAction, usedKnowledge, confidence, allowedFacts, scripted, usage } = resp;
    let needsHuman = resp.needsHuman;

    // SUPERVISORA: audita rascunhos gerados por IA (gate de qualidade/segurança — ADR 012).
    let supervisor: SupervisorVerdict | null = null;
    if (!scripted) {
      supervisor = await this.supervisor.review({
        customerMessage: agentMessage,
        draft,
        allowedFacts,
        history,
        context: route.agent === 'support' ? 'support' : 'sales',
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
    const SAFE_FALLBACK = route.agent === 'support' ? SAFE_FALLBACK_SUPPORT : SAFE_FALLBACK_SALES;

    if (input.conversationId) {
      if (!this.autonomy.isEnabled()) {
        blockedReason = 'autonomia desligada (kill switch) — rascunho aguardando humano';
      } else if (await this.isOverMonthlyLimit(tenantId)) {
        // A6 (auditoria 2026-07-08): teto de mensagens/mês do plano atingido → pausa o
        // auto-envio da Lia (o rascunho fica para um humano). Opt-out/transacional não passa
        // por aqui, então continua funcionando. Alerta o time uma vez por mês.
        blockedReason = 'limite mensal de mensagens do plano atingido — auto-envio pausado';
        await this.notifyPlanLimitReached(tenantId).catch(() => null);
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

    // Efeitos colaterais pós-resposta: reclamação, opt-out, handoff de lead quente e
    // escalação de suporte. Isolado do fluxo de decisão da resposta (A3).
    const handoff = await this.applyPostResponseEffects(tenantId, route, input, needsHuman);

    // MON-009: registra latência ponta a ponta e alerta se p95 acima do threshold.
    const elapsed = Date.now() - _t0;
    ConversationAgentService.latency.record(elapsed);
    const { p95Ms } = ConversationAgentService.latency.percentiles();
    if (p95Ms !== null && p95Ms > LATENCY_WARN_MS) {
      this.logger.warn(`[MON-009] latência p95=${p95Ms}ms acima de ${LATENCY_WARN_MS}ms`);
    }
    this.logger.debug(`[MON-009] handle() ${elapsed}ms conv=${input.conversationId?.slice(0, 8) ?? '-'}`);

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

  // A3: gera o rascunho de resposta. Aplica o anti-loop (pode trocar a rota para 'human'),
  // o gate de confiança (pede esclarecimento em 1º contato ambíguo) e despacha para o
  // agente certo (optout/human scripted, sales, support). Faz a limpeza de saudação repetida.
  // Devolve a rota (possivelmente ajustada) + o rascunho final e seus metadados.
  private async generateResponse(
    tenantId: string,
    input: { message: string; conversationId?: string; productCode?: string; portalIdentity?: { externalId: string; name?: string | null } },
    route: RouteDecision,
    ctx: {
      agentMessage: string;
      history: string;
      priorHistory: string;
      msgs: any[];
      liaAlreadyTalked: boolean;
      handoffContext: unknown;
      tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean } | undefined;
      hasPanel: boolean;
    },
  ): Promise<{
    route: RouteDecision;
    draft: string;
    suggestedAction: string;
    usedKnowledge: { id: string; title: string }[];
    confidence: 'high' | 'low';
    needsHuman: boolean;
    allowedFacts: string;
    scripted: boolean;
    usage: { tokensIn: number; tokensOut: number; costUsd: number } | undefined;
  }> {
    const { agentMessage, history, priorHistory, msgs, liaAlreadyTalked, handoffContext, tmsCustomer, hasPanel } = ctx;

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
    // Identidade já resolvida (handoff/portal/TMS lookup) → pula o gate: não faz sentido
    // perguntar "é cliente ou prospect?" pra quem já chegou autenticado/identificado (ADR 026).
    const identityKnown = !!handoffContext || !!input.portalIdentity || !!tmsCustomer;
    const clarify =
      route.needsClarification === true &&
      !liaAlreadyTalked &&
      !identityKnown &&
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
          // Prospect (número não cadastrado no TMS) pedindo suporte:
          // o suporte é exclusivo para clientes HiperTMS registrados no sistema.
          // Se tiver URL de contato/demo no playbook, oferece; senão orienta via Lia de Vendas.
          const pb = await this.prisma.salesPlaybook.findUnique({ where: { tenantId } }).catch(() => null);
          const contactUrl = pb?.signupUrl?.trim();
          draft = contactUrl
            ? `Nosso suporte técnico é exclusivo para clientes com acesso ao HiperTMS. Para ter acesso, você pode falar com nossa equipe comercial aqui: ${contactUrl} 😊\n\nEnquanto isso, posso te contar como o sistema funciona e quais os planos disponíveis — quer saber mais?`
            : `Nosso suporte técnico é exclusivo para clientes cadastrados no HiperTMS. Seu número ainda não está registrado no sistema. 😊\n\nPosso te apresentar o HiperTMS e explicar como contratar — quer que eu te explique?`;
          suggestedAction = 'none';
          scripted = true;
          this.logger.log('Prospect pediu suporte sem cadastro no TMS → orientação direcionada a vendas');
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

    return { route, draft, suggestedAction, usedKnowledge, confidence, needsHuman, allowedFacts, scripted, usage };
  }

  // A3: resolve a identidade do remetente antes do roteamento e limpa os marcadores da
  // mensagem. Ordem: handoff token (ADR 022 modalidade B) → marcador [via-painel-tms]
  // (modalidade A) → portal (sessão) → lookup no TMS por telefone. Qualquer um força rota
  // 'support'. Persiste externalId/customerStage na conversa quando a identidade é conhecida.
  // Devolve a rota (possivelmente ajustada) + a identidade + a mensagem limpa que os agentes leem.
  private async resolveIdentity(
    tenantId: string,
    input: { message: string; conversationId?: string; portalIdentity?: { externalId: string; name?: string | null } },
    route: RouteDecision,
  ): Promise<{
    route: RouteDecision;
    handoffContext: { externalId: string; tenantId: string; name?: string | null; page?: string | null; errorCode?: string | null } | null;
    tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean } | undefined;
    hasPanel: boolean;
    agentMessage: string;
  }> {
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
        const tmsMap = await this.tmsLookup.batchLookup([convForPhone.phone]).catch((e: any) => {
          // BUG-FIX: lookup falhou — mantém rota atual mas loga o erro (não deixa cliente cair em vendas silenciosamente)
          this.logger.warn(`TMS lookup falhou para ${convForPhone.phone}: ${e?.message} — mantendo rota=${route.agent}`);
          return new Map();
        });
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

          // BUG-FIX: atualiza customerStage para 'cliente_ativo' na conversa se ainda for 'lead'.
          // Isso garante que a conversa apareça no inbox de Suporte (isSupportTicket usa customerStage).
          if (convForPhone.customerStage !== 'cliente_ativo') {
            await this.prisma.aiConversation
              .update({ where: { id: input.conversationId }, data: { customerStage: 'cliente_ativo' as any } })
              .catch((e: any) => this.logger.warn(`Falha ao atualizar customerStage: ${e?.message}`));
          }
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

    return { route, handoffContext, tmsCustomer, hasPanel, agentMessage };
  }

  // A3: contexto da conversa anterior mais relevante do mesmo número — memória entre
  // sessões. Retorna '' quando não há conversationId ou nenhuma conversa prévia útil
  // (precisa de ≥2 inbound com conteúdo real). Uma única query com include (evita N+1).
  private async loadPriorHistory(tenantId: string, conversationId?: string): Promise<string> {
    if (!conversationId) return '';
    const convPhone = await this.prisma.aiConversation
      .findUnique({ where: { id: conversationId }, select: { phone: true } })
      .catch(() => null);
    if (!convPhone?.phone) return '';

    const priorConvs = await this.prisma.aiConversation
      .findMany({
        where: { tenantId, phone: convPhone.phone, id: { not: conversationId } },
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: { messages: { orderBy: { createdAt: 'asc' }, select: { direction: true, content: true } } },
      })
      .catch(() => []);

    for (const pc of priorConvs) {
      const pcMsgs = pc.messages ?? [];
      // Só aproveita conversa com ≥2 inbound com conteúdo real (>10 chars, sem palavrão/teste)
      const realInbound = pcMsgs.filter(
        (m: any) => m.direction === 'inbound' && m.content.length > 10 && !PROFANITY_RE.test(m.content),
      );
      if (realInbound.length < 2) continue;

      const filtered = pcMsgs.filter(
        (m: any) => !m.content.startsWith('Pronto! ✅') && !PROFANITY_RE.test(m.content),
      );
      this.logger.log(`Contexto anterior carregado para ${convPhone.phone}: conv ${pc.id.slice(0, 8)}, ${filtered.length} msgs`);
      return (
        '[Contexto de conversa anterior — use estes dados sem repetir as perguntas já respondidas]\n' +
        filtered.map((m: any) => `${m.direction === 'inbound' ? 'Cliente' : 'Lia'}: ${m.content.slice(0, 200)}`).join('\n') +
        '\n[Fim do contexto anterior]\n'
      );
    }
    return '';
  }

  // A3: efeitos colaterais que acontecem DEPOIS de decidir/enviar a resposta — registrar
  // reclamação, persistir opt-out, escalar lead quente/pedido de humano ao vendedor e
  // escalar suporte não-resolvido. Independem da autonomia. Busca a conversa UMA vez
  // (BUG-08) e devolve o handoff (usado na resposta do handle()).
  private async applyPostResponseEffects(
    tenantId: string,
    route: RouteDecision,
    input: { message: string; conversationId?: string },
    needsHuman: boolean,
  ): Promise<HandleResult['handoff']> {
    const conv = input.conversationId
      ? await this.conversations.findOne(tenantId, input.conversationId).catch(() => null)
      : null;
    if (!conv) return undefined;

    // MONITORAMENTO INTERNO DE RECLAMAÇÕES (G4) — só registra, não muda a resposta ao cliente.
    if (route.isComplaint) {
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
    if (route.agent === 'optout') {
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
    if (isHot || route.agent === 'human') {
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
    if (needsHuman && route.agent === 'support' && (conv.status as string) !== 'escalated') {
      await this.prisma.aiConversation
        .update({ where: { id: conv.id }, data: { status: 'escalated' as any } })
        .catch(() => null);
      await this.notifications.create(tenantId, {
        type: 'info',
        title: '🆘 Chamado precisa de atendente',
        body: `${conv.phone}: "${input.message.slice(0, 80)}"`,
        link: '/inbox',
      });
      // P3: chamado formal — e-mail ao suporte (SupportEscalationListener).
      // O histórico da conversa da Lia já está no próprio chamado (mesma entidade).
      // Dedup natural: este bloco só roda na transição para 'escalated'.
      this.events.emit('support.escalated', {
        tenantId,
        conversationId: conv.id,
        origin: 'chat',
      });
      // Notifica o cliente que um humano assumirá o atendimento (fire-and-forget).
      if (conv.phone && !conv.phone.startsWith('email:')) {
        this.waha
          .sendText(
            conv.phone,
            'Vou chamar um atendente para continuar seu atendimento. Aguarde, em breve alguém do time entrará em contato. 🙏',
          )
          .catch((e) => this.logger.warn(`Falha ao notificar escalação ao cliente: ${e?.message}`));
      }
      this.logger.log(`Suporte escalado p/ humano: conv=${conv.id} tel=${conv.phone}`);
    }

    return handoff;
  }

  // A6: mês corrente no formato 'YYYY-MM' (UTC) — janela do teto de mensagens do plano.
  private currentMonthStamp(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  // A6: true se o tenant já bateu o teto de mensagens do mês (PlanLimit.maxMessagesMonth).
  // Sem PlanLimit ou com maxMessagesMonth null → ilimitado (não faz a contagem, custo zero
  // para a maioria dos tenants). Conta só as mensagens outbound (a saída que gera custo).
  private async isOverMonthlyLimit(tenantId: string): Promise<boolean> {
    const plan = await this.prisma.planLimit
      .findUnique({ where: { tenantId }, select: { maxMessagesMonth: true } })
      .catch(() => null);
    const cap = plan?.maxMessagesMonth;
    if (cap == null) return false; // sem teto configurado

    const d = new Date();
    const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const used = await this.prisma.aiMessage
      .count({ where: { tenantId, direction: 'outbound', createdAt: { gte: monthStart } } })
      .catch(() => 0);
    return used >= cap;
  }

  // A6: alerta o time que o teto do plano foi atingido — uma vez por mês por tenant.
  private async notifyPlanLimitReached(tenantId: string): Promise<void> {
    const stamp = this.currentMonthStamp();
    if (this.planLimitNotified.get(tenantId) === stamp) return; // já avisou neste mês
    this.planLimitNotified.set(tenantId, stamp);
    this.logger.warn(`A6: tenant ${tenantId} atingiu o limite mensal de mensagens do plano`);
    await this.notifications
      .create(tenantId, {
        type: 'info',
        title: '⚠️ Limite do plano atingido',
        body: 'O teto mensal de mensagens do plano foi atingido — a Lia pausou o envio automático. Faça upgrade para reativar.',
        link: '/inbox',
      })
      .catch(() => null);
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
