import { describe, expect, it, vi } from 'vitest';
import { jaRespondeu, telefonesQueJaResponderam } from './engagement-gate';

function makePrisma(linhas: { conversation: { phone: string } }[]) {
  return { aiMessage: { findMany: vi.fn().mockResolvedValue(linhas) } };
}

describe('telefonesQueJaResponderam', () => {
  it('devolve só os telefones com mensagem de ENTRADA', async () => {
    const prisma = makePrisma([{ conversation: { phone: '5511988887777' } }]);

    const r = await telefonesQueJaResponderam(prisma, 't1', ['5511988887777', '5511999998888']);

    expect(r.has('5511988887777')).toBe(true);
    expect(r.has('5511999998888')).toBe(false);
  });

  it('a consulta filtra direction=inbound e o tenant', async () => {
    const prisma = makePrisma([]);

    await telefonesQueJaResponderam(prisma, 't1', ['5511988887777']);

    expect(prisma.aiMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 't1',
          direction: 'inbound',
          conversation: { phone: { in: ['5511988887777'] } },
        },
      }),
    );
  });

  it('lista vazia não consulta o banco', async () => {
    const prisma = makePrisma([]);

    const r = await telefonesQueJaResponderam(prisma, 't1', []);

    expect(r.size).toBe(0);
    expect(prisma.aiMessage.findMany).not.toHaveBeenCalled();
  });

  it('deduplica telefone repetido na entrada', async () => {
    const prisma = makePrisma([]);

    await telefonesQueJaResponderam(prisma, 't1', ['5511988887777', '5511988887777']);

    expect(prisma.aiMessage.findMany.mock.calls[0][0].where.conversation.phone.in).toEqual([
      '5511988887777',
    ]);
  });
});

describe('jaRespondeu — checagem de um telefone só (tick)', () => {
  it('true quando existe mensagem de entrada', async () => {
    const prisma = makePrisma([{ conversation: { phone: '5511988887777' } }]);
    expect(await jaRespondeu(prisma, 't1', '5511988887777')).toBe(true);
  });

  it('false quando não existe', async () => {
    const prisma = makePrisma([]);
    expect(await jaRespondeu(prisma, 't1', '5511988887777')).toBe(false);
  });

  it('telefone vazio nem consulta — nunca bloqueia por engano um alvo sem telefone', async () => {
    const prisma = makePrisma([]);
    expect(await jaRespondeu(prisma, 't1', '')).toBe(false);
    expect(prisma.aiMessage.findMany).not.toHaveBeenCalled();
  });
});
