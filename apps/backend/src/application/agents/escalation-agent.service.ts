import { Injectable } from '@nestjs/common';
import { TicketCategory, TicketPriority } from './case-classifier-agent.service';
import { DiagnosticResult } from './diagnostic-agent.service';
import { ResolutionResult } from './resolution-agent.service';
import { SUPPORT_SCRIPTS } from './support-scripts.const';

export interface EscalationDecision {
  escalate: boolean;
  reason: string;
  message: string;   // mensagem ao cliente quando escala
  /**
   * Resumo executivo de 3 linhas para quem recebe o transbordo (notificação +
   * card do Inbox) — [Problema Relatado] / [Ações Tentadas] / [Causa do
   * Transbordo]. Nulo quando não escala: não faz sentido resumir um caso que
   * a IA resolveu sozinha. Construído de forma determinística (sem chamada
   * à IA) a partir do que os agentes anteriores já produziram — o
   * escalonamento em si já é uma matriz de regras, não uma decisão da IA.
   */
  summary: string | null;
}

// Matriz de escalonamento (ADR 015 D6 + ADR 016 D4)
const FISCAL_FINANCIAL: TicketCategory[] = ['fiscal', 'financeiro'];

// Rótulo legível do motivo do transbordo — usado no resumo executivo.
const REASON_LABELS: Record<string, string> = {
  fiscal_financeiro_low_confidence: 'Tema fiscal/financeiro exige verificação humana (regra de segurança)',
  priority_critical: 'Prioridade crítica — operação do cliente parada',
  unresolved_no_kb_match: 'IA não encontrou solução na base de conhecimento',
  high_priority_low_confidence: 'Alta prioridade com baixa confiança na resolução',
  classifier_requires_human: 'Classificador identificou necessidade de análise especializada',
};

@Injectable()
export class EscalationAgentService {
  decide(input: {
    message: string;
    category: TicketCategory;
    priority: TicketPriority;
    diagnostic: DiagnosticResult;
    resolution: ResolutionResult;
    requiresHumanFromClassifier: boolean;
  }): EscalationDecision {

    // D6 — Segurança absoluta: fiscal/financeiro com baixa confiança → SEMPRE escala
    if (
      FISCAL_FINANCIAL.includes(input.category) &&
      (input.requiresHumanFromClassifier || input.resolution.confidence === 'low' || input.diagnostic.confidence === 'low')
    ) {
      return {
        escalate: true,
        reason: 'fiscal_financeiro_low_confidence',
        message: SUPPORT_SCRIPTS.escalaFiscalFinanceiro,
        summary: this.buildSummary(input, 'fiscal_financeiro_low_confidence'),
      };
    }

    // Prioridade crítica → escala imediato
    if (input.priority === 'critical') {
      return {
        escalate: true,
        reason: 'priority_critical',
        message: SUPPORT_SCRIPTS.escalaCritica,
        summary: this.buildSummary(input, 'priority_critical'),
      };
    }

    // Diagnóstico inconclusivo + ainda precisa de mais info → não escala ainda, aguarda dados
    if (input.diagnostic.needsMoreInfo) {
      return { escalate: false, reason: 'aguardando_dados_cliente', message: '', summary: null };
    }

    // Resolução não concluída → escala SEMPRE (independente de prioridade).
    // A mensagem ao cliente já vem do ResolutionAgent ("vou encaminhar para um especialista"),
    // mas o SupportAgent só notifica a equipe quando escalate=true.
    if (!input.resolution.resolved) {
      return {
        escalate: true,
        reason: 'unresolved_no_kb_match',
        message: '', // draft do ResolutionAgent já diz que vai encaminhar — não sobrescreve
        summary: this.buildSummary(input, 'unresolved_no_kb_match'),
      };
    }

    // Baixa confiança na resolução: alta prioridade → escala
    if (input.resolution.confidence === 'low' && input.priority === 'high') {
      return {
        escalate: true,
        reason: 'high_priority_low_confidence',
        message: SUPPORT_SCRIPTS.escalaAltaPrioridade,
        summary: this.buildSummary(input, 'high_priority_low_confidence'),
      };
    }

    // Classificador pediu humano
    if (input.requiresHumanFromClassifier) {
      return {
        escalate: true,
        reason: 'classifier_requires_human',
        message: SUPPORT_SCRIPTS.escalaAnaliseEspecializada,
        summary: this.buildSummary(input, 'classifier_requires_human'),
      };
    }

    return { escalate: false, reason: 'ia_resolve', message: '', summary: null };
  }

  // Resumo de 3 linhas — determinístico, sem chamada à IA (a decisão de
  // escalar já é uma matriz de regras; o resumo só descreve o que os agentes
  // anteriores já produziram).
  private buildSummary(
    input: {
      message: string;
      diagnostic: DiagnosticResult;
      resolution: ResolutionResult;
    },
    reason: string,
  ): string {
    const problema = input.message.trim().length > 200
      ? `${input.message.trim().slice(0, 200)}…`
      : input.message.trim();

    const acoes: string[] = [];
    if (input.diagnostic.rootCause) acoes.push(`Diagnóstico: ${input.diagnostic.rootCause}`);
    if (input.diagnostic.suggestedAction) acoes.push(`Orientação sugerida: ${input.diagnostic.suggestedAction}`);
    if (input.resolution.resolved === false && input.resolution.draft) {
      acoes.push(`Lia respondeu: ${input.resolution.draft}`);
    }
    const acoesTentadas = acoes.length > 0 ? acoes.join(' | ') : 'Nenhuma — encaminhado antes de tentar resolver';

    const causa = REASON_LABELS[reason] ?? reason;

    return [
      `[Problema Relatado] ${problema || '(mensagem vazia)'}`,
      `[Ações Tentadas] ${acoesTentadas}`,
      `[Causa do Transbordo] ${causa}`,
    ].join('\n');
  }
}
