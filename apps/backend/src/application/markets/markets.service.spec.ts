import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
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
