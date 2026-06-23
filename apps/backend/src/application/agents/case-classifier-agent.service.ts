import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService, AI_MODEL } from '@/shared/ai/anthropic.service';

// Categorias canônicas (ADR 016 D1)
export type TicketCategory =
  | 'fiscal'
  | 'cte'
  | 'mdfe'
  | 'frete'
  | 'financeiro'
  | 'cadastro'
  | 'frota'
  | 'usuarios'
  | 'integracoes'
  | 'api'
  | 'erro_sistema'
  | 'treinamento';

// Prioridade (ADR 016 D2)
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ClassificationResult {
  category: TicketCategory;
  priority: TicketPriority;
  requiresHuman: boolean;   // sensível (fiscal/financeiro com low-confidence)
  confidence: 'high' | 'low';
  reasoning?: string;       // para auditoria
}

@Injectable()
export class CaseClassifierAgentService {
  private readonly logger = new Logger('CaseClassifierAgent');

  constructor(private readonly ai: AnthropicService) {}

  async classify(message: string, history: string = ''): Promise<ClassificationResult> {
    const system = `Você é um classificador de chamados de suporte do HiperTMS (sistema TMS para transportadoras).

Categorias disponíveis:
- fiscal: tributação, regras fiscais, rejeição SEFAZ
- cte: emissão, complementar, cancelamento, rejeição de CT-e
- mdfe: manifesto, encerramento, eventos MDF-e
- frete: cálculo, tabela, contrato de frete
- financeiro: fatura, cobrança, repasse financeiro entre clientes/prestadores
- cadastro: clientes, remetentes, destinatários
- frota: veículos, motoristas, CNH, manutenção, abastecimento, combustível, diária de motorista
- usuarios: acesso, permissão, senha
- integracoes: ERP, parceiros, webhooks
- api: uso da API, tokens, erros HTTP
- erro_sistema: bug, tela travada, comportamento inesperado
- treinamento: dúvidas operacionais "como faço para..."

DESAMBIGUAÇÃO — use estas regras quando a mensagem misturar domínios:
- Abastecimento/combustível que não gera conta a pagar → frota (não financeiro)
- Conta a pagar gerada por abastecimento ou manutenção de veículo → frota
- Diária ou adiantamento de motorista → frota (não financeiro)
- Fatura de cliente ou prestador de serviço → financeiro
- Contrato comercial de frete → frete (não financeiro)

Prioridade:
- critical: operação parada (não emite CT-e/MDF-e em produção)
- high: bloqueio parcial, tema financeiro/fiscal
- medium: dúvida operacional sem bloqueio
- low: treinamento, "como faço"

Responda APENAS com JSON válido (sem markdown):
{
  "category": "<categoria>",
  "priority": "<prioridade>",
  "requiresHuman": false,
  "confidence": "high",
  "reasoning": "<motivo curto>"
}

Regra de segurança: se category for "fiscal" ou "financeiro" E confidence for "low" → requiresHuman = true.`;

    const userMsg = history
      ? `Histórico recente:\n${history}\n\nMensagem atual: ${message}`
      : `Mensagem: ${message}`;

    try {
      const text = await this.ai.complete(system, userMsg, { maxTokens: 200 });
      const clean = text.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(clean) as ClassificationResult;

      // Garantia de segurança ADR 015 D6
      if ((parsed.category === 'fiscal' || parsed.category === 'financeiro') && parsed.confidence === 'low') {
        parsed.requiresHuman = true;
      }

      return parsed;
    } catch (err: any) {
      this.logger.warn(`Classificação falhou (${err?.message}) — fallback p/ treinamento/medium`);
      return {
        category: 'treinamento',
        priority: 'medium',
        requiresHuman: false,
        confidence: 'low',
        reasoning: 'fallback por falha na classificação',
      };
    }
  }
}
