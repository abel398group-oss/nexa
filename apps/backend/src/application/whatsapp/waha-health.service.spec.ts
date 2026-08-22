import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WahaHealthService } from './waha-health.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';

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
function makeService(opts: { lock?: any } = {}) {
  // WahaClient REAL (lê env a cada chamada): desde o monitor por linha
  // (21/08/2026) o health resolve alvo/linhas por ele — mockar de novo aqui
  // seria testar o mock. `sendText` continua mockado: alerta não sai em teste.
  const waha: any = new WahaClientService();
  waha.sendText = vi.fn().mockResolvedValue({ sent: true });
  const svc: any = new WahaHealthService(
    { tenant: { findMany: vi.fn().mockResolvedValue([]) }, emailChannel: { findFirst: vi.fn().mockResolvedValue(null) } } as any,
    { create: vi.fn() } as any,
    waha,
    { decrypt: vi.fn() } as any,
    opts.lock,
  );
  svc['logger'] = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return svc;
}

/** Conta quantos alertas "FORA DO AR" saíram (o alert() dispara os 3 canais). */
function alertasDeQueda(svc: any): string[] {
  return svc.alert.mock.calls.map((c: any[]) => String(c[0])).filter((t: string) => t.includes('FORA DO AR'));
}

describe('WahaHealthService — prazo das chamadas ao WAHA', () => {
  let fetchOriginal: typeof global.fetch;

  beforeEach(() => {
    fetchOriginal = global.fetch;
    process.env.WAHA_API_URL = 'http://waha.local';
    process.env.WAHA_API_KEY = 'k';
    process.env.WAHA_SESSION = 'default';
    delete process.env.WAHA_LINHAS;
    delete process.env.WAHA_VENDAS_API_URL;
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

  // A linha `vendas` podia cair e ficar caída para sempre — o monitor só olhava a
  // principal. Agora cada linha declarada E configurada entra no ciclo.
  it('com WAHA_LINHAS a checagem cobre cada linha configurada', async () => {
    process.env.WAHA_LINHAS = 'vendas';
    process.env.WAHA_VENDAS_API_URL = 'http://waha-vendas.local';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'WORKING' }) });
    global.fetch = fetchMock as any;

    const svc = makeService();
    await svc.healthCheck();

    const urls = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls).toContain('http://waha.local/api/sessions/default');
    expect(urls).toContain('http://waha-vendas.local/api/sessions/default');
  });

  it('linha declarada mas SEM env fica fora do ciclo (não monitora a principal duas vezes)', async () => {
    process.env.WAHA_LINHAS = 'vendas'; // sem WAHA_VENDAS_API_URL
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'WORKING' }) });
    global.fetch = fetchMock as any;

    const svc = makeService();
    await svc.healthCheck();

    expect(fetchMock).toHaveBeenCalledTimes(1); // só a principal
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

/**
 * O ruído observado em produção em 22/08/2026: a linha vendas caiu de manhã e o
 * mesmo aviso chegou às 07:29, 08:02 e 08:22 no WhatsApp do Abel. O terceiro
 * furou o intervalo de 30 min porque um deploy às 08:16 recriou o container e
 * apagou o mapa em memória — e, como todo push para a master reimplanta, uma
 * linha caída repetia o aviso a cada deploy do dia.
 */
describe('WahaHealthService — o aviso de queda não vira enxurrada', () => {
  let fetchOriginal: typeof global.fetch;

  /** Sessão inexistente: é o 404 real que a linha vendas devolvia. */
  function wahaFora() {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
  }

  function svcCaido(lock?: any) {
    const svc = makeService({ lock });
    svc['sleep'] = () => Promise.resolve(); // o ciclo real espera 6×5s antes de desistir
    svc.alert = vi.fn().mockResolvedValue(undefined);
    return svc;
  }

  beforeEach(() => {
    fetchOriginal = global.fetch;
    process.env.WAHA_API_URL = 'http://waha.local';
    process.env.WAHA_API_KEY = 'k';
    delete process.env.WAHA_LINHAS;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T07:29:00-03:00'));
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    vi.useRealTimers();
  });

  it('a primeira queda avisa na hora', async () => {
    wahaFora();
    const svc = svcCaido();

    await svc.healthCheck();

    expect(alertasDeQueda(svc)).toHaveLength(1);
  });

  it('o intervalo ESCALONA: 30 min, 1h, 2h, 4h — não um aviso a cada 30 min', async () => {
    wahaFora();
    const svc = svcCaido();

    await svc.healthCheck();                       // 1º aviso (07:29)
    vi.advanceTimersByTime(31 * 60_000);
    await svc.healthCheck();                       // 2º (passou dos 30 min)
    expect(alertasDeQueda(svc)).toHaveLength(2);

    // Agora a espera é de 1h: 31 min NÃO bastam mais.
    vi.advanceTimersByTime(31 * 60_000);
    await svc.healthCheck();
    expect(alertasDeQueda(svc)).toHaveLength(2);

    vi.advanceTimersByTime(31 * 60_000);           // total 62 min desde o 2º
    await svc.healthCheck();
    expect(alertasDeQueda(svc)).toHaveLength(3);

    // ...e agora 2h. Em 4h de queda saíram 3 avisos, não 8.
    vi.advanceTimersByTime(61 * 60_000);
    await svc.healthCheck();
    expect(alertasDeQueda(svc)).toHaveLength(3);
  });

  it('a chave no Redis segura o aviso quando o deploy apaga a memória', async () => {
    wahaFora();
    // Redis real devolve null quando a chave já existe (SET NX falhou).
    const lock = { acquire: vi.fn().mockResolvedValue(null) };
    const svc = svcCaido(lock); // processo NOVO, mapa em memória vazio

    await svc.healthCheck();

    expect(alertasDeQueda(svc)).toHaveLength(0);
    expect(lock.acquire).toHaveBeenCalledWith('alert:waha-down:principal', 30 * 60);
  });

  it('sem Redis o aviso sai igual (dev/instância única não fica mudo)', async () => {
    wahaFora();
    const svc = svcCaido(undefined);

    await svc.healthCheck();

    expect(alertasDeQueda(svc)).toHaveLength(1);
  });

  it('a linha que volta zera o escalonamento — a próxima queda avisa na hora', async () => {
    wahaFora();
    const svc = svcCaido();
    await svc.healthCheck();
    vi.advanceTimersByTime(31 * 60_000);
    await svc.healthCheck();                       // 2 avisos, espera agora em 1h

    // Voltou.
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'WORKING' }) }) as any;
    await svc.healthCheck();

    // Caiu de novo 10 min depois: avisa imediatamente, sem herdar a espera longa.
    wahaFora();
    vi.advanceTimersByTime(10 * 60_000);
    await svc.healthCheck();

    expect(alertasDeQueda(svc)).toHaveLength(3);
  });

  // 404 = a sessão não existe naquele WAHA (volume novo, nunca pareado). O
  // `/start` do auto-restart responde 404 pelo mesmo motivo, então "verifique o
  // WAHA" manda o leitor procurar no lugar errado.
  it('404 explica que falta parear, em vez de mandar verificar o WAHA', async () => {
    wahaFora();
    const svc = svcCaido();

    await svc.healthCheck();

    const corpo = String(svc.alert.mock.calls[0][1]);
    expect(corpo).toContain('nunca foi pareado');
    expect(corpo).toContain('QR');
  });
});
