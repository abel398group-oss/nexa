import { describe, it, expect, vi } from 'vitest';
import { CampaignReplyLinker, extrairMessageIds, normalizarMessageId } from './campaign-reply-linker';

// ── A armadilha ─────────────────────────────────────────────────────────────
// O nodemailer devolve `info.messageId` COM os sinais (`<uuid@dominio>`) e o header
// In-Reply-To da resposta também. Se a gravação guardasse cru e a leitura tirasse os
// sinais, a comparação nunca casaria — e o recurso seria um no-op silencioso, do tipo
// que só aparece semanas depois como "a campanha nunca marca resposta".
describe('normalizarMessageId', () => {
  it('tira os sinais que o nodemailer devolve', () => {
    expect(normalizarMessageId('<abc@hipertms.com.br>')).toBe('abc@hipertms.com.br');
  });

  it('id já limpo passa igual (idempotente)', () => {
    expect(normalizarMessageId('abc@hipertms.com.br')).toBe('abc@hipertms.com.br');
    expect(normalizarMessageId(normalizarMessageId('<abc@x.com>'))).toBe('abc@x.com');
  });

  it('apara espaço em volta', () => {
    expect(normalizarMessageId('  <abc@x.com>  ')).toBe('abc@x.com');
  });

  // String vazia gravada casaria com qualquer outra string vazia — nunca gravar.
  it('vazio/ausente vira null, nunca string vazia', () => {
    expect(normalizarMessageId(undefined)).toBeNull();
    expect(normalizarMessageId(null)).toBeNull();
    expect(normalizarMessageId('')).toBeNull();
    expect(normalizarMessageId('   ')).toBeNull();
    expect(normalizarMessageId('<>')).toBeNull();
  });

  it('as duas pontas produzem a MESMA chave', () => {
    // como o nodemailer devolve no envio          → como o header chega na resposta
    const gravado = normalizarMessageId('<uuid-1@hipertms.com.br>');
    const [lido] = extrairMessageIds({ inReplyTo: '<uuid-1@hipertms.com.br>' });
    expect(gravado).toBe(lido);
  });
});

// O caso real (08/08/2026): o disparo foi para abel.398group@gmail.com e a resposta
// chegou de abelmramosss@gmail.com. A conversa é indexada pelo remetente, então nasceu
// uma conversa nova e o alvo original ficava "sem resposta" para sempre.
const MID = 'a1b2c3d4-e5f6@hipertms.com.br';

describe('extrairMessageIds', () => {
  it('tira os sinais de menor/maior do In-Reply-To', () => {
    expect(extrairMessageIds({ inReplyTo: `<${MID}>` })).toEqual([MID]);
  });

  it('aceita id sem os sinais (cliente desleixado)', () => {
    expect(extrairMessageIds({ inReplyTo: MID })).toEqual([MID]);
  });

  it('In-Reply-To vem ANTES de References — é a citação mais próxima', () => {
    const ids = extrairMessageIds({
      inReplyTo: '<direto@x.com>',
      references: '<antigo@x.com> <recente@x.com>',
    });
    expect(ids[0]).toBe('direto@x.com');
  });

  it('References é lido de trás para frente (o mais recente primeiro)', () => {
    const ids = extrairMessageIds({ references: '<primeiro@x.com> <ultimo@x.com>' });
    expect(ids).toEqual(['ultimo@x.com', 'primeiro@x.com']);
  });

  it('aceita References como array (formato do mailparser)', () => {
    expect(extrairMessageIds({ references: ['<a@x.com>', '<b@x.com>'] })).toEqual(['b@x.com', 'a@x.com']);
  });

  it('não repete id que aparece nos dois headers', () => {
    const ids = extrairMessageIds({ inReplyTo: `<${MID}>`, references: `<${MID}>` });
    expect(ids).toEqual([MID]);
  });

  it('sem headers de thread devolve vazio (e-mail novo, não é resposta)', () => {
    expect(extrairMessageIds({})).toEqual([]);
    expect(extrairMessageIds({ inReplyTo: null, references: null })).toEqual([]);
  });

  it('ignora lixo que não parece message-id', () => {
    expect(extrairMessageIds({ inReplyTo: 'sem arroba nenhuma' })).toEqual([]);
  });
});

describe('CampaignReplyLinker.link', () => {
  const alvo = (over: any = {}) => ({
    id: 'tg1',
    email: 'abel.398group@gmail.com',
    messageId: MID,
    repliedAt: null,
    campaign: { id: 'c1', name: 'Prospecção agosto' },
    ...over,
  });

  const makePrisma = (alvos: any[]) => ({
    campaignTarget: {
      findMany: vi.fn().mockResolvedValue(alvos),
      update: vi.fn().mockResolvedValue({}),
    },
  }) as any;

  it('atribui a resposta ao disparo mesmo vindo de OUTRO endereço', async () => {
    const prisma = makePrisma([alvo()]);

    const r = await new CampaignReplyLinker(prisma).link(
      't1',
      'abelmramosss@gmail.com', // endereço diferente do que recebeu
      { inReplyTo: `<${MID}>` },
    );

    expect(r).toMatchObject({
      campaignId: 'c1',
      campaignName: 'Prospecção agosto',
      targetId: 'tg1',
      targetEmail: 'abel.398group@gmail.com',
      enderecoDiferente: true,
    });
    // e o alvo passa a contar como respondido
    expect(prisma.campaignTarget.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tg1' }, data: { repliedAt: expect.any(Date) } }),
    );
  });

  it('mesmo endereço: atribui sem marcar como troca de endereço', async () => {
    const prisma = makePrisma([alvo()]);

    const r = await new CampaignReplyLinker(prisma).link('t1', 'abel.398group@gmail.com', {
      inReplyTo: `<${MID}>`,
    });

    expect(r?.enderecoDiferente).toBe(false);
  });

  it('compara endereço sem diferenciar maiúsculas', async () => {
    const prisma = makePrisma([alvo()]);

    const r = await new CampaignReplyLinker(prisma).link('t1', 'Abel.398Group@Gmail.com', {
      inReplyTo: `<${MID}>`,
    });

    expect(r?.enderecoDiferente).toBe(false);
  });

  it('não sobrescreve a data da PRIMEIRA resposta', async () => {
    const prisma = makePrisma([alvo({ repliedAt: new Date('2026-08-01') })]);

    const r = await new CampaignReplyLinker(prisma).link('t1', 'x@y.com', { inReplyTo: `<${MID}>` });

    expect(r).not.toBeNull();
    expect(prisma.campaignTarget.update).not.toHaveBeenCalled();
  });

  it('respeita a ordem dos ids — In-Reply-To ganha de References', async () => {
    // O banco devolve na ordem dele; o linker precisa escolher pela citação mais próxima.
    const prisma = makePrisma([
      alvo({ id: 'antigo', messageId: 'velho@x.com', campaign: { id: 'c0', name: 'Junho' } }),
      alvo({ id: 'novo', messageId: MID, campaign: { id: 'c1', name: 'Agosto' } }),
    ]);

    const r = await new CampaignReplyLinker(prisma).link('t1', 'x@y.com', {
      inReplyTo: `<${MID}>`,
      references: '<velho@x.com>',
    });

    expect(r?.targetId).toBe('novo');
    expect(r?.campaignName).toBe('Agosto');
  });

  it('e-mail que não é resposta: nem consulta o banco', async () => {
    const prisma = makePrisma([]);

    const r = await new CampaignReplyLinker(prisma).link('t1', 'x@y.com', {});

    expect(r).toBeNull();
    expect(prisma.campaignTarget.findMany).not.toHaveBeenCalled();
  });

  it('resposta a e-mail que não é de campanha devolve null', async () => {
    const prisma = makePrisma([]);

    const r = await new CampaignReplyLinker(prisma).link('t1', 'x@y.com', {
      inReplyTo: '<conversa-normal@x.com>',
    });

    expect(r).toBeNull();
  });

  it('busca sempre dentro do tenant', async () => {
    const prisma = makePrisma([alvo()]);

    await new CampaignReplyLinker(prisma).link('t1', 'x@y.com', { inReplyTo: `<${MID}>` });

    expect(prisma.campaignTarget.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1' });
  });

  // Falhar aqui é métrica errada; falhar propagando é a resposta do lead não entrando
  // no Inbox. O segundo é muito pior, então o linker engole o erro.
  it('erro de banco não derruba o processamento da resposta', async () => {
    const prisma = {
      campaignTarget: { findMany: vi.fn().mockRejectedValue(new Error('conexão caiu')) },
    } as any;

    await expect(
      new CampaignReplyLinker(prisma).link('t1', 'x@y.com', { inReplyTo: `<${MID}>` }),
    ).resolves.toBeNull();
  });
});
