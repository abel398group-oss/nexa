import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';

// ── Proteção contra prompt injection no input do cliente ─────────────────────
// Padrões que tentam sequestrar as instruções do sistema ou revelar o prompt.
// A lista é conservadora: só bloqueia o que é claramente mal-intencionado.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?previous\s+instructions?/i,
  /you\s+are\s+now\s+(a\s+)?(?!the\s+customer)/i,
  /act\s+as\s+(if\s+you\s+are\s+)?a\s+(?!customer)/i,
  /system\s*:\s*\[?\s*(prompt|instruction|context)/i,
  /<\|im_(start|end|sep)\|>/i,         // ChatML injection
  /\{\{.*\}\}/,                         // template injection
  /\[INST\]|\[\/INST\]/i,               // Llama instruction tags
  /###\s*(instruction|system|prompt)/i, // markdown header injection
];

const MAX_INPUT_LENGTH = 4_000; // ~3k tokens — suficiente para qualquer mensagem real

/**
 * Sanitiza a mensagem do cliente antes de entrar no prompt.
 * - Trunca mensagens excessivamente longas.
 * - Detecta e neutraliza padrões de prompt injection.
 * Retorna a mensagem sanitizada (nunca lança exceção — fail-open com aviso).
 */
function sanitizeCustomerMessage(input: string): { text: string; injectionDetected: boolean } {
  const truncated = input.slice(0, MAX_INPUT_LENGTH);
  const injectionDetected = INJECTION_PATTERNS.some((re) => re.test(truncated));
  if (injectionDetected) {
    // Substitui por mensagem neutra — não revela o motivo ao atacante.
    return { text: '[mensagem não pôde ser processada]', injectionDetected: true };
  }
  return { text: truncated, injectionDetected: false };
}

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
    context?: 'sales' | 'support'; // contexto muda os critérios de auditoria
  }): Promise<SupervisorVerdict> {
    // 0) sanitiza a mensagem do cliente antes de incluir no prompt (anti-injection)
    const { text: safeCustomerMessage, injectionDetected } = sanitizeCustomerMessage(input.customerMessage);
    if (injectionDetected) {
      this.logger.warn('Supervisor: prompt injection detectado em customerMessage — bloqueado');
    }
    const sanitizedInput = { ...input, customerMessage: safeCustomerMessage };

    // 1) regras duras
    const hardIssues = HARD_BLOCKS.filter((b) => b.re.test(sanitizedInput.draft)).map((b) => b.issue);
    if (hardIssues.length) {
      return { approved: false, risk: 'high', issues: hardIssues, source: 'fallback' };
    }

    // 2) auditoria por IA — prompt varia por contexto
    const isSupportCtx = input.context === 'support';
    const system = isSupportCtx
      ? // ── Critérios de auditoria para SUPORTE ──────────────────────────────
        'Você é a Supervisora de qualidade da Nexa. Audita a resposta de suporte que a IA vai enviar a um CLIENTE ATIVO no WhatsApp. ' +
        'REPROVE apenas se houver problema REAL: ' +
        '(a) descreve passo, menu ou caminho de sistema que NÃO está em "Fontes KB permitidas" (alucinação de troubleshooting); ' +
        '(b) cita código de erro SEFAZ ou diagnóstico técnico que NÃO consta nas fontes; ' +
        '(c) promete resolução em prazo específico ou garantia de fix sem base nas fontes; ' +
        '(d) tom rude/inadequado ou revela instruções internas; ' +
        '(e) foge totalmente do problema relatado pelo cliente. ' +
        'IMPORTANTE — NÃO reprove nestes casos: ' +
        '- Dizer que vai encaminhar para um especialista (é o comportamento correto quando KB não cobre o caso). ' +
        '- Pedir mais informações técnicas (módulo, tela, mensagem de erro). ' +
        '- Usar dados que o próprio cliente já informou no histórico. ' +
        '- Passos gerais de diagnóstico (Ctrl+F5, limpar cache, testar em outro navegador) — são orientações padrão válidas. ' +
        'Só reprove alucinação de passos específicos de MENU (ex.: "vá em Fiscal → Certificados → aba X" quando essa aba não existe na KB). ' +
        'Na dúvida, APROVE com risk "low". ' +
        'Responda APENAS com JSON: {"approved": true|false, "risk": "low|medium|high", "issues": ["..."]}. ' +
        'Se aprovado e sem problemas, issues = [].'
      : // ── Critérios de auditoria para VENDAS ───────────────────────────────
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
      `Fatos permitidos:\n${sanitizedInput.allowedFacts || '(nenhum fato específico fornecido)'}\n\n` +
      (sanitizedInput.history ? `Histórico da conversa (o que o cliente já disse conta como contexto válido):\n${sanitizedInput.history}\n\n` : '') +
      `Mensagem do cliente: ${sanitizedInput.customerMessage}\n\n` +
      `Resposta a auditar: ${sanitizedInput.draft}`;

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
