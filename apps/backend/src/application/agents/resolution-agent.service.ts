import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { PlaybookService } from '@/application/playbook/playbook.service';
import { SalesAgentService } from './sales-agent.service';
import { DiagnosticResult } from './diagnostic-agent.service';
import { TicketCategory, TicketPriority } from './case-classifier-agent.service';

export interface ResolutionResult {
  draft: string;                     // texto a enviar ao cliente
  resolved: boolean;                 // IA acredita ter resolvido
  action: string | null;             // ACTION= para backend executar (ADR 012)
  usedKnowledge: { id: string; title: string; score: number }[];
  confidence: 'high' | 'low';
}

@Injectable()
export class ResolutionAgentService {
  private readonly logger = new Logger('ResolutionAgent');

  constructor(
    private readonly ai: AnthropicService,
    private readonly knowledge: KnowledgeService,
    private readonly playbook: PlaybookService,
  ) {}

  async resolve(input: {
    tenantId: string;
    message: string;
    category: TicketCategory;
    priority: TicketPriority;
    diagnostic: DiagnosticResult;
    history: string;
    tmsCustomer: { name: string } | null;
  }): Promise<ResolutionResult> {
    const kb = await this.knowledge.retrieve(input.tenantId, input.message, 3, { excludeCategories: ['comercial'] });
    const usedKnowledge = kb.map((k: any) => ({ id: k.id, title: k.title, score: k.score }));
    const kbCtx = kb.map((k: any, i: number) => `[KB ${i + 1}: ${k.title}]\n${k.content}`).join('\n\n');

    const diagCtx = input.diagnostic.rootCause
      ? `Causa-raiz identificada: ${input.diagnostic.rootCause}`
      : 'Causa-raiz: não identificada';
    const suggCtx = input.diagnostic.suggestedAction
      ? `\nAção sugerida pelo diagnóstico: ${input.diagnostic.suggestedAction}`
      : '';

    const customerName = input.tmsCustomer?.name ?? 'cliente';

    // Persona/tom editável do SUPORTE (Config de Suporte). Só afeta o tom — as
    // regras fixas abaixo (anti-alucinação, usar só KB/diagnóstico) prevalecem.
    const cfg = await this.playbook.get(input.tenantId).catch(() => null);
    const supportTone = cfg?.supportPersona?.trim() ? `${cfg.supportPersona.trim()}\n` : '';

    const system = `Você é a Lia, assistente de SUPORTE do HiperTMS.
${supportTone}Você está atendendo ${customerName}, que já é cliente ativo.
NÃO tente vender. Foco: resolver o problema.

Regras:
- Resposta curta e objetiva (WhatsApp). PROIBIDO markdown (asteriscos, underline, #).
- Use SOMENTE as informações das fontes KB e do diagnóstico.
- Se resolver: declare "resolved: true" no JSON.
- Se precisar de ação do backend (ex: verificar configuração): use "action": "ACTION=<tipo>".
- Se não resolver: resolved=false, oriente próximo passo.
- Língua: português do Brasil.

Responda APENAS com JSON (sem markdown):
{
  "draft": "<mensagem ao cliente>",
  "resolved": false,
  "action": null,
  "confidence": "high"
}`;

    const userMsg =
      `Categoria: ${input.category} | Prioridade: ${input.priority}\n` +
      `${diagCtx}${suggCtx}\n\n` +
      (kbCtx ? `Fontes KB:\n${kbCtx}\n\n` : '') +
      (input.history ? `Histórico:\n${input.history}\n\n` : '') +
      `Mensagem do cliente: ${input.message}`;

    try {
      const text = await this.ai.complete(system, userMsg, { maxTokens: 400 });
      const clean = text.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(clean) as Omit<ResolutionResult, 'usedKnowledge'>;
      // Remove markdown residual
      parsed.draft = SalesAgentService.stripMarkdown(parsed.draft);
      return { ...parsed, usedKnowledge };
    } catch (err: any) {
      this.logger.warn(`Resolução falhou (${err?.message})`);
      return {
        draft: 'Não consegui processar sua solicitação. Vou te conectar com um especialista.',
        resolved: false,
        action: null,
        usedKnowledge,
        confidence: 'low',
      };
    }
  }
}
