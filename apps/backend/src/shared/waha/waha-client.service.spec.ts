import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WahaClientService } from './waha-client.service';

// Presença (sendSeen / startTyping / stopTyping) e débito no orçamento do número.
// A doc do WAHA lista marcar como lido e "digitando…" como as primeiras
// recomendações contra bloqueio; os endpoints sempre existiram, só não eram
// chamados — um número que nunca lê e responde em 1,5s é perfil de robô.

const envAnterior = { ...process.env };

/** URLs chamadas, na ordem — é a ORDEM que importa aqui. */
function rotasChamadas(fetchMock: any): string[] {
  return fetchMock.mock.calls.map((c: any[]) => String(c[0]).replace('http://waha.test/api/', ''));
}

describe('WahaClientService — presença e orçamento', () => {
  let fetchMock: any;

  beforeEach(() => {
    process.env.WAHA_API_URL = 'http://waha.test';
    process.env.WAHA_API_KEY = 'k';
    process.env.WAHA_SESSION = 'default';
    process.env.WAHA_SEND_ALLOWLIST = '';
    // sem isso cada teste esperaria até 5s de "digitando"
    process.env.WHATSAPP_TYPING_MAX_MS = '1';
    delete process.env.WHATSAPP_PRESENCE_ENABLED;

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: { _serialized: 'msg-1' } }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...envAnterior };
  });

  it('com presence: marca como lido, digita, para de digitar e SÓ ENTÃO envia', async () => {
    const svc = new WahaClientService();

    const r = await svc.sendText('5511999999999', 'oi', { presence: true });

    expect(r.sent).toBe(true);
    expect(rotasChamadas(fetchMock)).toEqual(['sendSeen', 'startTyping', 'stopTyping', 'sendText']);
  });

  it('sem presence: manda direto, sem chamada de presença', async () => {
    const svc = new WahaClientService();

    await svc.sendText('5511999999999', 'alerta automático');

    expect(rotasChamadas(fetchMock)).toEqual(['sendText']);
  });

  it('WHATSAPP_PRESENCE_ENABLED=false desliga a presença mesmo com presence: true', async () => {
    process.env.WHATSAPP_PRESENCE_ENABLED = 'false';
    const svc = new WahaClientService();

    await svc.sendText('5511999999999', 'oi', { presence: true });

    expect(rotasChamadas(fetchMock)).toEqual(['sendText']);
  });

  it('falha na presença NÃO impede o envio da mensagem', async () => {
    // presença quebrada, envio ok — a mensagem é o que importa
    fetchMock.mockImplementation(async (url: string) => {
      if (!String(url).endsWith('/sendText')) throw new Error('waha_presence_down');
      return { ok: true, json: async () => ({ id: 'm1' }), text: async () => '' };
    });
    const svc = new WahaClientService();

    const r = await svc.sendText('5511999999999', 'oi', { presence: true });

    expect(r.sent).toBe(true);
  });

  describe('débito no orçamento do número', () => {
    it('debita com a origem recebida', async () => {
      const budget = { record: vi.fn().mockResolvedValue(undefined) };
      const svc = new WahaClientService(budget as any);

      await svc.sendText('5511999999999', 'oi', { origin: 'monitor' });

      expect(budget.record).toHaveBeenCalledWith('monitor');
    });

    it('sem origem explícita cai em "outros" — nenhum envio fica de fora da conta', async () => {
      const budget = { record: vi.fn().mockResolvedValue(undefined) };
      const svc = new WahaClientService(budget as any);

      await svc.sendText('5511999999999', 'oi');

      expect(budget.record).toHaveBeenCalledWith('outros');
    });

    it('timeout também debita: a mensagem PODE ter saído (mesmo critério do DISP-021)', async () => {
      const erro: any = new Error('timeout');
      erro.name = 'TimeoutError';
      fetchMock.mockRejectedValue(erro);
      const budget = { record: vi.fn().mockResolvedValue(undefined) };
      const svc = new WahaClientService(budget as any);

      const r = await svc.sendText('5511999999999', 'oi', { origin: 'campaign' });

      expect(r.sent).toBe(false);
      expect(r.definitive).toBe(false);
      expect(budget.record).toHaveBeenCalledWith('campaign');
    });

    it('recusa DEFINITIVA (4xx) não debita — a mensagem com certeza não saiu', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'bad' });
      const budget = { record: vi.fn().mockResolvedValue(undefined) };
      const svc = new WahaClientService(budget as any);

      const r = await svc.sendText('5511999999999', 'oi', { origin: 'campaign' });

      expect(r.definitive).toBe(true);
      expect(budget.record).not.toHaveBeenCalled();
    });

    it('sem o serviço de orçamento o envio segue normal', async () => {
      const svc = new WahaClientService();

      const r = await svc.sendText('5511999999999', 'oi');

      expect(r.sent).toBe(true);
    });
  });
});
