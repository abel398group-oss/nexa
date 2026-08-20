import { describe, expect, it } from 'vitest';
import { avaliarLinha, detectarSeparador, parseCsvDeLeads, pareceRazaoSocial } from './lead-csv';

describe('separador', () => {
  it('detecta ponto-e-vírgula do Excel brasileiro', () => {
    // O caso clássico: com `,` fixo, o arquivo inteiro vira uma coluna e o operador
    // acha que a lista está ruim.
    expect(detectarSeparador('nome;empresa;telefone')).toBe(';');
  });

  it('detecta vírgula', () => {
    expect(detectarSeparador('nome,empresa,telefone')).toBe(',');
  });

  it('detecta tab', () => {
    expect(detectarSeparador('nome\tempresa\ttelefone')).toBe('\t');
  });
});

describe('parse', () => {
  it('lê as colunas e normaliza telefone e e-mail', () => {
    const { linhas } = parseCsvDeLeads(
      [
        'nome;empresa;telefone;email;frota',
        'Carlos Mendes;Transportes Silva;(12) 98807-3788;CARLOS@Silva.com.BR;12 caminhões',
      ].join('\n'),
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      linha: 2, // o operador conta o cabeçalho como linha 1
      name: 'Carlos Mendes',
      company: 'Transportes Silva',
      phone: '5512988073788', // DDI acrescentado, formatação removida
      fleetSize: 12,
      descarte: null,
      temNome: true,
    });
    expect(linhas[0].email).toBe('carlos@silva.com.br');
  });

  it('aceita cabeçalhos com acento e variações', () => {
    const { linhas, colunasIgnoradas } = parseCsvDeLeads(
      ['Razão Social;Celular;E-mail;CNPJ', 'Silva Ltda;11999887766;a@b.com;123'].join('\n'),
    );

    expect(linhas[0]).toMatchObject({ company: 'Silva Ltda', phone: '5511999887766' });
    // Coluna desconhecida é reportada, não descartada em silêncio.
    expect(colunasIgnoradas).toEqual(['CNPJ']);
  });

  it('respeita aspas com separador dentro', () => {
    const { linhas } = parseCsvDeLeads(
      ['nome;empresa;telefone', 'Carlos;"Silva, Transportes";11999887766'].join('\n'),
    );
    expect(linhas[0].company).toBe('Silva, Transportes');
  });

  it('e-mail ausente é null, nunca string vazia (ADR 021)', () => {
    const { linhas } = parseCsvDeLeads(
      ['nome;telefone;email', 'Carlos;11999887766;'].join('\n'),
    );
    expect(linhas[0].email).toBeNull();
  });

  it('marca duplicado dentro do próprio arquivo', () => {
    const { linhas } = parseCsvDeLeads(
      [
        'nome;telefone',
        'Carlos;11999887766',
        'Carlos Mendes;(11) 99988-7766', // mesmo número, escrito diferente
      ].join('\n'),
    );

    expect(linhas[0].descarte).toBeNull();
    expect(linhas[1].descarte).toBe('duplicado');
  });

  it('arquivo vazio ou só com cabeçalho não quebra', () => {
    expect(parseCsvDeLeads('').linhas).toEqual([]);
    expect(parseCsvDeLeads('nome;telefone').linhas).toEqual([]);
  });

  it('lê CRLF e BOM do Excel', () => {
    const { linhas } = parseCsvDeLeads('﻿nome;telefone\r\nCarlos;11999887766\r\n');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].name).toBe('Carlos');
  });
});

describe('veredito da linha', () => {
  const base = {
    linha: 2,
    name: null,
    company: null,
    fleetSize: null,
    foneInvalido: false,
  };

  it('lead só com e-mail é válido', () => {
    // Descartar por não ter telefone jogaria fora lead de formulário do site.
    const r = avaliarLinha({ ...base, phone: null, email: 'a@b.com' }, new Set());
    expect(r).toBeNull();
  });

  it('lead só com telefone é válido', () => {
    expect(avaliarLinha({ ...base, phone: '5511999887766', email: null }, new Set())).toBeNull();
  });

  it('telefone curto e sem e-mail cai como telefone_invalido', () => {
    const r = avaliarLinha({ ...base, phone: '5511999', email: null }, new Set());
    expect(r).toBe('telefone_invalido');
  });

  it('e-mail torto mas telefone bom continua válido', () => {
    const r = avaliarLinha({ ...base, phone: '5511999887766', email: 'sem-arroba' }, new Set());
    expect(r).toBeNull();
  });

  it('lixo no telefone é reportado como telefone_invalido, não como e-mail', () => {
    // "abc" some na normalização (vira null), então antes desta regra o relatório
    // acusava o e-mail e mandava o operador conferir a coluna errada.
    const r = avaliarLinha(
      { ...base, foneInvalido: true, phone: null, email: 'sem-arroba' },
      new Set(),
    );
    expect(r).toBe('telefone_invalido');
  });

  it('célula de telefone vazia não é erro do operador', () => {
    // Sem telefone e com e-mail torto: o que ele preencheu errado foi o e-mail.
    const r = avaliarLinha(
      { ...base, foneInvalido: false, phone: null, email: 'sem-arroba' },
      new Set(),
    );
    expect(r).toBe('email_invalido');
  });

  it('linha sem nada aproveitável é descartada', () => {
    expect(avaliarLinha({ ...base, phone: null, email: null }, new Set())).toBe(
      'telefone_invalido',
    );
  });
});

/**
 * Cabeçalho vindo de exportação de sistema.
 *
 * Lista de feira sai à mão e o cabeçalho é "Empresa". Exportação de banco de dados
 * sai em `snake_case`, e era aí que o parser desistia em silêncio: a coluna caía em
 * "ignoradas" e o lead entrava sem empresa. Em 18/08/2026 isso valeu 27.607 leads
 * anônimos num arquivo de 31.906 linhas — e nada na tela dizia o porquê.
 */
describe('parseCsvDeLeads — cabeçalho de exportação', () => {
  it('reconhece razao_social e nome_fantasia como empresa', () => {
    const { linhas, colunasIgnoradas } = parseCsvDeLeads(
      'razao_social,email\nTRANSPORTADORA BARBARENSE LTDA,ilario@tb.com.br',
    );
    expect(linhas[0].company).toBe('TRANSPORTADORA BARBARENSE LTDA');
    expect(colunasIgnoradas).toEqual([]);
  });

  it('nome_fantasia é da empresa, não da pessoa', () => {
    const { linhas } = parseCsvDeLeads('nome_fantasia,email\nTB LOG,ilario@tb.com.br');
    expect(linhas[0].company).toBe('TB LOG');
    expect(linhas[0].name).toBeNull();
  });

  // Cabeçalho de planilha humana costuma vir com maiúscula, acento e espaço a mais.
  it('maiúscula, acento e espaço sobrando continuam casando', () => {
    const { linhas } = parseCsvDeLeads('  RAZÃO_SOCIAL  ,E-Mail\nAgabê Óleos,contato@agabe.com.br');
    expect(linhas[0].company).toBe('Agabê Óleos');
    expect(linhas[0].email).toBe('contato@agabe.com.br');
  });

  // A coluna que o parser realmente não conhece precisa continuar sendo reportada:
  // é o único aviso que o operador tem de que um dado dele não entrou.
  it('coluna desconhecida continua aparecendo em ignoradas', () => {
    const { colunasIgnoradas } = parseCsvDeLeads('cnpj,email\n57189367000112,a@b.com.br');
    expect(colunasIgnoradas).toEqual(['cnpj']);
  });
});

/**
 * Duas colunas do arquivo caindo no mesmo campo.
 *
 * Acontece o tempo todo em exportação: `razao_social` + `nome_fantasia` são as duas
 * empresa, `whatsapp` + `telefone` são os dois telefone. A regra é "primeira
 * preenchida vence" — a última vencendo fazia coluna vazia da direita apagar dado bom
 * da esquerda, e o lead entrava anônimo sem nada acusar.
 */
describe('parseCsvDeLeads — colunas que disputam o mesmo campo', () => {
  it('coluna vazia à direita não apaga o valor da esquerda', () => {
    const { linhas } = parseCsvDeLeads(
      'razao_social,nome_fantasia,email\nTRANSPORTADORA BARBARENSE LTDA,,ilario@tb.com.br',
    );
    expect(linhas[0].company).toBe('TRANSPORTADORA BARBARENSE LTDA');
  });

  it('estando as duas preenchidas, vence a primeira do arquivo', () => {
    const { linhas } = parseCsvDeLeads(
      'razao_social,nome_fantasia,email\nBARBARENSE LTDA,TB LOG,ilario@tb.com.br',
    );
    expect(linhas[0].company).toBe('BARBARENSE LTDA');
  });

  // O SDR trabalha no zap; a coluna `telefone` costuma ser o fixo da empresa.
  it('whatsapp ganha do telefone quando os dois vêm', () => {
    const { linhas } = parseCsvDeLeads(
      'whatsapp,telefone,email\n+5519971051858,+551937824328,ilario@tb.com.br',
    );
    expect(linhas[0].phone).toBe('5519971051858');
  });

  it('sem whatsapp, o telefone entra normalmente', () => {
    const { linhas } = parseCsvDeLeads('whatsapp,telefone,email\n,+5519971051858,a@b.com.br');
    expect(linhas[0].phone).toBe('5519971051858');
  });
});

/**
 * Razão social na coluna do nome (20/08/2026).
 *
 * Os casos abaixo são LINHAS REAIS das planilhas de transportadoras — 71% dos leads
 * quentes e 84% dos frios vinham assim. O disparo usa o primeiro nome, então isso
 * saía como "Bom dia, OURO!" e "Bom dia, TB!".
 *
 * O que torna o defeito traiçoeiro: campo VAZIO produzia mensagem melhor. Sem nome,
 * `tidyMissingName` tira o placeholder e a frase se recompõe. O estrago vinha de
 * confiar num nome que não era nome.
 */
describe('pareceRazaoSocial', () => {
  it('nome idêntico à empresa é razão social, mesmo sem marcador', () => {
    expect(pareceRazaoSocial('Ostel', 'Ostel')).toBe(true);
    expect(pareceRazaoSocial('OURO CARGO', 'ouro cargo')).toBe(true);
  });

  it('marcador de pessoa jurídica basta', () => {
    expect(pareceRazaoSocial('OURO CARGO TRANSPORTES LTDA', null)).toBe(true);
    expect(pareceRazaoSocial('TB LOG', null)).toBe(true);
    expect(pareceRazaoSocial('TLZ TRANSPORTES LTDA', null)).toBe(true);
    expect(pareceRazaoSocial('Aviat Cargo Express', null)).toBe(true);
    expect(pareceRazaoSocial('BR01 -Transportes e Logística', null)).toBe(true);
  });

  it('nome de pessoa passa intacto', () => {
    expect(pareceRazaoSocial('Carlos Mendes', 'Transportes Silva')).toBe(false);
    expect(pareceRazaoSocial('Fernanda Dias', null)).toBe(false);
    expect(pareceRazaoSocial('Ana', 'Carga Pesada MG')).toBe(false);
  });

  // `\b` no marcador: sem ele, "log" casa dentro de "Logan" e um sobrenome vira
  // empresa — perder o nome de um lead bom é o custo do falso positivo.
  it('marcador dentro de outra palavra não conta', () => {
    expect(pareceRazaoSocial('Logan Ferreira', null)).toBe(false);
    expect(pareceRazaoSocial('Mesquita Alves', null)).toBe(false);
    expect(pareceRazaoSocial('Salvador Costa', null)).toBe(false);
  });

  it('vazio não é razão social', () => {
    expect(pareceRazaoSocial(null, 'X')).toBe(false);
    expect(pareceRazaoSocial('   ', 'X')).toBe(false);
  });
});

describe('parseCsvDeLeads — razão social no lugar do nome', () => {
  it('sem empresa na linha, a razão social ocupa a empresa e o nome fica vazio', () => {
    const { linhas } = parseCsvDeLeads('nome;telefone\nOURO CARGO TRANSPORTES LTDA;11930256122');
    expect(linhas[0].name).toBeNull();
    expect(linhas[0].company).toBe('OURO CARGO TRANSPORTES LTDA');
  });

  // A coluna de empresa é a que o operador escolheu; trocar a razão social completa
  // pela abreviação do outro campo perderia informação.
  it('com empresa preenchida, ela manda — o nome só é descartado', () => {
    const { linhas } = parseCsvDeLeads(
      'nome;empresa;telefone\nTB LOG;TRANSPORTADORA BARBARENSE LTDA;5519971051858',
    );
    expect(linhas[0].name).toBeNull();
    expect(linhas[0].company).toBe('TRANSPORTADORA BARBARENSE LTDA');
  });

  it('nome de pessoa continua chegando como nome', () => {
    const { linhas } = parseCsvDeLeads('nome;empresa;telefone\nCarlos Mendes;Transportes Silva;11988887777');
    expect(linhas[0].name).toBe('Carlos Mendes');
    expect(linhas[0].company).toBe('Transportes Silva');
  });

  // A linha continua valendo: o que sumiu foi um nome que não servia, não o lead.
  it('descartar o nome não descarta a linha', () => {
    const { linhas } = parseCsvDeLeads('nome;telefone\nTLZ TRANSPORTES LTDA;5519992583389');
    expect(linhas[0].descarte).toBeNull();
    expect(linhas[0].temNome).toBe(false);
  });
});

/**
 * A marca abreviada como nome — "MAZALOG" para "MAZALOG TRANSPORTES E LOGISTICA
 * LTDA". São 2.017 linhas só na base quente, e nenhuma é gente. Os outros dois
 * sinais não a alcançam: a abreviação não tem marcador dentro de si.
 */
describe('pareceRazaoSocial — marca abreviada no lugar do nome', () => {
  it('prefixo da razão social, com marcador no resto, é empresa', () => {
    expect(pareceRazaoSocial('MAZALOG', 'MAZALOG TRANSPORTES E LOGISTICA LTDA')).toBe(true);
    expect(pareceRazaoSocial('CONFCARGO', 'CONFCARGO TRANSPORTE E LOGISTICA LTDA')).toBe(true);
    expect(pareceRazaoSocial('IRMAOS VIEIRA', 'IRMAOS VIEIRA MUDANCAS E TRANSPORTES LTDA.')).toBe(true);
    expect(pareceRazaoSocial('KAYRO', 'KAYRO SOLUCOES LTDA')).toBe(true);
  });

  // O caso legítimo que a exigência de marcador NO RESTO protege: o dono da
  // transportadora, cujo primeiro nome no cumprimento está certo.
  it('nome que é começo da empresa SEM marcador no resto continua sendo nome', () => {
    expect(pareceRazaoSocial('Carlos', 'Carlos Silva')).toBe(false);
    expect(pareceRazaoSocial('Pedro', 'Pedro Henrique')).toBe(false);
  });

  it('prefixo parcial de palavra não conta — falta o espaço', () => {
    expect(pareceRazaoSocial('Maza', 'MAZALOG TRANSPORTES LTDA')).toBe(false);
  });
});
