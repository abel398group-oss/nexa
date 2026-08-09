import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WahaBootstrapService } from './waha-bootstrap.service';

/**
 * Eventos que o Nexa assina no WAHA.
 *
 * O que importa aqui é `message.any`, e a razão não é óbvia: o evento `message`
 * do WAHA entrega SÓ o que entra. Uma mensagem que sai do nosso número — o
 * vendedor digitando no WhatsApp Web da empresa — só chega por `message.any`.
 *
 * Sem ele o takeover da ADR 035 não dispara nesse caminho, e a Lia continua
 * respondendo por cima do humano que acabou de assumir. Foi o que aconteceu em
 * produção em 09/08/2026: nenhuma linha de ADR 035 no log, porque o webhook para
 * mensagens de saída nunca existiu.
 *
 * Estes testes existem porque `message.any` PARECE redundante ao lado de
 * `message` — é exatamente o tipo de linha que alguém remove numa limpeza.
 */
describe('WahaBootstrapService — eventos do webhook', () => {
  const OLD_ENV = process.env;
  let fetchMock: ReturnType<typeof vi.fn>;

  const sessaoCom = (webhooks: any[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ config: { webhooks } }),
  });

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      WAHA_API_URL: 'http://waha:3000',
      WAHA_API_KEY: 'k',
      WAHA_SESSION: 'default',
      WAHA_WEBHOOK_TOKEN: 'tok',
      NEXA_PUBLIC_URL: 'https://app.exemplo.com',
    };
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Eventos enviados no PUT de atualização da sessão. */
  const eventosRegistrados = () => {
    const put = fetchMock.mock.calls.find(([, init]: any[]) => init?.method === 'PUT');
    const body = JSON.parse((put as any)[1].body);
    const nosso = body.config.webhooks.find((w: any) => String(w.url).includes('/api/webhooks/waha'));
    return nosso.events as string[];
  };

  it('assina message.any — sem ele o takeover pelo WhatsApp Web não existe', async () => {
    fetchMock.mockResolvedValueOnce(sessaoCom([])).mockResolvedValueOnce({ ok: true, status: 200 });

    await new WahaBootstrapService().onApplicationBootstrap();

    expect(eventosRegistrados()).toContain('message.any');
  });

  it('mantém message — `message.any` não substitui o caminho de entrada', async () => {
    fetchMock.mockResolvedValueOnce(sessaoCom([])).mockResolvedValueOnce({ ok: true, status: 200 });

    await new WahaBootstrapService().onApplicationBootstrap();

    const eventos = eventosRegistrados();
    expect(eventos).toContain('message');
    expect(eventos).toContain('message.ack');
    expect(eventos).toContain('session.status');
  });

  // Caminho de atualização: produção já tinha um webhook registrado SEM
  // `message.any`. Se o bootstrap considerasse esse registro suficiente, o
  // conserto nunca chegaria lá — o webhook só é reescrito quando falta evento.
  it('re-registra um webhook antigo a que falta message.any', async () => {
    fetchMock
      .mockResolvedValueOnce(
        sessaoCom([
          {
            url: 'https://app.exemplo.com/api/webhooks/waha?token=tok',
            events: ['message', 'message.ack', 'session.status'],
          },
        ]),
      )
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await new WahaBootstrapService().onApplicationBootstrap();

    const put = fetchMock.mock.calls.find(([, init]: any[]) => init?.method === 'PUT');
    expect(put, 'webhook antigo deveria ter sido reescrito').toBeTruthy();
    expect(eventosRegistrados()).toContain('message.any');
  });

  it('não reescreve quando já está tudo registrado', async () => {
    fetchMock.mockResolvedValueOnce(
      sessaoCom([
        {
          url: 'https://app.exemplo.com/api/webhooks/waha?token=tok',
          events: ['message', 'message.any', 'message.ack', 'session.status'],
        },
      ]),
    );

    await new WahaBootstrapService().onApplicationBootstrap();

    expect(fetchMock.mock.calls.some(([, init]: any[]) => init?.method === 'PUT')).toBe(false);
  });
});
