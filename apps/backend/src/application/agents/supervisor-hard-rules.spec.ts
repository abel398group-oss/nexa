import { describe, it, expect } from 'vitest';
import { SupervisorAgentService } from './supervisor-agent.service';
import { inspectOutbound } from '@/shared/governance/output-guard';

/**
 * Regras duras da Supervisora — as que decidem ANTES de chamar o modelo.
 *
 * Rodam de graça e no CI, ao contrário do golden set em `evals/`, que chama a API
 * e fica de fora. O stub de IA abaixo explode se for chamado: se alguém inverter a
 * ordem e passar a consultar o modelo antes das regras duras, o teste acusa.
 */
describe('Supervisora — regras duras', () => {
  const aiQueNaoPodeSerChamada = {
    completeJson: async () => {
      throw new Error('a IA não deveria ser chamada — a regra dura decide antes');
    },
  } as any;

  const revisar = (draft: string) =>
    new SupervisorAgentService(aiQueNaoPodeSerChamada).review({
      customerMessage: 'e depois que eu assinar, vocês somem?',
      draft,
      allowedFacts: 'PLANOS:\n- Básico: R$89',
    });

  it('barra garantia de resultado sem consultar o modelo', async () => {
    const v = await revisar('Garantimos lucro de 30% na sua operação.');
    expect(v.approved).toBe(false);
    expect(v.source).toBe('fallback'); // decidido pela regra, não pela IA
  });

  /**
   * DEFEITO CONHECIDO — este bloco documenta o comportamento de hoje, não o desejado.
   *
   * A regra é `/(100%|sempre|nunca falha|infalível)/i`. "Estou sempre por aqui" é
   * português comum, não promessa exagerada, mas volta reprovado com risco alto e
   * o lead recebe o aceno seguro em vez da resposta.
   *
   * Afrouxar trava de segurança é decisão do Abel, então o teste prende a realidade
   * atual. Quando a regra for escopada, ele inverte para `approved: true` — e a
   * inversão é o sinal de que o conserto entrou.
   */
  it('DEFEITO: "sempre" sozinho reprova conversa legítima', async () => {
    const v = await revisar('De jeito nenhum. Estou sempre por aqui, e a implantação é acompanhada.');

    expect(v.approved).toBe(false); // ← inverte quando a regra for escopada
    expect(v.issues.join(' ')).toMatch(/absolutismo/i);
  });

  it('e o guard determinístico deixa a mesma frase passar — as camadas discordam', () => {
    const frase = 'De jeito nenhum. Estou sempre por aqui, e a implantação é acompanhada.';
    expect(inspectOutbound(frase, 'PLANOS:\n- Básico: R$89').safe).toBe(true);
  });
});
