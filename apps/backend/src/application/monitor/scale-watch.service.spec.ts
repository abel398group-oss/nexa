import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScaleWatchService } from './scale-watch.service';

// ─── Termômetro de gargalos (docs/infra/monitoramento-gargalos-2026-07.md) ───
// Mede DB/fila/alertas-hora, classifica green/yellow e avisa o admin 1x/dia.

function makeService(opts: {
  dbUsed?: number;
  dbMax?: number;
  queue?: number;
  alerts?: number;
} = {}) {
  const prisma = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([
      { used: BigInt(opts.dbUsed ?? 3), max: String(opts.dbMax ?? 25) },
    ]),
    notificationLog: { count: vi.fn().mockResolvedValue(opts.alerts ?? 0) },
  } as any;
  const dispatch = { pending: opts.queue ?? 0 } as any;
  const adminAlert = { notifyAdmin: vi.fn().mockResolvedValue({ whatsapp: true, email: true }) } as any;
  const svc = new ScaleWatchService(prisma, dispatch, adminAlert);
  return { svc, prisma, dispatch, adminAlert };
}

describe('ScaleWatchService.snapshot', () => {
  it('tudo baixo → todos green, overall green', async () => {
    const { svc } = makeService({ dbUsed: 3, dbMax: 25, queue: 0, alerts: 0 });
    const snap = await svc.snapshot();
    expect(snap.db.level).toBe('green');
    expect(snap.dispatchQueue.level).toBe('green');
    expect(snap.alertsLastHour.level).toBe('green');
    expect(snap.overall).toBe('green');
  });

  it('conexões ≥ 70% do max → db amarelo e overall amarelo', async () => {
    const { svc } = makeService({ dbUsed: 18, dbMax: 25 }); // 72%
    const snap = await svc.snapshot();
    expect(snap.db.pct).toBe(72);
    expect(snap.db.level).toBe('yellow');
    expect(snap.overall).toBe('yellow');
  });

  it('fila ≥ limiar (50) → dispatchQueue amarelo', async () => {
    const { svc } = makeService({ queue: 50 });
    const snap = await svc.snapshot();
    expect(snap.dispatchQueue.level).toBe('yellow');
  });

  it('erro no banco → degrada pra 0/0 sem quebrar', async () => {
    const { svc, prisma } = makeService();
    prisma.$queryRawUnsafe.mockRejectedValue(new Error('db down'));
    const snap = await svc.snapshot();
    expect(snap.db.value).toBe(0);
    expect(snap.db.level).toBe('green'); // sem max não classifica amarelo
    expect(snap.overall).toBe('green');
  });
});

describe('ScaleWatchService.tick — aviso ao admin', () => {
  const orig = { phone: process.env.ALERT_ADMIN_PHONE, enabled: process.env.SCALE_WATCH_ENABLED };
  beforeEach(() => {
    process.env.ALERT_ADMIN_PHONE = '5511999990001';
    process.env.SCALE_WATCH_ENABLED = 'true';
  });
  afterEach(() => {
    process.env.ALERT_ADMIN_PHONE = orig.phone;
    process.env.SCALE_WATCH_ENABLED = orig.enabled;
  });

  it('overall green → NÃO avisa', async () => {
    const { svc, adminAlert } = makeService({ dbUsed: 3, dbMax: 25 });
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('amarelo → avisa o admin uma vez (2 canais), com o link do doc certo', async () => {
    const { svc, adminAlert } = makeService({ dbUsed: 20, dbMax: 25 }); // 80%
    await svc.tick();
    expect(adminAlert.notifyAdmin).toHaveBeenCalledOnce();
    const [, body] = adminAlert.notifyAdmin.mock.calls[0];
    expect(body).toContain('20/25');
    expect(body).toContain('docs/infra/item1');
  });

  it('dedup: 2 ticks no mesmo dia = 1 aviso só', async () => {
    const { svc, adminAlert } = makeService({ dbUsed: 20, dbMax: 25 });
    await svc.tick();
    await svc.tick();
    expect(adminAlert.notifyAdmin).toHaveBeenCalledOnce();
  });

  it('SCALE_WATCH_ENABLED=false → nem mede nem avisa', async () => {
    process.env.SCALE_WATCH_ENABLED = 'false';
    const { svc, adminAlert, prisma } = makeService({ dbUsed: 24, dbMax: 25 });
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('amarelo mas nenhum canal configurado → só loga, não quebra', async () => {
    const { svc, adminAlert } = makeService({ dbUsed: 24, dbMax: 25 });
    adminAlert.notifyAdmin.mockResolvedValue({ whatsapp: false, email: false });
    await expect(svc.tick()).resolves.toBeUndefined();
  });
});
