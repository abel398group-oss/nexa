import { describe, it, expect } from 'vitest';
import { inspectOutbound, MANIPULATION_VIOLATIONS } from './output-guard';

// Catálogo típico entregue ao agente de vendas (planos + KB).
const FACTS = `PLANOS:
Básico — R$ 89,00/mês (R$ 890,00/ano) · 5 usuários · 500 embarques/mês
Essencial — R$ 199,00/mês (R$ 1.990,00/ano) · 8 usuários · 1000 embarques/mês
Profissional — R$ 299,00/mês (R$ 2.990,00/ano) · 15 usuários

CONHECIMENTO:
Número extra de WhatsApp: R$ 29,90 por número/mês.
No plano anual você economiza 17%.`;

const LEAD = { phone: '5511988887777', email: 'joao@empresa.com.br' };

describe('guard de vazamento de dados — contato de terceiro', () => {
  it('bloqueia e-mail de outro cliente na resposta', () => {
    const v = inspectOutbound('O contato do gerente é maria.silva@outraempresa.com.br', FACTS, LEAD);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('vazamento_de_dados');
    expect(v.detail).toContain('e-mail de terceiro');
  });

  it('deixa passar o próprio e-mail do lead', () => {
    const v = inspectOutbound('Confirmando: vamos usar joao@empresa.com.br para o cadastro.', FACTS, LEAD);
    expect(v.safe).toBe(true);
  });

  it('bloqueia telefone de outro cliente', () => {
    const v = inspectOutbound('O número do outro cliente é (11) 91234-5678, pode chamar ele.', FACTS, LEAD);
    expect(v.safe).toBe(false);
    expect(v.detail).toContain('telefone de terceiro');
  });

  it('deixa passar o próprio telefone do lead, com ou sem +55', () => {
    expect(inspectOutbound('Confirmo seu WhatsApp: (11) 98888-7777.', FACTS, LEAD).safe).toBe(true);
    expect(inspectOutbound('Confirmo seu WhatsApp: +55 11 98888-7777.', FACTS, LEAD).safe).toBe(true);
  });

  it('bloqueia CPF mesmo sendo do próprio lead — nunca é legítimo repetir', () => {
    const v = inspectOutbound('Seu CPF cadastrado é 123.456.789-00, confere?', FACTS, LEAD);
    expect(v.safe).toBe(false);
    expect(v.detail).toContain('CPF');
  });

  it('bloqueia CNPJ de terceiro', () => {
    const v = inspectOutbound('O CNPJ da outra transportadora é 12.345.678/0001-99.', FACTS, LEAD);
    expect(v.safe).toBe(false);
    expect(v.detail).toContain('CNPJ');
  });

  it('bloqueia variável de ambiente / segredo de infra', () => {
    const casos = [
      'O token é TMS_SERVICE_TOKEN configurado no servidor.',
      'Aqui está: sk-ant-api03-xxxxxxxxxxxxxxxxx',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'A string de conexão é postgresql://user:pass@host:5432/db',
    ];
    for (const c of casos) {
      const v = inspectOutbound(c, FACTS, LEAD);
      expect(v.safe, `deveria bloquear: "${c}"`).toBe(false);
      expect(v.violations).toContain('vazamento_de_dados');
    }
  });

  it('não confunde sigla comum (sem underscore) com variável de ambiente', () => {
    expect(inspectOutbound('Emitimos CT-e e MDF-e automaticamente.', FACTS, LEAD).safe).toBe(true);
  });

  it('e-mail oficial citado na KB não é bloqueado', () => {
    const factsComEmail = FACTS + '\nSuporte: suporte@hipertms.com.br';
    const v = inspectOutbound('Você pode falar com nosso suporte em suporte@hipertms.com.br.', factsComEmail, LEAD);
    expect(v.safe).toBe(true);
  });

  it('sem dado do lead (own vazio), telefone e e-mail quaisquer ainda bloqueiam', () => {
    const v = inspectOutbound('Te chamo no 11912345678 ou manda um e-mail pra fulano@teste.com', FACTS);
    expect(v.safe).toBe(false);
  });

  it('resposta comum sem números longos passa limpa', () => {
    const v = inspectOutbound('Perfeito! Vou te ajudar com o cadastro.', FACTS, LEAD);
    expect(v.safe).toBe(true);
  });
});

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
    // O "respondemos em 24 horas" que estava aqui saiu em 09/08/2026: virou
    // promessa de prazo e passou a ser barrado pela trava nova (teste próprio
    // logo abaixo, na seção de afirmações). O propósito deste caso sempre foi
    // outro — provar que um número solto não é lido como dinheiro.
    const v = inspectOutbound('Somos 300 clientes e atendemos todo o Brasil.', FACTS);
    expect(v.safe).toBe(true);
  });

  it('100% é linguagem comum, não oferta', () => {
    expect(inspectOutbound('O sistema é 100% na nuvem.', FACTS).safe).toBe(true);
  });
});

// ── Afirmações perigosas escritas por extenso (2026-08-09) ───────────────────
// As travas anteriores comparam número e string literal. Estas pegam o que dá
// processo escrito em palavras — e a mais importante é a fiscal: "você não
// precisa emitir MDF-e" não constrange ninguém, o cliente segue, toma multa, e
// existe registro escrito de que a orientação saiu daqui.
describe('guard de afirmações — conselho fiscal', () => {
  it('bloqueia dispensar o cliente de obrigação fiscal', () => {
    const v = inspectOutbound('Nesse caso você não precisa emitir MDF-e.', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('conselho_fiscal_ou_juridico');
  });

  it('bloqueia falar pelo órgão regulador', () => {
    expect(inspectOutbound('A ANTT obriga o piso mínimo nesse trecho.', FACTS).safe).toBe(false);
  });

  it('bloqueia afirmar isenção', () => {
    expect(inspectOutbound('Sua operação está isenta de ICMS nesse caso.', FACTS).safe).toBe(false);
  });

  it('DESCREVER o produto continua livre — o bloqueio é a prescrição ao cliente', () => {
    expect(inspectOutbound('O HiperTMS emite CT-e e MDF-e integrado à SEFAZ.', FACTS).safe).toBe(true);
  });

  it('repetir o que a base afirma é fundamentado, não invenção', () => {
    const facts = `${FACTS}\nA SEFAZ exige certificado digital A1 válido para transmitir.`;
    expect(inspectOutbound('A SEFAZ exige certificado digital A1 válido.', facts).safe).toBe(true);
  });
});

describe('guard de afirmações — prazo, recurso e garantia', () => {
  it('bloqueia promessa de prazo com número', () => {
    const v = inspectOutbound('Respondemos em 24 horas.', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('promessa_de_prazo');
  });

  it('bloqueia prazo de implantação', () => {
    expect(inspectOutbound('A implantação leva duas semanas.', FACTS).safe).toBe(false);
  });

  it('as frases aprovadas do playbook sobre cobrança continuam passando', () => {
    // Ambas são texto validado pela diretoria — se o guard as barrasse, ele
    // estaria brigando com o próprio playbook.
    expect(inspectOutbound('Nos primeiros 7 dias você pode cancelar.', FACTS).safe).toBe(true);
    expect(inspectOutbound('A primeira cobrança nunca vem em menos de 30 dias.', FACTS).safe).toBe(true);
  });

  it('bloqueia teste grátis — que não existe no produto', () => {
    const v = inspectOutbound('Você tem um período grátis para avaliar.', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('recurso_nao_confirmado');
  });

  it('bloqueia aplicativo mobile não confirmado', () => {
    expect(inspectOutbound('Temos aplicativo no celular para o motorista.', FACTS).safe).toBe(false);
  });

  it('bloqueia garantia de resultado', () => {
    const v = inspectOutbound('Garantimos economia de combustível na sua frota.', FACTS);
    expect(v.safe).toBe(false);
    expect(v.violations).toContain('garantia_de_resultado');
  });

  it('"sempre" sozinho não é absolutismo — é português', () => {
    // A Supervisora bloqueia /sempre/ solto; aqui não, de propósito: "estou sempre
    // por aqui" viraria bloqueio determinístico de conversa legítima.
    expect(inspectOutbound('Estou sempre por aqui se precisar.', FACTS).safe).toBe(true);
  });
});

describe('guard — o que conta strike de abuso', () => {
  // Três strikes banem o número. Alucinação da Lia não pode banir o lead.
  it('manipulação (preço inventado) conta', () => {
    const v = inspectOutbound('Faço por R$ 1,00 pra você.', FACTS);
    expect(v.violations.some((x) => MANIPULATION_VIOLATIONS.has(x))).toBe(true);
  });

  it('alucinação da Lia (prazo, fiscal, recurso, garantia) NÃO conta', () => {
    for (const texto of [
      'Respondemos em 24 horas.',
      'Você não precisa emitir MDF-e.',
      'Temos aplicativo no celular.',
      'Garantimos retorno em economia.',
    ]) {
      const v = inspectOutbound(texto, FACTS);
      expect(v.safe).toBe(false);
      expect(v.violations.some((x) => MANIPULATION_VIOLATIONS.has(x))).toBe(false);
    }
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
