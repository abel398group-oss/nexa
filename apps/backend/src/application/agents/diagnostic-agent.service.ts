import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';
import { HiperTmsConnector } from '@/application/connectors/hipertms.connector';
import { TicketCategory } from './case-classifier-agent.service';

export interface DiagnosticResult {
  rootCause: string | null;           // causa-raiz identificada (ou null se inconclusivo)
  playbook: string | null;            // nome do playbook aplicado
  diagnosticData: Record<string, any>; // dados lidos do TMS (auditável)
  suggestedAction: string | null;     // orientação ao cliente
  needsMoreInfo: boolean;             // precisa de mais dados do cliente
  questionsToAsk: string[];           // perguntas pendentes
  confidence: 'high' | 'low';
}

@Injectable()
export class DiagnosticAgentService {
  private readonly logger = new Logger('DiagnosticAgent');

  constructor(
    private readonly ai: AnthropicService,
    private readonly connector: HiperTmsConnector,
  ) {}

  // Diagnostica com base na categoria e na mensagem do cliente.
  // Lê dados reais do TMS via Connector (read-only, ADR 015 D3).
  async diagnose(input: {
    message: string;
    category: TicketCategory;
    history: string;
    tmsCustomer: { externalId: string; name: string; plan?: string } | null;
  }): Promise<DiagnosticResult> {
    const diagnosticData: Record<string, any> = {};

    // Leitura contextual por categoria (via Connector — nunca acesso direto ao DB)
    try {
      if (input.tmsCustomer) {
        const contract = await this.connector.getContractStatus(input.tmsCustomer.externalId);
        if (contract) diagnosticData.contract = contract;
      }

      // Para CT-e/MDF-e: tenta extrair código de rejeição da mensagem
      if (input.category === 'cte' || input.category === 'mdfe' || input.category === 'fiscal') {
        const rejCodeMatch = input.message.match(/\b([0-9]{3,4})\b/);
        if (rejCodeMatch) {
          const rejInfo = await this.connector.getRejectionInfo(rejCodeMatch[1]);
          if (rejInfo) diagnosticData.rejectionInfo = rejInfo;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Leitura diagnóstica falhou: ${err?.message}`);
    }

    const customerCtx = input.tmsCustomer
      ? `Cliente: ${input.tmsCustomer.name}, plano: ${input.tmsCustomer.plan ?? 'desconhecido'}`
      : 'Cliente não identificado no TMS';

    const dataCtx = Object.keys(diagnosticData).length > 0
      ? `\nDados do TMS:\n${JSON.stringify(diagnosticData, null, 2)}`
      : '\nNenhum dado adicional disponível no TMS.';

    const system = `Você é um agente diagnóstico do suporte HiperTMS.
Seu papel: identificar a causa-raiz do problema com base na mensagem, histórico e dados do TMS.
Regra: NUNCA invente dados. Se não tiver dados suficientes, liste as perguntas necessárias.
Regra: NÃO resolva — apenas diagnostique. A resolução é do ResolutionAgent.

Responda APENAS com JSON (sem markdown):
{
  "rootCause": "<causa-raiz ou null>",
  "playbook": "<nome do playbook ou null>",
  "suggestedAction": "<orientação ou null>",
  "needsMoreInfo": false,
  "questionsToAsk": [],
  "confidence": "high"
}`;

    const userMsg = `Categoria: ${input.category}
${customerCtx}${dataCtx}

Histórico:
${input.history || '(sem histórico)'}

Mensagem atual: ${input.message}`;

    try {
      const text = await this.ai.complete(system, userMsg, { maxTokens: 300 });
      const clean = text.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(clean) as Omit<DiagnosticResult, 'diagnosticData'>;
      return { ...parsed, diagnosticData };
    } catch (err: any) {
      this.logger.warn(`Diagnóstico falhou (${err?.message})`);
      return {
        rootCause: null,
        playbook: null,
        diagnosticData,
        suggestedAction: null,
        needsMoreInfo: true,
        questionsToAsk: ['Pode me dar mais detalhes sobre o problema?'],
        confidence: 'low',
      };
    }
  }
}
