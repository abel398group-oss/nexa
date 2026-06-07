import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';

export type Intent =
  | 'opt_out'
  | 'interested'
  | 'pricing_question'
  | 'meeting_request'
  | 'support_question'
  | 'not_now'
  | 'wrong_person'
  | 'human_needed'
  | 'unknown';

export type TargetAgent = 'sales' | 'support' | 'human' | 'optout';

export interface RouteDecision {
  intent: Intent;
  agent: TargetAgent;
  leadScore: number; // 0-100
  reason: string;
  source: 'ai' | 'fallback';
  isComplaint?: boolean; // monitoramento interno (G4)
  complaintTopic?: string; // lentidao|bug|preco|atendimento|fiscal|outro
  isAggressive?: boolean; // ofensa (G8)
}

// score mínimo por intenção (business-rules §1) — G9
const MIN_SCORE: Partial<Record<Intent, number>> = {
  meeting_request: 80,
  interested: 60,
};

const OPT_OUT_RE = /\b(sair|parar|stop|descadastrar|cancelar inscri|remover|nao quero mais)\b/i;

@Injectable()
export class RouterAgentService {
  private readonly logger = new Logger('RouterAgent');

  constructor(private readonly ai: AnthropicService) {}

  // Decide o destino da mensagem (qual agente / score do lead).
  async route(message: string): Promise<RouteDecision> {
    // opt-out tem precedência e não depende de IA (regra de negócio + LGPD)
    if (OPT_OUT_RE.test(message)) {
      return { intent: 'opt_out', agent: 'optout', leadScore: 0, reason: 'palavra de opt-out', source: 'fallback' };
    }

    const system =
      'Você classifica mensagens de leads B2B que chegam no WhatsApp de uma empresa que vende o ' +
      'sistema HiperTMS (gestão de transporte) para transportadoras. ' +
      'Responda APENAS com um JSON válido, sem texto extra, no formato: ' +
      '{"intent": "...", "leadScore": 0-100, "reason": "...", "isComplaint": bool, "complaintTopic": "...", "isAggressive": bool}. ' +
      'intent ∈ [opt_out, interested, pricing_question, meeting_request, support_question, not_now, wrong_person, human_needed, unknown]. ' +
      'leadScore: 0 (frio/sem fit) a 100 (quente, quer comprar). ' +
      'pricing_question/interested/meeting_request = alto. support_question = cliente já existente. ' +
      'wrong_person/not_now = baixo. human_needed = pede humano/negociação complexa. ' +
      'isComplaint=true se for reclamação; complaintTopic ∈ [lentidao,bug,preco,atendimento,fiscal,outro]. ' +
      'isAggressive=true se a mensagem for ofensiva/agressiva (xingamento, hostilidade).';

    try {
      const out = await this.ai.completeJson<{
        intent: Intent; leadScore: number; reason: string;
        isComplaint?: boolean; complaintTopic?: string; isAggressive?: boolean;
      }>(system, `Mensagem do lead: "${message}"`);
      let intent = out.intent ?? 'unknown';
      // ofensa/agressão → passa pro humano, nunca revida (G8)
      if (out.isAggressive) intent = 'human_needed';
      let leadScore = Math.max(0, Math.min(100, Math.round(out.leadScore ?? 0)));
      // score mínimo por intenção (G9)
      const min = MIN_SCORE[intent];
      if (min && leadScore < min) leadScore = min;
      return {
        intent,
        agent: this.toAgent(intent),
        leadScore,
        reason: out.reason ?? '',
        source: 'ai',
        isComplaint: !!out.isComplaint,
        complaintTopic: out.complaintTopic,
        isAggressive: !!out.isAggressive,
      };
    } catch (e: any) {
      this.logger.warn(`Router fallback (${e?.message})`);
      // fallback heurístico simples
      const intent: Intent = /pre[çc]o|valor|quanto custa|plano/i.test(message)
        ? 'pricing_question'
        : /reuni[ãa]o|agenda|call|demonstra/i.test(message)
          ? 'meeting_request'
          : 'unknown';
      return { intent, agent: this.toAgent(intent), leadScore: intent === 'unknown' ? 30 : 70, reason: 'heurística', source: 'fallback' };
    }
  }

  private toAgent(intent: Intent): TargetAgent {
    switch (intent) {
      case 'opt_out':
        return 'optout';
      case 'pricing_question':
      case 'interested':
      case 'meeting_request':
        return 'sales';
      case 'support_question':
        return 'support';
      case 'human_needed':
      case 'wrong_person':
        return 'human';
      case 'not_now':
      case 'unknown':
      default:
        return 'support'; // resposta cordial padrão; não some
    }
  }
}
