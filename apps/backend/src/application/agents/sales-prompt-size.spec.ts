import { describe, it, expect, vi } from 'vitest';
import { SalesAgentService } from './sales-agent.service';
import { PLAYBOOK_DEFAULTS } from '@/application/playbook/playbook.service';

/**
 * Tamanho e forma do prompt de vendas — o que o cache de prompt exige.
 *
 * O cache da Anthropic é casamento de PREFIXO: qualquer byte que mude no meio
 * invalida tudo depois dele. Por isso o prompt é montado como NÚCLEO (idêntico
 * em toda mensagem) + SITUAÇÃO (muda a cada chamada), nessa ordem.
 *
 * Estes testes existem porque a regressão é SILENCIOSA: quem inserir uma
 * interpolação no meio do núcleo não vê erro nenhum — só o cache para de casar
 * e a conta sobe sem explicação.
 */
async function promptDeVendas(over: Partial<Parameters<SalesAgentService['sell']>[1]> = {}) {
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
  await svc.sell('t1', { question: 'quanto custa?', ...over });
  return capturado;
}

const MARCADOR = 'SITUAÇÃO DESTA CONVERSA AGORA:';
const nucleoDe = (p: string) => p.split(MARCADOR)[0];

describe('prompt de vendas — núcleo cacheável', () => {
  it('separa núcleo de situação', async () => {
    const p = await promptDeVendas();
    expect(p).toContain(MARCADOR);
  });

  it('o núcleo é IDÊNTICO entre chamadas com situações diferentes', async () => {
    // Primeiro contato, lead frio × conversa em andamento, lead quente:
    // tudo que difere tem de estar depois do marcador.
    const frio = await promptDeVendas({ leadScore: 0, ongoing: false });
    const quente = await promptDeVendas({ leadScore: 90, ongoing: true, hasPriorContext: true });

    expect(nucleoDe(frio)).toBe(nucleoDe(quente));
    expect(frio).not.toBe(quente); // a situação, essa sim, mudou
  });

  it('nada que varia por conversa vaza para dentro do núcleo', async () => {
    // Os rótulos de temperatura aparecem no texto ESTÁTICO da matriz, então
    // procurar por "QUENTE" acusaria falso. O que não pode vazar é o valor
    // daquela conversa — a linha de engajamento, a saudação e a retomada.
    // (A garantia forte é o teste de identidade acima; este aponta o culpado.)
    const nucleo = nucleoDe(await promptDeVendas({ leadScore: 90, ongoing: true, hasPriorContext: true }));
    expect(nucleo).not.toMatch(/ENGAJAMENTO ATUAL DO LEAD/);
    expect(nucleo).not.toMatch(/bom dia|boa tarde|boa noite/i); // saudação por horário
    expect(nucleo).not.toMatch(/RETOMADA/);
  });
});

describe('prompt de vendas — matriz de qualificação', () => {
  it('qualifica por dor e urgência, não por ter frota ou emitir CT-e', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/MATRIZ DE QUALIFICAÇÃO/);
    expect(p).toMatch(/LEAD QUENTE = dor concreta declarada \+ urgência real/);
    // A armadilha que a primeira versão da matriz tinha: qualificar pelo que toda
    // transportadora já tem, o que tornaria ~100% dos leads quentes.
    expect(p).toMatch(/NÃO qualificam sozinhos/);
  });

  it('define o perfil frio sem mandar descartar', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/LEAD FRIO \/ FORA DE PERFIL/);
    expect(p).toMatch(/Não descarte/);
  });

  it('exige os dados de qualificação antes do bastão', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/ANTES DE PASSAR AO ESPECIALISTA/);
    expect(p).toMatch(/nome da pessoa, nome da empresa/);
  });
});

// Reposicionamento comercial de agosto/2026 (11_briefing_dev_nexa_lia.md).
// Este bloco chamava-se "self-service preservado" e travava o oposto: preço
// respondido pelo catálogo e fechamento no link de cadastro. O Básico de R$89 foi
// extinto, o /signup virou captação de lead e o objetivo do funil passou a ser
// demonstração agendada.
describe('prompt de vendas — sem preço, fechamento em demonstração', () => {
  it('proíbe informar valor, inclusive "a partir de"', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/você NUNCA informa valor/i);
    expect(p).toMatch(/a partir de/i);
  });

  it('pergunta de preço vira escalação, não resposta', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/QUALQUER pergunta sobre preço, valor, tabela ou proposta/i);
  });

  it('o fechamento é demonstração agendada, nunca cadastro', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/DEMONSTRAÇÃO AGENDADA/i);
    expect(p).toMatch(/NUNCA envie link de cadastro/i);
    // A URL de cadastro não pode mais chegar ao modelo por nenhum caminho.
    expect(p).not.toMatch(/signup/i);
  });

  it('lista o vocabulário do funil antigo como proibido', async () => {
    const p = await promptDeVendas();
    for (const morto of ['sem implantação', '5 minutos', 'conta grátis', 'crie sua conta']) {
      expect(p).toContain(morto);
    }
    expect(p).toMatch(/VOCABULÁRIO PROIBIDO/);
  });

  it('reconhece o lead estruturado vindo do site', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/LEAD VINDO DO SITE/);
    expect(p).toMatch(/Quero falar com um especialista do HiperTMS/);
  });

  it('tira operação de 1 a 3 veículos do perfil', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/1 A 3 VEÍCULOS está fora do perfil/i);
  });

  it('a frase de bastão não promete prazo', async () => {
    const p = await promptDeVendas();
    expect(p).toMatch(/conectando você ao nosso especialista/);
    expect(p).not.toMatch(/agora mesmo|em \d+ minutos/i);
  });
});
