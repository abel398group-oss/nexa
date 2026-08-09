import { describe, it, expect } from 'vitest';
import { SupervisorAgentService } from './supervisor-agent.service';
import { inspectOutbound } from '@/shared/governance/output-guard';

/**
 * Regras duras da Supervisora — as que decidem ANTES de chamar o modelo.
 *
 * Rodam de graça e no CI, ao contrário do golden set em `evals/`, que chama a API
 * e fica de fora.
 *
 * A divisão de trabalho que estes testes protegem: a regra dura pega a promessa
 * ÓBVIA e é burra de propósito (coisa burra não é convencida por conversa); o
 * caso ambíguo segue para a Supervisora, que lê o sentido. Até 09/08/2026 a
 * regra casava a palavra "sempre" solta e o ambíguo nunca chegava a ela.
 */
const FACTS = 'PLANOS:\n- Básico: R$89';

/** IA que EXPLODE se for chamada — prova que a regra dura decidiu sozinha. */
const aiProibida = {
  completeJson: async () => {
    throw new Error('a IA não deveria ser chamada — a regra dura decide antes');
  },
} as any;

/** IA que aprova — usada quando o esperado é a frase CHEGAR na Supervisora. */
const aiQueAprova = {
  completeJson: async () => ({ approved: true, risk: 'low', issues: [] }),
} as any;

const revisar = (ai: any, draft: string) =>
  new SupervisorAgentService(ai).review({
    customerMessage: 'e depois que eu assinar, vocês somem?',
    draft,
    allowedFacts: FACTS,
  });

describe('Supervisora — a regra dura barra a promessa óbvia', () => {
  it.each([
    ['Garantimos lucro de 30% na sua operação.', 'garantia de resultado'],
    ['Pode confiar: sempre funciona.', 'sempre + verbo de desempenho'],
    ['O sistema nunca falha.', 'nunca falha'],
    ['Nosso processo é infalível.', 'infalível'],
    ['Temos 100% de garantia de aprovação na SEFAZ.', '100% de garantia'],
    ['É grátis para sempre.', 'oferta vitalícia'],
  ])('bloqueia "%s" (%s) sem consultar o modelo', async (draft) => {
    const v = await revisar(aiProibida, draft);
    expect(v.approved).toBe(false);
    expect(v.source).toBe('fallback'); // decidido pela regra, não pela IA
  });
});

describe('Supervisora — português comum não é promessa', () => {
  // Estes três eram reprovados com risco alto até 09/08/2026, e o lead recebia o
  // aceno seguro no lugar da resposta. O que mudou é a regra dura deixar passar —
  // o julgamento continua existindo, agora feito por quem lê o sentido.
  it.each([
    'De jeito nenhum. Estou sempre por aqui, e a implantação é acompanhada.',
    'O sistema é 100% na nuvem, você acessa de qualquer lugar.',
    'Sempre que precisar, é só chamar por aqui.',
  ])('deixa "%s" chegar na Supervisora', async (draft) => {
    const v = await revisar(aiQueAprova, draft);
    expect(v.approved).toBe(true);
    expect(v.source).toBe('ai'); // quem decidiu foi o modelo, não o regex
  });

  it('o guard determinístico concorda — as duas camadas param de divergir', () => {
    const frase = 'De jeito nenhum. Estou sempre por aqui, e a implantação é acompanhada.';
    expect(inspectOutbound(frase, FACTS).safe).toBe(true);
  });
});

describe('Supervisora — o caso ambíguo vai para quem lê o sentido', () => {
  /**
   * "sua margem sempre sobe" É promessa exagerada, e nenhum regex honesto pega
   * isso sem pegar junto meia língua portuguesa. O desenho é esse: a regra dura
   * não tenta: ela entrega para a Supervisora, cujo prompt manda reprovar
   * "promessa exagerada ou garantia de resultado".
   */
  it('a regra dura não decide — a Supervisora recebe e reprova', async () => {
    const aiQueReprova = {
      completeJson: async () => ({
        approved: false,
        risk: 'high',
        issues: ['promessa exagerada'],
      }),
    } as any;

    const v = await revisar(aiQueReprova, 'Com a gente sua margem sempre sobe.');

    expect(v.approved).toBe(false);
    // `source: 'ai'` é o ponto do teste: a frase ATRAVESSOU a regra dura e foi
    // reprovada por quem lê o sentido. Com 'fallback' teria morrido no regex.
    expect(v.source).toBe('ai');
    expect(v.issues).toContain('promessa exagerada');
  });
});
