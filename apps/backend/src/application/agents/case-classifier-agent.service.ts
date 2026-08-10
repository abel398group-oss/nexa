import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';

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

// Vocabulário válido de category — usado para normalizar a saída da IA antes
// de comparar (auditoria de suporte 2026-08-05, achado §1). Sem isso, "Fiscal"
// (maiúscula) ou espaço a mais fazia a trava de segurança ADR 015 D6 falhar
// em silêncio, sem log nenhum avisando.
const KNOWN_CATEGORIES: TicketCategory[] = [
  'fiscal', 'cte', 'mdfe', 'frete', 'financeiro', 'cadastro',
  'frota', 'usuarios', 'integracoes', 'api', 'erro_sistema', 'treinamento',
];

/**
 * Setor que o cliente escolhe no widget do TMS → vocabulário canônico daqui.
 *
 * O widget obriga a escolha antes de enviar a mensagem, então este é um sinal
 * HUMANO — vale mais que o palpite do modelo, mas não substitui a mensagem: quem
 * clica em "Outro" e descreve uma rejeição de CT-e está falando de CT-e.
 * "Outro" não vira dica nenhuma de propósito.
 */
const SETOR_DO_WIDGET: Record<string, TicketCategory> = {
  fiscal: 'fiscal',
  frota: 'frota',
  financeiro: 'financeiro',
  logistica: 'frete',
  sistema: 'erro_sistema',
};

function dicaDeSetor(sector?: string): string {
  if (!sector) return '';
  const norm = sector.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const categoria = SETOR_DO_WIDGET[norm];
  if (!categoria) return '';
  return (
    `\n\nINDÍCIO — o cliente escolheu o setor "${sector}" no widget, o que costuma corresponder a ` +
    `"${categoria}". Use isso para desempatar quando a mensagem for ambígua. NÃO use contra a mensagem: ` +
    'se ela descreve claramente outro assunto, a mensagem vence.'
  );
}

@Injectable()
export class CaseClassifierAgentService {
  private readonly logger = new Logger('CaseClassifierAgent');

  constructor(private readonly ai: AnthropicService) {}

  async classify(
    message: string,
    history: string = '',
    sector?: string,
  ): Promise<ClassificationResult> {
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
- Rejeição de CT-e, com ou sem código SEFAZ → cte (NÃO treinamento, mesmo que a
  pergunta termine em "o que eu faço?"). Rejeição é problema concreto num documento
  emitido, não dúvida de como usar o sistema.
- Rejeição de MDF-e → mdfe. Dúvida sobre regra tributária/CFOP sem documento
  rejeitado → fiscal.
- "treinamento" é só para quem quer APRENDER a fazer algo que ainda não tentou.
  Se existe erro, rejeição ou algo que parou de funcionar, a categoria é a do
  problema — a forma da frase não muda isso.

Prioridade:
- critical: operação parada (não emite CT-e/MDF-e em produção)
- high: bloqueio parcial, tema financeiro/fiscal
- medium: dúvida operacional sem bloqueio
- low: treinamento, "como faço"

requiresHuman — quando marcar true:
- SOMENTE quando o caso exige uma ação que só uma pessoa pode executar: estorno,
  cancelamento de contrato, negociação de valores, pedido jurídico, ou acesso a
  dado que a IA não pode consultar.
- NÃO marque true só porque o assunto parece técnico, sensível ou importante. Ter
  solução documentada não é motivo para chamar humano.
- Na dúvida, false. O backend tem regras próprias de escalonamento e vai escalar
  sozinho quando for o caso — marcar true aqui por precaução tira do cliente uma
  resposta que a IA já teria.

Responda APENAS com JSON válido (sem markdown):
{
  "category": "<categoria>",
  "priority": "<prioridade>",
  "requiresHuman": false,
  "confidence": "high",
  "reasoning": "<motivo curto>"
}

Regra de segurança: se category for "fiscal" ou "financeiro" E confidence for "low" → requiresHuman = true.${dicaDeSetor(sector)}`;

    const userMsg = history
      ? `Histórico recente:\n${history}\n\nMensagem atual: ${message}`
      : `Mensagem: ${message}`;

    try {
      const text = await this.ai.complete(system, userMsg, { maxTokens: 200 });
      const clean = text.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(clean) as ClassificationResult;

      // Normaliza ANTES de comparar (achado §1, auditoria 2026-08-05): a IA
      // varia caixa/espaço na resposta livre; comparar o valor cru contra
      // 'fiscal'/'financeiro'/'low' faz a trava de segurança abaixo falhar
      // em silêncio quando o texto não bate byte a byte.
      const rawCategory = String(parsed.category ?? '').trim().toLowerCase();
      const categoryKnown = KNOWN_CATEGORIES.includes(rawCategory as TicketCategory);
      if (categoryKnown) parsed.category = rawCategory as TicketCategory;
      if (!categoryKnown) {
        this.logger.warn(
          `Classificador retornou categoria não reconhecida ("${parsed.category}") — ` +
          'mantendo valor original para auditoria, mas tratando como potencialmente sensível.',
        );
      }
      parsed.confidence = String(parsed.confidence ?? '').trim().toLowerCase() === 'high' ? 'high' : 'low';

      // Garantia de segurança ADR 015 D6 — sobre valores normalizados.
      // Categoria não reconhecida também força humano: não dá pra garantir
      // que NÃO é fiscal/financeiro se a IA fugiu do vocabulário esperado.
      const isFiscalOrFinancial = parsed.category === 'fiscal' || parsed.category === 'financeiro';
      if ((isFiscalOrFinancial || !categoryKnown) && parsed.confidence === 'low') {
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
