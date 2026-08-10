import { describe, it, expect, vi } from 'vitest';
import { EmailService } from './email.service';

/**
 * Modo manual: a Lia do e-mail desligada, a equipe responde à mão.
 *
 * A decisão (10/08/2026) é construir histórico real de conversa antes de deixar a
 * Lia responder por e-mail — ela aprende com o que foi respondido de verdade.
 *
 * O buraco que isso abria: com a autonomia OFF, `process()` gravava a mensagem e
 * voltava calado. `NotificationsService` estava injetado no serviço e nunca era
 * chamado. Ou seja, "a gente responde na mão" dependia de alguém abrir o Inbox por
 * conta própria e reparar numa conversa nova — lead que respondeu a uma prospecção
 * e ficou dois dias sem retorno é pior que lead nunca abordado: ele já levantou a
 * mão, e o silêncio depois disso é o que vira reclamação de spam.
 */

function makeService(autonomia: boolean) {
  const prisma = {
    processedMessage: { create: vi.fn().mockResolvedValue({}) },
    contact: { upsert: vi.fn().mockResolvedValue({ id: 'ct1', status: 'active' }) },
    aiConversation: { findFirst: vi.fn().mockResolvedValue({ id: 'conv-9', status: 'open' }) },
  } as any;
  const conversations = { addMessage: vi.fn().mockResolvedValue({}), create: vi.fn() };
  const agent = { handle: vi.fn().mockResolvedValue({ autoSent: true, route: { agent: 'sales' } }) };
  const notifications = { create: vi.fn().mockResolvedValue({}) };

  const svc = new EmailService(
    prisma,
    {} as any,
    conversations as any,
    agent as any,
    notifications as any,
    {} as any,
    { isEnabled: () => autonomia } as any,
    { link: vi.fn().mockResolvedValue(null) } as any,
  );
  return { svc, notifications, conversations, agent };
}

const payload = {
  from: 'Uelder <uelder@transportadora.com.br>',
  subject: 'Re: Sobre a sua operação de frete',
  'stripped-text': 'Boa tarde! Temos 40 caminhões e hoje cotamos tudo na planilha. Como funciona?',
  'Message-ID': '<abc@x.com>',
};

describe('EmailService.process — Lia desligada no e-mail', () => {
  it('grava a mensagem e NÃO deixa a Lia responder', async () => {
    const { svc, conversations, agent } = makeService(false);

    const r: any = await svc.process(payload, 't1');

    expect(conversations.addMessage).toHaveBeenCalledTimes(1); // o histórico é o objetivo
    expect(agent.handle).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, autonomy: 'email_off' });
  });

  it('avisa que existe resposta esperando atendimento humano', async () => {
    const { svc, notifications } = makeService(false);

    await svc.process(payload, 't1');

    expect(notifications.create).toHaveBeenCalledTimes(1);
    const [tenant, n] = notifications.create.mock.calls[0];
    expect(tenant).toBe('t1');
    expect(n.title).toContain('responder à mão');
    // Quem lê o aviso decide se corre pelo REMETENTE e pelo TEOR — sem eles, é só
    // "chegou algo", e aí o aviso não economiza a ida ao Inbox.
    expect(n.body).toContain('uelder@transportadora.com.br');
    expect(n.body).toContain('40 caminhões');
    // Um clique para o fio certo.
    expect(n.link).toBe('/inbox/conv-9');
  });

  it('devolve a conversa para quem chamou (o poller de IMAP loga o destino)', async () => {
    const { svc } = makeService(false);
    const r: any = await svc.process(payload, 't1');
    expect(r.conversationId).toBe('conv-9');
  });

  it('corpo longo é cortado — aviso é chamada, não a mensagem inteira', async () => {
    const { svc, notifications } = makeService(false);

    await svc.process({ ...payload, 'stripped-text': 'a'.repeat(400) }, 't1');

    expect(notifications.create.mock.calls[0][1].body).toContain('…');
  });

  // Avisar é secundário; a mensagem gravada é o que não pode se perder.
  it('falha ao notificar não derruba o processamento', async () => {
    const { svc, notifications } = makeService(false);
    notifications.create.mockRejectedValue(new Error('banco fora'));

    const r: any = await svc.process(payload, 't1');

    expect(r).toMatchObject({ ok: true, autonomy: 'email_off' });
  });

  // Com a Lia ligada o aviso não sai: ela já respondeu, e um sino para cada
  // resposta automática treinaria a equipe a ignorar o sino.
  it('com a Lia ligada, responde e não notifica', async () => {
    const { svc, notifications, agent } = makeService(true);

    await svc.process(payload, 't1');

    expect(agent.handle).toHaveBeenCalledTimes(1);
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
