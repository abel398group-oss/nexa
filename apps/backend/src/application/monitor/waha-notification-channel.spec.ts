import { describe, it, expect, vi } from 'vitest';
import { WahaNotificationChannel, DO_NOT_REPLY_NOTICE } from './waha-notification-channel';

// ─── Aviso "não responda" (brainstorm 2026-07-20, decisão do Abel) ───────────
// Toda mensagem WhatsApp do Monitor abre com o aviso de canal só-saída.
// Prependado no canal (ponto único: envio direto + fila de dispatch), nunca
// nos builders — e-mail e specs de builder ficam intocados.

function makeChannel(sendResult: { sent: boolean; reason?: string } = { sent: true }) {
  const waha = { sendText: vi.fn().mockResolvedValue(sendResult) } as any;
  return { channel: new WahaNotificationChannel(waha), waha };
}

describe('WahaNotificationChannel — aviso não-responda', () => {
  it('prependa o aviso antes do corpo da mensagem', async () => {
    const { channel, waha } = makeChannel();
    await channel.sendTo('t1', '5511900000001', 'Alertas Fiscal — 20/07');
    const [, text] = waha.sendText.mock.calls[0];
    expect(text.startsWith(DO_NOT_REPLY_NOTICE)).toBe(true);
    expect(text).toContain('Alertas Fiscal — 20/07');
    // aviso separado do corpo por linha em branco
    expect(text).toBe(`${DO_NOT_REPLY_NOTICE}\n\nAlertas Fiscal — 20/07`);
  });

  it('não duplica o aviso se a mensagem já o contém', async () => {
    const { channel, waha } = makeChannel();
    const already = `${DO_NOT_REPLY_NOTICE}\n\ncorpo`;
    await channel.sendTo('t1', '5511900000001', already);
    const [, text] = waha.sendText.mock.calls[0];
    expect(text).toBe(already);
    expect(text.indexOf(DO_NOT_REPLY_NOTICE)).toBe(text.lastIndexOf(DO_NOT_REPLY_NOTICE));
  });

  it('falha do WAHA → sent=false com reason preservado', async () => {
    const { channel } = makeChannel({ sent: false, reason: 'waha_down' });
    const r = await channel.sendTo('t1', '5511900000001', 'msg');
    expect(r.sent).toBe(false);
    expect(r.reason).toBe('waha_down');
  });

  it('sucesso → sent=true', async () => {
    const { channel } = makeChannel();
    const r = await channel.sendTo('t1', '5511900000001', 'msg');
    expect(r).toEqual({ sent: true });
  });
});
