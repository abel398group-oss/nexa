import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketsService } from './markets.service';

/**
 * Criação de mercado (ADR 037).
 *
 * Estes testes existem por causa de um 500 real: o insert omitia `connector`, que é
 * `String` sem default no schema, e o PrismaClientValidationError subia como "Internal
 * server error" — a tela só dizia que o servidor caiu. Um teste que apenas checasse
 * "chamou o create" teria passado igual, então o que se afirma aqui é o CONTEÚDO do
 * data: toda coluna obrigatória de `products` precisa sair preenchida.
 */
function makeSvc(mercadoExistente: any = null) {
  const prisma = {
    product: {
      findUnique: vi.fn().mockResolvedValue(mercadoExistente),
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'p1', ...data })),
    },
  };
  return { svc: new MarketsService(prisma as any), prisma };
}

describe('MarketsService.create', () => {
  it('preenche `connector`, a coluna obrigatória que derrubava o insert', async () => {
    const { svc, prisma } = makeSvc();

    await svc.create('t1', { name: 'Agabê', slug: 'agabe' });

    const { data } = prisma.product.create.mock.calls[0][0];
    // Não é `expect.anything()`: o ponto do teste é que a coluna sai com valor.
    expect(data.connector).toBe('none');
    expect(data.code).toBe('agabe');
    expect(data.name).toBe('Agabê');
  });

  it('nasce em rascunho — mercado sem conhecimento não pode cair no seletor do disparo', async () => {
    const { svc, prisma } = makeSvc();

    await svc.create('t1', { name: 'Óleo', slug: 'oleo' });

    // O default da coluna é 'active'; criar sem forçar 'draft' furaria a trava de
    // liberação (readiness) pela porta dos fundos.
    expect(prisma.product.create.mock.calls[0][0].data.status).toBe('draft');
  });

  it('herda a identidade de e-mail do nome para o primeiro disparo não sair com a marca errada', async () => {
    const { svc, prisma } = makeSvc();

    await svc.create('t1', { name: 'Pneus', slug: 'pneus' });

    const { data } = prisma.product.create.mock.calls[0][0];
    expect(data.displayName).toBe('Pneus');
    expect(data.senderName).toBe('Pneus');
  });

  // O formulário de criação passou a oferecer a identidade (18/08/2026). Antes, o
  // mercado nascia com uma pendência vermelha por um campo que a tela nem mostrava.
  it('grava a identidade vinda do formulário quando ela veio', async () => {
    const { svc, prisma } = makeSvc();

    await svc.create('t1', {
      name: 'Agabê',
      slug: 'agabe',
      displayName: 'Agabê Óleos',
      senderName: 'Lia',
      brandTagline: 'Óleo que roda mais',
      brandColor: '#FF5A1F',
      signupUrl: 'https://agabe.com.br',
    });

    const { data } = prisma.product.create.mock.calls[0][0];
    expect(data.displayName).toBe('Agabê Óleos');
    expect(data.senderName).toBe('Lia');
    expect(data.brandTagline).toBe('Óleo que roda mais');
    expect(data.brandColor).toBe('#FF5A1F');
    expect(data.signupUrl).toBe('https://agabe.com.br');
  });

  // Espaço em branco é campo vazio disfarçado. Deixar `displayName: '   '` passar
  // satisfaria a trava de liberação (`!!displayName`) sem identidade nenhuma — e o
  // e-mail sairia sem marca, que é exatamente o que a trava existe para evitar.
  it('campo só com espaço cai no nome, não passa por preenchido', async () => {
    const { svc, prisma } = makeSvc();

    await svc.create('t1', { name: 'Pneus', slug: 'pneus', displayName: '   ', brandColor: '  ' });

    const { data } = prisma.product.create.mock.calls[0][0];
    expect(data.displayName).toBe('Pneus');
    expect(data.brandColor).toBeNull();
  });

  it('recusa slug já usado com o nome do dono, em vez de deixar virar 500', async () => {
    const { svc, prisma } = makeSvc({ name: 'Agabê' });

    await expect(svc.create('t1', { name: 'Agabe Novo', slug: 'agabe' })).rejects.toThrow(
      BadRequestException,
    );
    // Sem a checagem prévia o unique de `code` viraria P2002 sem tratamento.
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('normaliza espaço e caixa do slug antes de virar `code`', async () => {
    const { svc, prisma } = makeSvc();

    await svc.create('t1', { name: '  Agabê  ', slug: '  AGABE  ' });

    const { data } = prisma.product.create.mock.calls[0][0];
    expect(data.code).toBe('agabe');
    expect(data.name).toBe('Agabê');
  });
});

/**
 * A identidade do mercado não tinha como ser preenchida (17/08/2026).
 *
 * O `create` acima promete "editável depois na configuração do mercado" e essa
 * configuração nunca existiu: nenhuma rota escrevia `displayName`/`senderName`
 * depois da criação. A trava de liberação EXIGE os dois (`temIdentidade`), então o
 * sistema cobrava algo que ele mesmo não deixava fazer — e o HiperTMS, criado antes
 * do `create` passar a preenchê-los, ficou com ambos NULL.
 *
 * O custo é silencioso: `email-market-identity.ts` faz `if (!displayName) return {}`,
 * e o e-mail sai SEM marca — sem assinatura, sem cor, sem link. Chega, e chega errado.
 */
function makeSvcUpdate(mercado: any = { id: 'p1', code: 'hipertms', name: 'HiperTMS' }) {
  const prisma = {
    product: {
      findUnique: vi.fn().mockResolvedValue(mercado),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...mercado, ...data })),
    },
  };
  const svc: any = new MarketsService(prisma as any);
  svc['logger'] = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { svc, prisma };
}

describe('MarketsService.updateIdentidade', () => {
  it('grava a identidade que a trava de liberação exige', async () => {
    const { svc, prisma } = makeSvcUpdate();

    await svc.updateIdentidade('t1', 'hipertms', {
      displayName: 'HiperTMS',
      senderName: 'Lia',
      brandTagline: 'O TMS feito para vender frete.',
      brandColor: '#FF5A1F',
    });

    expect(prisma.product.update.mock.calls[0][0].data).toEqual({
      displayName: 'HiperTMS',
      senderName: 'Lia',
      brandTagline: 'O TMS feito para vender frete.',
      brandColor: '#FF5A1F',
    });
  });

  // PATCH: o que não veio no corpo não pode ser apagado. Mandar só a cor não
  // pode zerar o nome de exibição e derrubar o mercado da trava.
  it('campo ausente não é tocado', async () => {
    const { svc, prisma } = makeSvcUpdate();

    await svc.updateIdentidade('t1', 'hipertms', { brandColor: '#000000' });

    expect(prisma.product.update.mock.calls[0][0].data).toEqual({ brandColor: '#000000' });
  });

  // A trava lê `!!displayName`, e `''` é falsy — mas gravar string vazia deixaria o
  // campo "preenchido" para quem olha o banco e vazio para quem envia. NULL é honesto.
  it('string vazia vira NULL, não vazio', async () => {
    const { svc, prisma } = makeSvcUpdate();

    await svc.updateIdentidade('t1', 'hipertms', { displayName: '   ', signupUrl: '' });

    expect(prisma.product.update.mock.calls[0][0].data).toEqual({
      displayName: null,
      signupUrl: null,
    });
  });

  // Limpar é decisão legítima: volta à marca padrão do HiperTMS.
  it('null explícito limpa o campo', async () => {
    const { svc, prisma } = makeSvcUpdate();

    await svc.updateIdentidade('t1', 'hipertms', { brandTagline: null });

    expect(prisma.product.update.mock.calls[0][0].data).toEqual({ brandTagline: null });
  });

  it('corpo vazio não chama update', async () => {
    const { svc, prisma } = makeSvcUpdate();

    await svc.updateIdentidade('t1', 'hipertms', {});

    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('mercado inexistente: 404 antes de tentar gravar', async () => {
    const { svc, prisma } = makeSvcUpdate(null);

    await expect(svc.updateIdentidade('t1', 'nao-existe', { displayName: 'X' })).rejects.toThrow();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

/**
 * Exclusão de mercado.
 *
 * O que estes testes protegem não é o caminho feliz — é a trava. `productCode` é a
 * chave que separa conhecimento, campanha e conector em todo o sistema, então um
 * "Excluir" solto na tela é a distância de um clique entre desfazer um nome digitado
 * errado e apagar a operação. Por isso quase tudo aqui afirma que NÃO apagou.
 */
function makeSvcRemove(
  mercado: any = { id: 'p1', code: 'd', name: 'agabe', status: 'draft' },
  counts: any = { kb: 0, modelos: 0, lotes: 0, materiais: 0 },
) {
  const prisma = {
    product: {
      findUnique: vi.fn().mockResolvedValue(mercado),
      delete: vi.fn().mockResolvedValue(mercado),
    },
    aiKnowledgeBase: { count: vi.fn().mockResolvedValue(counts.kb) },
    marketAsset: { count: vi.fn().mockResolvedValue(counts.materiais ?? 0) },
    messageTemplate: { count: vi.fn().mockResolvedValue(counts.modelos) },
    leadBatch: { count: vi.fn().mockResolvedValue(counts.lotes) },
    campaign: { count: vi.fn().mockResolvedValue(counts.campanhas ?? 0) },
    sellerMarket: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn().mockResolvedValue([{ count: 1 }, mercado]),
  };
  return { svc: new MarketsService(prisma as any), prisma };
}

describe('MarketsService.remove', () => {
  it('rascunho vazio sai, e o vínculo do vendedor sai junto na mesma transação', async () => {
    const { svc, prisma } = makeSvcRemove();

    await expect(svc.remove('t1', 'd')).resolves.toEqual({ ok: true, code: 'd' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.sellerMarket.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', productCode: 'd' },
    });
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { code: 'd' } });
  });

  // Mercado liberado já mandou e-mail para gente de verdade. Some com "Suspender".
  it('recusa mercado que já foi liberado, e manda suspender', async () => {
    const { svc, prisma } = makeSvcRemove({ id: 'p1', code: 'hipertms', name: 'HiperTMS', status: 'active' });

    await expect(svc.remove('t1', 'hipertms')).rejects.toThrow(BadRequestException);
    await expect(svc.remove('t1', 'hipertms')).rejects.toThrow(/Suspender/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // A recusa precisa dizer O QUE impede: quem clicou tem que saber onde ir apagar.
  it('recusa rascunho com conteúdo, listando o que existe', async () => {
    const { svc, prisma } = makeSvcRemove(undefined, { kb: 1483, modelos: 4, lotes: 3 });

    await expect(svc.remove('t1', 'd')).rejects.toThrow(
      /1483 artigo\(s\) de conhecimento, 4 modelo\(s\) de mensagem, 3 lista\(s\) de lead/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('um único uso já basta para segurar', async () => {
    const { svc, prisma } = makeSvcRemove(undefined, { kb: 0, modelos: 1, lotes: 0 });

    await expect(svc.remove('t1', 'd')).rejects.toThrow(/1 modelo\(s\) de mensagem/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('código inexistente é 404, não sucesso silencioso', async () => {
    const { svc, prisma } = makeSvcRemove(null);

    await expect(svc.remove('t1', 'nao-existe')).rejects.toThrow('Mercado não encontrado');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

/**
 * A trava de exclusão contra as tabelas que nasceram DEPOIS dela.
 *
 * `market_assets` é de 18/08/2026 e a trava é de 17/08 — ninguém a atualizou, e no
 * primeiro teste de tela um mercado com roteiro dentro foi apagado sem uma palavra.
 * O texto ficou órfão na tabela; fosse portfólio, o arquivo teria ficado largado em
 * `uploads/` sem nada que o alcançasse.
 *
 * Este teste é a lembrança: toda tabela nova com `productCode` entra na contagem.
 */
describe('MarketsService.remove — material de campanha segura', () => {
  it('rascunho com roteiro dentro não é apagado', async () => {
    const { svc, prisma } = makeSvcRemove(undefined, { kb: 0, modelos: 0, lotes: 0, materiais: 1 });

    await expect(svc.remove('t1', 'd')).rejects.toThrow(/1 arquivo\(s\) de campanha/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('o material aparece junto dos outros motivos, não no lugar deles', async () => {
    const { svc } = makeSvcRemove(undefined, { kb: 3, modelos: 0, lotes: 0, materiais: 2 });

    await expect(svc.remove('t1', 'd')).rejects.toThrow(
      /3 artigo\(s\) de conhecimento, 2 arquivo\(s\) de campanha/,
    );
  });
});

// Campanha entrou na trava em 19/08/2026: antes da trava de mercado no disparo era
// possível criar campanha apontando para um mercado em rascunho — apagar o mercado
// deixaria essas campanhas com um código que não leva a nada.
describe('MarketsService.remove — campanha segura', () => {
  it('rascunho com campanha apontando para ele não é apagado', async () => {
    const { svc, prisma } = makeSvcRemove(undefined, {
      kb: 0, modelos: 0, lotes: 0, materiais: 0, campanhas: 2,
    });

    await expect(svc.remove('t1', 'd')).rejects.toThrow(/2 campanha\(s\)/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

/**
 * Suspender o mercado arrasta as campanhas RODANDO dele.
 *
 * Até 19/08/2026 o botão dizia "sumiu do disparo" e só valia para campanha nova:
 * uma que já estava `running` continuava esvaziando a fila com a marca do
 * parceiro. Pausar (não cancelar) é de propósito — a fila fica de pé, e a trava
 * de retomada só a solta quando o mercado voltar a `active`.
 */
describe('MarketsService.pause', () => {
  function makeSvcPause(pausadas = 0) {
    const mercado = { id: 'p1', code: 'agabe', name: 'Agabê', status: 'paused' };
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ code: 'agabe' }),
        update: vi.fn().mockResolvedValue(mercado),
      },
      campaign: { updateMany: vi.fn().mockResolvedValue({ count: pausadas }) },
      $transaction: vi.fn().mockResolvedValue([{ count: pausadas }, mercado]),
    };
    return { svc: new MarketsService(prisma as any), prisma };
  }

  it('pausa só as campanhas running do mercado, escopadas no tenant', async () => {
    const { svc, prisma } = makeSvcPause(2);

    const r: any = await svc.pause('t1', 'agabe');
    expect(r.pausedCampaigns).toBe(2);
    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', productCode: 'agabe', status: 'running' },
      data: { status: 'paused' },
    });
  });

  it('mercado sem campanha rodando: suspende e devolve zero', async () => {
    const { svc } = makeSvcPause(0);

    const r: any = await svc.pause('t1', 'agabe');
    expect(r.pausedCampaigns).toBe(0);
    expect(r.status).toBe('paused');
  });

  it('código inexistente: 404 sem tocar em nada', async () => {
    const { svc, prisma } = makeSvcPause();
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(svc.pause('t1', 'nao-existe')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
