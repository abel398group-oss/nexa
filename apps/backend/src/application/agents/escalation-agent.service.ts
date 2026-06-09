import { Injectable } from '@nestjs/common';
import { TicketCategory, TicketPriority } from './case-classifier-agent.service';
import { DiagnosticResult } from './diagnostic-agent.service';
import { ResolutionResult } from './resolution-agent.service';

export interface EscalationDecision {
  escalate: boolean;
  reason: string;
  message: string;   // mensagem ao cliente quando escala
}

// Matriz de escalonamento (ADR 015 D6 + ADR 016 D4)
const FISCAL_FINANCIAL: TicketCategory[] = ['fiscal', 'financeiro'];

@Injectable()
export class EscalationAgentService {
  decide(input: {
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
        message:
          'Sua solicitação envolve um tema fiscal ou financeiro que precisa de verificação especializada. ' +
          'Vou te conectar com nossa equipe agora.',
      };
    }

    // Prioridade crítica → escala imediato
    if (input.priority === 'critical') {
      return {
        escalate: true,
        reason: 'priority_critical',
        message:
          'Identifiquei que sua operação está parada. Estou escalando para atendimento urgente agora.',
      };
    }

    // Diagnóstico inconclusivo + ainda precisa de mais info → não escala ainda, aguarda dados
    if (input.diagnostic.needsMoreInfo) {
      return { escalate: false, reason: 'aguardando_dados_cliente', message: '' };
    }

    // Resolução com baixa confiança → escala
    if (input.resolution.confidence === 'low' || !input.resolution.resolved) {
      // Alta prioridade sem resolução → escala
      if (input.priority === 'high') {
        return {
          escalate: true,
          reason: 'high_priority_unresolved',
          message:
            'Não consegui resolver sua questão de alta prioridade automaticamente. ' +
            'Estou acionando um especialista para te ajudar.',
        };
      }
    }

    // Classificador pediu humano
    if (input.requiresHumanFromClassifier) {
      return {
        escalate: true,
        reason: 'classifier_requires_human',
        message: 'Esta solicitação precisa de análise especializada. Estou te conectando com nossa equipe.',
      };
    }

    return { escalate: false, reason: 'ia_resolve', message: '' };
  }
}
