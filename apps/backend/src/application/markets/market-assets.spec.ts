import { afterEach, describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MarketAssetsService, TAMANHO_MAXIMO, urlPublicaDoArquivo } from './market-assets.service';

/**
 * O que estes testes protegem é a APROVAÇÃO.
 *
 * O material vira o que a Lia afirma para o lead. Um caminho que deixe texto não lido
 * chegar lá anula a razão de a aprovação existir — e o pior desses caminhos não é o
 * óbvio (subir já aprovado), é o silencioso: aprovar, editar o arquivo depois, e a
 * aprovação continuar valendo para um texto que ninguém releu.
 */
function makeSvc(
  market: any = { code: 'hipertms' },
  asset: any = null,
  // Artigo derivado já existente na base (tag `asset:<id>`), quando o teste precisa.
  artigoDerivado: any = null,
) {
  const prisma = {
    product: { findUnique: vi.fn().mockResolvedValue(market) },
    marketAsset: {
      upsert: vi.fn().mockImplementation(({ create, update }: any) => ({ id: 'a1', ...create, ...update })),
      findFirst: vi.fn().mockResolvedValue(asset),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }: any) => ({ id: 'a1', ...asset, ...data })),
      delete: vi.fn().mockResolvedValue(asset),
    },
    aiKnowledgeBase: { findFirst: vi.fn().mockResolvedValue(artigoDerivado) },
  };
  const knowledge = {
    create: vi.fn().mockResolvedValue({ id: 'kb1' }),
    update: vi.fn().mockResolvedValue({ id: 'kb1' }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
  };
  return { svc: new MarketAssetsService(prisma as any, knowledge as any), prisma, knowledge };
}

describe('MarketAssetsService.subir', () => {
  it('material novo nasce pendente — ninguém leu ainda', async () => {
    const { svc, prisma } = makeSvc();

    await svc.subir('t1', 'hipertms', { name: '02_eixo_cotacoes.md', content: '# Cotações' });

    expect(prisma.marketAsset.upsert.mock.calls[0][0].create.status).toBe('pending');
  });

  // O caminho silencioso: aprovar o texto de ontem e deixar o de hoje entrar por baixo
  // dá a garantia sem cumpri-la. Reenviar é correção, e correção volta para a fila.
  it('reenviar o mesmo arquivo derruba a aprovação', async () => {
    const { svc, prisma } = makeSvc();

    await svc.subir('t1', 'hipertms', { name: '02_eixo_cotacoes.md', content: 'texto novo' });

    const { update, where } = prisma.marketAsset.upsert.mock.calls[0][0];
    expect(update.status).toBe('pending');
    expect(update.approvedAt).toBeNull();
    expect(update.approvedBy).toBeNull();
    // Mesmo nome no mesmo mercado é a MESMA linha: sem isto a lista fica com duas
    // versões do mesmo arquivo e ninguém sabe qual a Lia lê.
    expect(where.tenantId_productCode_name).toEqual({
      tenantId: 't1',
      productCode: 'hipertms',
      name: '02_eixo_cotacoes.md',
    });
  });

  it('recusa PDF — é binário e não cabe numa coluna de texto', async () => {
    const { svc } = makeSvc();
    await expect(
      svc.subir('t1', 'hipertms', { name: 'portfolio.pdf', content: '%PDF-1.4' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('a recusa diz o nome do arquivo, para achar na pilha que foi arrastada', async () => {
    const { svc } = makeSvc();
    await expect(
      svc.subir('t1', 'hipertms', { name: 'planilha.xlsx', content: 'x' }),
    ).rejects.toThrow(/planilha\.xlsx/);
  });

  it('arquivo vazio não entra', async () => {
    const { svc } = makeSvc();
    await expect(svc.subir('t1', 'hipertms', { name: 'vazio.md', content: '' })).rejects.toThrow(
      /vazio/,
    );
  });

  // O limite é em BYTES. Um plano cheio de "ç" e "ã" tem menos caracteres que bytes, e
  // uma checagem por `length` deixaria passar o que o banco recusa.
  it('o limite conta bytes, não caracteres', async () => {
    const { svc } = makeSvc();
    // Cada "ç" ocupa 2 bytes: metade dos caracteres do limite já estoura.
    const acentuado = 'ç'.repeat(TAMANHO_MAXIMO / 2 + 10);
    expect(acentuado.length).toBeLessThan(TAMANHO_MAXIMO);

    await expect(svc.subir('t1', 'hipertms', { name: 'grande.md', content: acentuado })).rejects.toThrow(
      /limite/,
    );
  });

  it('mercado inexistente é 404, não uma linha órfã', async () => {
    const { svc, prisma } = makeSvc(null);
    await expect(svc.subir('t1', 'nao-existe', { name: 'a.md', content: 'x' })).rejects.toThrow(
      'Mercado não encontrado',
    );
    expect(prisma.marketAsset.upsert).not.toHaveBeenCalled();
  });
});

describe('MarketAssetsService.aprovar', () => {
  const pendente = { id: 'a1', name: '02_eixo_cotacoes.md', productCode: 'hipertms', status: 'pending' };

  it('guarda quem aprovou — a pergunta depois vai ser quem leu isto', async () => {
    const { svc, prisma } = makeSvc(undefined, pendente);

    await svc.aprovar('t1', 'a1', 'user-9');

    const { data } = prisma.marketAsset.update.mock.calls[0][0];
    expect(data.status).toBe('approved');
    expect(data.approvedBy).toBe('user-9');
    expect(data.approvedAt).toBeInstanceOf(Date);
  });

  it('aprovar de novo não reescreve a data da primeira leitura', async () => {
    const { svc, prisma } = makeSvc(undefined, { ...pendente, status: 'approved' });

    await svc.aprovar('t1', 'a1', 'user-9');

    expect(prisma.marketAsset.update).not.toHaveBeenCalled();
  });

  it('reprovar devolve para pendente sem perder o texto', async () => {
    const { svc, prisma } = makeSvc(undefined, { ...pendente, status: 'approved' });

    await svc.reprovar('t1', 'a1');

    const { data } = prisma.marketAsset.update.mock.calls[0][0];
    expect(data.status).toBe('pending');
    expect(data.approvedAt).toBeNull();
    expect(data).not.toHaveProperty('content');
  });

  // Material de outro cliente não pode ser aprovado nem lido daqui: o `findFirst`
  // filtra por tenant, e é o que impede um id adivinhado de alcançar a conta vizinha.
  it('material de outro cliente não é encontrado', async () => {
    const { svc } = makeSvc(undefined, null);
    await expect(svc.aprovar('t1', 'id-de-outro', 'user-9')).rejects.toThrow(
      'Material não encontrado',
    );
  });
});

describe('MarketAssetsService.listar', () => {
  it('não devolve o conteúdo na lista', async () => {
    const { svc, prisma } = makeSvc();

    await svc.listar('t1', 'hipertms');

    // Sete arquivos de 15 KB seriam ~100 KB por render só para mostrar nome e tamanho.
    const { select } = prisma.marketAsset.findMany.mock.calls[0][0];
    expect(select.content).toBeUndefined();
    expect(select.name).toBe(true);
  });

  /**
   * O que precisa de ação vem no topo — a lista existe para ser trabalhada até zerar,
   * e pendente enterrado embaixo de aprovado é como ele fica lá para sempre.
   *
   * O teste afirma a ORDEM RESULTANTE, não o parâmetro passado ao Prisma. A primeira
   * versão afirmava `status: 'asc'` e passava — enquanto entregava a lista invertida,
   * porque "approved" vem antes de "pending" no alfabeto. Um teste que copia a
   * implementação concorda com o defeito.
   */
  it('pendente aparece antes de aprovado', async () => {
    const { svc, prisma } = makeSvc();
    const ordenar = (linhas: any[]) => {
      const { orderBy } = prisma.marketAsset.findMany.mock.calls[0][0];
      const dir = orderBy[0].status === 'desc' ? -1 : 1;
      return [...linhas].sort((a, b) => a.status.localeCompare(b.status) * dir);
    };

    await svc.listar('t1', 'hipertms');

    const ordenadas = ordenar([
      { name: 'aprovado.md', status: 'approved' },
      { name: 'pendente.md', status: 'pending' },
    ]);
    expect(ordenadas.map((l) => l.status)).toEqual(['pending', 'approved']);
  });
});

/**
 * Portfólio — o que o LEAD vê.
 *
 * Os bytes ficam em disco (multer) e a linha guarda o caminho. O que se protege aqui é
 * que ele siga a MESMA regra de aprovação do roteiro: trocar o folder por uma versão
 * nova sem revisar é o mesmo furo do texto, e mais difícil de notar — ninguém relê um
 * PDF por acidente.
 */
describe('MarketAssetsService.subirPortfolio', () => {
  const arquivo = {
    name: 'portfolio_hipertms.pdf',
    fileUrl: '/uploads/1787000000_portfolio_hipertms.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2_100_000,
  };

  it('guarda o caminho relativo, não a URL pública', async () => {
    const { svc, prisma } = makeSvc();

    await svc.subirPortfolio('t1', 'hipertms', arquivo);

    const { create } = prisma.marketAsset.upsert.mock.calls[0][0];
    expect(create.kind).toBe('portfolio');
    expect(create.status).toBe('pending');
    // O domínio é montado no envio com MEDIA_PUBLIC_BASE. Gravá-lo aqui congelaria no
    // banco um endereço que muda de ambiente.
    expect(create.fileUrl).toBe('/uploads/1787000000_portfolio_hipertms.pdf');
    expect(create.fileUrl).not.toMatch(/^https?:/);
  });

  it('reenviar o folder derruba a aprovação, igual ao roteiro', async () => {
    const { svc, prisma } = makeSvc();

    await svc.subirPortfolio('t1', 'hipertms', arquivo);

    const { update } = prisma.marketAsset.upsert.mock.calls[0][0];
    expect(update.status).toBe('pending');
    expect(update.approvedAt).toBeNull();
  });

  // Mesmo nome que era um roteiro: o tipo muda, e o texto antigo não pode ficar
  // pendurado numa linha que agora é um PDF.
  it('virando portfólio, o texto antigo é apagado', async () => {
    const { svc, prisma } = makeSvc();

    await svc.subirPortfolio('t1', 'hipertms', arquivo);

    expect(prisma.marketAsset.upsert.mock.calls[0][0].update.content).toBeNull();
  });

  it('mercado inexistente é 404, não uma linha órfã apontando para um arquivo', async () => {
    const { svc, prisma } = makeSvc(null);
    await expect(svc.subirPortfolio('t1', 'nao-existe', arquivo)).rejects.toThrow(
      'Mercado não encontrado',
    );
    expect(prisma.marketAsset.upsert).not.toHaveBeenCalled();
  });
});

describe('MarketAssetsService.listar por tipo', () => {
  it('separa roteiro de portfólio — são duas listas na tela', async () => {
    const { svc, prisma } = makeSvc();

    await svc.listar('t1', 'hipertms', 'portfolio');

    expect(prisma.marketAsset.findMany.mock.calls[0][0].where.kind).toBe('portfolio');
  });

  it('sem tipo, devolve os dois', async () => {
    const { svc, prisma } = makeSvc();

    await svc.listar('t1', 'hipertms');

    expect(prisma.marketAsset.findMany.mock.calls[0][0].where).not.toHaveProperty('kind');
  });
});

/**
 * Correção durante a revisão.
 *
 * Quem está lendo para aprovar é quem vê o erro de digitação. Sem editar aqui, o
 * caminho é fechar, voltar ao computador, mexer no `.md` e arrastar de novo — e o
 * caminho mais curto passa a ser aprovar assim mesmo. A edição existe para o erro
 * ser corrigido em vez de aceito.
 */
describe('MarketAssetsService.editar', () => {
  const roteiro = {
    id: 'a1', name: '02_eixo_cotacoes.md', productCode: 'hipertms',
    kind: 'plan', status: 'approved', content: 'texto velho',
  };

  it('editar o texto derruba a aprovação', async () => {
    const { svc, prisma } = makeSvc(undefined, roteiro);

    await svc.editar('t1', 'a1', { content: 'texto corrigido' });

    const { data } = prisma.marketAsset.update.mock.calls[0][0];
    expect(data.content).toBe('texto corrigido');
    // O que foi lido e o que está gravado têm que ser a mesma coisa.
    expect(data.status).toBe('pending');
    expect(data.approvedAt).toBeNull();
  });

  it('o tamanho é recalculado, não herdado', async () => {
    const { svc, prisma } = makeSvc(undefined, roteiro);

    await svc.editar('t1', 'a1', { content: 'ção' }); // 5 bytes, 3 caracteres

    expect(prisma.marketAsset.update.mock.calls[0][0].data.sizeBytes).toBe(5);
  });

  it('renomear também derruba a aprovação, porque o nome é o que se reconhece na lista', async () => {
    const { svc, prisma } = makeSvc(undefined, roteiro);
    prisma.marketAsset.findFirst
      .mockResolvedValueOnce(roteiro)   // busca o próprio
      .mockResolvedValueOnce(null);     // ninguém com o nome novo

    await svc.editar('t1', 'a1', { name: '02_cotacoes_revisado.md' });

    const { data } = prisma.marketAsset.update.mock.calls[0][0];
    expect(data.name).toBe('02_cotacoes_revisado.md');
    expect(data.status).toBe('pending');
  });

  // A extensão manda no tipo: um roteiro renomeado para `.pdf` viraria um texto que a
  // tela tenta abrir num visualizador de PDF.
  it('roteiro não pode ser renomeado para fora de texto', async () => {
    const { svc } = makeSvc(undefined, roteiro);
    await expect(svc.editar('t1', 'a1', { name: 'virou.pdf' })).rejects.toThrow(/\.md/);
  });

  it('nome já usado no mercado é recusado com o nome, não com um 500', async () => {
    const { svc, prisma } = makeSvc(undefined, roteiro);
    prisma.marketAsset.findFirst
      .mockResolvedValueOnce(roteiro)
      .mockResolvedValueOnce({ id: 'outro' }); // o nome novo já existe

    await expect(svc.editar('t1', 'a1', { name: '04_financeiro.md' })).rejects.toThrow(
      /Já existe "04_financeiro\.md"/,
    );
    expect(prisma.marketAsset.update).not.toHaveBeenCalled();
  });

  it('portfólio recusa edição de texto — os bytes não se editam por aqui', async () => {
    const { svc } = makeSvc(undefined, { ...roteiro, kind: 'portfolio', content: null });
    await expect(svc.editar('t1', 'a1', { content: 'x' })).rejects.toThrow(/suba o arquivo novo/);
  });

  it('portfólio aceita renomear', async () => {
    const pdf = { ...roteiro, name: 'folder.pdf', kind: 'portfolio', content: null };
    const { svc, prisma } = makeSvc(undefined, pdf);
    prisma.marketAsset.findFirst.mockResolvedValueOnce(pdf).mockResolvedValueOnce(null);

    await svc.editar('t1', 'a1', { name: 'folder_2026.pdf' });

    expect(prisma.marketAsset.update.mock.calls[0][0].data.name).toBe('folder_2026.pdf');
  });

  it('texto vazio não passa — apagaria o roteiro sem dizer', async () => {
    const { svc } = makeSvc(undefined, roteiro);
    await expect(svc.editar('t1', 'a1', { content: '' })).rejects.toThrow(/vazio/);
  });

  it('corpo vazio não escreve nada', async () => {
    const { svc, prisma } = makeSvc(undefined, roteiro);
    await svc.editar('t1', 'a1', {});
    expect(prisma.marketAsset.update).not.toHaveBeenCalled();
  });
});

/**
 * A ponte com a Lia (19/08/2026).
 *
 * A tela sempre prometeu "é só o aprovado que a Lia usa" — e nada cumpria: o
 * aprovado só chegava às telas do SDR e do closer, e a Lia seguia lendo apenas a
 * `aiKnowledgeBase`. Estes testes prendem a promessa: aprovar roteiro PUBLICA
 * artigo na trilha de vendas; qualquer volta a pendente TIRA o artigo primeiro.
 */
describe('MarketAssetsService — ponte com a base de conhecimento', () => {
  const ROTEIRO = {
    id: 'a1', kind: 'plan', name: '02_eixo_cotacoes.md',
    content: '# Cotações', productCode: 'hipertms', status: 'pending',
  };

  it('aprovar roteiro publica artigo aprovado na trilha de vendas, amarrado pela tag', async () => {
    const { svc, knowledge } = makeSvc(undefined, ROTEIRO);

    await svc.aprovar('t1', 'a1', 'u9');

    const [tenant, dto, autor, autoApprove] = knowledge.create.mock.calls[0];
    expect(tenant).toBe('t1');
    // `vendas` está na lista branca da trilha de vendas — fora dela o artigo
    // existiria e a Lia não o alcançaria, o mesmo furo com outra roupa.
    expect(dto.category).toBe('vendas');
    expect(dto.productCode).toBe('hipertms');
    expect(dto.content).toBe('# Cotações');
    expect(dto.tags).toContain('asset:a1');
    expect(autor).toBe('u9');
    expect(autoApprove).toBe(true);
  });

  it('reaprovar o mesmo roteiro atualiza o artigo em vez de acumular cópia', async () => {
    const { svc, knowledge } = makeSvc(undefined, ROTEIRO, { id: 'kb1' });

    await svc.aprovar('t1', 'a1');

    expect(knowledge.update).toHaveBeenCalledWith('t1', 'kb1', expect.objectContaining({ content: '# Cotações' }));
    expect(knowledge.create).not.toHaveBeenCalled();
  });

  it('portfólio aprovado NÃO vira artigo — PDF é para o vendedor mostrar, não para a Lia citar', async () => {
    const { svc, knowledge } = makeSvc(undefined, {
      id: 'a2', kind: 'portfolio', name: 'folder.pdf', content: null,
      productCode: 'hipertms', status: 'pending',
    });

    await svc.aprovar('t1', 'a2');

    expect(knowledge.create).not.toHaveBeenCalled();
    expect(knowledge.update).not.toHaveBeenCalled();
  });

  // Se a publicação falha (embedding fora do ar), o material NÃO pode ficar
  // carimbado: "aprovado" que a Lia não vê é a mentira que esta ponte veio matar.
  it('falha na publicação segura a aprovação', async () => {
    const { svc, prisma, knowledge } = makeSvc(undefined, ROTEIRO);
    knowledge.create.mockRejectedValue(new Error('embedding fora do ar'));

    await expect(svc.aprovar('t1', 'a1')).rejects.toThrow('embedding fora do ar');
    expect(prisma.marketAsset.update).not.toHaveBeenCalled();
  });

  it('reprovar tira o artigo da Lia antes de voltar a pendente', async () => {
    const { svc, knowledge } = makeSvc(undefined, { ...ROTEIRO, status: 'approved' }, { id: 'kb1' });

    await svc.reprovar('t1', 'a1');

    expect(knowledge.remove).toHaveBeenCalledWith('t1', 'kb1');
  });

  it('excluir o material tira o artigo junto', async () => {
    const { svc, knowledge } = makeSvc(undefined, { ...ROTEIRO, status: 'approved' }, { id: 'kb1' });

    await svc.remover('t1', 'a1');

    expect(knowledge.remove).toHaveBeenCalledWith('t1', 'kb1');
  });

  it('editar (que derruba a aprovação) também tira o artigo', async () => {
    const { svc, knowledge } = makeSvc(undefined, { ...ROTEIRO, status: 'approved' }, { id: 'kb1' });

    await svc.editar('t1', 'a1', { content: '# Cotações v2' });

    expect(knowledge.remove).toHaveBeenCalledWith('t1', 'kb1');
  });

  it('re-subir o mesmo nome tira o artigo do texto antigo antes do novo entrar', async () => {
    const { svc, knowledge } = makeSvc(undefined, { ...ROTEIRO, status: 'approved' }, { id: 'kb1' });

    await svc.subir('t1', 'hipertms', { name: '02_eixo_cotacoes.md', content: 'texto novo' });

    expect(knowledge.remove).toHaveBeenCalledWith('t1', 'kb1');
  });
});

/**
 * A URL que a tela recebe precisa ser alcançável pelo NAVEGADOR.
 *
 * O banco guarda `/uploads/...` relativo (o domínio muda por ambiente). Em dev o
 * proxy do Vite resolve; em produção o nginx do frontend não conhece /uploads e
 * devolve o index.html — o operador via o Nexa DENTRO do quadro de prévia no
 * lugar do PDF (19/08/2026). A resolução usa a MESMA base do anexo de campanha.
 */
describe('urlPublicaDoArquivo', () => {
  afterEach(() => {
    delete process.env.MEDIA_PUBLIC_BASE;
    delete process.env.NEXA_PUBLIC_URL;
  });

  it('sem base configurada, mantém o relativo — em dev o proxy resolve', () => {
    expect(urlPublicaDoArquivo('/uploads/a.pdf')).toBe('/uploads/a.pdf');
  });

  it('com MEDIA_PUBLIC_BASE, monta a URL absoluta (sem barra dupla)', () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://material.hipertms.com.br/';
    expect(urlPublicaDoArquivo('/uploads/a.pdf')).toBe('https://material.hipertms.com.br/uploads/a.pdf');
  });

  it('NEXA_PUBLIC_URL é o fallback, como no envio de anexo', () => {
    process.env.NEXA_PUBLIC_URL = 'https://nexa.exemplo.com';
    expect(urlPublicaDoArquivo('/uploads/a.pdf')).toBe('https://nexa.exemplo.com/uploads/a.pdf');
  });

  it('URL já absoluta e nulo passam intocados', () => {
    process.env.MEDIA_PUBLIC_BASE = 'https://material.hipertms.com.br';
    expect(urlPublicaDoArquivo('https://cdn.x/a.pdf')).toBe('https://cdn.x/a.pdf');
    expect(urlPublicaDoArquivo(null)).toBeNull();
  });
});
