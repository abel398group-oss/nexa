import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsappService } from './whatsapp.service';

// ADR 035 — takeover quando o humano responde FORA do Nexa (2026-08-08).
//
// Toda mensagem com `fromMe` era descartada, então o vendedor podia assumir a
// conversa pelo celular e a Lia continuava respondendo por cima dele. Agora o
// caminho distingue o eco do próprio Nexa da digitação humana.
//
// A classificação erra de propósito para "é eco": um falso "é eco" só mantém o
// comportamento antigo; um falso "é humana" CALA a Lia numa conversa em que
// ninguém assumiu. Os testes fixam essa assimetria.
describe('WhatsappService — takeover pelo WhatsApp direto (ADR 035)', () => {
  let addMessage: ReturnType<typeof vi.fn>;
  let prisma: any;
  let svc: any;

  const CONV = { id: 'conv-1', humanTakeoverAt: null };

  const build = (over: { conv?: any; nossa?: any; envioRecente?: any } = {}) => {
    addMessage = vi.fn().mockResolvedValue({});
    prisma = {
      aiMessage: {
        // 1ª chamada = "essa mensagem é nossa?"; 2ª = "houve envio nosso recente?"
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(over.nossa ?? null)
          .mockResolvedValueOnce(over.envioRecente ?? null),
      },
      aiConversation: { findFirst: vi.fn().mockResolvedValue(over.conv === undefined ? CONV : over.conv) },
      processedMessage: { create: vi.fn().mockResolvedValue({}) },
    };
    const s = new WhatsappService(
      prisma,
      {} as any, // contacts
      { addMessage } as any, // conversations
      {} as any, // agent
      {} as any, // followup
      {} as any, // autonomy
      {} as any, // notifications
      {} as any, // transcription
      {} as any, // emitter
      {} as any, // internalNumbers
      {} as any, // optOutRegistry
    );
    (s as any).logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    return s as any;
  };

  // Mensagem SAINDO do nosso número: `from` somos nós, `to` é o lead.
  const outbound = (text: string, id = 'true_5512911112222@c.us_ABC12345') => ({
    payload: { id, fromMe: true, from: '5511988888888@c.us', to: '5512911112222@c.us', body: text },
  });

  beforeEach(() => {
    svc = build();
  });

  it('humano digitou pelo celular → grava e ativa o takeover', async () => {
    const r = await svc.process(outbound('Oi João, aqui é o Carlos, vou te ligar'), 't1');

    expect(r.ok).toBe(true);
    expect(addMessage).toHaveBeenCalledTimes(1);
    const [tenantId, convId, dto] = addMessage.mock.calls[0];
    expect(tenantId).toBe('t1');
    expect(convId).toBe('conv-1');
    expect(dto.direction).toBe('outbound');
    expect(dto.byHuman).toBe(true); // é isto que dispara o humanTakeoverAt
    // Sem alreadyDelivered o addMessage DESPACHA e o lead recebe duas vezes.
    expect(dto.alreadyDelivered).toBe(true);
  });

  it('eco de mensagem que o próprio Nexa enviou → ignora', async () => {
    svc = build({ nossa: { id: 'm1' } });
    const r = await svc.process(outbound('resposta da Lia'), 't1');

    expect(r.ignored).toBe(true);
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('dentro da carência de um envio nosso → ignora (id do WAHA pode divergir)', async () => {
    svc = build({ envioRecente: { id: 'm9' } });
    const r = await svc.process(outbound('texto qualquer'), 't1');

    expect(r.ignored).toBe(true);
    expect(r.reason).toContain('carência');
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('takeover já ativo → não regrava', async () => {
    svc = build({ conv: { id: 'conv-1', humanTakeoverAt: new Date() } });
    const r = await svc.process(outbound('segunda mensagem do vendedor'), 't1');

    expect(r.ignored).toBe(true);
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('sem conversa aberta para o destinatário → ignora', async () => {
    svc = build({ conv: null });
    const r = await svc.process(outbound('mensagem avulsa'), 't1');

    expect(r.ignored).toBe(true);
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('mensagem sem texto (mídia) → ignora', async () => {
    const r = await svc.process(outbound(''), 't1');

    expect(r.ignored).toBe(true);
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('falha no banco não derruba o webhook — cai no comportamento antigo', async () => {
    svc = build();
    prisma.aiConversation.findFirst.mockRejectedValue(new Error('db down'));

    const r = await svc.process(outbound('oi'), 't1');

    expect(r.ignored).toBe(true);
    expect(addMessage).not.toHaveBeenCalled();
  });

  it('reentrega do webhook não grava duas vezes', async () => {
    svc = build();
    prisma.processedMessage.create.mockRejectedValue(new Error('unique violation'));

    const r = await svc.process(outbound('oi'), 't1');

    expect(r.ignored).toBe(true);
    expect(addMessage).not.toHaveBeenCalled();
  });
});
