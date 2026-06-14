import { describe, it, expect, vi, beforeEach, test } from 'vitest';
import { RouterAgentService } from './router-agent.service';
import { AnthropicService } from '@/shared/ai/anthropic.service';

// Mock do AnthropicService — não chama a API real nos testes
const mockAnthropic = {
  completeJson: vi.fn(),
  configured: true,
} as unknown as AnthropicService;

const makeService = () => new RouterAgentService(mockAnthropic);

describe('RouterAgentService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('opt-out por regex (sem chamar IA)', () => {
    const optOutMessages = ['SAIR', 'parar', 'stop', 'descadastrar', 'CANCELAR INSCRI', 'nao quero mais'];

    test.each(optOutMessages)('mensagem "%s" → opt_out sem chamar IA', async (msg) => {
      const result = await makeService().route(msg);
      expect(result.intent).toBe('opt_out');
      expect(result.agent).toBe('optout');
      expect(result.leadScore).toBe(0);
      expect(result.source).toBe('fallback');
      expect(mockAnthropic.completeJson).not.toHaveBeenCalled();
    });
  });

  // completeJson retorna o objeto já parseado (não string)
  describe('roteamento via IA', () => {
    it('lead interessado → agent sales, score alto', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'interested', leadScore: 75, reason: 'quer saber mais', isComplaint: false, isAggressive: false },
      );
      const result = await makeService().route('Quero saber mais sobre o sistema de TMS');
      expect(result.intent).toBe('interested');
      expect(result.agent).toBe('sales');
      expect(result.leadScore).toBeGreaterThanOrEqual(60);
    });

    it('pedido de reunião → score elevado ao mínimo 80 (MIN_SCORE G9)', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'meeting_request', leadScore: 50, reason: 'quer reunião', isComplaint: false, isAggressive: false },
      );
      const result = await makeService().route('Posso agendar uma demonstração?');
      expect(result.intent).toBe('meeting_request');
      expect(result.agent).toBe('sales');
      expect(result.leadScore).toBeGreaterThanOrEqual(80);
    });

    it('dúvida de suporte → agent support', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'support_question', leadScore: 20, reason: 'cliente com problema', isComplaint: false, isAggressive: false },
      );
      const result = await makeService().route('O sistema está lento hoje');
      expect(result.intent).toBe('support_question');
      expect(result.agent).toBe('support');
    });

    it('pede humano → agent human', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'human_needed', leadScore: 50, reason: 'quer falar com vendedor', isComplaint: false, isAggressive: false },
      );
      const result = await makeService().route('Quero falar com um vendedor real');
      expect(result.intent).toBe('human_needed');
      expect(result.agent).toBe('human');
    });

    it('pessoa errada → score 0', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'wrong_person', leadScore: 0, reason: 'número errado', isComplaint: false, isAggressive: false },
      );
      const result = await makeService().route('Acho que mandou para o número errado');
      expect(result.intent).toBe('wrong_person');
      expect(result.leadScore).toBe(0);
    });

    it('mensagem agressiva → forçada para human_needed (G8)', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'unknown', leadScore: 0, reason: 'ofensa', isComplaint: false, isAggressive: true },
      );
      const result = await makeService().route('Palavrão e hostilidade');
      expect(result.agent).toBe('human');
      expect(result.isAggressive).toBe(true);
    });

    it('reclamação → isComplaint true com topic', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'support_question', leadScore: 10, reason: 'reclamação', isComplaint: true, complaintTopic: 'lentidao', isAggressive: false },
      );
      const result = await makeService().route('O sistema está muito lento, não consigo trabalhar');
      expect(result.isComplaint).toBe(true);
      expect(result.complaintTopic).toBe('lentidao');
    });
  });

  describe('risco jurídico/comercial por regex (sem chamar IA)', () => {
    const legalMessages = [
      'vou chamar meu advogado',
      'isso vai parar no PROCON',
      'vou processar vocês',
      'vou entrar com ação judicial',
      'vou registrar no reclame aqui',
    ];

    test.each(legalMessages)('mensagem "%s" → human sem chamar IA', async (msg) => {
      const result = await makeService().route(msg);
      expect(result.agent).toBe('human');
      expect(result.intent).toBe('human_needed');
      expect(result.legalRisk).toBe(true);
      expect(result.confidence).toBe(1);
      expect(mockAnthropic.completeJson).not.toHaveBeenCalled();
    });
  });

  describe('gate de confiança', () => {
    it('intenção indefinida + confiança baixa → needsClarification true', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'unknown', leadScore: 20, confidence: 0.3, reason: 'mensagem vaga', isComplaint: false, isAggressive: false },
      );
      const result = await makeService().route('oi');
      expect(result.confidence).toBe(0.3);
      expect(result.needsClarification).toBe(true);
    });

    it('intenção clara + confiança alta → needsClarification falsy', async () => {
      vi.mocked(mockAnthropic.completeJson).mockResolvedValueOnce(
        { intent: 'pricing_question', leadScore: 70, confidence: 0.95, reason: 'pergunta de preço', isComplaint: false, isAggressive: false },
      );
      const result = await makeService().route('quanto custa o plano profissional?');
      expect(result.confidence).toBe(0.95);
      expect(result.needsClarification).toBeFalsy();
    });
  });

  describe('fallback quando IA falha', () => {
    it('retorna fallback com source=fallback se IA lançar erro', async () => {
      vi.mocked(mockAnthropic.completeJson).mockRejectedValueOnce(new Error('timeout'));
      const result = await makeService().route('mensagem qualquer sem padrão');
      expect(result.source).toBe('fallback');
    });

    it('fallback heurístico detecta preço por regex', async () => {
      vi.mocked(mockAnthropic.completeJson).mockRejectedValueOnce(new Error('timeout'));
      const result = await makeService().route('qual o preço do sistema?');
      expect(result.intent).toBe('pricing_question');
      expect(result.source).toBe('fallback');
    });

    it('fallback heurístico detecta reunião por regex', async () => {
      vi.mocked(mockAnthropic.completeJson).mockRejectedValueOnce(new Error('timeout'));
      const result = await makeService().route('quero agendar uma demonstração');
      expect(result.intent).toBe('meeting_request');
      expect(result.source).toBe('fallback');
    });
  });
});
