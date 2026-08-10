import { describe, it, expect, vi } from 'vitest';
import { EmailService } from './email.service';

/**
 * Dedup de e-mail inbound por Message-ID.
 *
 * Incidente de 08/08/2026 (lead real, Uelder da Hipervias): a mesma resposta entrou
 * três vezes — duas no mesmo milissegundo, uma terceira 18s depois. As duas primeiras
 * dispararam a Lia em paralelo e ela mandou DUAS respostas diferentes para o lead,
 * separadas por 33ms. O WhatsApp já tinha essa trava desde sempre; o e-mail não.
 *
 * A trava é o INSERT numa coluna única: a violação PROVA que outro processo já pegou
 * a mensagem. Um SELECT antes deixaria aberta exatamente a janela de corrida que
 * causou o incidente — dois polls do IMAP rodando ao mesmo tempo.
 */

const MID = '<abc-123@hipervias.com.br>';

function makeService(overrides: any = {}) {
  const prisma = {
    processedMessage: { create: vi.fn().mockResolvedValue({}) },
    contact: { upsert: vi.fn().mockResolvedValue({ id: 'ct1', status: 'active' }) },
    aiConversation: { findFirst: vi.fn().mockResolvedValue({ id: 'cv1', status: 'open' }) },
    ...overrides.prisma,
  };
  const conversations = { addMessage: vi.fn().mockResolvedValue({}), create: vi.fn() };
  const agent = { handle: vi.fn().mockResolvedValue({ reply: 'ok' }) };
  const svc = new EmailService(
    prisma as any,
    {} as any,                                   // contacts
    conversations as any,
    agent as any,
    // notifications: com a autonomia OFF (abaixo), o process() avisa que existe
    // resposta esperando atendimento humano — ver email-manual-mode.spec.ts.
    { create: vi.fn().mockResolvedValue({}) } as any,
    {} as any,                                   // emailReply
    { isEnabled: () => false } as any,           // autonomy OFF: isola o teste do agente
    { link: vi.fn().mockResolvedValue(null) } as any,
  );
  return { svc, prisma, conversations, agent };
}

const payload = (extra: Record<string, string> = {}) => ({
  from: 'Uelder <uelder.martins@hipervias.com.br>',
  subject: 'Re: HiperTMS',
  'stripped-text': 'OI Pode sim',
  'Message-ID': MID,
  ...extra,
});

describe('EmailService.process — dedup por Message-ID', () => {
  it('primeira passada processa e registra o Message-ID', async () => {
    const { svc, prisma, conversations } = makeService();

    const r: any = await svc.process(payload(), 't1');

    expect(r.ignored).toBeFalsy();
    expect(conversations.addMessage).toHaveBeenCalledTimes(1);
    // Prefixado para não colidir com id de mensagem do WhatsApp na mesma tabela.
    expect(prisma.processedMessage.create).toHaveBeenCalledWith({
      data: { messageId: 'email:abc-123@hipervias.com.br' },
    });
  });

  it('segunda passada é recusada e NÃO grava mensagem', async () => {
    const { svc, conversations } = makeService({
      prisma: { processedMessage: { create: vi.fn().mockRejectedValue(new Error('unique violation')) } },
    });

    const r: any = await svc.process(payload(), 't1');

    expect(r).toMatchObject({ ignored: true, reason: 'duplicada' });
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('a recusa acontece ANTES de qualquer escrita (é o ponto da trava)', async () => {
    const { svc, prisma } = makeService({
      prisma: { processedMessage: { create: vi.fn().mockRejectedValue(new Error('dup')) } },
    });

    await svc.process(payload(), 't1');

    // nem o contato é tocado — a mensagem morre na porta
    expect(prisma.contact.upsert).not.toHaveBeenCalled();
  });

  it('normaliza os sinais <> (o header vem com eles)', async () => {
    const { svc, prisma } = makeService();

    await svc.process(payload({ 'Message-ID': '  <x@y.com>  ' }), 't1');

    expect(prisma.processedMessage.create).toHaveBeenCalledWith({ data: { messageId: 'email:x@y.com' } });
  });

  it('aceita o header em minúsculas', async () => {
    const { svc, prisma } = makeService();
    const p: any = { ...payload() };
    delete p['Message-ID'];
    p['message-id'] = MID;

    await svc.process(p, 't1');

    expect(prisma.processedMessage.create).toHaveBeenCalledWith({
      data: { messageId: 'email:abc-123@hipervias.com.br' },
    });
  });

  // Sem Message-ID não dá para deduplicar — e recusar seria pior: a mensagem do lead
  // simplesmente sumiria. Segue o fluxo, como antes.
  it('e-mail sem Message-ID continua sendo processado', async () => {
    const { svc, prisma, conversations } = makeService();
    const p: any = { ...payload() };
    delete p['Message-ID'];

    const r: any = await svc.process(p, 't1');

    expect(r.ignored).toBeFalsy();
    expect(prisma.processedMessage.create).not.toHaveBeenCalled();
    expect(conversations.addMessage).toHaveBeenCalledTimes(1);
  });

  it('remetente inválido é barrado antes do dedup (não suja a tabela)', async () => {
    const { svc, prisma } = makeService();

    const r: any = await svc.process({ ...payload(), from: 'sem-arroba' }, 't1');

    expect(r).toMatchObject({ ignored: true, reason: 'invalid_from' });
    expect(prisma.processedMessage.create).not.toHaveBeenCalled();
  });
});
