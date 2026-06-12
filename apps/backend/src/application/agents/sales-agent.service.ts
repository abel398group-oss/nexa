import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { ConnectorsService } from '@/application/connectors/connectors.service';
import { PlaybookService, PlaybookConfig } from '@/application/playbook/playbook.service';

export interface SalesReply {
  draft: string;
  suggestedAction: 'none' | 'schedule_meeting' | 'handoff_human';
  usedKnowledge: { id: string; title: string }[];
  allowedFacts: string; // catálogo de planos + KB que a vendedora PODIA usar (p/ supervisora)
  confidence: 'high' | 'low';
  model: string;
  usage?: { tokensIn: number; tokensOut: number; costUsd: number };
}

@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger('SalesAgent');

  // saudação por horário (Brasília) — business-rules §10
  // BUG-06 fix: getHours() retorna UTC em containers Linux → usar UTC-3 explicitamente
  static greeting(): string {
    const h = (new Date().getUTCHours() - 3 + 24) % 24;
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  constructor(
    private readonly ai: AnthropicService,
    private readonly knowledge: KnowledgeService,
    private readonly connectors: ConnectorsService,
    private readonly playbook: PlaybookService,
  ) {}

  // CTA progressivo: o próximo passo muda conforme o engajamento (lead score) — textos vêm do playbook editável.
  private ctaGuidance(score: number, cfg: PlaybookConfig): { tier: string; guidance: string } {
    if (score >= 70) return { tier: 'QUENTE', guidance: cfg.ctaHot };
    if (score >= 40) return { tier: 'MORNO', guidance: cfg.ctaWarm };
    return { tier: 'FRIO', guidance: cfg.ctaCold };
  }

  // Conduz a venda: qualifica, recomenda plano, sugere próximo passo (NÃO executa — ADR 012).
  async sell(
    tenantId: string,
    input: { question: string; productCode?: string; history?: string; leadScore?: number; ongoing?: boolean; hasPriorContext?: boolean },
  ): Promise<SalesReply> {
    const productCode = input.productCode ?? 'hipertms';
    const [kb, plans, cfg] = await Promise.all([
      this.knowledge.retrieve(tenantId, input.question, 2),
      this.connectors.getPlans(productCode).catch(() => []),
      this.playbook.get(tenantId),
    ]);

    const planTxt = plans
      .map((p) => `- ${p.name} (${p.code}): R$${p.price}${p.maxUsers ? `, até ${p.maxUsers} usuários` : ''}${p.features?.length ? ` — ${p.features.join(', ')}` : ''}`)
      .join('\n');
    const kbTxt = kb.map((k) => `[${k.title}]\n${k.content}`).join('\n\n');
    // tudo que a vendedora tinha permissão de usar (planos + KB) → vai p/ a supervisora auditar
    const allowedFacts =
      (planTxt ? `PLANOS:\n${planTxt}` : '') + (kbTxt ? `\n\nCONHECIMENTO:\n${kbTxt}` : '');

    const { tier, guidance } = this.ctaGuidance(input.leadScore ?? 0, cfg);
    const objectionsTxt = (cfg.objections ?? [])
      .map((o) => `"${o.objection}" → ${o.guidance}`)
      .join('\n');

    const ongoing = input.ongoing ?? !!(input.history && input.history.trim().length > 0);
    const greetingRule = ongoing
      ? 'IMPORTANTE: a conversa JÁ ESTÁ EM ANDAMENTO. NÃO cumprimente de novo (proibido "bom dia/boa tarde/olá/oi" e proibido se reapresentar). Responda direto ao ponto. '
      : `Este é o PRIMEIRO contato: cumprimente UMA vez com "${SalesAgentService.greeting()}" e apresente-se brevemente. `;

    const priorContextRule = input.hasPriorContext
      ? 'RETOMADA: o histórico acima contém conversas anteriores com este lead. Retome ativamente: mencione o que ele já informou (ex.: "você mencionou X caminhões antes") e continue de onde parou, sem repetir perguntas já respondidas. Se o lead voltou após opt-out, trate com naturalidade — sem drama nem explicação sobre o opt-out. '
      : '';

    const system =
      'Você é a Lia, consultora de vendas da Nexa (vende o HiperTMS para transportadoras). ' +
      (cfg.persona ? `${cfg.persona} ` : '') +
      greetingRule +
      priorContextRule +
      'Fale em português do Brasil, com tom profissional e institucional (negociação entre empresas) e postura consultiva, em mensagens curtas de WhatsApp (2-5 linhas). Evite emojis e gírias. ' +
      'PROIBIDO usar markdown (asteriscos, underline, #, backtick) — o WhatsApp não renderiza, aparece literalmente.\n\n' +
      'VOCÊ CONDUZ A VENDA POR ESTÁGIOS. Descubra em qual estágio a conversa está (pelo histórico) e cumpra o objetivo dele:\n' +
      '1) SAUDAÇÃO: acolher e descobrir o motivo do contato.\n' +
      '2) DESCOBERTA: entender a dor/operação (que problema ele quer resolver?).\n' +
      '3) QUALIFICAÇÃO (BANT-lite): descobrir o que ainda não souber — porte da frota (Necessidade), volume de docs/mês, quem decide a compra (Autoridade) e urgência (Timing). Faça no MÁXIMO UMA pergunta por mensagem. NÃO repergunte o que o cliente já respondeu no histórico.\n' +
      '4) PROPOSTA DE VALOR: recomende o plano adequado (SÓ do catálogo, nunca invente preço/recurso) e ligue 1-2 benefícios à dor dele.\n' +
      '5) OBJEÇÕES: se houver resistência, trate com a biblioteca abaixo (adapte, não copie).\n' +
      '6) CTA: conduza ao próximo passo conforme o engajamento (veja abaixo).\n' +
      '7) HANDOFF: quando quente, encaminhe ao especialista.\n\n' +
      `ENGAJAMENTO ATUAL DO LEAD: ${tier}. ${guidance}\n\n` +
      (objectionsTxt ? `BIBLIOTECA DE OBJEÇÕES:\n${objectionsTxt}\n\n` : '') +
      'REGRAS: nunca invente preço/recurso (use só o catálogo). ' +
      'PROIBIDO prometer/afirmar o que NÃO estiver no catálogo/base: teste grátis ou período de teste, desconto, aplicativo/app mobile, ' +
      'integração específica, prazo de implantação ou qualquer recurso não listado. Se o cliente pedir algo assim e não constar nos fatos, ' +
      'diga com naturalidade que vai confirmar com o time — NUNCA invente. ' +
      'Uma pergunta por vez; não peça e-mail se o lead ainda está frio; ' +
      'não cobra nem processa pagamento — o cliente finaliza no site. ' +
      `FECHAMENTO: quando o lead quiser contratar, envie o LINK DE CADASTRO: ${cfg.signupUrl} — ` +
      'oriente a criar a conta lá (onde ele escolhe o plano e finaliza) e ofereça ajuda se travar. NÃO peça pagamento aqui. ' +
      'Ao final, em uma linha separada: ACTION=<none|schedule_meeting|handoff_human>.';

    const user =
      `Catálogo de planos:\n${planTxt || '(indisponível)'}\n\n` +
      (kbTxt ? `Base de conhecimento:\n${kbTxt}\n\n` : '') +
      (input.history ? `Histórico da conversa:\n${input.history}\n\n` : '') +
      `Mensagem do lead AGORA: ${input.question}`;

    try {
      const u = await this.ai.completeWithUsage(system, user, { maxTokens: 450, temperature: 0.5 });
      const raw = u.text;
      const action = this.parseAction(raw);
      let draft = raw.replace(/ACTION=.*/i, '').trim();
      // Remove formatação markdown — WhatsApp não renderiza, aparece como lixo visual
      draft = SalesAgentService.stripMarkdown(draft);
      // GARANTIA: se a conversa já está em andamento, remove saudação no início (o modelo às vezes insiste)
      if (ongoing) {
        const before = draft;
        // remove saudação no começo + tudo que não for letra (emoji, pontuação, quebras) até o conteúdo real
        draft = draft
          .replace(/^[^a-zA-ZÀ-ÿ]*(bom dia|boa tarde|boa noite|ol[áa]|oi)[^a-zA-ZÀ-ÿ]*?(tudo bem\??|tudo certo\??)?[^a-zA-ZÀ-ÿ]*/i, '')
          .trimStart();
        if (draft && draft !== before) draft = draft.charAt(0).toUpperCase() + draft.slice(1);
      }
      return {
        draft,
        suggestedAction: action,
        usedKnowledge: kb.map((k) => ({ id: k.id, title: k.title })),
        allowedFacts,
        confidence: 'high',
        model: AI_MODEL,
        usage: { tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd: u.costUsd },
      };
    } catch (e: any) {
      this.logger.warn(`Sales fallback (${e?.message})`);
      const draft =
        `Temos planos a partir de R$89/mês. Para indicar o ideal para a sua operação, me conte: ` +
        `quantos veículos a sua frota tem hoje e qual o volume aproximado de documentos fiscais por mês?`;
      return { draft, suggestedAction: 'none', usedKnowledge: [], allowedFacts, confidence: 'low', model: AI_MODEL };
    }
  }

  // Remove formatação markdown (negrito, itálico, código, cabeçalhos, listas)
  // para que o texto fique limpo no WhatsApp onde markdown não é renderizado.
  static stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')   // **negrito** → negrito
      .replace(/\*(.+?)\*/g, '$1')        // *itálico* → itálico
      .replace(/__(.+?)__/g, '$1')        // __negrito__ → negrito
      .replace(/_(.+?)_/g, '$1')          // _itálico_ → itálico
      .replace(/`{1,3}(.+?)`{1,3}/g, '$1') // `código` → código
      .replace(/^#{1,6}\s+/gm, '')        // # Título → Título
      .replace(/^\s*[-*+]\s+/gm, '• ')   // - item → • item (lista limpa)
      .trim();
  }

  private parseAction(raw: string): SalesReply['suggestedAction'] {
    const m = raw.match(/ACTION=\s*(none|schedule_meeting|handoff_human)/i);
    return (m?.[1]?.toLowerCase() as SalesReply['suggestedAction']) ?? 'none';
  }
}
