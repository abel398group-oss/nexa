import { describe, it, expect, vi } from 'vitest';
import { EmailService } from './email.service';
import { EmailOutboundListener } from './email-outbound.listener';

/**
 * Duas coisas que o teste real de 10/08/2026 mostrou, e que são a mesma coisa
 * vista de dois lados: a conversa por e-mail não parecia uma conversa.
 *
 * 1. NO NOSSO INBOX — uma resposta de duas palavras chegava como quarenta linhas.
 *    O cliente do lead devolve a mensagem anterior inteira embaixo, com ">" em
 *    cada linha, e gravávamos tudo. O analista abria o fio e via o nosso próprio
 *    rodapé, o wordmark e o link de descadastro com token, em vez do "sim".
 *
 * 2. NA CAIXA DO LEAD — cada resposta nossa abria um fio novo, porque nenhum
 *    e-mail que sai daqui levava In-Reply-To. Assunto igual ajuda, mas quem de
 *    fato encadeia é o cabeçalho.
 */

const CITADO = [
  'Gostaria de saber mais sim',
  '',
  '',
  'Em 10/08/2026 15:08, Mateus Gomes escreveu:',
  '> HiperTMS',
  '> bom dia',
  '>',
  '> Mateus Gomes',
  '> Comercial · HiperTMS',
  '> Cancelar e-mails <https://nexa.hipertms.com.br/api/email/optout?token=O14PNEIyTfV1iTHQasxuBz>',
].join('\n');

function makeService() {
  const prisma = {
    processedMessage: { create: vi.fn().mockResolvedValue({}) },
    contact: { upsert: vi.fn().mockResolvedValue({ id: 'ct1', status: 'active' }) },
    aiConversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conv-1', status: 'open' }) },
  } as any;
  const conversations = { addMessage: vi.fn().mockResolvedValue({}), create: vi.fn() };
  const notifications = { create: vi.fn().mockResolvedValue({}) };
  const svc = new EmailService(
    prisma, {} as any, conversations as any,
    { handle: vi.fn().mockResolvedValue({}) } as any,
    notifications as any, {} as any,
    { isEnabled: () => false } as any,
    { link: vi.fn().mockResolvedValue(null) } as any,
  );
  return { svc, conversations, notifications };
}

const payload = {
  from: 'Abel <abel.ramos@hipertms.com.br>',
  subject: 'Re: Hipertms - Cotação',
  'stripped-text': CITADO,
  'Message-ID': '<resposta-do-lead@hipertms.com.br>',
};

describe('mensagem recebida — só o que a pessoa escreveu', () => {
  it('grava a resposta sem o histórico citado', async () => {
    const { svc, conversations } = makeService();

    await svc.process(payload, 't1');

    const msg = conversations.addMessage.mock.calls[0][2];
    expect(msg.content).toBe('Gostaria de saber mais sim');
    expect(msg.content).not.toContain('>');
    // e o nosso próprio token de descadastro não fica dentro da conversa
    expect(msg.content).not.toContain('optout');
  });

  it('o texto completo não se perde — vai para bodyCompleto', async () => {
    const { svc, conversations } = makeService();

    await svc.process(payload, 't1');

    expect(conversations.addMessage.mock.calls[0][2].metadata.bodyCompleto).toBe(CITADO);
  });

  it('sem citação, não duplica o corpo em bodyCompleto', async () => {
    const { svc, conversations } = makeService();

    await svc.process({ ...payload, 'stripped-text': 'Podemos conversar quinta?' }, 't1');

    const msg = conversations.addMessage.mock.calls[0][2];
    expect(msg.content).toBe('Podemos conversar quinta?');
    expect(msg.metadata.bodyCompleto).toBeUndefined();
  });

  it('o aviso no sino mostra a resposta, não a citação', async () => {
    const { svc, notifications } = makeService();

    await svc.process(payload, 't1');

    const body = notifications.create.mock.calls[0][1].body;
    expect(body).toContain('Gostaria de saber mais sim');
    expect(body).not.toContain('Cancelar e-mails');
  });

  it('guarda o Message-ID recebido — é o que permite responder dentro da thread', async () => {
    const { svc, conversations } = makeService();

    await svc.process(payload, 't1');

    expect(conversations.addMessage.mock.calls[0][2].metadata.messageId)
      .toBe('resposta-do-lead@hipertms.com.br');
  });
});

describe('resposta enviada — dentro do fio do lead', () => {
  function makeListener(metadataUltima: any) {
    const prisma = {
      aiConversation: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'conv-1', phone: 'email:lead@empresa.com', contactId: 'ct1',
          subject: null, productCode: null,
        }),
      },
      aiMessage: {
        findUnique: vi.fn().mockResolvedValue({ content: 'Claro, quinta às 10h?' }),
        findFirst: vi.fn().mockResolvedValue(metadataUltima ? { metadata: metadataUltima } : null),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;
    const emailReply = { send: vi.fn().mockResolvedValue({ sent: true }) };
    const listener = new EmailOutboundListener(prisma, emailReply as any, { emit: vi.fn() } as any);
    return { listener, emailReply };
  }

  const evento = { tenantId: 't1', conversationId: 'conv-1', messageId: 'msg-1' };

  it('responde com In-Reply-To da última mensagem recebida', async () => {
    const { listener, emailReply } = makeListener({
      subject: 'Re: Hipertms - Cotação',
      messageId: 'resposta-do-lead@hipertms.com.br',
    });

    await listener.handle(evento);

    expect(emailReply.send.mock.calls[0][0]).toMatchObject({
      subject: 'Re: Hipertms - Cotação',
      inReplyTo: 'resposta-do-lead@hipertms.com.br',
    });
  });

  // Conversa anterior a 10/08/2026 não tem o campo gravado. O e-mail sai igual,
  // só sem encadear — nunca deixa de sair por causa disso.
  it('conversa antiga, sem Message-ID guardado, envia mesmo assim', async () => {
    const { listener, emailReply } = makeListener({ subject: 'Assunto antigo' });

    await listener.handle(evento);

    const enviado = emailReply.send.mock.calls[0][0];
    expect(enviado.subject).toBe('Assunto antigo');
    expect(enviado.inReplyTo).toBeUndefined();
  });

  it('conversa sem nenhuma mensagem recebida cai no assunto genérico', async () => {
    const { listener, emailReply } = makeListener(null);

    await listener.handle(evento);

    expect(emailReply.send.mock.calls[0][0].subject).toBe('HiperTMS');
  });
});
