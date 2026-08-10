import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailOutboundListener } from './email-outbound.listener';

function makeDeps() {
  const prisma = {
    aiConversation: { findUnique: vi.fn() },
    aiMessage: {
      findUnique: vi.fn().mockResolvedValue({ content: 'Claro, mando a demonstração hoje.' }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
  const emailReply = { send: vi.fn().mockResolvedValue({ sent: true }) } as any;
  const events = { emit: vi.fn() } as any;
  return { prisma, emailReply, events };
}

const evento = { tenantId: 't1', conversationId: 'conv-1', messageId: 'msg-1' };

const conv = {
  id: 'conv-1',
  phone: 'email:lead@empresa.com',
  contactId: 'contact-1',
  subject: null as string | null,
  productCode: null as string | null,
};

describe('EmailOutboundListener', () => {
  let deps: ReturnType<typeof makeDeps>;
  let listener: EmailOutboundListener;

  beforeEach(() => {
    deps = makeDeps();
    listener = new EmailOutboundListener(deps.prisma, deps.emailReply, deps.events);
    deps.prisma.aiConversation.findUnique.mockResolvedValue(conv);
  });

  it('envia para o endereço extraído do phone sintético', async () => {
    await listener.handle(evento);

    expect(deps.emailReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'lead@empresa.com',
        body: 'Claro, mando a demonstração hoje.',
        tenantId: 't1',
        contactId: 'contact-1',
      }),
    );
  });

  it('usa o assunto da última mensagem recebida quando o chamado não tem um', async () => {
    deps.prisma.aiMessage.findFirst.mockResolvedValue({ metadata: { subject: 'Sobre o HiperTMS' } });

    await listener.handle(evento);

    expect(deps.emailReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Sobre o HiperTMS', inReplyToSubject: 'Sobre o HiperTMS' }),
    );
  });

  it('marca ack=1 e avisa o Inbox ao vivo — sem isso fica "enviando" para sempre', async () => {
    await listener.handle(evento);

    expect(deps.prisma.aiMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { ack: 1 },
    });
    expect(deps.events.emit).toHaveBeenCalledWith('message.updated', {
      conversationId: 'conv-1',
      id: 'msg-1',
      ack: 1,
    });
  });

  it('falha no SMTP não marca ack (a mensagem não saiu)', async () => {
    deps.emailReply.send.mockResolvedValue({ sent: false, reason: 'smtp_error: timeout' });

    await listener.handle(evento);

    expect(deps.prisma.aiMessage.update).not.toHaveBeenCalled();
    expect(deps.events.emit).not.toHaveBeenCalled();
  });

  it('phone sem o prefixo email: não envia (não é conversa de e-mail de verdade)', async () => {
    deps.prisma.aiConversation.findUnique.mockResolvedValue({ ...conv, phone: '5511999999999' });

    await listener.handle(evento);

    expect(deps.emailReply.send).not.toHaveBeenCalled();
  });

  it('mensagem sem conteúdo não envia e-mail vazio', async () => {
    deps.prisma.aiMessage.findUnique.mockResolvedValue({ content: '   ' });

    await listener.handle(evento);

    expect(deps.emailReply.send).not.toHaveBeenCalled();
  });

  // ADR 037: o disparo saiu com a marca do mercado; a resposta da Lia no mesmo fio
  // tem que sair com a MESMA marca. Sem repassar o productCode da conversa, o lead
  // via duas identidades diferentes na mesma thread — e marca trocada no meio da
  // conversa é o que mais parece golpe.
  it('repassa o mercado da conversa para o envio', async () => {
    deps.prisma.aiConversation.findUnique.mockResolvedValue({ ...conv, productCode: 'pneus' });

    await listener.handle(evento);

    expect(deps.emailReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ productCode: 'pneus' }),
    );
  });

  it('conversa sem mercado envia sem productCode (marca padrão)', async () => {
    await listener.handle(evento);

    expect(deps.emailReply.send.mock.calls[0][0].productCode).toBeNull();
  });
});
