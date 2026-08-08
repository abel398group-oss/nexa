import { describe, it, expect, vi } from 'vitest';
import { SellerHandoffListener } from './seller-handoff.listener';

// Avisar o vendedor por e-mail além do WhatsApp: lead quente atribuído 22h de sexta
// dependia de alguém ver a mensagem no celular.
const EVENTO = {
  tenantId: 't1',
  sellerName: 'Mateus Gomes',
  sellerEmail: 'mateus.gomes@hipertms.com.br',
  kind: 'hot_lead' as const,
  conversationId: 'conv-1',
  contactPhone: '5512911112222',
  leadScore: 85,
  attendLine: 'Atender agora: https://painel.exemplo.com.br/inbox?c=conv-1',
};

const make = (sendAlertEmail = vi.fn().mockResolvedValue({ sent: true })) => ({
  listener: new SellerHandoffListener({ sendAlertEmail } as any),
  sendAlertEmail,
});

describe('SellerHandoffListener', () => {
  it('manda o aviso com contato, resumo e link do inbox', async () => {
    const { listener, sendAlertEmail } = make();

    await listener.onHandoff({ ...EVENTO, summary: 'Quer cotar SP→BH' });

    const [para, assunto, corpo, tenant] = sendAlertEmail.mock.calls[0];
    expect(para).toBe(EVENTO.sellerEmail);
    expect(assunto).toContain(EVENTO.contactPhone);
    expect(corpo).toContain('Quer cotar SP→BH');
    expect(corpo).toContain(EVENTO.attendLine);
    expect(tenant).toBe('t1');
  });

  // O vendedor que responde o alerta acha que falou com o cliente e o lead esfria
  // esperando. O aviso do WhatsApp já aprendeu isso; o e-mail nasce sabendo.
  it('avisa que responder o e-mail NÃO fala com o cliente', async () => {
    const { listener, sendAlertEmail } = make();
    await listener.onHandoff(EVENTO);
    expect(sendAlertEmail.mock.calls[0][2]).toMatch(/NÃO fala com o cliente/i);
  });

  it('pedido de humano tem assunto próprio e não inventa score', async () => {
    const { listener, sendAlertEmail } = make();

    await listener.onHandoff({ ...EVENTO, kind: 'human_request', leadScore: 0 });

    const [, assunto, corpo] = sendAlertEmail.mock.calls[0];
    expect(assunto).toMatch(/pediu atendimento/i);
    expect(corpo).not.toMatch(/score/i);
  });

  it('sem e-mail cadastrado não manda nada', async () => {
    const { listener, sendAlertEmail } = make();
    await listener.onHandoff({ ...EVENTO, sellerEmail: null });
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  it('e-mail em branco conta como sem e-mail', async () => {
    const { listener, sendAlertEmail } = make();
    await listener.onHandoff({ ...EVENTO, sellerEmail: '   ' });
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  // O lead já está atribuído quando o aviso sai. Propagar a falha não desfaz nada
  // e só polui o log de erro do handoff.
  it('falha de SMTP não propaga', async () => {
    const { listener } = make(vi.fn().mockRejectedValue(new Error('smtp fora')));
    await expect(listener.onHandoff(EVENTO)).resolves.toBeUndefined();
  });
});
