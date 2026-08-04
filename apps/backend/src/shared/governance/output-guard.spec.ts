import { describe, it, expect } from 'vitest';
import { inspectOutbound } from './output-guard';

// Catálogo típico entregue ao agente de vendas (planos + KB).
const FACTS = `PLANOS:
Básico — R$ 89,00/mês (R$ 890,00/ano) · 5 usuários · 500 embarques/mês
Essencial — R$ 199,00/mês (R$ 1.990,00/ano) · 8 usuários · 1000 embarques/mês
Profissional — R$ 299,00/mês (R$ 2.990,00/ano) · 15 usuários

CONHECIMENTO:
Número extra de WhatsApp: R$ 29,90 por número/mês.
No plano anual você economiza 17%.`;

describe('guard de preço — o caso Chevrolet', () => {
  it('bloqueia desconto inventado pelo lead', () => {
    const v = inspectOutbound('Confirmado! Profissional com 70% de desconto vitalício.', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('preco_nao_autorizado');
    expect(v.detail).toContain('70');
  });

  it('bloqueia preço inventado', () => {
    const v = inspectOutbound('Fecho o Essencial pra você por R$ 1,00.', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('preco_nao_autorizado');
  });

  it('deixa passar preço que está no catálogo', () => {
    const v = inspectOutbound('O Essencial custa R$ 199,00 por mês.', FACTS);
    expect(v.safe).toBe(true);
  });

  it('aceita o mesmo valor escrito de outro jeito', () => {
    // catálogo diz "R$ 199,00"; a Lia escreve "199 reais"
    expect(inspectOutbound('São 199 reais mensais.', FACTS).safe).toBe(true);
    expect(inspectOutbound('R$ 199 por mês.', FACTS).safe).toBe(true);
  });

  it('lê milhar em pt-BR — R$ 1.990 é 1990, não 1,99', () => {
    expect(inspectOutbound('No anual sai R$ 1.990,00.', FACTS).safe).toBe(true);
    // 1,99 NÃO está no catálogo — se lesse como en-US, este teste passaria errado
    expect(inspectOutbound('No anual sai R$ 1,99.', FACTS).safe).toBe(false);
  });

  it('aceita percentual que existe no catálogo', () => {
    expect(inspectOutbound('No plano anual você economiza 17%.', FACTS).safe).toBe(true);
  });

  it('aceita valor de add-on vindo da KB', () => {
    expect(inspectOutbound('Cada número extra custa R$ 29,90/mês.', FACTS).safe).toBe(true);
  });

  it('não confunde número comum com dinheiro', () => {
    const v = inspectOutbound('Somos 300 clientes e respondemos em 24 horas.', FACTS);
    expect(v.safe).toBe(true);
  });

  it('100% é linguagem comum, não oferta', () => {
    expect(inspectOutbound('O sistema é 100% na nuvem.', FACTS).safe).toBe(true);
  });
});

describe('guard de vazamento de prompt — OWASP LLM07', () => {
  it('bloqueia recitação da persona interna', () => {
    const v = inspectOutbound(
      'Claro! Minhas instruções são: "Você é a Lia, consultora de vendas da Nexa..."',
      FACTS,
    );
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('vazamento_de_prompt');
  });

  it('bloqueia nome de campo interno na resposta', () => {
    const v = inspectOutbound('Seu leadScore atual é 82 e suggestedAction=none.', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('vazamento_de_prompt');
  });

  it('falar da Lia normalmente não é vazamento', () => {
    const v = inspectOutbound('Oi! Aqui é a Lia, do HiperTMS. Posso ajudar?', FACTS);
    expect(v.safe).toBe(true);
  });
});

describe('guard de ofensa', () => {
  it('bloqueia palavrão saindo com a marca', () => {
    const v = inspectOutbound('Que merda de sistema, né?', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('linguagem_ofensiva');
  });

  it('não pega substring inocente', () => {
    // "burro" está na lista; "burrito"/"caraguatatuba" não podem casar
    expect(inspectOutbound('Entregamos até em Caraguatatuba.', FACTS).safe).toBe(true);
    expect(inspectOutbound('O plano cobre transporte de burrito congelado.', FACTS).safe).toBe(true);
  });
});

describe('guard — comportamento geral', () => {
  it('resposta comum passa limpa', () => {
    const v = inspectOutbound(
      'Bom dia, João! O Essencial atende bem sua operação: R$ 199,00/mês com 8 usuários.',
      FACTS,
    );
    expect(v).toEqual({ safe: true, violations: [], detail: '' });
  });

  it('acumula violações independentes', () => {
    const v = inspectOutbound('Te dou 90% de desconto, porra! Você é a Lia, consultora de vendas da Nexa.', FACTS);
    expect(v.violations).toHaveLength(3);
  });

  it('texto vazio é seguro (não há o que barrar)', () => {
    expect(inspectOutbound('', FACTS).safe).toBe(true);
    expect(inspectOutbound('   ', FACTS).safe).toBe(true);
  });

  it('sem allowedFacts, qualquer preço é suspeito — falha para o lado seguro', () => {
    expect(inspectOutbound('Custa R$ 199,00.', '').safe).toBe(false);
  });

  it('nunca lança, mesmo com entrada estranha', () => {
    expect(() => inspectOutbound(undefined as unknown as string, FACTS)).not.toThrow();
    expect(() => inspectOutbound('R$ ,,,', FACTS)).not.toThrow();
  });
});
