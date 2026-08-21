import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailOptOutService } from './email-optout.service';

/**
 * O descadastro NUNCA pode terminar em erro.
 *
 * O comportamento anterior: token de uso único, válido por 30 dias. Quem clicasse
 * em "Cancelar inscrição" no dia 31, ou clicasse duas vezes, recebia uma página
 * 410. A pessoa que quer sair e não consegue faz a única coisa que resta — marca
 * como spam. E reclamação de spam é a métrica mais cara que existe (o Google exige
 * abaixo de 0,10%), enquanto um token de descadastro reapresentado não causa dano
 * nenhum: ele só descadastra de novo.
 */

const FUTURO = new Date(Date.now() + 86_400_000);
const PASSADO = new Date(Date.now() - 86_400_000);

function makeSvc(record: any) {
  const prisma = {
    emailOptOutToken: {
      findUnique: vi.fn().mockResolvedValue(record),
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockReturnValue({ __op: 'token' }),
    },
    contact: { updateMany: vi.fn().mockReturnValue({ __op: 'contact' }) },
    $transaction: vi.fn().mockResolvedValue([]),
  } as any;
  const registro = { register: vi.fn().mockResolvedValue(undefined) } as any;
  return { svc: new EmailOptOutService(prisma, registro), prisma, registro };
}

const valido = {
  token: 'tk1',
  tenantId: 't1',
  contactId: 'c1',
  email: 'joao@x.com',
  expiresAt: FUTURO,
  usedAt: null,
};

describe('EmailOptOutService.consume — idempotente por decisão', () => {
  it('token válido descadastra', async () => {
    const { svc, prisma } = makeSvc(valido);

    await expect(svc.consume('tk1')).resolves.toEqual({ email: 'joao@x.com', tenantId: 't1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('token JÁ USADO continua devolvendo sucesso (segundo clique não pode dar erro)', async () => {
    const { svc, prisma } = makeSvc({ ...valido, usedAt: PASSADO });

    await expect(svc.consume('tk1')).resolves.toEqual({ email: 'joao@x.com', tenantId: 't1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('token VENCIDO descadastra assim mesmo', async () => {
    const { svc, prisma } = makeSvc({ ...valido, expiresAt: PASSADO });

    await expect(svc.consume('tk1')).resolves.toEqual({ email: 'joao@x.com', tenantId: 't1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  // O único erro legítimo: token que nunca existiu.
  it('token desconhecido devolve null', async () => {
    const { svc, prisma } = makeSvc(null);

    await expect(svc.consume('nao-existe')).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('não move o optOutAt de quem já estava descadastrado', async () => {
    const { svc, prisma } = makeSvc({ ...valido, usedAt: PASSADO });

    await svc.consume('tk1');

    expect(prisma.contact.updateMany.mock.calls[0][0].where.status).toEqual({ not: 'opted_out' });
  });

  it('o usedAt só é gravado na primeira vez', async () => {
    const { svc, prisma } = makeSvc(valido);

    await svc.consume('tk1');

    expect(prisma.emailOptOutToken.updateMany.mock.calls[0][0].where).toEqual({ token: 'tk1', usedAt: null });
  });

  // Caso Patrícia por e-mail: o pedido tem que sobreviver à limpeza da base.
  // O registro fica FORA do contato — reimportar o CSV não traz a pessoa de volta.
  it('grava o pedido no registro permanente (LGPD)', async () => {
    const { svc, registro } = makeSvc(valido);

    await svc.consume('tk1');

    expect(registro.register).toHaveBeenCalledWith('t1', { email: 'joao@x.com' }, 'pedido_email');
  });

  it('token desconhecido não registra nada', async () => {
    const { svc, registro } = makeSvc(null);

    await svc.consume('nao-existe');

    expect(registro.register).not.toHaveBeenCalled();
  });
});

describe('EmailOptOutService.peek — a página precisa saber o estado', () => {
  it('token válido: nem usado nem vencido', async () => {
    const { svc } = makeSvc(valido);
    await expect(svc.peek('tk1')).resolves.toMatchObject({ email: 'joao@x.com', jaUsado: false, vencido: false });
  });

  // A página mostra "você já está descadastrado" em vez de "link inválido".
  it('token já usado volta marcado, não nulo', async () => {
    const { svc } = makeSvc({ ...valido, usedAt: PASSADO });
    await expect(svc.peek('tk1')).resolves.toMatchObject({ jaUsado: true });
  });

  it('token vencido volta marcado, não nulo', async () => {
    const { svc } = makeSvc({ ...valido, expiresAt: PASSADO });
    await expect(svc.peek('tk1')).resolves.toMatchObject({ vencido: true });
  });

  it('token desconhecido é o único null', async () => {
    const { svc } = makeSvc(null);
    await expect(svc.peek('x')).resolves.toBeNull();
  });
});

describe('EmailOptOutService.generateToken — validade longa', () => {
  // E-mail arquivado é reaberto muito depois; o botão nativo do Gmail tem que
  // continuar funcionando quando isso acontecer.
  it('gera token com validade de anos, não de dias', async () => {
    const { svc, prisma } = makeSvc(null);

    await svc.generateToken('t1', 'c1', 'joao@x.com');

    const { expiresAt } = prisma.emailOptOutToken.create.mock.calls[0][0].data;
    const dias = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(365);
  });
});
