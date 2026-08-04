import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from '@/shared/ai/anthropic.service';
import { fenceUntrusted, UNTRUSTED_RULE } from '@/shared/ai/untrusted-input';

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
  confidence: number; // 0-1 — confiança do roteamento (gate de esclarecimento, ADR 003)
  needsClarification?: boolean; // confiança baixa + intenção indefinida → pedir esclarecimento
  legalRisk?: boolean; // risco jurídico/comercial (advogado/procon/processo) → humano
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

// Risco jurídico/comercial → handoff humano imediato (não depende de IA; a Lia nunca negocia isso).
const LEGAL_RISK_RE = /\b(advogad[oa]|procon|processar|processo\s+judicial|a[çc][ãa]o\s+judicial|justi[çc]a|indeniza|reclame\s*aqui|notifica[çc][ãa]o\s+extrajudicial|direito\s+do\s+consumidor)\b/i;

// Abaixo deste nível de confiança + intenção indefinida → pedir esclarecimento (ADR 003 / guardrails §5).
const CONF_THRESHOLD = Number(process.env.ROUTER_CONF_THRESHOLD ?? 0.6);

@Injectable()
export class RouterAgentService {
  private readonly logger = new Logger('RouterAgent');

  constructor(private readonly ai: AnthropicService) {}

  // Decide o destino da mensagem (qual agente / score do lead).
  async route(message: string): Promise<RouteDecision> {
    // risco jurídico/comercial vem PRIMEIRO → humano (ANTES do opt-out: "parar no PROCON"
    // não é descadastro; a IA nunca negocia/responde risco jurídico).
    if (LEGAL_RISK_RE.test(message)) {
      return {
        intent: 'human_needed',
        agent: 'human',
        leadScore: 0,
        reason: 'risco jurídico/comercial detectado',
        source: 'fallback',
        confidence: 1,
        legalRisk: true,
        isComplaint: true,
        complaintTopic: 'outro',
      };
    }

    // opt-out (regra de negócio + LGPD) — não depende de IA
    if (OPT_OUT_RE.test(message)) {
      return { intent: 'opt_out', agent: 'optout', leadScore: 0, reason: 'palavra de opt-out', source: 'fallback', confidence: 1 };
    }

    const system =
      'Você classifica mensagens de leads B2B que chegam no WhatsApp de uma empresa que vende o ' +
      'sistema HiperTMS (gestão de transporte) para transportadoras. ' +
      'Responda APENAS com um JSON válido, sem texto extra, no formato: ' +
      '{"intent": "...", "leadScore": 0-100, "confidence": 0-1, "reason": "...", "isComplaint": bool, "complaintTopic": "...", "isAggressive": bool}. ' +
      'intent ∈ [opt_out, interested, pricing_question, meeting_request, support_question, not_now, wrong_person, human_needed, unknown]. ' +
      'leadScore: 0 (frio/sem fit) a 100 (quente, quer comprar). ' +
      'confidence: 0 (não tenho certeza da intenção) a 1 (intenção muito clara). Use abaixo de 0.6 quando a mensagem for vaga, curta ou ambígua. ' +
      'pricing_question/interested/meeting_request = alto. support_question = cliente já existente. ' +
      'wrong_person/not_now = baixo. human_needed = pede humano/negociação complexa. ' +
      'isComplaint=true se for reclamação; complaintTopic ∈ [lentidao,bug,preco,atendimento,fiscal,outro]. ' +
      'isAggressive=true se a mensagem for ofensiva/agressiva (xingamento, hostilidade). ' +
      // Sem esta frase a cerca abaixo é só enfeite — o modelo precisa saber o que ela significa.
      UNTRUSTED_RULE;

    try {
      const out = await this.ai.completeJson<{
        intent: Intent; leadScore: number; confidence?: number; reason: string;
        isComplaint?: boolean; complaintTopic?: string; isAggressive?: boolean;
        // Cercado, não entre aspas: aspas não delimitam nada, porque quem escreve a
        // mensagem também escreve aspas. Ver shared/ai/untrusted-input.ts.
      }>(system, `Mensagem do lead:\n${fenceUntrusted(message)}`);
      let intent = out.intent ?? 'unknown';
      // ofensa/agressão → passa pro humano, nunca revida (G8)
      if (out.isAggressive) intent = 'human_needed';
      let leadScore = Math.max(0, Math.min(100, Math.round(out.leadScore ?? 0)));
      // score mínimo por intenção (G9)
      const min = MIN_SCORE[intent];
      if (min && leadScore < min) leadScore = min;
      const confidence = typeof out.confidence === 'number' ? Math.max(0, Math.min(1, out.confidence)) : 0.5;
      // gate de esclarecimento: só quando a intenção ficou indefinida e a confiança é baixa
      const needsClarification = intent === 'unknown' && confidence < CONF_THRESHOLD;
      return {
        intent,
        agent: this.toAgent(intent),
        leadScore,
        reason: out.reason ?? '',
        source: 'ai',
        confidence,
        needsClarification,
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
      const confidence = intent === 'unknown' ? 0.4 : 0.7;
      return {
        intent,
        agent: this.toAgent(intent),
        leadScore: intent === 'unknown' ? 30 : 70,
        reason: 'heurística',
        source: 'fallback',
        confidence,
        needsClarification: intent === 'unknown' && confidence < CONF_THRESHOLD,
      };
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
        // bot é de VENDAS: saudação/abertura vaga vai p/ a Lia comercial (cumprimenta + qualifica),
        // não pro suporte (que responde "não achei na base"). Suporte só p/ support_question explícito.
        return 'sales';
    }
  }
}
