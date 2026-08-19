import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScraperAlertService, ScraperSuspect } from './scraper-alert.service';

// ─── ScraperAlertService — relatório de raspagem do TMS → alerta do admin ────

function makeService(opts: { acquire?: (key: string) => unknown } = {}) {
  const notifyAdmin = vi.fn().mockResolvedValue({ whatsapp: true, email: true });
  const alerta = { notifyAdmin } as any;
  // Por padrão o lock sempre concede — cada IP é "novo".
  const acquire = vi.fn(async (key: string) => (opts.acquire ? opts.acquire(key) : async () => {}));
  const lock = { acquire } as any;
  return { svc: new ScraperAlertService(alerta, lock), notifyAdmin, acquire };
}

const suspeito = (over: Partial<ScraperSuspect> = {}): ScraperSuspect => ({
  ip: '203.0.113.7',
  hits: 12_480,
  peakRpm: 310,
  userAgent: 'python-requests/2.31',
  fetchedCss: false,
  ...over,
});

describe('ScraperAlertService.report', () => {
  beforeEach(() => {
    delete process.env.SCRAPER_ALERT_THROTTLE_H;
  });

  it('avisa o admin e devolve os canais que entregaram', async () => {
    const { svc, notifyAdmin } = makeService();

    const r = await svc.report({ site: 'x/transportadoras', suspects: [suspeito()] });

    expect(r).toMatchObject({ received: 1, alerted: 1, throttled: 0, dryRun: false });
    expect(r.channels).toEqual({ whatsapp: true, email: true });
    expect(notifyAdmin).toHaveBeenCalledOnce();
    const [assunto, corpo] = notifyAdmin.mock.calls[0];
    expect(assunto).toContain('Suspeita de raspagem');
    expect(corpo).toContain('203.0.113.7');
  });

  it('CSS ausente é "não apurado", nunca tratado como se o robô não tivesse baixado', async () => {
    const { svc, notifyAdmin } = makeService();

    await svc.report({ site: 's', suspects: [suspeito({ fetchedCss: undefined })] });

    const corpo = notifyAdmin.mock.calls[0][1] as string;
    expect(corpo).toContain('CSS: não apurado');
    expect(corpo).not.toContain('sinal forte');
  });

  it('CSS ausente no download é destacado como o sinal mais forte', async () => {
    const { svc, notifyAdmin } = makeService();

    await svc.report({ site: 's', suspects: [suspeito({ fetchedCss: false })] });

    expect(notifyAdmin.mock.calls[0][1]).toContain('NÃO baixou o CSS');
  });

  it('IP já avisado dentro da janela é calado, e a omissão é dita na mensagem', async () => {
    // O lock nega o IP repetido (chave já existe) e concede o novo.
    const { svc, notifyAdmin } = makeService({
      acquire: (key) => (key.includes('203.0.113.7') ? null : async () => {}),
    });

    const r = await svc.report({
      site: 's',
      suspects: [suspeito(), suspeito({ ip: '198.51.100.9', hits: 900 })],
    });

    expect(r).toMatchObject({ received: 2, alerted: 1, throttled: 1 });
    const corpo = notifyAdmin.mock.calls[0][1] as string;
    expect(corpo).toContain('198.51.100.9');
    expect(corpo).toContain('1 IP(s) já avisados recentemente foram omitidos.');
  });

  it('todos calados pelo ritmo => nenhuma mensagem sai', async () => {
    const { svc, notifyAdmin } = makeService({ acquire: () => null });

    const r = await svc.report({ site: 's', suspects: [suspeito()] });

    expect(r).toMatchObject({ alerted: 0, throttled: 1, channels: null });
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('severity critical fura o ritmo — é o aviso fora da cadência', async () => {
    const { svc, notifyAdmin, acquire } = makeService({ acquire: () => null });

    const r = await svc.report({ site: 's', severity: 'critical', suspects: [suspeito()] });

    expect(r.alerted).toBe(1);
    expect(acquire).not.toHaveBeenCalled();
    expect(notifyAdmin.mock.calls[0][0]).toContain('Raspagem em curso');
    expect(notifyAdmin.mock.calls[0][2]).toEqual({ icon: '🚨' });
  });

  it('dryRun devolve o texto e NÃO consome o ritmo por IP', async () => {
    const { svc, notifyAdmin, acquire } = makeService();

    const r = await svc.report({ site: 's', dryRun: true, suspects: [suspeito()] });

    expect(r).toMatchObject({ dryRun: true, alerted: 1, channels: null });
    expect(r.preview).toContain('203.0.113.7');
    expect(acquire).not.toHaveBeenCalled();
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('ordena por volume e diz quantos ficaram de fora da mensagem', async () => {
    const { svc, notifyAdmin } = makeService();
    const muitos = Array.from({ length: 12 }, (_, i) =>
      suspeito({ ip: `10.0.0.${i}`, hits: (i + 1) * 100 }),
    );

    const r = await svc.report({ site: 's', suspects: muitos });

    expect(r.alerted).toBe(12);
    const corpo = notifyAdmin.mock.calls[0][1] as string;
    expect(corpo).toContain('1. 10.0.0.11'); // maior volume primeiro
    expect(corpo).toContain('+2 suspeito(s) não listados aqui');
  });

  it('SCRAPER_ALERT_THROTTLE_H inválido cai no padrão de 6h em vez de virar TTL zero', async () => {
    process.env.SCRAPER_ALERT_THROTTLE_H = 'abc';
    const { svc, acquire } = makeService();

    await svc.report({ site: 's', suspects: [suspeito()] });

    expect(acquire).toHaveBeenCalledWith('nexa:scraper-alert:s:203.0.113.7', 6 * 3600);
  });
});
