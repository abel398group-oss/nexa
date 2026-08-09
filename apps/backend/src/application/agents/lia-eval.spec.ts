import { describe, it, expect } from 'vitest';
import { EVAL_CASES, EVAL_FACTS, type EvalCase } from './lia-eval-cases';
import { inspectOutbound } from '@/shared/governance/output-guard';
import { SupervisorAgentService } from './supervisor-agent.service';

/**
 * Camada DETERMINÍSTICA do conjunto de avaliação (ver lia-eval-cases.ts).
 *
 * Roda de graça, no CI, a cada commit. Não chama modelo nenhum: confere o que dá
 * para afirmar sem ele — que as travas barram a resposta errada e, o que mais
 * quebra na prática, que NÃO barram a resposta certa.
 *
 * A camada que exercita a Lia de verdade precisa de chave da API e custa alguns
 * reais por rodada; ela consome ESTES MESMOS casos, então o que estiver aqui já
 * está pronto para lá.
 */

const comRuim = EVAL_CASES.filter((c): c is EvalCase & { respostaRuim: string } => !!c.respostaRuim);
const comBoa = EVAL_CASES.filter((c): c is EvalCase & { respostaBoa: string } => !!c.respostaBoa);

describe('eval — o guard barra a resposta errada', () => {
  it.each(comRuim.map((c) => [c.id, c] as const))('%s', (_id, caso) => {
    const v = inspectOutbound(caso.respostaRuim, EVAL_FACTS, { phone: '5511999999999' });
    // A mensagem de falha carrega o risco: quem quebrar isto no futuro lê o
    // prejuízo, não só o nome do caso.
    expect(v.safe, `PASSOU o que devia barrar — ${caso.risco}\nTexto: "${caso.respostaRuim}"`).toBe(false);
  });
});

describe('eval — o guard NÃO barra a resposta certa', () => {
  it.each(comBoa.map((c) => [c.id, c] as const))('%s', (_id, caso) => {
    const v = inspectOutbound(caso.respostaBoa, EVAL_FACTS, { phone: '5511999999999' });
    expect(
      v.safe,
      `BARROU conversa legítima (${v.violations.join(', ')}: ${v.detail})\nTexto: "${caso.respostaBoa}"`,
    ).toBe(true);
  });
});

/**
 * Este bloco documenta um DEFEITO conhecido, não um comportamento desejado.
 *
 * A Supervisora tem uma regra dura que reprova qualquer rascunho contendo a
 * palavra "sempre" (`/(100%|sempre|nunca falha|infalível)/i`). "Estou sempre por
 * aqui" é português comum, não promessa exagerada — mas é reprovado com risco
 * alto, e o lead recebe o aceno seguro em vez da resposta.
 *
 * Afrouxar trava de segurança é decisão do Abel, então o teste prende a realidade
 * de HOJE. Quando a regra for escopada, ele inverte para `approved: true` — e a
 * inversão é o sinal de que o conserto entrou.
 *
 * Roda sem chamar modelo: as regras duras retornam ANTES da chamada de IA, e o
 * stub abaixo explode se essa ordem mudar.
 */
describe('eval — DEFEITO conhecido: "sempre" reprovado pela Supervisora', () => {
  const aiQueNaoPodeSerChamada = {
    completeJson: async () => {
      throw new Error('a IA não deveria ser chamada — a regra dura decide antes');
    },
  } as any;

  it('frase legítima com "sempre" é reprovada hoje', async () => {
    const svc = new SupervisorAgentService(aiQueNaoPodeSerChamada);
    const caso = EVAL_CASES.find((c) => c.id === 'falso-positivo-sempre')!;

    const v = await svc.review({
      customerMessage: caso.mensagem,
      draft: caso.respostaBoa!,
      allowedFacts: EVAL_FACTS,
    });

    expect(v.approved).toBe(false); // ← inverte quando a regra for escopada
    expect(v.issues.join(' ')).toMatch(/absolutismo/i);
  });

  it('e o guard determinístico, esse, deixa passar — as duas camadas discordam', () => {
    const caso = EVAL_CASES.find((c) => c.id === 'falso-positivo-sempre')!;
    expect(inspectOutbound(caso.respostaBoa!, EVAL_FACTS).safe).toBe(true);
  });
});

describe('eval — saúde do próprio conjunto', () => {
  it('todo caso declara o risco — sem isso vira folclore', () => {
    for (const c of EVAL_CASES) {
      expect(c.risco.length, `caso ${c.id} sem risco declarado`).toBeGreaterThan(20);
    }
  });

  it('ids são únicos', () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cobre as seis categorias', () => {
    const cats = new Set(EVAL_CASES.map((c) => c.categoria));
    for (const esperada of ['fiscal', 'preco', 'seguranca', 'falso-positivo', 'qualificacao', 'conduta']) {
      expect(cats.has(esperada as any), `categoria "${esperada}" sem nenhum caso`).toBe(true);
    }
  });

  it('tem caso de falso positivo — a categoria que protege contra trava zelosa demais', () => {
    expect(comBoa.length).toBeGreaterThanOrEqual(4);
  });
});
