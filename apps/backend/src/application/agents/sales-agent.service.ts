import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { ConnectorsService } from '@/application/connectors/connectors.service';

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
  ) {}

  // Conduz a venda: qualifica, recomenda plano, sugere próximo passo (NÃO executa — ADR 012).
  async sell(
    tenantId: string,
    input: { question: string; productCode?: string; history?: string },
  ): Promise<SalesReply> {
    const productCode = input.productCode ?? 'hipertms';
    const [kb, plans] = await Promise.all([
      this.knowledge.retrieve(tenantId, input.question, 2),
      this.connectors.getPlans(productCode).catch(() => []),
    ]);

    const planTxt = plans
      .map((p) => `- ${p.name} (${p.code}): R$${p.price}${p.maxUsers ? `, até ${p.maxUsers} usuários` : ''}${p.features?.length ? ` — ${p.features.join(', ')}` : ''}`)
      .join('\n');
    const kbTxt = kb.map((k) => `[${k.title}]\n${k.content}`).join('\n\n');
    // tudo que a vendedora tinha permissão de usar (planos + KB) → vai p/ a supervisora auditar
    const allowedFacts =
      (planTxt ? `PLANOS:\n${planTxt}` : '') + (kbTxt ? `\n\nCONHECIMENTO:\n${kbTxt}` : '');

    const system =
      'Você é a Lia, consultora de vendas da Nexa (vende o HiperTMS para transportadoras). ' +
      `Quando saudar, use a saudação adequada ao horário atual: "${SalesAgentService.greeting()}" (não repita saudação em toda mensagem). ` +
      'Objetivo: avançar a venda de forma cordial e consultiva, em português do Brasil, curto (WhatsApp). ' +
      'Qualifique o lead com no máximo UMA pergunta objetiva quando fizer sentido (porte da frota, volume de docs). ' +
      'Recomende o plano adequado usando SOMENTE o catálogo fornecido (nunca invente preço/recurso). ' +
      'Se o lead demonstrar intenção de fechar, conduza para o próximo passo. ' +
      'Quando o lead estiver interessado, peça de forma natural o MELHOR e-mail (ou confirme o WhatsApp) ' +
      'para o time comercial dar sequência — só peça uma vez, sem insistir. ' +
      'Você NÃO fecha pagamento nem agenda sozinha — apenas sugere o próximo passo. ' +
      'Ao final da resposta, em uma linha separada, escreva: ACTION=<none|create_payment|schedule_meeting|handoff_human>.';

    const user =
      `Catálogo de planos:\n${planTxt || '(indisponível)'}\n\n` +
      (kbTxt ? `Base de conhecimento:\n${kbTxt}\n\n` : '') +
      (input.history ? `Histórico:\n${input.history}\n\n` : '') +
      `Mensagem do lead: ${input.question}`;

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
