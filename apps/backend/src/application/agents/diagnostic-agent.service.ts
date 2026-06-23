import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';
import { HiperTmsConnector } from '@/application/connectors/hipertms.connector';
import { TicketCategory } from './case-classifier-agent.service';
import { getPlaybook } from './support-playbooks.const';

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

      // Para CT-e/MDF-e: tenta extrair chave de acesso (44 dígitos) ou número do documento,
      // e código de rejeição SEFAZ (3-4 dígitos), da mensagem do cliente.
      if (input.category === 'cte' || input.category === 'mdfe' || input.category === 'fiscal') {
        // 1) Chave de acesso (44 dígitos exatos) ou número de documento (7-15 dígitos)
        const docType: 'cte' | 'mdfe' = input.category === 'mdfe' ? 'mdfe' : 'cte';
        const accessKeyMatch = input.message.match(/\b(\d{44})\b/);
        const docNumberMatch = !accessKeyMatch && input.message.match(/\b(\d{7,15})\b/);
        const docKey = accessKeyMatch?.[1] ?? (docNumberMatch ? docNumberMatch[1] : null) ?? null;

        if (docKey && input.tmsCustomer) {
          const docStatus = await this.connector.getDocumentStatus(
            input.tmsCustomer.externalId,
            docType,
            docKey,
          );
          if (docStatus) diagnosticData.documentStatus = docStatus;
        }

        // 2) Código de rejeição SEFAZ (3-4 dígitos — evita sobreposição com chave/número acima)
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

    // Carrega playbook determinístico para a categoria (ADR 017).
    // Se existir, injeta os passos no prompt → diagnóstico previsível e auditável.
    const pb = getPlaybook(input.category);
    const playbookCtx = pb
      ? `\nPLAYBOOK DETERMINÍSTICO — siga esta sequência (não improvise):\nNome: ${pb.name}\n${pb.steps.join('\n')}\n${pb.escalate?.length ? `Escalar imediatamente se detectar: ${pb.escalate.join(' | ')}` : ''}`
      : '';

    const system = `Você é um agente diagnóstico do suporte HiperTMS.
Seu papel: identificar a causa-raiz do problema com base na mensagem, histórico e dados do TMS.
Regra: NUNCA invente dados. Se não tiver dados suficientes, liste as perguntas necessárias.
Regra: NÃO resolva — apenas diagnostique. A resolução é do ResolutionAgent.
${playbookCtx}
SEGURANÇA E PRIVACIDADE (obrigatório):
- NUNCA peça dados pessoais ou de identificação ao cliente: nome, CNPJ, CPF, e-mail, telefone, senha.
  A identidade vem do login/contexto do sistema, NUNCA do que a pessoa digita no WhatsApp (LGPD + anti-fraude).
- Se o cliente NÃO estiver identificado, NÃO pergunte quem ele é — apenas ajude com o problema técnico.
- Se o cliente estiver identificado, use o primeiro nome dele naturalmente, sem confirmar dados.

PERGUNTAS (questionsToAsk):
- No máximo 1 pergunta (a mais importante). SOMENTE sobre o problema técnico: qual tela/módulo, mensagem de erro exata, ou o que estava fazendo.
- Se a mensagem já descreve claramente o problema (ex: "senha errada", "CT-e rejeitado código X", "abastecimento não gerou conta"), defina needsMoreInfo=false — não pergunte nada.
- Nunca pergunte dados de identificação (nome, CNPJ, e-mail, senha).

FORMATO JSON (obrigatório):
- Todos os valores devem ser strings de linha única. NÃO use quebras de linha dentro dos campos.
- Use \\n (barra-n) se precisar de quebra dentro de uma string.

Responda APENAS com JSON (sem markdown):
{
  "rootCause": "<causa-raiz ou null>",
  "playbook": "${pb?.name ?? '<nome do playbook ou null>'}",
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
      const text = await this.ai.complete(system, userMsg, { maxTokens: 450 });
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
