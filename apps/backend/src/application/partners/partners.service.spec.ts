import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PartnersService } from './partners.service';

function makePrisma() {
  return {
    partner: {
      findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    opportunity: { count: vi.fn().mockResolvedValue(0) },
  } as any;
}

describe('PartnersService', () => {
  let prisma: any;
  let svc: PartnersService;
  beforeEach(() => { prisma = makePrisma(); svc = new PartnersService(prisma); });

  it('list: escopa por tenant', async () => {
    prisma.partner.findMany.mockResolvedValue([]);
    await svc.list('t1');
    expect(prisma.partner.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1' });
  });

  it('findOne: 404 quando nao e do tenant', async () => {
    prisma.partner.findFirst.mockResolvedValue(null);
    await expect(svc.findOne('t1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.partner.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'x', tenantId: 't1' });
  });

  it('create: grava tenantId + dados do parceiro', async () => {
    prisma.partner.create.mockResolvedValue({ id: 'p1', name: 'Pneus X' });
    await svc.create('t1', { name: 'Pneus X', type: 'pneus' });
    expect(prisma.partner.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', name: 'Pneus X', type: 'pneus' });
  });

  it('setActive: 404 se nao pertence ao tenant, sem chamar update', async () => {
    prisma.partner.findFirst.mockResolvedValue(null);
    await expect(svc.setActive('t1', 'x', false)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.partner.update).not.toHaveBeenCalled();
  });

  it('setActive: desativa parceiro existente', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    prisma.partner.update.mockResolvedValue({ id: 'p1', active: false });
    await svc.setActive('t1', 'p1', false);
    expect(prisma.partner.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p1' }, data: { active: false } });
  });
});

/**
 * A rota de exclusão não existia (13/08/2026): dava para cadastrar um parceiro
 * errado e nunca limpar, só desativar.
 *
 * O que estes testes prendem é sobretudo a RECUSA.
 * `Opportunity.sharedWithPartnerId` é `onDelete: SetNull`, então apagar
 * funcionaria — e apagaria em silêncio de QUEM o lead foi compartilhado,
 * deixando `partnerSharedAt` e `partnerShareStatus` apontando para ninguém. A
 * oportunidade seguiria dizendo "compartilhado em tal data", sem dizer com quem.
 * Esse é o rastro de consentimento de LGPD.
 */
describe('PartnersService.remove', () => {
  const PARCEIRO = { id: 'p1', tenantId: 't1', name: 'Pneus Silva', type: 'pneus' };
  let prisma: any;
  let svc: PartnersService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new PartnersService(prisma);
    prisma.partner.findFirst.mockResolvedValue(PARCEIRO);
  });

  it('parceiro sem indicação nenhuma: apaga', async () => {
    await expect(svc.remove('t1', 'p1')).resolves.toEqual({ id: 'p1', deleted: true });
    expect(prisma.partner.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('parceiro COM indicação: recusa e não apaga', async () => {
    prisma.opportunity.count.mockResolvedValue(3);

    await expect(svc.remove('t1', 'p1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.partner.delete).not.toHaveBeenCalled();
  });

  it('a recusa diz quantas indicações e o que fazer no lugar', async () => {
    prisma.opportunity.count.mockResolvedValue(3);

    const erro: any = await svc.remove('t1', 'p1').catch((e) => e);
    expect(erro.message).toContain('Pneus Silva');
    expect(erro.message).toContain('3 indicação');
    expect(erro.message).toContain('Desative');
  });

  // Escopo de tenant: o id sozinho não pode bastar para apagar o parceiro de
  // outro cliente. Quem garante isso é o findOne, e ele roda ANTES da contagem.
  it('parceiro de outro tenant: 404, sem nem contar indicação', async () => {
    prisma.partner.findFirst.mockResolvedValue(null);

    await expect(svc.remove('t1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.opportunity.count).not.toHaveBeenCalled();
    expect(prisma.partner.delete).not.toHaveBeenCalled();
  });

  it('a contagem é escopada no tenant e no parceiro', async () => {
    await svc.remove('t1', 'p1');

    expect(prisma.opportunity.count).toHaveBeenCalledWith({
      where: { tenantId: 't1', sharedWithPartnerId: 'p1' },
    });
  });
});
