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
