import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';
import { SalesAgentService } from './sales-agent.service';

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
}

@Injectable()
export class SupportAgentService {
  private readonly logger = new Logger('SupportAgent');
  private lastUsage?: { tokensIn: number; tokensOut: number; costUsd: number };

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly conversations: ConversationsService,
    private readonly ai: AnthropicService,
  ) {}

  // NOTA BUG-02 + BUG-03: autonomy getter removido daqui.
  // O auto-envio era feito em finalize() causando double-send (SupportAgent + ConversationAgentService).
  // O envio é responsabilidade exclusiva do orquestrador (ConversationAgentService — ADR 012).
  // O kill switch em runtime (AutonomyService) só é respeitado no orquestrador.

  // A Lia responde uma pergunta usando a base de conhecimento (RAG).
  // Sempre retorna RASCUNHO — o orquestrador decide se envia (ADR 012).
  async ask(
    tenantId: string,
    input: { question: string; conversationId?: string },
  ): Promise<AgentReply> {
    const kb = await this.knowledge.retrieve(tenantId, input.question, 3);
    const usedKnowledge = kb.map((k) => ({ id: k.id, title: k.title, score: k.score }));

    // sem conhecimento relevante → escala p/ humano (não inventa)
    if (kb.length === 0) {
      const draft =
        'Não encontrei isso na nossa base ainda. Vou te conectar com um especialista pra te ajudar melhor. 🙂';
      return this.finalize(input, draft, usedKnowledge, '', 'low', true);
    }

    const context = kb
      .map((k, i) => `[Fonte ${i + 1}: ${k.title}]\n${k.content}`)
      .join('\n\n');

    const history = input.conversationId
      ? (await this.conversations.getMessages(tenantId, input.conversationId))
          .slice(-6)
          .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Lia'}: ${m.content}`)
          .join('\n')
      : '';

    // BUG-06 fix: hora de Brasília (UTC-3) para saudação correta em containers Linux
    const greeting = (() => {
      const h = (new Date().getUTCHours() - 3 + 24) % 24;
      if (h >= 5 && h < 12) return 'Bom dia';
      if (h >= 12 && h < 18) return 'Boa tarde';
      return 'Boa noite';
    })();
    const system =
      'Você é a Lia, assistente comercial da Nexa (vende o sistema HiperTMS para transportadoras). ' +
      `Quando saudar, use a saudação adequada ao horário atual: "${greeting}" (não repita em toda mensagem). ` +
      'Responda em português do Brasil, de forma curta, cordial e objetiva (WhatsApp). ' +
      'PROIBIDO usar markdown (asteriscos, underline, #, backtick) — o WhatsApp não renderiza, aparece literalmente. ' +
      'Use SOMENTE as informações das Fontes fornecidas. Se a resposta não estiver nas Fontes, ' +
      'diga que vai checar com um especialista — NUNCA invente preços, prazos ou recursos. ' +
      'Se a dúvida exigir decisão humana (negociação, desconto, contrato), sinalize.';

    const userMsg =
      `Fontes da base de conhecimento:\n${context}\n\n` +
      (history ? `Histórico recente:\n${history}\n\n` : '') +
      `Pergunta do cliente: ${input.question}`;

    let draft: string;
    let confidence: 'high' | 'low' = 'high';
    this.lastUsage = undefined;
    try {
      const u = await this.ai.completeWithUsage(system, userMsg, { maxTokens: 400 });
      // Remove markdown — WhatsApp não renderiza, aparece como asteriscos literais
      draft = SalesAgentService.stripMarkdown(u.text);
      this.lastUsage = { tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd: u.costUsd };
    } catch (e: any) {
      this.logger.warn(`Claude indisponível (${e?.message}) — fallback determinístico`);
      // fallback testável sem API: monta resposta a partir da fonte top-1
      draft = `${kb[0].content}\n\n(Posso detalhar mais se quiser! 🙂)`;
      confidence = 'low';
    }

    const needsHuman = /especialista|humano|não encontrei|checar/i.test(draft);
    return this.finalize(input, draft, usedKnowledge, context, confidence, needsHuman);
  }

  // BUG-02 fix: finalize() nunca envia mensagem — apenas monta e retorna o rascunho.
  // O ConversationAgentService (orquestrador) é o único responsável pelo auto-envio.
  private finalize(
    input: { question: string; conversationId?: string },
    draft: string,
    usedKnowledge: AgentReply['usedKnowledge'],
    allowedFacts: string,
    confidence: 'high' | 'low',
    needsHuman: boolean,
  ): AgentReply {
    return {
      draft,
      usedKnowledge,
      allowedFacts,
      confidence,
      needsHuman,
      model: MODEL,
      autonomyEnabled: false, // decisão de autonomia fica no orquestrador
      autoSent: false,        // nunca envia daqui — BUG-02
      usage: this.lastUsage,
    };
  }
}
