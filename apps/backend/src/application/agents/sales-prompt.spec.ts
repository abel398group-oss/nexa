import { describe, it, expect, vi } from 'vitest';
import { SalesAgentService } from './sales-agent.service';
import { PLAYBOOK_DEFAULTS } from '@/application/playbook/playbook.service';

/**
 * Regras de CONDUTA da Lia de vendas que vinham de um documento e nada verificava.
 *
 * O documento `07_scripts_lia_prospeccao.md` vivia no material de marketing e nunca
 * foi ligado a nada: o prompt abria a apresentação por "Emissão de CT-e" — a parte que
 * todo sistema do mercado faz — exatamente o que o documento proíbe, e ninguém
 * percebeu porque não havia teste. Documento sem teste é sugestão.
 *
 * Estes testes prendem as regras no prompt. Nenhum deles verifica PREÇO de propósito:
 * o preço chega ao prompt do catálogo AO VIVO do TMS (`connectors.getPlans`), e fixar
 * número aqui seria criar uma terceira versão da tabela de planos.
 */

// Monta o prompt real chamando sell() com um cliente de IA falso que só captura o
// system. É o único jeito honesto de testar: reimplementar a montagem no teste
// provaria apenas que o teste concorda consigo mesmo.
async function promptDeVendas(): Promise<string> {
  let capturado = '';
  const ai = {
    completeWithUsage: vi.fn(async (system: string) => {
      capturado = system;
      return { text: 'ok\nACTION=none', usage: {} };
    }),
  };
  const svc = new SalesAgentService(
    ai as any,
    { retrieve: vi.fn(async () => []) } as any,
    { getPlans: vi.fn(async () => [{ code: 'basico', name: 'Básico', price: 89, features: [] }]) } as any,
    { get: vi.fn(async () => PLAYBOOK_DEFAULTS) } as any,
  );
  await svc.sell('t1', { question: 'quanto custa?' });
  return capturado;
}

describe('prompt de vendas — ângulo de abertura', () => {
  it('manda abrir pela dor de precificar/cotar, não pelo fiscal', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/ÂNGULO DE ABERTURA/);
    expect(p).toMatch(/NÃO abra falando de CT-e/i);
  });

  it('a vitrine de recursos não começa por CT-e', async () => {
    const p = await promptDeVendas();
    // Só bullets que ABREM a linha: a instrução sobre qual caractere usar cita "• "
    // no meio de uma frase e não é item de lista.
    const bullets = [...p.matchAll(/^• (.+)$/gm)].map((m) => m[1]);
    expect(bullets.length).toBeGreaterThan(0);
    // O primeiro item que o modelo vê como exemplo define o que ele imita.
    expect(bullets[0]).not.toMatch(/CT-e|MDF-e|SEFAZ|fiscal/i);
    expect(bullets[0]).toMatch(/precifica|cotaç|margem/i);
  });

  it('o fiscal continua presente — o problema era a ordem, não a existência', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/CT-e/);
  });
});

describe('prompt de vendas — gatilhos objetivos de escalação', () => {
  it('os quatro gatilhos estão no prompt', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/frota acima de 20/i);
    expect(p).toMatch(/NEGOCIAR preço|desconto/i);
    expect(p).toMatch(/plano de maior porte|proposta formal/i);
    expect(p).toMatch(/duas mensagens seguidas/i);
  });

  it('escala mesmo com lead frio (era o caso que mais escapava)', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/mesmo que o lead pareça frio/i);
  });

  it('não promete prazo que a Lia não controla ao escalar', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/não prometa prazo/i);
  });
});

describe('playbook — o que veio do documento de prospecção', () => {
  const texto = PLAYBOOK_DEFAULTS.objections.map((o) => `${o.objection} ${o.guidance}`).join('\n');

  it('trouxe as objeções de conduta que faltavam', () => {
    const rotulos = PLAYBOOK_DEFAULTS.objections.map((o) => o.objection).join(' | ');
    expect(rotulos).toMatch(/Quem é você/i);
    expect(rotulos).toMatch(/Já temos sistema/i);
    expect(rotulos).toMatch(/autônomo/i);
    expect(rotulos).toMatch(/Emite CT-e/i);
  });

  it('pede a rota real do lead como convite de menor atrito', () => {
    expect(PLAYBOOK_DEFAULTS.ctaCold).toMatch(/origem e destino/i);
  });

  // "+5.500 municípios" e "mais de 30 anos" DEIXARAM de ser não conferidas: o
  // posicionamento de agosto/2026 do TMS as declara oficialmente. Mas o lugar
  // delas continua não sendo aqui.
  //
  // A regra da Lia é afirmar só o que está no catálogo ou na BASE. Colar o número
  // no playbook o transforma em fato por decreto — sem artigo, sem fonte, e fora
  // do alcance da Supervisora, que audita contra o que foi recuperado da base.
  // Elas entraram como artigo ("Inteligência de precificação — a tabela nacional
  // viva"), que é recuperável, auditável e editável sem deploy.
  //
  // Ou seja: este teste continua guardando o mesmo princípio de sempre — número
  // se prova pela base, não pelo playbook.
  it('NÃO fixa as afirmações numéricas no playbook — o lugar delas é a base', () => {
    expect(texto).not.toMatch(/5\.?500/);
    expect(texto).not.toMatch(/30 anos/i);
  });

  // Preço tem contradição aberta entre as fontes (ver docs/ai/kb-vendas-pendencias-tms.md);
  // o valor válido é o do catálogo ao vivo, não texto colado no playbook.
  it('NÃO fixa preço de plano no playbook', () => {
    expect(texto).not.toMatch(/R\$\s?\d/);
  });
});
