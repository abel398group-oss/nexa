import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageviewRetentionCron } from './pageview-retention.cron';

// ─── Expurgo de retenção da page_views (LGPD) ───────────────────────────────

function makeCron(opts: { execRaw?: () => Promise<number>; count?: number; semLock?: boolean } = {}) {
  const executeRaw = vi.fn(opts.execRaw ?? (async () => 0));
  const count = vi.fn(async () => opts.count ?? 0);
  const prisma = { $executeRaw: executeRaw, pageView: { count } } as any;
  const release = vi.fn(async () => {});
  const acquire = vi.fn(async () => (opts.semLock ? null : release));
  const lock = { acquire } as any;
  const cron = new PageviewRetentionCron(prisma, lock);
  return { cron, executeRaw, count, acquire, release };
}

describe('PageviewRetentionCron', () => {
  beforeEach(() => {
    delete process.env.PAGEVIEW_RETENTION_ENABLED;
    delete process.env.PAGEVIEW_IP_RETENTION_DAYS;
    delete process.env.PAGEVIEW_ROW_RETENTION_DAYS;
  });

  it('nasce DESLIGADO — sem a env, não escreve e nem pega o lock', async () => {
    const { cron, executeRaw, acquire } = makeCron();

    await cron.executar();

    expect(acquire).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it.each(['1', 'sim', 'yes', 'on', ''])(
    'valor "%s" NÃO liga a rotina — só a palavra exata "true"',
    async (valor) => {
      process.env.PAGEVIEW_RETENTION_ENABLED = valor;
      const { cron, executeRaw } = makeCron();

      await cron.executar();

      expect(executeRaw).not.toHaveBeenCalled();
    },
  );

  it('"TRUE " com espaço e maiúscula liga (trim + lowercase)', async () => {
    process.env.PAGEVIEW_RETENTION_ENABLED = 'True';
    const { cron, executeRaw } = makeCron();

    await cron.executar();

    expect(executeRaw).toHaveBeenCalled();
  });

  it('modo dry conta e loga, mas não escreve nada', async () => {
    process.env.PAGEVIEW_RETENTION_ENABLED = 'dry';
    const { cron, executeRaw, count } = makeCron({ count: 42 });

    await cron.executar();

    expect(count).toHaveBeenCalledTimes(2); // ips + linhas
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('ligado: anula IPs e apaga linhas', async () => {
    process.env.PAGEVIEW_RETENTION_ENABLED = 'true';
    const { cron, executeRaw } = makeCron({ execRaw: async () => 7 });

    await cron.executar();

    // Um lote de cada (7 < LOTE, então o laço encerra na primeira volta).
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('repete o lote enquanto vier cheio, sem laço infinito', async () => {
    process.env.PAGEVIEW_RETENTION_ENABLED = 'true';
    // 2 lotes cheios e depois um parcial, para cada uma das duas operações.
    const seq = [5000, 5000, 10, 5000, 3];
    let i = 0;
    const { cron, executeRaw } = makeCron({ execRaw: async () => seq[i++] ?? 0 });

    await cron.executar();

    expect(executeRaw).toHaveBeenCalledTimes(5);
  });

  it('outra instância segurando o lock => não faz nada', async () => {
    process.env.PAGEVIEW_RETENTION_ENABLED = 'true';
    const { cron, executeRaw } = makeCron({ semLock: true });

    await cron.executar();

    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('prazo inválido cai no padrão em vez de apagar tudo', async () => {
    process.env.PAGEVIEW_RETENTION_ENABLED = 'dry';
    process.env.PAGEVIEW_IP_RETENTION_DAYS = '0'; // apagaria até o de hoje
    const { cron, count } = makeCron();

    await cron.executar();

    const corte = (count.mock.calls[0][0] as any).where.createdAt.lt as Date;
    const dias = Math.round((Date.now() - corte.getTime()) / 86_400_000);
    expect(dias).toBe(30); // padrão, não 0
  });

  it('solta o lock mesmo quando a query explode, e loga o erro', async () => {
    process.env.PAGEVIEW_RETENTION_ENABLED = 'true';
    const { cron, release } = makeCron({
      execRaw: async () => {
        throw new Error('conexão caiu');
      },
    });
    const erro = vi.spyOn((cron as any).logger, 'error').mockImplementation(() => {});

    await expect(cron.executar()).resolves.toBeUndefined();

    expect(release).toHaveBeenCalled();
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('conexão caiu'));
  });
});
