import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { ConversationsService } from '@/application/conversations/conversations.service';

const MODEL = process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export interface AgentReply {
  draft: string;
  usedKnowledge: { id: string; title: string; score: number }[];
  confidence: 'high' | 'low';
  needsHuman: boolean;
  model: string;
  autonomyEnabled: boolean;
  autoSent: boolean;
}

@Injectable()
export class SupportAgentService {
  private readonly logger = new Logger('SupportAgent');

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly conversations: ConversationsService,
  ) {}

  private get autonomy(): boolean {
    return String(process.env.AI_AUTONOMY_ENABLED).toLowerCase() === 'true';
  }

  // A Lia responde uma pergunta usando a base de conhecimento (RAG).
  // Por padrão gera RASCUNHO (IA recomenda; humano/back-end executa — ADR 012).
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
      return this.finalize(tenantId, input, draft, usedKnowledge, 'low', true);
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

    const system =
      'Você é a Lia, assistente comercial da Nexa (vende o sistema HiperTMS para transportadoras). ' +
      'Responda em português do Brasil, de forma curta, cordial e objetiva (WhatsApp). ' +
      'Use SOMENTE as informações das Fontes fornecidas. Se a resposta não estiver nas Fontes, ' +
      'diga que vai checar com um especialista — NUNCA invente preços, prazos ou recursos. ' +
      'Se a dúvida exigir decisão humana (negociação, desconto, contrato), sinalize.';

    const userMsg =
      `Fontes da base de conhecimento:\n${context}\n\n` +
      (history ? `Histórico recente:\n${history}\n\n` : '') +
      `Pergunta do cliente: ${input.question}`;

    let draft: string;
    let confidence: 'high' | 'low' = 'high';
    try {
      draft = await this.callClaude(system, userMsg);
    } catch (e: any) {
      this.logger.warn(`Claude indisponível (${e?.message}) — fallback determinístico`);
      // fallback testável sem API: monta resposta a partir da fonte top-1
      draft = `${kb[0].content}\n\n(Posso detalhar mais se quiser! 🙂)`;
      confidence = 'low';
    }

    const needsHuman = /especialista|humano|não encontrei|checar/i.test(draft);
    return this.finalize(tenantId, input, draft, usedKnowledge, confidence, needsHuman);
  }

  private async finalize(
    tenantId: string,
    input: { question: string; conversationId?: string },
    draft: string,
    usedKnowledge: AgentReply['usedKnowledge'],
    confidence: 'high' | 'low',
    needsHuman: boolean,
  ): Promise<AgentReply> {
    // auto-envio só se autonomia LIGADA, confiança alta e não precisa humano (kill switch + ADR 012)
    let autoSent = false;
    if (this.autonomy && confidence === 'high' && !needsHuman && input.conversationId) {
      await this.conversations.addMessage(tenantId, input.conversationId, {
        direction: 'outbound',
        content: draft,
        intent: 'support_answer',
      });
      autoSent = true;
    }
    return {
      draft,
      usedKnowledge,
      confidence,
      needsHuman,
      model: MODEL,
      autonomyEnabled: this.autonomy,
      autoSent,
    };
  }

  private async callClaude(system: string, userMsg: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente');

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 160)}`);
    }
    const data: any = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text) throw new Error('Resposta vazia da Anthropic');
    return text;
  }
}
