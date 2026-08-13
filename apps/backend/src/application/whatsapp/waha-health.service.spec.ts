import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WahaHealthService } from './waha-health.service';

/**
 * O bug que estes testes travam (13/08/2026): este serviço era o ÚNICO lugar
 * que falava com o WAHA sem timeout. WAHA travado — aceitando a conexão e nunca
 * respondendo, que é o comportamento típico do container sobrecarregado — deixava
 * o `fetch` pendurado para sempre.
 *
 * O estrago não era a espera em si: `healthCheck` marca `this.checking = true` e
 * só devolve para false no `finally`. Com o fetch pendurado o `finally` nunca
 * roda, e TODO healthCheck seguinte volta na primeira linha. O monitor da sessão
 * do WhatsApp morria calado até alguém reiniciar o backend — sem auto-restart e
 * sem o alerta "WhatsApp FORA DO AR", justamente quando ele é necessário.
 */
function makeService() {
  const svc: any = new WahaHealthService(
    { tenant: { findMany: vi.fn().mockResolvedValue([]) }, emailChannel: { findFirst: vi.fn().mockResolvedValue(null) } } as any,
    { create: vi.fn() } as any,
    { sendText: vi.fn().mockResolvedValue({ sent: true }) } as any,
    { decrypt: vi.fn() } as any,
  );
  svc['logger'] = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return svc;
}

describe('WahaHealthService — prazo das chamadas ao WAHA', () => {
  let fetchOriginal: typeof global.fetch;

  beforeEach(() => {
    fetchOriginal = global.fetch;
    process.env.WAHA_API_URL = 'http://waha.local';
    process.env.WAHA_API_KEY = 'k';
    process.env.WAHA_SESSION = 'default';
    delete process.env.ALERT_ADMIN_PHONE;
    delete process.env.ALERT_ADMIN_EMAIL;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('a leitura de status manda um AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'WORKING' }) });
    global.fetch = fetchMock as any;

    const svc = makeService();
    expect(await svc.getStatus()).toBe('WORKING');

    const opts = fetchMock.mock.calls[0][1];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('o religar da sessão também manda um AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock as any;

    const svc = makeService();
    expect(await svc.tryStart()).toBe(true);

    const opts = fetchMock.mock.calls[0][1];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  // O ponto todo: prazo estourado tem que virar 'UNREACHABLE', não exceção. Do
  // ponto de vista de quem lê o painel, WAHA travado e WAHA fora do ar são a
  // mesma notícia — a Lia não está atendendo.
  it('prazo estourado vira UNREACHABLE, não exceção', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    ) as any;

    const svc = makeService();
    await expect(svc.getStatus()).resolves.toBe('UNREACHABLE');
  });

  // A consequência real do bug: se getStatus pendurasse, `checking` ficava true
  // para sempre e o monitor não rodava mais. Com o prazo, o finally sempre roda.
  it('healthCheck devolve o flag `checking` mesmo quando o WAHA falha', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout')) as any;

    const svc = makeService();
    // O ciclo real espera 6×5s antes de desistir; aqui só interessa o `finally`.
    svc['sleep'] = () => Promise.resolve();
    await svc.healthCheck();

    expect(svc['checking']).toBe(false);

    // E o próximo ciclo precisa REALMENTE rodar — era isto que parava de
    // acontecer quando o flag ficava preso.
    (global.fetch as any).mockClear();
    await svc.healthCheck();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('o painel responde mesmo com o WAHA fora — não fica pendurado', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const svc = makeService();
    const r = await svc.getHealth();

    expect(r.status).toBe('UNREACHABLE');
    expect(r.connected).toBe(false);
    expect(r.configured).toBe(true);
  });

  it('sem WAHA configurado nem chega a chamar a rede', async () => {
    delete process.env.WAHA_API_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    const svc = makeService();
    const r = await svc.getHealth();

    expect(r.status).toBe('NOT_CONFIGURED');
    expect(r.configured).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('o caminho feliz continua igual', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'WORKING' }) }) as any;

    const svc = makeService();
    const r = await svc.getHealth();

    expect(r.status).toBe('WORKING');
    expect(r.connected).toBe(true);
    expect(r.downSince).toBeNull();
  });
});
