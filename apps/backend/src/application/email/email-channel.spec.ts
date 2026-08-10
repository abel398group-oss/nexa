import { describe, it, expect, vi } from 'vitest';
import { EmailChannelService } from './email-channel.service';

/**
 * Perfis de remetente (10/08/2026).
 *
 * Era uma caixa por tenant. Quando a prospecção passou a sair do endereço do
 * vendedor em vez do da Lia, trocar significava SOBRESCREVER a única linha — e a
 * resposta a qualquer disparo anterior cairia numa caixa que ninguém mais lê.
 *
 * Agora convivem várias: todas as ativas são lidas, só a `isSender` envia.
 */

function makeSvc(caixas: any[] = []) {
  const prisma = {
    emailChannel: {
      findMany: vi.fn().mockResolvedValue(caixas),
      findFirst: vi.fn().mockImplementation(({ where }: any) =>
        caixas.find((c) => (!where.id || c.id === where.id) && (!where.tenantId || c.tenantId === where.tenantId)) ?? null),
      count: vi.fn().mockResolvedValue(caixas.length),
      create: vi.fn().mockImplementation(({ data }: any) => ({ id: 'nova', ...data })),
      update: vi.fn().mockImplementation(({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  } as any;
  const crypto = { encrypt: (s: string) => `enc(${s})`, decrypt: (s: string) => s };
  return { svc: new EmailChannelService(prisma, crypto as any), prisma };
}

const lia = { id: 'lia', tenantId: 't1', label: 'Lia', isSender: true, isActive: true, fromEmail: 'lia@x.com' };
const mateus = { id: 'mat', tenantId: 't1', label: 'Mateus', isSender: false, isActive: true, fromEmail: 'mateus@x.com' };

describe('setSender — o seletor da tela', () => {
  it('marca a escolhida e desmarca as outras', async () => {
    const { svc, prisma } = makeSvc([lia, mateus]);

    await svc.setSender('t1', 'mat');

    // desmarca todas menos a alvo…
    expect(prisma.emailChannel.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', id: { not: 'mat' } },
      data: { isSender: false },
    });
    // …e marca a alvo
    expect(prisma.emailChannel.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'mat' },
      data: { isSender: true },
    });
  });

  // Duas remetentes ao mesmo tempo fariam o envio sair de endereços diferentes
  // conforme a ordem da consulta — defeito que só aparece no e-mail de um lead.
  it('as duas escritas vão na mesma transação', async () => {
    const { svc, prisma } = makeSvc([lia, mateus]);
    await svc.setSender('t1', 'mat');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('caixa inativa não pode virar remetente', async () => {
    const { svc } = makeSvc([lia, { ...mateus, isActive: false }]);
    await expect(svc.setSender('t1', 'mat')).rejects.toThrow(/Ative a caixa/);
  });

  it('caixa de outro tenant não é alcançável', async () => {
    const { svc } = makeSvc([{ ...mateus, tenantId: 'outro' }]);
    await expect(svc.setSender('t1', 'mat')).rejects.toThrow(/não encontrada/);
  });
});

describe('setActive e remove — não deixam o tenant sem remetente', () => {
  // Sem isto o disparo pararia com "smtp_not_configured", cujo motivo real
  // (alguém desligou a caixa) não aparece em lugar nenhum da tela.
  it('não desativa a caixa que está enviando', async () => {
    const { svc } = makeSvc([lia]);
    await expect(svc.setActive('t1', 'lia', false)).rejects.toThrow(/Escolha outra como remetente/);
  });

  it('desativa uma que não está enviando', async () => {
    const { svc, prisma } = makeSvc([lia, mateus]);
    await svc.setActive('t1', 'mat', false);
    expect(prisma.emailChannel.update).toHaveBeenCalled();
  });

  it('não exclui a caixa que está enviando', async () => {
    const { svc } = makeSvc([lia]);
    await expect(svc.remove('t1', 'lia')).rejects.toThrow(/Escolha outra como remetente/);
  });

  it('exclui uma que não está enviando', async () => {
    const { svc, prisma } = makeSvc([lia, mateus]);
    await expect(svc.remove('t1', 'mat')).resolves.toEqual({ ok: true });
    expect(prisma.emailChannel.delete).toHaveBeenCalledWith({ where: { id: 'mat' } });
  });
});

describe('upsert', () => {
  it('cadastrar exige as duas senhas (senão o canal nasce quebrado)', async () => {
    const { svc } = makeSvc([]);
    await expect(
      svc.upsert('t1', { fromEmail: 'a@b.com', smtpUser: 'a@b.com', imapUser: 'a@b.com' }),
    ).rejects.toThrow(/informe a senha/i);
  });

  it('senha em branco na EDIÇÃO mantém a atual', async () => {
    const { svc, prisma } = makeSvc([lia]);

    await svc.upsert('t1', { id: 'lia', fromEmail: 'lia@x.com', smtpUser: 'u', imapUser: 'u' });

    const data = prisma.emailChannel.update.mock.calls[0][0].data;
    expect(data.smtpPass).toBeUndefined();
    expect(data.imapPass).toBeUndefined();
  });

  it('senha nova é criptografada antes de ir ao banco', async () => {
    const { svc, prisma } = makeSvc([lia]);

    await svc.upsert('t1', {
      id: 'lia', fromEmail: 'lia@x.com', smtpUser: 'u', imapUser: 'u',
      smtpPass: 'segredo', imapPass: 'segredo',
    });

    expect(prisma.emailChannel.update.mock.calls[0][0].data.smtpPass).toBe('enc(segredo)');
  });

  // Um tenant com caixa cadastrada e nenhuma remetente não manda e-mail nenhum, e
  // o motivo não apareceria em lugar nenhum da tela.
  it('a PRIMEIRA caixa do tenant já nasce remetente', async () => {
    const { svc, prisma } = makeSvc([]);
    prisma.emailChannel.count.mockResolvedValue(1);
    prisma.emailChannel.findFirst.mockResolvedValue({ id: 'nova', tenantId: 't1', isActive: true });

    await svc.upsert('t1', {
      fromEmail: 'a@b.com', smtpUser: 'u', imapUser: 'u', smtpPass: 'x', imapPass: 'y',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // setSender rodou
  });

  it('sem rótulo, usa a parte antes do @ do e-mail', async () => {
    const { svc, prisma } = makeSvc([]);
    prisma.emailChannel.count.mockResolvedValue(2); // não é a primeira

    await svc.upsert('t1', {
      fromEmail: 'mateus@hipertms.com.br', smtpUser: 'u', imapUser: 'u', smtpPass: 'x', imapPass: 'y',
    });

    expect(prisma.emailChannel.create.mock.calls[0][0].data.label).toBe('mateus');
  });
});

describe('getSender', () => {
  it('devolve a caixa marcada como remetente', async () => {
    const { svc } = makeSvc([lia, mateus]);
    await expect(svc.getSender('t1')).resolves.toMatchObject({ id: 'lia' });
  });

  // Base sem nenhuma marcada ainda acha uma caixa, em vez de parar de enviar
  // em silêncio.
  it('sem nenhuma marcada, cai na primeira', async () => {
    const { svc } = makeSvc([{ ...lia, isSender: false }]);
    await expect(svc.getSender('t1')).resolves.toMatchObject({ id: 'lia' });
  });

  it('tenant sem caixa devolve null', async () => {
    const { svc } = makeSvc([]);
    await expect(svc.getSender('t1')).resolves.toBeNull();
  });
});
