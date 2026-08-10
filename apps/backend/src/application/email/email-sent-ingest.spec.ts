import { describe, it, expect, vi } from 'vitest';
import { EmailSentIngestService, primeiroDestinatario } from './email-sent-ingest.service';

/**
 * A metade humana do histórico.
 *
 * O poller lia só a INBOX, então a resposta que a pessoa do comercial escreve do
 * webmail ou do celular nunca chegava ao Nexa: ficavam as perguntas dos leads sem
 * as respostas. Isso importa agora porque esse histórico é o material com que a
 * Lia vai aprender a responder o canal — meia conversa ensinaria só a objeção,
 * nunca a réplica.
 */

function makeSvc(conversaExistente: any = { id: 'conv-1' }) {
  const prisma = {
    processedMessage: { create: vi.fn().mockResolvedValue({}) },
    aiConversation: { findFirst: vi.fn().mockResolvedValue(conversaExistente) },
  } as any;
  const conversations = { addMessage: vi.fn().mockResolvedValue({}) };
  return { svc: new EmailSentIngestService(prisma, conversations as any), prisma, conversations };
}

const enviado = {
  to: 'Uelder <uelder@transportadora.com.br>',
  subject: 'Re: Sobre a sua operação de frete',
  bodyText: 'Boa tarde, Uelder! A cotação sai em 30 segundos no HiperTMS. Te mostro quinta?',
  messageId: '<resposta-1@hipertms.com.br>',
  sentAt: new Date('2026-08-11T13:00:00Z'),
};

describe('primeiroDestinatario', () => {
  it('extrai o endereço do formato "Nome <a@b>" e normaliza', () => {
    expect(primeiroDestinatario('Uelder <Uelder@Transportadora.com.BR>')).toBe('uelder@transportadora.com.br');
  });

  it('aceita endereço cru', () => {
    expect(primeiroDestinatario('  a@b.com ')).toBe('a@b.com');
  });

  // Vários destinatários: o fio pertence ao primeiro. Registrar em todos criaria a
  // mesma mensagem em várias conversas.
  it('com vários, fica com o primeiro', () => {
    expect(primeiroDestinatario('a@b.com, c@d.com')).toBe('a@b.com');
  });
});

describe('EmailSentIngestService.ingest', () => {
  it('registra a resposta na conversa existente, como saída já entregue', async () => {
    const { svc, conversations } = makeSvc();

    const r: any = await svc.ingest('t1', enviado);

    expect(r).toMatchObject({ ok: true, conversationId: 'conv-1' });
    const [tenant, convId, msg] = conversations.addMessage.mock.calls[0];
    expect(tenant).toBe('t1');
    expect(convId).toBe('conv-1');
    expect(msg.direction).toBe('outbound');
    expect(msg.content).toContain('cotação sai em 30 segundos');
    // O e-mail JÁ saiu pelo cliente de quem escreveu; sem esta marca o addMessage
    // despacharia o mesmo texto pelo SMTP e o lead receberia duas vezes.
    expect(msg.alreadyDelivered).toBe(true);
    // A marca de origem é o que, no treino, distingue resposta humana de verdade.
    expect(msg.metadata).toMatchObject({ channel: 'email', source: 'imap_sent' });
  });

  it('procura a conversa pelo telefone sintético do destinatário', async () => {
    const { svc, prisma } = makeSvc();

    await svc.ingest('t1', enviado);

    expect(prisma.aiConversation.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      phone: 'email:uelder@transportadora.com.br',
    });
  });

  // Regra 1: nunca cria conversa. A caixa de prospecção recebe e-mail para colega,
  // contador, fornecedor — cada um viraria um lead falso no funil E no material de
  // treino, que é mais caro que uma mensagem não registrada.
  it('sem conversa correspondente, NÃO cria nada', async () => {
    const { svc, conversations } = makeSvc(null);

    const r: any = await svc.ingest('t1', { ...enviado, to: 'contador@escritorio.com.br' });

    expect(r).toMatchObject({ ignored: true, reason: 'sem_conversa' });
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  // Regra 2: o que o próprio Nexa mandou já foi gravado no envio. O INSERT do
  // Message-ID falha porque o send() já registrou aquele id.
  it('mensagem que o próprio Nexa enviou é barrada pelo Message-ID', async () => {
    const { svc, conversations } = makeSvc();
    (svc as any).prisma.processedMessage.create.mockRejectedValue(new Error('unique violation'));

    const r: any = await svc.ingest('t1', enviado);

    expect(r).toMatchObject({ ignored: true, reason: 'duplicada' });
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('a trava acontece ANTES de procurar a conversa (é o ponto de ser INSERT)', async () => {
    const { svc, prisma } = makeSvc();
    prisma.processedMessage.create.mockRejectedValue(new Error('dup'));

    await svc.ingest('t1', enviado);

    expect(prisma.aiConversation.findFirst).not.toHaveBeenCalled();
  });

  it('grava o Message-ID no mesmo espaço do dedup de entrada', async () => {
    const { svc, prisma } = makeSvc();

    await svc.ingest('t1', enviado);

    expect(prisma.processedMessage.create).toHaveBeenCalledWith({
      data: { messageId: 'email:resposta-1@hipertms.com.br' },
    });
  });

  it('destinatário inválido não vira nada', async () => {
    const { svc, conversations } = makeSvc();

    const r: any = await svc.ingest('t1', { ...enviado, to: 'sem-arroba' });

    expect(r).toMatchObject({ ignored: true, reason: 'sem_destinatario' });
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('corpo vazio não vira mensagem vazia no fio', async () => {
    const { svc, conversations } = makeSvc();

    const r: any = await svc.ingest('t1', { ...enviado, bodyText: '   ' });

    expect(r).toMatchObject({ ignored: true, reason: 'sem_corpo' });
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  // Sem Message-ID não dá para deduplicar, e recusar seria pior: a resposta some.
  // Segue — a marca d'água por UID já evita reler a mesma mensagem.
  it('enviado sem Message-ID continua entrando', async () => {
    const { svc, conversations } = makeSvc();

    const r: any = await svc.ingest('t1', { ...enviado, messageId: undefined });

    expect(r).toMatchObject({ ok: true });
    expect(conversations.addMessage).toHaveBeenCalledTimes(1);
  });
});
