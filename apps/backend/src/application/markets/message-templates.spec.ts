import { describe, it, expect, vi } from 'vitest';
import { MessageTemplatesService, avisosDoTeste } from './message-templates.service';
import { partirWordmark } from '@/application/email/email-template';

/**
 * Biblioteca de mensagens e o teste de mensagem (ADR 037).
 *
 * A pré-visualização existe para pegar o que só aparece renderizado. Se ela divergir
 * do envio, é pior que não existir — por isso o HTML sai do MESMO renderEmailHtml.
 */

function makeSvc(mercado: any = null) {
  const prisma = {
    product: { findUnique: vi.fn().mockResolvedValue(mercado) },
    messageTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 't1', ...data })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const emailReply = { sendAlertEmail: vi.fn().mockResolvedValue({ sent: true }) };
  return { svc: new MessageTemplatesService(prisma as any, emailReply as any), prisma, emailReply };
}

describe('MessageTemplatesService — criação', () => {
  it('e-mail SEM assunto é recusado', async () => {
    const { svc } = makeSvc();
    // Assunto vazio já produziu campanha com assunto "hipertms" e "sss" em produção.
    await expect(
      svc.create('t1', { productCode: 'pneus', name: 'Toque 1', channel: 'email', body: 'oi' }),
    ).rejects.toThrow(/assunto/i);
  });

  it('whatsapp não precisa de assunto — e não guarda um', async () => {
    const { svc, prisma } = makeSvc({ code: 'pneus' });
    await svc.create('t1', {
      productCode: 'pneus', name: 'Toque 1', channel: 'whatsapp', subject: 'ignorado', body: 'oi',
    });
    expect(prisma.messageTemplate.create.mock.calls[0][0].data.subject).toBeNull();
  });

  // Um typo no productCode criaria um modelo órfão: fora do seletor do Disparo,
  // fora da contagem da trava do mercado certo — e ninguém percebe.
  it('mercado inexistente é recusado, não vira modelo órfão', async () => {
    const { svc, prisma } = makeSvc(null);
    await expect(
      svc.create('t1', { productCode: 'hiprtms', name: 'Toque 1', channel: 'whatsapp', body: 'oi' }),
    ).rejects.toThrow(/não existe/);
    expect(prisma.messageTemplate.create).not.toHaveBeenCalled();
  });

  it('canal inválido é recusado', async () => {
    const { svc } = makeSvc();
    await expect(
      svc.create('t1', { productCode: 'p', name: 'X', channel: 'sms', body: 'oi' }),
    ).rejects.toThrow(/email ou whatsapp/i);
  });

  // Campanha antiga aponta para o modelo que a originou; apagar perderia a resposta
  // de "qual texto gerou este resultado".
  it('arquivar desativa, não apaga', async () => {
    const { svc, prisma } = makeSvc();
    await svc.archive('t1', 'tpl1');
    expect(prisma.messageTemplate.updateMany.mock.calls[0][0].data).toEqual({ active: false });
  });
});

describe('MessageTemplatesService — pré-visualização', () => {
  it('preenche {{nome}} com um nome de verdade', async () => {
    const { svc } = makeSvc();
    const p = await svc.preview('t1', { channel: 'whatsapp', body: 'Bom dia, {{nome}}!' });
    expect(p.corpo).toContain('Bom dia, Carlos!');
    expect(p.corpo).not.toContain('{{nome}}');
  });

  it('aceita outro nome de teste', async () => {
    const { svc } = makeSvc();
    const p = await svc.preview('t1', { channel: 'whatsapp', body: 'Oi {{nome}}', nomeTeste: 'Ana' });
    expect(p.corpo).toContain('Oi Ana');
  });

  // No e-mail o descadastro é o link do rodapé do HTML; "Responda SAIR" mandaria o
  // lead responder um e-mail que ninguém lê.
  it('e-mail NÃO leva o rodapé "Responda SAIR"; whatsapp leva', async () => {
    const { svc } = makeSvc();
    const mail = await svc.preview('t1', { channel: 'email', subject: 'x', body: 'Oi' });
    const zap = await svc.preview('t1', { channel: 'whatsapp', body: 'Oi' });
    expect(mail.corpo).not.toContain('Responda SAIR');
    expect(zap.corpo).toContain('Responda SAIR');
  });

  it('whatsapp não gera HTML', async () => {
    const { svc } = makeSvc();
    expect((await svc.preview('t1', { channel: 'whatsapp', body: 'Oi' })).html).toBeNull();
  });

  it('e-mail de mercado usa a MARCA do mercado, não a do HiperTMS', async () => {
    const { svc } = makeSvc({
      code: 'pneus', name: 'Pneus Brasil', displayName: 'Pneus Brasil',
      brandColor: '#1D9E75', brandTagline: 'Rodando mais por menos',
    });

    const p = await svc.preview('t1', { productCode: 'pneus', channel: 'email', subject: 'x', body: 'Oi' });

    expect(p.html).toContain('#1D9E75');
    expect(p.html).toContain('Rodando mais por menos');
    expect(p.html).not.toContain('O TMS feito para vender frete.');
  });

  it('sem mercado, cai na marca padrão (comportamento de sempre)', async () => {
    const { svc } = makeSvc();
    const p = await svc.preview('t1', { channel: 'email', subject: 'x', body: 'Oi' });
    expect(p.html).toContain('O TMS feito para vender frete.');
    expect(p.html).toContain('#FF5A1F');
  });

  // Gerar token de verdade numa prévia criaria descadastro válido a partir de um teste.
  it('a prévia não gera token de descadastro real', async () => {
    const { svc } = makeSvc();
    const p = await svc.preview('t1', { channel: 'email', subject: 'x', body: 'Oi' });
    expect(p.html).toContain('token=previa');
  });
});

describe('avisosDoTeste — o que só aparece renderizado', () => {
  it('markdown no WhatsApp é ERRO (sai literal)', () => {
    const a = avisosDoTeste('whatsapp', 'Olha o **desconto**');
    expect(a[0].gravidade).toBe('erro');
    expect(a[0].texto).toMatch(/markdown/i);
  });

  it('markdown no e-mail não é problema', () => {
    expect(avisosDoTeste('email', 'Olha o **desconto**', 'assunto')).toHaveLength(0);
  });

  it('link longo vira aviso', () => {
    const a = avisosDoTeste('email', 'Veja https://exemplo.com.br/uma/rota/bem/longa/mesmo/aqui', 'x');
    expect(a.some((x) => /link longo/i.test(x.texto))).toBe(true);
  });

  // A regra do próprio material de prospecção: assunto pela dor, nunca pelo produto.
  it('assunto que fala do produto vira aviso', () => {
    const a = avisosDoTeste('email', 'oi', 'Sobre o HiperTMS');
    expect(a.some((x) => /fala do produto/i.test(x.texto))).toBe(true);
  });

  it('assunto longo avisa do corte do Gmail', () => {
    const a = avisosDoTeste('email', 'oi', 'a'.repeat(80));
    expect(a.some((x) => /60/.test(x.texto))).toBe(true);
  });

  it('mensagem limpa não gera aviso nenhum', () => {
    expect(avisosDoTeste('whatsapp', 'Bom dia! Quanto tempo leva uma cotação aí?')).toHaveLength(0);
  });
});

describe('partirWordmark — destaque do nome da marca', () => {
  it('maiúscula no meio vira o destaque (HiperTMS)', () => {
    expect(partirWordmark('HiperTMS')).toEqual({ inicio: 'Hiper', destaque: 'TMS' });
  });

  it('duas palavras destacam a última', () => {
    expect(partirWordmark('Pneus Brasil')).toEqual({ inicio: 'Pneus ', destaque: 'Brasil' });
  });

  // Inventar uma quebra em nome de uma palavra ficaria pior que não destacar.
  it('uma palavra só sai inteira, sem destaque', () => {
    expect(partirWordmark('Michelin')).toEqual({ inicio: 'Michelin', destaque: '' });
  });
});

/**
 * Aprovação no modelo (20/08/2026). O modelo é o texto que o LEAD recebe e era o
 * único da esteira sem revisão — dois toques com preço e promessa proibida ficaram
 * armados no disparo até a varredura de 20/08. As regras aqui são as mesmas do
 * material de campanha: rascunho não aparece no seletor, e editar derruba.
 */
describe('MessageTemplatesService — aprovação', () => {
  it('o seletor do Disparo só recebe aprovados', async () => {
    const { svc, prisma } = makeSvc();

    await svc.list('t1', 'hipertms', undefined, true);

    expect(prisma.messageTemplate.findMany.mock.calls[0][0].where.status).toBe('approved');
  });

  it('a tela de Mensagens lista tudo — rascunho enterrado é rascunho sem revisão', async () => {
    const { svc, prisma } = makeSvc();

    await svc.list('t1', 'hipertms');

    expect(prisma.messageTemplate.findMany.mock.calls[0][0].where.status).toBeUndefined();
  });

  it('editar o corpo derruba a aprovação', async () => {
    const { svc, prisma } = makeSvc();
    prisma.messageTemplate.findFirst.mockResolvedValue({
      id: 't1', channel: 'whatsapp', body: 'antigo', subject: null,
    });

    await svc.update('t1', 't1', { body: 'texto novo' });

    expect(prisma.messageTemplate.update.mock.calls[0][0].data.status).toBe('draft');
  });

  it('renomear e reordenar NÃO derrubam — não mudam o que o lead recebe', async () => {
    const { svc, prisma } = makeSvc();
    prisma.messageTemplate.findFirst.mockResolvedValue({
      id: 't1', channel: 'whatsapp', body: 'texto', subject: null,
    });

    await svc.update('t1', 't1', { name: 'Toque 1 — novo nome', step: 2 });

    expect(prisma.messageTemplate.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('aprovar é escopado no tenant — id alheio é 404', async () => {
    const { svc, prisma } = makeSvc();
    prisma.messageTemplate.updateMany.mockResolvedValue({ count: 0 });

    await expect(svc.approve('t1', 'de-outro')).rejects.toThrow('Modelo não encontrado');
  });

  it('reprovar volta para rascunho sem apagar nada', async () => {
    const { svc, prisma } = makeSvc();

    await svc.unapprove('t1', 't1');

    const call = prisma.messageTemplate.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 't1', tenantId: 't1' });
    expect(call.data).toEqual({ status: 'draft' });
  });
});
