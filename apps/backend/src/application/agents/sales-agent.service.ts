import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { ConnectorsService } from '@/application/connectors/connectors.service';

export interface SalesReply {
  draft: string;
  suggestedAction: 'none' | 'create_payment' | 'schedule_meeting' | 'handoff_human';
  usedKnowledge: { id: string; title: string }[];
  confidence: 'high' | 'low';
  model: string;
}

@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger('SalesAgent');

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

    const system =
      'Você é a Lia, consultora de vendas da Nexa (vende o HiperTMS para transportadoras). ' +
      'Objetivo: avançar a venda de forma cordial e consultiva, em português do Brasil, curto (WhatsApp). ' +
      'Qualifique o lead com no máximo UMA pergunta objetiva quando fizer sentido (porte da frota, volume de docs). ' +
      'Recomende o plano adequado usando SOMENTE o catálogo fornecido (nunca invente preço/recurso). ' +
      'Se o lead demonstrar intenção de fechar, conduza para o próximo passo. ' +
      'Você NÃO fecha pagamento nem agenda sozinha — apenas sugere o próximo passo. ' +
      'Ao final da resposta, em uma linha separada, escreva: ACTION=<none|create_payment|schedule_meeting|handoff_human>.';

    const user =
      `Catálogo de planos:\n${planTxt || '(indisponível)'}\n\n` +
      (kbTxt ? `Base de conhecimento:\n${kbTxt}\n\n` : '') +
      (input.history ? `Histórico:\n${input.history}\n\n` : '') +
      `Mensagem do lead: ${input.question}`;

    try {
      const raw = await this.ai.complete(system, user, { maxTokens: 450, temperature: 0.5 });
      const action = this.parseAction(raw);
      const draft = raw.replace(/ACTION=.*/i, '').trim();
      return {
        draft,
        suggestedAction: action,
        usedKnowledge: kb.map((k) => ({ id: k.id, title: k.title })),
        confidence: 'high',
        model: AI_MODEL,
      };
    } catch (e: any) {
      this.logger.warn(`Sales fallback (${e?.message})`);
      const draft =
        `Temos planos a partir de R$89/mês. Pra te indicar o ideal, me conta: ` +
        `quantos veículos/motoristas a sua operação tem hoje? 🚚`;
      return { draft, suggestedAction: 'none', usedKnowledge: [], confidence: 'low', model: AI_MODEL };
    }
  }

  private parseAction(raw: string): SalesReply['suggestedAction'] {
    const m = raw.match(/ACTION=\s*(none|create_payment|schedule_meeting|handoff_human)/i);
    return (m?.[1]?.toLowerCase() as SalesReply['suggestedAction']) ?? 'none';
  }
}
