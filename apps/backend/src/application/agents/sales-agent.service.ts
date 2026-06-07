import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { ConnectorsService } from '@/application/connectors/connectors.service';
import { PlaybookService, PlaybookConfig } from '@/application/playbook/playbook.service';

export interface SalesReply {
  draft: string;
  suggestedAction: 'none' | 'create_payment' | 'schedule_meeting' | 'handoff_human';
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
  static greeting(): string {
    const h = new Date().getHours();
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
    input: { question: string; productCode?: string; history?: string; leadScore?: number },
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

    const system =
      'Você é a Lia, consultora de vendas da Nexa (vende o HiperTMS para transportadoras). ' +
      (cfg.persona ? `${cfg.persona} ` : '') +
      `Saudação do horário: "${SalesAgentService.greeting()}" — só cumprimente no PRIMEIRO contato, nunca repita em toda mensagem. ` +
      'Fale em português do Brasil, tom cordial e consultivo, curto (WhatsApp, 2-5 linhas). Use **negrito** e emojis com moderação.\n\n' +
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
      'REGRAS: nunca invente preço/recurso (use só o catálogo); uma pergunta por vez; não peça e-mail se o lead ainda está frio; ' +
      'não fecha pagamento nem agenda sozinha — apenas conduz. ' +
      'Ao final, em uma linha separada: ACTION=<none|create_payment|schedule_meeting|handoff_human>.';

    const user =
      `Catálogo de planos:\n${planTxt || '(indisponível)'}\n\n` +
      (kbTxt ? `Base de conhecimento:\n${kbTxt}\n\n` : '') +
      (input.history ? `Histórico da conversa:\n${input.history}\n\n` : '') +
      `Mensagem do lead AGORA: ${input.question}`;

    try {
      const u = await this.ai.completeWithUsage(system, user, { maxTokens: 450, temperature: 0.5 });
      const raw = u.text;
      const action = this.parseAction(raw);
      const draft = raw.replace(/ACTION=.*/i, '').trim();
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
        `Temos planos a partir de R$89/mês. Pra te indicar o ideal, me conta: ` +
        `quantos veículos/motoristas a sua operação tem hoje? 🚚`;
      return { draft, suggestedAction: 'none', usedKnowledge: [], allowedFacts, confidence: 'low', model: AI_MODEL };
    }
  }

  private parseAction(raw: string): SalesReply['suggestedAction'] {
    const m = raw.match(/ACTION=\s*(none|create_payment|schedule_meeting|handoff_human)/i);
    return (m?.[1]?.toLowerCase() as SalesReply['suggestedAction']) ?? 'none';
  }
}
