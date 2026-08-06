import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RollingStats } from '@/shared/utils/rolling-stats';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { SellersService } from '@/application/sellers/sellers.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { inspectOutbound } from '@/shared/governance/output-guard';
import { RouterAgentService, RouteDecision } from './router-agent.service';
import { SalesAgentService, type LeadProfile } from './sales-agent.service';
import { SupportAgentService } from './support-agent.service';
import { SupervisorAgentService, SupervisorVerdict } from './supervisor-agent.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { HandoffService } from '@/application/handoff/handoff.service';
import { OpportunitiesService } from '@/application/opportunities/opportunities.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { AbuseGuardService } from '@/application/contacts/abuse-guard.service';
import { isWithinSupportHours, nextOpeningLabel, supportHoursLabel } from '@/application/conversations/support-hours';

// Detecta marcador do botão TMS (Modalidade A — ADR 022)
const VIA_PANEL_MARKER = /\[via-painel-tms\]/i;

/**
 * Respostas ROTEIRIZADAS — texto fixo, escrito aqui, que pula a Supervisora.
 *
 * Pular a auditoria é correto para texto que nós escrevemos: não há alucinação
 * possível num literal. O risco não é o texto de hoje, é o de amanhã — alguém
 * acrescenta um `scripted = true` ao lado de um draft montado dinamicamente e a
 * resposta passa a sair sem nenhuma revisão, silenciosamente.
 *
 * Por isso o catálogo existe e é VERIFICADO no envio (`isKnownScript`): a flag
 * deixa de ser uma promessa e vira uma afirmação conferível. Draft marcado como
 * roteirizado que não bate com nada daqui é tratado como texto gerado — vai para o
 * aceno seguro e o caso é logado.
 */
const SCRIPTS = {
  clarify: (greeting: string) =>
    `${greeting}! Aqui é a Lia, do HiperTMS. ` +
    `Para eu te direcionar do jeito certo: você quer conhecer o sistema e os planos, ou já é cliente e precisa de suporte?`,
  optOut:
    'Pronto! ✅ Você não receberá mais mensagens nossas. Se mudar de ideia, é só chamar por aqui. Obrigada! 🙏',
  handoffHuman:
    'Entendi! Vou te conectar agora com um dos nossos especialistas pra te atender melhor. 🙂',
  supportSemCadastroComUrl: (url: string) =>
    `Nosso suporte técnico é exclusivo para clientes com acesso ao HiperTMS. Para ter acesso, você pode falar com nossa equipe comercial aqui: ${url} 😊\n\nEnquanto isso, posso te contar como o sistema funciona e quais os planos disponíveis — quer saber mais?`,
  supportSemCadastro:
    `Nosso suporte técnico é exclusivo para clientes cadastrados no HiperTMS. Seu número ainda não está registrado no sistema. 😊\n\nPosso te apresentar o HiperTMS e explicar como contratar — quer que eu te explique?`,
} as const;

/**
 * O texto é mesmo um dos roteiros do catálogo?
 *
 * Comparação literal, exceto pelos dois trechos variáveis legítimos: a saudação
 * (bom dia/boa tarde/boa noite) e a URL do playbook do tenant. A URL é comparada
 * por FORMA, não por valor — o playbook é editável e não faz sentido replicar a
 * validação dele aqui; o que importa é que a moldura da frase seja a nossa.
 *
 * Draft vazio conta como roteirizado: é o caso `wrong_person`, em que a resposta
 * correta é silêncio (responder confirmaria o número como ativo para um spammer).
 */
function isKnownScript(draft: string): boolean {
  if (!draft) return true;

  const fixos: string[] = [SCRIPTS.optOut, SCRIPTS.handoffHuman, SCRIPTS.supportSemCadastro];
  if (fixos.includes(draft)) return true;

  for (const saudacao of ['Bom dia', 'Boa tarde', 'Boa noite']) {
    if (draft === SCRIPTS.clarify(saudacao)) return true;
  }

  // Variante com URL: confere a MOLDURA e aceita qualquer URL http(s) no slot.
  // O sentinela precisa ser um token que nao ocorra no texto do roteiro: com um
  // espaco, o split partiria a frase em todas as palavras em vez de separar
  // prefixo e sufixo.
  const SLOT = '<<URL>>';
  const [antes, depois] = SCRIPTS.supportSemCadastroComUrl(SLOT).split(SLOT);
  if (draft.length > antes.length + depois.length && draft.startsWith(antes) && draft.endsWith(depois)) {
    const url = draft.slice(antes.length, draft.length - depois.length);
    return /^https?:\/\/\S+$/.test(url);
  }

  return false;
}
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
  // F6+ seller-leads: sellerId exposto p/ vincular a oportunidade ao dono real
  handoff?: { assigned: boolean; sellerId?: string; sellerName?: string; reason?: string };
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
  /** tenantId → dia (YYYY-MM-DD) do último aviso de teto de gasto. Evita spam de alerta. */
  private costCapNotified = new Map<string, string>();

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
    private readonly contacts: ContactsService,
    private readonly abuseGuard: AbuseGuardService,
  ) {}

  // Pipeline completo: classifica → roteia → responde → SUPERVISIONA → (auto-envia se autorizado).
  async handle(
    tenantId: string,
    input: { message: string; conversationId?: string; productCode?: string; portalIdentity?: { externalId: string; name?: string | null; page?: string | null } },
  ): Promise<HandleResult> {
    const _t0 = Date.now(); // MON-009: início da medição

    // BANIMENTO ("3 strikes" — shared/contacts/abuse-guard.service.ts): checado ANTES
    // do roteador de propósito. Se o corte viesse depois, um número banido continuaria
    // queimando chamada de IA a cada mensagem sem nunca receber resposta — o banimento
    // existe justamente para parar isso, não só para calar a saída.
    let ownPhone: string | null = null;
    let ownEmail: string | null = null;
    if (input.conversationId) {
      const convId = input.conversationId;
      const convForGuard = await this.prisma.aiConversation
        .findUnique({ where: { id: convId }, select: { phone: true, productCode: true } })
        .catch(() => null);
      ownPhone = convForGuard?.phone ?? null;

      // F8: o produto fica gravado na conversa quando o lead entra pela campanha
      // (sender.service.ts). Quando ele RESPONDE, quem chama o handle() não sabe
      // disso — sem esta releitura a separação de conhecimento por produto
      // valeria só para a primeira mensagem e depois silenciosamente sumia.
      if (!input.productCode && convForGuard?.productCode) {
        input = { ...input, productCode: convForGuard.productCode };
      }

      if (ownPhone && (await this.abuseGuard.isBanned(tenantId, ownPhone))) {
        this.logger.warn(`Mensagem ignorada — número banido por abuso repetido (tenant=${tenantId} phone=${ownPhone})`);
        return {
          route: { intent: 'unknown', agent: 'human', leadScore: 0, reason: 'número banido', source: 'fallback', confidence: 1 },
          draft: '',
          suggestedAction: 'none',
          usedKnowledge: [],
          confidence: 'high',
          needsHuman: false,
          supervisor: null,
          autonomyEnabled: this.autonomy.isEnabled(),
          autoSent: false,
          blockedReason: 'número banido por abuso repetido — nenhuma mensagem enviada',
        };
      }

      // E-mail do lead — permite ao guard de saída distinguir "o próprio contato
      // falando do próprio e-mail" de "vazando e-mail de outro cliente".
      if (ownPhone) {
        const contact = await this.prisma.contact
          .findFirst({ where: { tenantId, phone: ownPhone }, select: { email: true } })
          .catch(() => null);
        ownEmail = contact?.email ?? null;
      }
    }

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
    // Roteiro que não bate com o catálogo é tratado como texto GERADO e vai para a
    // auditoria. Sem isto ele cairia direto no aceno seguro mais adiante — seguro,
    // porém desnecessário: a Supervisora ainda pode aprovar e o cliente recebe a
    // resposta de verdade em vez de um "só um instante".
    const scriptedOk = scripted && isKnownScript(draft);
    if (!scriptedOk) {
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
    // `scripted` só vale se o texto REALMENTE for um dos roteiros do catálogo (a
    // conferência acontece acima, junto com a decisão de auditar). A flag sozinha é
    // uma promessa; conferida contra SCRIPTS, vira afirmação verificável — e um
    // `scripted = true` novo, ao lado de um draft montado dinamicamente, deixa de
    // pular a Supervisora em silêncio.
    if (scripted && !scriptedOk) {
      this.logger.warn(
        `Draft marcado como roteirizado NÃO corresponde ao catálogo — auditado como gerado. ` +
        `conv=${input.conversationId} intent=${route.intent} texto="${draft.slice(0, 120)}"`,
      );
    }
    const supervisorOk = scriptedOk || supervisor?.approved === true;
    // aceno seguro quando não dá pra confiar no rascunho gerado — mantém a conversa andando,
    // SEM prometer um retorno que talvez não venha (a IA continua dona da conversa).
    // No suporte: fallback diferente — avisa que vai escalar (não manda pitch de vendas).
    const SAFE_FALLBACK = route.agent === 'support' ? SAFE_FALLBACK_SUPPORT : SAFE_FALLBACK_SALES;

    // ADR 035: takeover humano por conversa — humano assumiu (primeira resposta
    // pelo inbox) ou chamado nasceu/foi escalado. A Lia continua gerando o
    // rascunho acima (modo assistente), mas NUNCA auto-envia nesta conversa.
    let humanTakeover = false;
    if (input.conversationId) {
      // `any` de ponta a ponta: o campo humanTakeoverAt só existe no client
      // Prisma regenerado — o cast único mantém o build verde antes e depois
      // do `prisma generate` (o select com cast fazia o TS inferir uniões
      // malucas e quebrava o nest build).
      const convState: any = await this.prisma.aiConversation.findUnique({
        where: { id: input.conversationId },
        select: { status: true, humanTakeoverAt: true } as any,
      });
      humanTakeover =
        !!convState && ((convState.humanTakeoverAt ?? null) !== null || convState.status === 'escalated');
    }

    if (input.conversationId) {
      if (humanTakeover) {
        blockedReason = 'takeover humano ativo (ADR 035) — rascunho aguardando o atendente';
      } else if (!this.autonomy.isEnabled()) {
        blockedReason = 'autonomia desligada (kill switch) — rascunho aguardando humano';
      } else if (await this.isOverMonthlyLimit(tenantId)) {
        // A6 (auditoria 2026-07-08): teto de mensagens/mês do plano atingido → pausa o
        // auto-envio da Lia (o rascunho fica para um humano). Opt-out/transacional não passa
        // por aqui, então continua funcionando. Alerta o time uma vez por mês.
        blockedReason = 'limite mensal de mensagens do plano atingido — auto-envio pausado';
        await this.notifyPlanLimitReached(tenantId).catch(() => null);
      } else if (await this.isOverDailyCostCap(tenantId)) {
        // Teto de GASTO do dia (distinto do teto de mensagens): trava o loop bot-vs-bot
        // antes que ele vire fatura. O rascunho fica para um humano decidir.
        blockedReason = 'teto de gasto diário de IA atingido — auto-envio pausado';
        await this.notifyCostCapReached(tenantId).catch(() => null);
      } else if (!draft) {
        // wrong_person/spam (2026-07-20): resposta deliberadamente vazia — nunca
        // enviar nada (nem aceno seguro; responder confirma o número como ativo).
        blockedReason = 'sem resposta (spam/fora de perfil) — nenhuma mensagem enviada';
        this.logger.log(
          `Auto-envio suprimido: draft vazio (intent=${route.intent}) conv=${input.conversationId} — spam/fora de perfil`,
        );
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
        } else {
          // Última linha de defesa, DETERMINÍSTICA (ver shared/governance/output-guard.ts).
          // A Supervisora é outro modelo lendo a mesma mensagem hostil — se o texto
          // enganou o primeiro, pode enganar o segundo. Estas travas comparam número
          // com número: preço fora do catálogo (caso Chevrolet), recitação do prompt
          // interno (OWASP LLM07) e palavrão saindo com a marca. Só roda no caminho
          // aprovado — nos outros o texto já virou aceno seguro.
          const guard = inspectOutbound(outbound, allowedFacts, { phone: ownPhone, email: ownEmail });
          if (!guard.safe) {
            outbound = SAFE_FALLBACK;
            needsHuman = true; // vale para vendas também: alguém precisa ver o que ela ia dizer
            blockedReason = `bloqueado pelo guard de saída (${guard.violations.join(', ')}): ${guard.detail}`;
            this.logger.warn(
              `Guard de saída barrou resposta conv=${input.conversationId} ` +
              `intent=${route.intent} — ${guard.detail}. Rascunho: ${draft.slice(0, 160)}`,
            );
            // O guard só dispara quando o rascunho JÁ continha algo que não devia sair —
            // ou seja, alguém tentou manipular a Lia. Conta como tentativa ("3 strikes");
            // ao atingir o teto, o número é banido (ver abuse-guard.service.ts).
            if (ownPhone) {
              await this.abuseGuard.recordStrike(tenantId, ownPhone, guard.violations, guard.detail).catch(() => null);
            }
          }
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
    input: { message: string; conversationId?: string; productCode?: string; portalIdentity?: { externalId: string; name?: string | null; page?: string | null } },
    route: RouteDecision,
    ctx: {
      agentMessage: string;
      history: string;
      priorHistory: string;
      msgs: any[];
      liaAlreadyTalked: boolean;
      handoffContext: unknown;
      tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean; page?: string | null } | undefined;
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
    // 2026-08-01: nome/empresa/frota que o lead revelou nesta mensagem (rota sales).
    let leadProfile: LeadProfile | undefined;

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
      draft = SCRIPTS.clarify(SalesAgentService.greeting());
      suggestedAction = 'none';
      scripted = true;
      this.logger.log(`Gate de confiança acionado (confidence=${route.confidence}) → pedindo esclarecimento`);
    } else {
    switch (route.agent) {
      case 'optout':
        draft = SCRIPTS.optOut;
        suggestedAction = 'handoff_human';
        scripted = true;
        break;

      case 'human':
        // wrong_person = spam/fora de perfil (2026-07-20): não responde ("vou te
        // conectar com especialistas" pra um robô de disparo é desperdício e
        // confirma o número como ativo) e não marca needsHuman.
        if (route.intent === 'wrong_person') {
          draft = '';
          suggestedAction = 'none';
          scripted = true;
          break;
        }
        draft = SCRIPTS.handoffHuman;
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
        // 2026-08-01: guarda o que o LEAD revelou; a gravação acontece após o
        // switch (aqui não há a conversa em escopo para pegar o telefone).
        leadProfile = r.profile;
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
          // Só usa a variante com link quando a URL do playbook é http(s) de verdade.
          // `signupUrl` é campo editável do tenant: sem esta checagem, um valor
          // qualquer entraria numa resposta que pula a Supervisora.
          const urlValida = !!contactUrl && /^https?:\/\/\S+$/.test(contactUrl);
          draft = urlValida
            ? SCRIPTS.supportSemCadastroComUrl(contactUrl as string)
            : SCRIPTS.supportSemCadastro;
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

    // 2026-08-01: grava nome/empresa/frota que o lead revelou. A consulta da
    // conversa só acontece quando HÁ algo para gravar (minoria das mensagens),
    // então não adiciona custo ao caminho comum. Best-effort: falhar aqui nunca
    // pode derrubar a resposta ao lead — enriquecer cadastro é secundário.
    if (leadProfile && input.conversationId) {
      try {
        const c = await this.conversations.findOne(tenantId, input.conversationId);
        if (c?.phone) await this.contacts.applyLeadProfile(tenantId, c.phone, leadProfile);
      } catch (e: any) {
        this.logger.warn(`applyLeadProfile falhou (conv=${input.conversationId}): ${e?.message}`);
      }
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
    input: { message: string; conversationId?: string; portalIdentity?: { externalId: string; name?: string | null; page?: string | null } },
    route: RouteDecision,
  ): Promise<{
    route: RouteDecision;
    handoffContext: { externalId: string; tenantId: string; name?: string | null; page?: string | null; errorCode?: string | null } | null;
    tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean; page?: string | null } | undefined;
    hasPanel: boolean;
    agentMessage: string;
  }> {
    // Modalidade A: [via-painel-tms] → vai direto para suporte sem lookup
    const hasPanel = VIA_PANEL_MARKER.test(input.message);
    // Modalidade B: HANDOFF:token → resolve contexto rico e vai direto para suporte
    const handoffMatch = input.message.match(HANDOFF_TOKEN_RE);
    let handoffContext: { externalId: string; tenantId: string; name?: string | null; page?: string | null; errorCode?: string | null } | null = null;
    // Identidade do cliente — nome vem do TMS (token de handoff ou lookup por telefone), NUNCA do que a pessoa digita.
    let tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean; page?: string | null } | undefined;

    if (handoffMatch) {
      handoffContext = await this.handoff.consume(handoffMatch[1]);
      if (handoffContext) {
        route = { ...route, agent: 'support' };
        // identidade segura: o nome vem do token (TMS autenticado), então a Lia já sabe quem é
        if (handoffContext.name) {
          tmsCustomer = { externalId: handoffContext.externalId, name: handoffContext.name, isAdmin: false, page: handoffContext.page ?? null };
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
      tmsCustomer = { externalId: input.portalIdentity.externalId, name: input.portalIdentity.name ?? 'Cliente', isAdmin: false, page: input.portalIdentity.page ?? null };
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
    // Guard anti-spam (2026-07-20, incidente da marmita): wrong_person = mensagem
    // fora de perfil/spam — a IA acertou (score 0), mas o mapeamento p/ agente
    // 'human' acionava o rodízio e o vendedor recebia "lead quente (score 0)".
    // Fora de perfil NUNCA aciona vendedor; fica registrado na conversa e no log.
    const isHumanRequest = route.agent === 'human' && route.intent !== 'wrong_person';
    if (route.agent === 'human' && route.intent === 'wrong_person') {
      this.logger.log(
        `Handoff suprimido: intent=wrong_person (spam/fora de perfil) ` +
          `phone=${conv.phone} conv=${input.conversationId} score=${route.leadScore} — nenhum vendedor notificado`,
      );
    }
    if (isHot || isHumanRequest) {
      // F6+ seller-leads: handoff ANTES de criar a oportunidade — o sellerId do
      // rodizio vira o dono real (assignedSellerId) do lead no funil.
      handoff = await this.sellers.handoff(tenantId, {
        conversationId: input.conversationId ?? '',
        contactPhone: conv.phone,
        leadScore: route.leadScore,
        summary: input.message.slice(0, 120),
        kind: isHot ? 'hot_lead' : 'human_request',
      });
      if (isHot) {
        await this.opportunities
          .createFromLead(tenantId, {
            conversationId: input.conversationId,
            contactId: conv.contactId,
            phone: conv.phone,
            interestScore: route.leadScore,
            intent: route.intent,
            summary: input.message.slice(0, 120),
            assignedSellerId: handoff?.sellerId,
            assignedTo: handoff?.sellerName,
          })
          .catch(() => null);
      }
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
      //
      // 2026-08-05: era `waha.sendText(conv.phone, ...)` direto. Em conversa do
      // widget do TMS o `phone` é o externalId, e no portal vem como
      // `portal:<id>` — mandava WhatsApp para uma string que não é telefone, a
      // falha era engolida no catch, e justamente o cliente do chat (o canal
      // oficial de suporte) nunca era avisado de que tinha sido escalado.
      // `addMessage` roteia por canal: WebSocket para web_chat/portal, WAHA para
      // WhatsApp — e ainda deixa o aviso registrado na thread.
      if (conv.phone && !conv.phone.startsWith('email:')) {
        // Fora do expediente, "em breve" pode ser 8 horas ou o fim de semana
        // inteiro. Dizer a verdade custa menos confiança do que a espera em si:
        // o cliente para de atualizar o chat esperando algo que não vem.
        const aviso = isWithinSupportHours()
          ? 'Vou chamar um atendente para continuar seu atendimento. Aguarde, em breve alguém do time entrará em contato. 🙏'
          : `Vou encaminhar para um atendente. Nosso time atende ${supportHoursLabel()}, então ele retoma ${nextOpeningLabel()} — `
            + 'seu chamado já está registrado e é um dos primeiros da fila. 🙏';
        this.conversations
          .addMessage(tenantId, conv.id, {
            direction: 'outbound',
            content: aviso,
            intent: 'escalation_notice',
          })
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

  /**
   * Teto de GASTO diário de IA por tenant (OWASP LLM10:2025 — Unbounded Consumption).
   *
   * O teto mensal acima conta MENSAGENS, e mensagem é barata quando o lead é humano.
   * O cenário caro é outro: alguém aponta um bot para o nosso número e os dois
   * conversam sozinhos a madrugada inteira. Cada mensagem custa 3 chamadas ao modelo
   * (roteador + agente + supervisora) e ninguém descobre até chegar a fatura.
   *
   * Conta o custo real já registrado em `aiMessage.estimatedCostUsd` — não estima.
   * `AI_DAILY_COST_CAP_USD=0` desliga a trava.
   */
  private async isOverDailyCostCap(tenantId: string): Promise<boolean> {
    const cap = Number(process.env.AI_DAILY_COST_CAP_USD ?? 25);
    if (!Number.isFinite(cap) || cap <= 0) return false;

    const d = new Date();
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // try/catch e não só .catch(): uma trava de custo jamais pode derrubar a conversa.
    // Se a soma falhar, o certo é ATENDER o cliente e reclamar no log — o teto é uma
    // proteção de fatura, não um pré-requisito para conversar.
    let agg: { _sum?: { estimatedCostUsd?: unknown } } | null = null;
    try {
      agg = await this.prisma.aiMessage.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { tenantId, createdAt: { gte: dayStart } },
      });
    } catch (e: any) {
      this.logger.warn(`Teto de gasto não pôde ser apurado (${e?.message}) — seguindo sem travar`);
      return false;
    }

    const spent = Number(agg?._sum?.estimatedCostUsd ?? 0);
    if (spent < cap) return false;

    this.logger.warn(
      `Teto de gasto diário atingido: tenant=${tenantId} gastou US$ ${spent.toFixed(2)} (teto US$ ${cap})`,
    );
    return true;
  }

  /** Avisa o time que o gasto do dia estourou — uma vez por dia por tenant. */
  private async notifyCostCapReached(tenantId: string): Promise<void> {
    const hoje = new Date().toISOString().slice(0, 10);
    if (this.costCapNotified.get(tenantId) === hoje) return;
    this.costCapNotified.set(tenantId, hoje);
    await this.notifications
      .create(tenantId, {
        type: 'info',
        title: '💸 Teto de gasto diário de IA atingido',
        body:
          'A Lia pausou o envio automático para hoje. Se o volume for legítimo, aumente ' +
          'AI_DAILY_COST_CAP_USD; se não for, provavelmente há uma conversa em loop no inbox.',
        link: '/inbox',
      })
      .catch(() => null);
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
    // Mesmo guard anti-spam do handle(): wrong_person nunca aciona vendedor.
    const isHumanRequest = route.agent === 'human' && route.intent !== 'wrong_person';
    if (route.agent === 'human' && route.intent === 'wrong_person') {
      this.logger.log(
        `escalateOnly: handoff suprimido (intent=wrong_person, spam/fora de perfil) ` +
          `phone=${conv.phone} conv=${input.conversationId} — nenhum vendedor notificado`,
      );
    }
    if (isHot || isHumanRequest) {
      handoff = await this.sellers.handoff(tenantId, {
        conversationId: input.conversationId,
        contactPhone: conv.phone,
        leadScore: route.leadScore,
        summary: input.message.slice(0, 120),
        kind: isHot ? 'hot_lead' : 'human_request',
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
