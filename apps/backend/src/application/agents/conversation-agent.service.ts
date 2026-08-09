import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RollingStats } from '@/shared/utils/rolling-stats';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { SellersService } from '@/application/sellers/sellers.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { inspectOutbound, MANIPULATION_VIOLATIONS } from '@/shared/governance/output-guard';
import { RouterAgentService, RouteDecision } from './router-agent.service';
import { SalesAgentService, type LeadProfile } from './sales-agent.service';
import { SupportAgentService } from './support-agent.service';
import { SupervisorAgentService, SupervisorVerdict } from './supervisor-agent.service';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';
import { HandoffService, type HandoffContext } from '@/application/handoff/handoff.service';
import { OpportunitiesService } from '@/application/opportunities/opportunities.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { AbuseGuardService } from '@/application/contacts/abuse-guard.service';
import { isWithinSupportHours, nextOpeningLabel, supportHoursLabel } from '@/application/conversations/support-hours';
import { isSupportScript } from './support-scripts.const';
import { isSupportChannel, isSupportConversation, trackWhere } from '@/application/conversations/conversation-track';

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
  /**
   * Mensagem ambígua num canal COMERCIAL.
   *
   * Até 09/08/2026 esta frase perguntava "você quer conhecer os planos, ou já é
   * cliente e precisa de suporte?" — e foi assim que o primeiro teste real
   * descarrilou: a Lia OFERECEU a trilha de suporte num canal que é só comercial,
   * e o lead naturalmente entrou por ela. A regra agora é: ela nunca menciona
   * suporte por conta própria; só responde sobre isso se for provocada.
   */
  clarify: (greeting: string) =>
    `${greeting}! Aqui é a Lia, do HiperTMS — sistema de gestão para transportadoras. ` +
    `Me conta rapidinho: qual é o principal desafio da sua operação hoje?`,
  optOut:
    'Pronto! Você não receberá mais mensagens nossas. Se mudar de ideia, é só chamar por aqui. Obrigada!',
  handoffHuman:
    'Entendi! Vou te conectar agora com um dos nossos especialistas pra te atender melhor.',
  /**
   * Pediram suporte num canal COMERCIAL (WhatsApp, e-mail).
   *
   * Uma resposta só, para cliente e para prospect. Antes eram três, e a escolha
   * entre elas dependia de o número estar cadastrado no TMS — o que produzia, para
   * quem ainda não é cliente, um texto que dizia "fale com a equipe comercial" e
   * entregava um link de autocadastro. Confuso, e sem citar onde o suporte fica.
   *
   * Não leva URL de propósito: a única que o playbook conhece é a de cadastro, e
   * suporte não é cadastro. Inventar um endereço aqui seria pior que não ter.
   */
  suporteNoSite:
    'O suporte técnico do HiperTMS é feito pelo chat no site, e é exclusivo para quem já é cliente ' +
    'com acesso ao sistema — lá a equipe atende com seus dados em mãos.\n\n' +
    'Aqui neste número eu cuido da parte comercial: planos, contratação e dúvidas sobre o sistema. ' +
    'Posso te ajudar com alguma dessas?',
  /**
   * Pediram suporte JÁ no canal de suporte (chat do site), mas o número/identidade
   * não é de cliente. Aqui não cabe dizer "vá para o chat do site" — a pessoa já
   * está nele; o que falta é o cadastro.
   */
  suporteSomenteCliente:
    'O suporte técnico é exclusivo para quem já é cliente com acesso ao HiperTMS, ' +
    'porque a equipe precisa dos dados da sua conta para te atender.\n\n' +
    'Se você ainda não tem acesso, posso te explicar os planos e como contratar — quer que eu explique?',
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

  const fixos: string[] = [
    SCRIPTS.optOut,
    SCRIPTS.handoffHuman,
    SCRIPTS.suporteNoSite,
    SCRIPTS.suporteSomenteCliente,
  ];
  if (fixos.includes(draft)) return true;

  // Catálogo do suporte (saudação, CSAT, avisos de transbordo) — mesma regra:
  // literal nosso não precisa de auditoria. Ver support-scripts.const.ts.
  if (isSupportScript(draft)) return true;

  for (const saudacao of ['Bom dia', 'Boa tarde', 'Boa noite']) {
    if (draft === SCRIPTS.clarify(saudacao)) return true;
  }

  // A validação por moldura+URL saiu em 09/08/2026 junto com o roteiro que a
  // usava: nenhum roteiro de suporte carrega URL hoje.
  return false;
}
// Detecta token de handoff (Modalidade B — ADR 022)
const HANDOFF_TOKEN_RE = /\bHANDOFF:([a-z0-9]{6,12})\b/i;

// QUAL-005: mensagens de fallback seguro extraídas como constantes de módulo
// (evita string literals duplicadas no meio de método crítico).
//
// 09/08/2026 — o teste real mostrou que este texto NÃO é raro: duas das quatro
// respostas da conversa foram ele, porque a Supervisora reprovou os rascunhos.
// Ou seja, é a cara da Lia com mais frequência do que o nome "fallback" sugere,
// e ele abria por "documentos, emissão de CT-e/MDF-e" — exatamente o ângulo que
// o prompt de vendas proíbe, por ser o que todo sistema do mercado faz. Agora
// abre pela dor de precificar e cotar, como o resto da conversa.
const SAFE_FALLBACK_SALES =
  'O HiperTMS ajuda a transportadora a precificar o frete por custo real e a responder cotação rápido, ' +
  'com a parte fiscal e o financeiro no mesmo lugar. Qual é o principal desafio da sua operação hoje?';
const SAFE_FALLBACK_SUPPORT =
  'Não consegui identificar a solução para o seu problema. Vou encaminhar para um atendente da nossa equipe, que vai entrar em contato com você em breve.';

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
// Janela de contexto: quantos turnos da conversa atual vão no prompt.
// Eram 6 — curto demais desde que o agrupamento passou a juntar mensagens
// picadas: três mensagens do lead e uma resposta da Lia já consumiam 4 dos 6
// turnos, e um "sim" solto perdia a pergunta que o motivou. 12 cobre o
// vai-e-vem de uma qualificação inteira sem inchar o prompt (~+400 tokens).
const HISTORY_TURNS = Number(process.env.AI_HISTORY_TURNS ?? 12);
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
    input: { message: string; conversationId?: string; productCode?: string; portalIdentity?: { externalId: string; name?: string | null; page?: string | null }; sector?: string },
  ): Promise<HandleResult> {
    const _t0 = Date.now(); // MON-009: início da medição

    // BANIMENTO ("3 strikes" — shared/contacts/abuse-guard.service.ts): checado ANTES
    // do roteador de propósito. Se o corte viesse depois, um número banido continuaria
    // queimando chamada de IA a cada mensagem sem nunca receber resposta — o banimento
    // existe justamente para parar isso, não só para calar a saída.
    let ownPhone: string | null = null;
    let ownEmail: string | null = null;
    // Canal da conversa — é ele que decide a trilha (ver conversation-track.ts).
    // Sem conversationId (chamada avulsa) a presença de portalIdentity é o indício:
    // ela só existe no widget e no portal.
    let canal: string | null = input.portalIdentity ? 'web_chat' : null;
    if (input.conversationId) {
      const convId = input.conversationId;
      const convForGuard = await this.prisma.aiConversation
        .findUnique({ where: { id: convId }, select: { phone: true, productCode: true, sourceChannel: true } })
        .catch(() => null);
      ownPhone = convForGuard?.phone ?? null;
      canal = (convForGuard?.sourceChannel as string | null) ?? canal;

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

    // As três leituras são independentes entre si: o roteador só olha o texto da
    // mensagem, e as duas consultas de histórico só olham o banco. Em série, a
    // chamada de IA do roteador somava com dois round-trips ao Postgres (que é o
    // gerenciado da DO — caro de latência); em paralelo o custo vira o do mais lento.
    const [routeDecision, msgs, priorHistory] = await Promise.all([
      this.router.route(input.message),
      input.conversationId
        ? this.conversations.getMessages(tenantId, input.conversationId)
        : Promise.resolve([] as any[]),
      // Contexto de conversas anteriores do mesmo número (mantém memória entre sessões).
      this.loadPriorHistory(tenantId, input.conversationId),
    ]);
    let route = routeDecision;

    // Resolve a identidade do remetente (handoff token / marcador de painel / portal /
    // lookup no TMS), podendo forçar rota 'support', e limpa a mensagem dos marcadores (A3).
    const identity = await this.resolveIdentity(tenantId, input, route, canal);
    route = identity.route;
    const { handoffContext, tmsCustomer, hasPanel, agentMessage } = identity;

    // a Lia já respondeu nesta conversa? (se sim, NÃO cumprimenta de novo)
    const liaAlreadyTalked = msgs.some((m: any) => m.direction === 'outbound');
    const history = priorHistory + msgs
      .slice(-HISTORY_TURNS)
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
      canal,
      canalDeSuporte: isSupportChannel(canal),
    });
    route = resp.route;
    const { draft, suggestedAction, usedKnowledge, confidence, allowedFacts, scripted, usage } = resp;
    let needsHuman = resp.needsHuman;
    // Escalação decidida pelo PRÓPRIO agente (matriz do SupportAgent) — nesse caso o
    // rascunho já anuncia o transbordo ao cliente. Distinto de `needsHuman` virar true
    // mais abaixo por decisão do orquestrador, quando o texto enviado é a resposta
    // técnica e não avisa nada. A diferença decide se o aviso de escalação é duplicado
    // ou é a única chance de o cliente saber que alguém vai assumir.
    const escalacaoDecididaPeloAgente = resp.needsHuman;

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
    // O texto que de fato saiu já diz ao cliente que um atendente vai assumir?
    let transbordoAnunciadoNoTexto = false;
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
          if (route.agent === 'support') {
            needsHuman = true;
            transbordoAnunciadoNoTexto = true; // o aceno seguro do suporte já avisa
          }
          blockedReason = `rascunho reprovado pela supervisora (enviado aceno seguro): ${supervisor?.issues.join(', ') || 'reprovado'}`;
          // REGRA 3: caminho que descarta o texto gerado tem que dizer por quê.
          this.logger.warn(
            `Aceno seguro no lugar do rascunho conv=${input.conversationId} intent=${route.intent} — ` +
            `${blockedReason}. Rascunho: ${draft.slice(0, 160)}`,
          );
        } else if (confidence !== 'high' && route.agent === 'support') {
          // Incidente do CT-e 519 (2026-08-07): trocar o rascunho de SUPORTE pelo aceno
          // seguro fazia a Lia dizer "não consegui identificar a solução" com o
          // diagnóstico pronto — o cliente via o chamado escalado sem nenhuma
          // informação, enquanto a orientação (ancorada em KB) ficava só no resumo
          // interno. `confidence` é auto-declarado pelo modelo em JSON livre; quem
          // audita alucinação de verdade é a Supervisora, e ela JÁ aprovou este texto.
          // Então: envia a resposta real E escala em paralelo (needsHuman), em vez de
          // trocar informação útil por uma frase que é falsa quando há diagnóstico.
          needsHuman = true;
          blockedReason = 'confiança baixa no suporte — resposta enviada e caso escalado para humano';
          this.logger.warn(
            `Confiança baixa no suporte conv=${input.conversationId} — resposta mantida (aprovada pela ` +
            'supervisora) e caso escalado para humano',
          );
        } else if (confidence !== 'high') {
          // Vendas: o aceno seguro é um convite genérico, não uma afirmação falsa —
          // trocar o pitch por ele não engana ninguém. Comportamento preservado.
          outbound = SAFE_FALLBACK;
          blockedReason = 'confiança baixa (enviado aceno seguro)';
          this.logger.warn(
            `Aceno seguro no lugar do rascunho conv=${input.conversationId} intent=${route.intent} — ` +
            `${blockedReason}. Rascunho: ${draft.slice(0, 160)}`,
          );
        }

        // Última linha de defesa, DETERMINÍSTICA (ver shared/governance/output-guard.ts).
        // A Supervisora é outro modelo lendo a mesma mensagem hostil — se o texto
        // enganou o primeiro, pode enganar o segundo. Estas travas comparam número
        // com número: preço fora do catálogo (caso Chevrolet), recitação do prompt
        // interno (OWASP LLM07) e palavrão saindo com a marca.
        //
        // Roda sempre que o texto que vai sair é o GERADO — inclusive no caminho novo
        // de confiança baixa no suporte. Nos demais o texto já é literal nosso (aceno
        // seguro), e literal nosso não precisa de guard.
        if (outbound === draft) {
          // Rascunho do próprio agente de suporte com escalação já decidida por ele:
          // o texto traz o aviso de transbordo (ver support-agent.service.ts).
          if (route.agent === 'support' && escalacaoDecididaPeloAgente) transbordoAnunciadoNoTexto = true;

          const guard = inspectOutbound(outbound, allowedFacts, { phone: ownPhone, email: ownEmail });
          if (!guard.safe) {
            outbound = SAFE_FALLBACK;
            needsHuman = true; // vale para vendas também: alguém precisa ver o que ela ia dizer
            if (route.agent === 'support') transbordoAnunciadoNoTexto = true;
            blockedReason = `bloqueado pelo guard de saída (${guard.violations.join(', ')}): ${guard.detail}`;
            this.logger.warn(
              `Guard de saída barrou resposta conv=${input.conversationId} ` +
              `intent=${route.intent} — ${guard.detail}. Rascunho: ${draft.slice(0, 160)}`,
            );
            // Strike só quando a violação indica MANIPULAÇÃO (preço inventado,
            // recitação do prompt, ofensa, vazamento) — três strikes banem o número.
            // As travas de conselho fiscal, prazo, recurso e garantia bloqueiam do
            // mesmo jeito, mas NÃO pontuam: ali quem se excedeu foi a Lia, e banir o
            // lead por uma alucinação dela seria punir a vítima, em silêncio.
            const manipulacao = guard.violations.filter((v) => MANIPULATION_VIOLATIONS.has(v));
            if (ownPhone && manipulacao.length) {
              await this.abuseGuard.recordStrike(tenantId, ownPhone, manipulacao, guard.detail).catch(() => null);
            }
          }
        }

        // Humanização: pequena pausa antes de enviar (G5) — varia pelo tamanho do texto.
        //
        // Só no WhatsApp. Lá a pausa imita o tempo de digitação de uma pessoa e o
        // cliente não está com a tela aberta esperando. No widget do TMS e no portal
        // ele ESTÁ olhando o chat, e a pausa é latência percebida pura — 3 a 6 segundos
        // somados a um pipeline que já faz várias chamadas de IA em série.
        if (!input.portalIdentity) {
          const jitter = HUMANIZE_MIN_MS + (outbound.length % Math.max(1, HUMANIZE_MAX_MS - HUMANIZE_MIN_MS));
          await new Promise((r) => setTimeout(r, Math.min(HUMANIZE_MAX_MS, jitter)));
        }
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
    // Quando a resposta que acabou de sair JÁ avisou o cliente do transbordo (aceno
    // seguro ou aviso da matriz de escalação), o aviso adiante é uma segunda mensagem
    // dizendo a mesma coisa — foi o que aconteceu no chamado do CT-e 519. Quando ela
    // NÃO avisou (caminho de confiança baixa: sai a resposta técnica e o caso escala
    // por decisão do orquestrador), o aviso é a única forma de o cliente saber.
    const escalacaoJaAvisada = autoSent && route.agent === 'support' && transbordoAnunciadoNoTexto;
    const handoff = await this.applyPostResponseEffects(tenantId, route, input, needsHuman, escalacaoJaAvisada);

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
    input: { message: string; conversationId?: string; productCode?: string; portalIdentity?: { externalId: string; name?: string | null; page?: string | null }; sector?: string },
    route: RouteDecision,
    ctx: {
      agentMessage: string;
      history: string;
      priorHistory: string;
      msgs: any[];
      liaAlreadyTalked: boolean;
      handoffContext: unknown;
      /** Canal da conversa — decide a trilha (ver conversation-track.ts). */
      canal: string | null;
      canalDeSuporte: boolean;
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
        // Suporte pedido num CANAL COMERCIAL (WhatsApp, e-mail): a Lia direciona.
        //
        // Decisão de produto (08/08/2026, reafirmada em 09/08): suporte é exclusivo
        // do chat no site do HiperTMS. Aqui ela não diagnostica, não abre chamado e
        // não escala — fazer isso misturaria os dois funis.
        //
        // Resposta ÚNICA, para cliente e para prospect. Antes o texto dependia de o
        // número estar cadastrado no TMS: quem não era cliente recebia "fale com a
        // equipe comercial" mais um link de autocadastro, sem nunca dizer onde o
        // suporte fica. Distinguir os dois só fazia sentido quando a Lia tentava
        // resolver algo; direcionando, o endereço é o mesmo para todo mundo.
        //
        // Este caminho não chama o SupportAgent, então não gasta as chamadas de IA de
        // classificação/diagnóstico/resolução só para dizer "canal errado".
        if (!ctx.canalDeSuporte) {
          draft = SCRIPTS.suporteNoSite;
          suggestedAction = 'none';
          scripted = true;
          // A rota volta para comercial. Deixá-la em 'support' num canal comercial
          // seria um estado mentiroso: os efeitos pós-resposta olham `route.agent`
          // para decidir escalação e fila, e a conversa É comercial.
          route = { ...route, agent: 'sales', reason: 'suporte pedido em canal comercial — direcionado' };
          this.logger.log(
            `Suporte pedido em canal comercial (canal=${ctx.canal ?? '-'}) → direcionado ao chat do site`,
          );
          break;
        }

        // Já está no canal de suporte, mas não é cliente. Mandá-lo "para o chat do
        // site" seria circular — ele está nele. O que falta é o cadastro, e é isso
        // que a resposta diz. Sem este guard o prospect cairia no pipeline de
        // suporte completo, que é pós-venda.
        if (!tmsCustomer && !hasPanel && !handoffContext) {
          draft = SCRIPTS.suporteSomenteCliente;
          suggestedAction = 'none';
          scripted = true;
          this.logger.log('Prospect pediu suporte no canal de suporte → orientado ao comercial');
          break;
        }

        // Passa conversationId para que o SupportAgent recupere o histórico da conversa
        const r = await this.support.ask(tenantId, {
          question: agentMessage,
          conversationId: input.conversationId,
          tmsCustomer,
          sector: input.sector,
          productCode: input.productCode,
        });
        draft = r.draft;
        usedKnowledge = r.usedKnowledge;
        confidence = r.confidence;
        needsHuman = r.needsHuman;
        allowedFacts = r.allowedFacts;
        usage = r.usage;
        // Saudação/CSAT/aviso de transbordo são literais do catálogo do suporte —
        // pulam a Supervisora (a flag ainda é conferida por isKnownScript no envio).
        scripted = r.scripted === true;
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

  /**
   * Resumo de qualificação que o vendedor recebe no handoff (2026-08-08).
   *
   * Antes daqui o resumo era só `input.message.slice(0, 120)` — a última
   * mensagem crua. O vendedor abria o WhatsApp e via "🔥 Novo lead quente!
   * Cliente: 5511999999999 / Resumo: quero saber o preço": nenhum nome, nenhuma
   * empresa, nenhuma frota. E o sistema JÁ tinha esses dados: a vendedora os
   * extrai da conversa e o `applyLeadProfile` os grava no contato.
   *
   * Best-effort de propósito: se a consulta falhar, devolve a mensagem crua.
   * Um resumo pobre é ruim; um handoff que não acontece é muito pior.
   */
  private async buildHandoffSummary(tenantId: string, phone: string, lastMessage: string): Promise<string> {
    const crua = lastMessage.slice(0, 120);
    try {
      const c: any = await this.prisma.contact.findFirst({
        where: { tenantId, phone },
        select: { name: true, company: true, fleetSize: true } as any,
      });
      if (!c) return crua;

      const partes: string[] = [];
      if (c.name) partes.push(c.name);
      if (c.company) partes.push(c.company);
      if (c.fleetSize != null) partes.push(`frota ${c.fleetSize}`);
      // Sem nenhum dado de qualificação o prefixo seria só ruído.
      return partes.length ? `${partes.join(' · ')} — "${crua}"` : crua;
    } catch (e: any) {
      this.logger.warn(`buildHandoffSummary falhou (${phone}): ${e?.message}`);
      return crua;
    }
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
    canal: string | null,
  ): Promise<{
    route: RouteDecision;
    handoffContext: HandoffContext | null;
    tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean; page?: string | null } | undefined;
    hasPanel: boolean;
    agentMessage: string;
  }> {
    // Modalidade A: [via-painel-tms] → vai direto para suporte sem lookup
    const hasPanel = VIA_PANEL_MARKER.test(input.message);
    // Modalidade B: HANDOFF:token → resolve contexto rico e vai direto para suporte
    const handoffMatch = input.message.match(HANDOFF_TOKEN_RE);
    let handoffContext: HandoffContext | null = null;
    // Identidade do cliente — nome vem do TMS (token de handoff ou lookup por telefone), NUNCA do que a pessoa digita.
    let tmsCustomer: { externalId?: string; name: string; role?: string; tenantName?: string; isAdmin: boolean; page?: string | null } | undefined;

    // Suporte só existe em canal de suporte (widget/portal). Marcador e token de
    // handoff chegavam pelo WhatsApp — modalidades A e B da ADR 022, hoje SUPERADAS:
    // o frontend do TMS não usa mais nenhuma das duas, e a decisão de produto de
    // 08/08/2026 tornou o WhatsApp exclusivamente comercial. Se algo ainda mandar
    // esses marcadores por lá, o log registra em vez de abrir uma porta de suporte
    // no canal errado.
    const canalDeSuporte = isSupportChannel(canal);
    if ((handoffMatch || hasPanel) && !canalDeSuporte) {
      this.logger.warn(
        `Marcador de suporte recebido em canal comercial (canal=${canal ?? '-'}) — ` +
        'ADR 022 modalidades A/B foram superadas; a rota permanece comercial.',
      );
    }

    if (handoffMatch && canalDeSuporte) {
      handoffContext = await this.handoff.consume(handoffMatch[1]);
      if (handoffContext) {
        route = { ...route, agent: 'support' };
        // identidade segura: o nome vem do token (TMS autenticado), então a Lia já sabe quem é
        if (handoffContext.name) {
          tmsCustomer = {
            externalId: handoffContext.externalId,
            name: handoffContext.name,
            isAdmin: false,
            page: handoffContext.page ?? null,
            // Empresa vinda do token do TMS: a Lia sabe para quem o cliente trabalha
            // sem precisar perguntar (perguntar dado que o sistema já tem irrita e,
            // no caso de CNPJ, é vetor de fraude — ver regras de LGPD nos prompts).
            tenantName: handoffContext.companyName ?? undefined,
          };
        }
        this.logger.log(`HANDOFF token resolvido: ext=${handoffContext.externalId} nome=${handoffContext.name ?? '-'} page=${handoffContext.page ?? '-'}`);
      } else {
        this.logger.warn(`HANDOFF token inválido/expirado: ${handoffMatch[1]}`);
      }
    } else if (hasPanel && canalDeSuporte) {
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

    // ── TMS lookup: quem é o remetente ──────────────────────────────────────────
    //
    // Antes este bloco FORÇAVA rota de suporte quando o telefone era de um cliente
    // do TMS — inclusive no WhatsApp. Cliente que mandava mensagem no número de
    // marketing era atendido pelo suporte no canal errado, e a conversa saía da fila
    // de vendas. Agora ele só resolve a IDENTIDADE (útil para o vendedor saber que
    // fala com um cliente ativo); a trilha continua sendo do canal.
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
          // Cliente do TMS. A rota só vira suporte se o CANAL for de suporte — num
          // canal comercial ele segue com a Lia de vendas, que agora sabe estar
          // falando com um cliente ativo (bom para renovação e upsell).
          if (canalDeSuporte) route = { ...route, agent: 'support' };
          tmsCustomer = {
            name: tmsInfo.name,
            role: tmsInfo.role,
            tenantName: tmsInfo.tenantName,
            isAdmin: tmsInfo.role?.toUpperCase() === 'ADMIN',
          };
          this.logger.log(
            `TMS customer detected (${convForPhone.phone} → ${tmsInfo.name}) — ` +
            `canal=${canal ?? '-'} rota=${route.agent}`,
          );

          // `customerStage = 'cliente_ativo'` registra um FATO sobre o contato: ele já
          // é cliente. Antes esse campo era também o que jogava a conversa para o
          // inbox de Suporte — motivo pelo qual um cliente no WhatsApp saía da fila de
          // vendas. Agora a trilha é do canal, então o campo volta a ser só
          // informação, útil para quem vende (renovação, upsell).
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
    const atual = await this.prisma.aiConversation
      .findUnique({
        where: { id: conversationId },
        select: { phone: true, ticketCategory: true, customerStage: true, status: true, sourceChannel: true },
      })
      .catch(() => null);
    if (!atual?.phone) return '';

    // MESMA TRILHA, apenas.
    //
    // A busca era só por telefone. Um cliente que abriu chamado reclamando de CT-e
    // rejeitado e meses depois falou com vendas levava a reclamação inteira para
    // dentro do prompt de vendas, como "[Contexto de conversa anterior]". Suporte e
    // vendas são funis separados; memória entre eles é vazamento, não contexto.
    const trilha = isSupportConversation(atual) ? 'support' : 'sales';

    const priorConvs = await this.prisma.aiConversation
      .findMany({
        where: {
          tenantId,
          phone: atual.phone,
          id: { not: conversationId },
          ...trackWhere(trilha),
        },
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
      this.logger.log(
        `Contexto anterior carregado para ${atual.phone} (trilha=${trilha}): conv ${pc.id.slice(0, 8)}, ${filtered.length} msgs`,
      );
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
    /** A resposta já enviada ao cliente nesta rodada já anunciou o transbordo. */
    escalacaoJaAvisada = false,
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
      const handoffSummary = await this.buildHandoffSummary(tenantId, conv.phone, input.message);
      handoff = await this.sellers.handoff(tenantId, {
        conversationId: input.conversationId ?? '',
        contactPhone: conv.phone,
        leadScore: route.leadScore,
        summary: handoffSummary,
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
      // Dentro do expediente este aviso repete o que a resposta anterior já disse —
      // duas mensagens seguidas anunciando o mesmo transbordo. Fora do expediente ele
      // acrescenta informação que o rascunho não tem (horário e quando o time retoma),
      // então continua valendo mesmo com a escalação já anunciada.
      const avisoRedundante = escalacaoJaAvisada && isWithinSupportHours();
      if (avisoRedundante) {
        this.logger.log(
          `Aviso de escalação suprimido (conv=${conv.id}) — a resposta enviada nesta rodada já avisou o cliente`,
        );
      }
      if (conv.phone && !conv.phone.startsWith('email:') && !avisoRedundante) {
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
        summary: await this.buildHandoffSummary(tenantId, conv.phone, input.message),
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
