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
  /**
   * TMS indisponível (disjuntor aberto) — leitura falhou por instabilidade, não
   * porque o dado não existe. Campo de primeira classe de propósito: enquanto
   * vivia só dentro de `diagnosticData`, o ResolutionAgent (que lê apenas
   * rootCause/suggestedAction) nunca ficava sabendo, e o cliente recebia uma
   * escalação comum em vez de "o sistema está instável, tente em alguns
   * minutos" — exatamente o que a correção original queria evitar.
   */
  tmsUnstable: boolean;
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
    tmsCustomer: { externalId: string; name: string; plan?: string; page?: string | null } | null;
  }): Promise<DiagnosticResult> {
    const diagnosticData: Record<string, any> = {};
    // true quando alguma leitura voltou vazia PORQUE o disjuntor do TMS está aberto —
    // não porque o dado não existe. Sem essa distinção, os dois casos chegam ao
    // cliente como o mesmo silêncio, e a Lia arrisca dizer "não encontrei" quando na
    // verdade é só uma instabilidade que passa em segundos.
    let tmsUnstable = false;

    // Leitura contextual por categoria (via Connector — nunca acesso direto ao DB)
    try {
      if (input.tmsCustomer) {
        const contract = await this.connector.getContractStatus(input.tmsCustomer.externalId);
        if (contract) diagnosticData.contract = contract;
        else if (this.connector.isDegraded()) tmsUnstable = true;
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
          else if (this.connector.isDegraded()) tmsUnstable = true;
        }

        // 2) Código de rejeição SEFAZ (3-4 dígitos — evita sobreposição com chave/número acima)
        const rejCodeMatch = input.message.match(/\b([0-9]{3,4})\b/);
        if (rejCodeMatch) {
          const rejInfo = await this.connector.getRejectionInfo(rejCodeMatch[1]);
          if (rejInfo) {
            diagnosticData.rejectionInfo = rejInfo;
          } else {
            // F11: a tabela local cobre só ~21 códigos "top N" (comentário no
            // próprio connector). Fora dela, getRejectionInfo() voltava null em
            // silêncio — a IA ficava sem pista nenhuma e sem log pra saber que
            // o código nem foi consultado. Agora fica registrado, e o prompt
            // recebe a instrução explícita de não inventar o significado do
            // código (ver rejectionCodeUnknown no dataCtx abaixo).
            this.logger.warn(`Código de rejeição SEFAZ ${rejCodeMatch[1]} não está na tabela local — sem match em getRejectionInfo()`);
            diagnosticData.rejectionCodeUnknown = rejCodeMatch[1];
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Leitura diagnóstica falhou: ${err?.message}`);
    }

    if (tmsUnstable) diagnosticData.tmsIndisponivel = true;

    // O plano NUNCA vem preenchido no caminho do widget/portal: o token do TMS
    // carrega só externalId/nome/página (handoff.service.ts) — então a Lia
    // atendia todo cliente do chat como "plano: desconhecido". O contrato já foi
    // lido logo acima e traz o plano; usar ele fecha o buraco sem mudar o
    // contrato do token nem gastar uma chamada a mais.
    const planoDoContrato = (diagnosticData.contract as any)?.plan;
    const plano = input.tmsCustomer?.plan || planoDoContrato || 'desconhecido';
    // F10: tela do TMS de onde o cliente abriu o chat (vem do token de handoff, ADR 027).
    // Permite saudação contextual ("vi que você está na tela de X") em vez de genérica.
    const paginaCtx = input.tmsCustomer?.page ? `, na tela: ${input.tmsCustomer.page}` : '';
    const customerCtx = input.tmsCustomer
      ? `Cliente: ${input.tmsCustomer.name}, plano: ${plano}${paginaCtx}`
      : 'Cliente não identificado no TMS';

    // F11: código de rejeição fora da tabela local (~21 códigos cobertos, ver
    // comentário em hipertms.connector.ts) — instrui a IA a não inventar o
    // significado do código em vez de simplesmente não ter o que dizer sobre ele.
    const rejUnknownCtx = diagnosticData.rejectionCodeUnknown
      ? `\nO código de rejeição SEFAZ ${diagnosticData.rejectionCodeUnknown} não está na base local de códigos conhecidos. ` +
        'NÃO invente o que ele significa. Diga que vai verificar o código específico com o time técnico (consulta ao MOC/manual da SEFAZ) e escale.'
      : '';

    const dataCtx = tmsUnstable
      ? '\nATENÇÃO: o sistema TMS está temporariamente instável — pelo menos uma consulta de dado falhou por ' +
        'indisponibilidade do TMS, NÃO porque o dado não existe. Não diga que o cliente "não tem" contrato/documento ' +
        'nem escale como se fosse um caso normal: explique que houve uma instabilidade momentânea no sistema e peça ' +
        'para tentar de novo em alguns minutos.' +
        rejUnknownCtx +
        (Object.keys(diagnosticData).length > 1 ? `\nDados do TMS (parciais):\n${JSON.stringify(diagnosticData, null, 2)}` : '')
      : Object.keys(diagnosticData).length > 0
        ? `${rejUnknownCtx}\nDados do TMS:\n${JSON.stringify(diagnosticData, null, 2)}`
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
Regra: se o contexto abaixo avisar de instabilidade do TMS, isso é diferente de "dado não existe" — o rootCause deve refletir a instabilidade (não uma causa inventada) e o suggestedAction deve orientar o cliente a tentar de novo em alguns minutos, sem afirmar ausência de contrato/documento.
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
      const parsed = JSON.parse(clean) as Omit<DiagnosticResult, 'diagnosticData' | 'tmsUnstable'>;
      // tmsUnstable vem do código, nunca do modelo — é fato observado no
      // disjuntor, não opinião da IA.
      return { ...parsed, diagnosticData, tmsUnstable };
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
        tmsUnstable,
      };
    }
  }
}
