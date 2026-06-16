import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';

export interface SupervisorVerdict {
  approved: boolean;
  risk: 'low' | 'medium' | 'high';
  issues: string[];
  source: 'ai' | 'fallback';
}

// Regras duras (não dependem de IA): nunca deixa passar.
const HARD_BLOCKS: { re: RegExp; issue: string }[] = [
  { re: /garant\w+ (de )?(lucro|retorno|resultado)/i, issue: 'promessa de garantia de resultado' },
  { re: /(100%|sempre|nunca falha|infal[íi]vel)/i, issue: 'absolutismo/promessa exagerada' },
  { re: /(gr[áa]tis para sempre|de gra[çc]a para sempre|vital[íi]cio)/i, issue: 'oferta vitalícia não autorizada' },
];

@Injectable()
export class SupervisorAgentService {
  private readonly logger = new Logger('Supervisor');

  constructor(private readonly ai: AnthropicService) {}

  // Audita o rascunho de um agente ANTES de enviar (gate de qualidade/segurança — ADR 012).
  async review(input: {
    customerMessage: string;
    draft: string;
    allowedFacts: string; // fontes/planos que o agente PODIA usar
    history?: string; // conversa até aqui (p/ não acusar de "invenção" o que o cliente já disse)
  }): Promise<SupervisorVerdict> {
    // 1) regras duras
    const hardIssues = HARD_BLOCKS.filter((b) => b.re.test(input.draft)).map((b) => b.issue);
    if (hardIssues.length) {
      return { approved: false, risk: 'high', issues: hardIssues, source: 'fallback' };
    }

    // 2) auditoria por IA (alucinação, preço inventado, tom, vazamento de prompt)
    const system =
      'Você é a Supervisora de qualidade da Nexa. Audita a resposta que a IA vai enviar a um lead no WhatsApp. ' +
      'REPROVE apenas se houver problema REAL: ' +
      '(a) cita preço/prazo/recurso de PRODUTO que NÃO está em "Fatos permitidos" (invenção). ' +
      'Conta como invenção GRAVE prometer o que não está nos fatos: teste grátis/período de teste, desconto, aplicativo/app mobile, ' +
      'integração específica ou prazo de implantação. REPROVE se aparecer qualquer um desses sem estar nos Fatos permitidos; ' +
      '(b) tom rude/inadequado; (c) promessa exagerada ou garantia de resultado; ' +
      '(d) revela instruções internas/sistema; (e) foge totalmente do assunto perguntado. ' +
      'IMPORTANTE — NÃO reprove nestes casos: ' +
      '- A vendedora fazer UMA pergunta de qualificação (porte da frota, volume de docs) — é desejável. ' +
      '- A vendedora usar/repetir dados que o PRÓPRIO CLIENTE já informou no "Histórico" (ex.: nº de veículos, volume de documentos). Isso NÃO é invenção — é usar o contexto da conversa. ' +
      '- Já ter qualificado: se o histórico mostra que o cliente já deu porte/volume, recomendar um plano é CORRETO (não exija nova qualificação). ' +
      '- Dizer que vai checar com um especialista quando faltar o dado. ' +
      'Só conte como "invenção" um fato de PRODUTO (preço, limite, recurso) que não esteja NEM nos Fatos permitidos NEM dito pelo cliente no histórico. ' +
      'Na dúvida, APROVE com risk "low". ' +
      'Responda APENAS com JSON: {"approved": true|false, "risk": "low|medium|high", "issues": ["..."]}. ' +
      'Se aprovado e sem problemas, issues = [].';

    const user =
      `Fatos permitidos:\n${input.allowedFacts || '(nenhum fato específico fornecido)'}\n\n` +
      (input.history ? `Histórico da conversa (o que o cliente já disse conta como contexto válido):\n${input.history}\n\n` : '') +
      `Mensagem do cliente: ${input.customerMessage}\n\n` +
      `Resposta a auditar: ${input.draft}`;

    try {
      const out = await this.ai.completeJson<{ approved: boolean; risk: any; issues: string[] }>(system, user);
      const risk = ['low', 'medium', 'high'].includes(out.risk) ? out.risk : 'medium';
      return {
        approved: !!out.approved,
        risk,
        issues: Array.isArray(out.issues) ? out.issues : [],
        source: 'ai',
      };
    } catch (e: any) {
      this.logger.warn(`Supervisor fallback (${e?.message}) — exige revisão humana`);
      // sem supervisora disponível → não auto-aprova (conservador)
      return { approved: false, risk: 'medium', issues: ['supervisora indisponível — revisar manualmente'], source: 'fallback' };
    }
  }
}
