import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonitorDispatchService } from './monitor-dispatch.service';

function makePrisma() {
  return { notificationLog: { create: vi.fn().mockResolvedValue({}) } } as any;
}

describe('MonitorDispatchService — fila com retry e rate-limit (A4)', () => {
  let prisma: any;
  let channel: any;
  let svc: MonitorDispatchService;

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = makePrisma();
    channel = { sendTo: vi.fn().mockResolvedValue({ sent: true }) };
    svc = new MonitorDispatchService(prisma, channel);
  });

  afterEach(() => {
    svc.onModuleDestroy();
    vi.useRealTimers();
    delete process.env.DISPATCH_MAX_PER_MINUTE;
  });

  it('envia job enfileirado e loga sucesso', async () => {
    svc.enqueue({ tenantId: 't1', to: '5511999999999', message: 'oi' });
    await vi.advanceTimersByTimeAsync(2_100);

    expect(channel.sendTo).toHaveBeenCalledWith('t1', '5511999999999', 'oi');
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true, channel: 'whatsapp' }) }),
    );
    expect(svc.pending).toBe(0);
  });

  it('falha → re-enfileira com backoff e só desiste após maxAttempts (log de erro)', async () => {
    channel.sendTo.mockResolvedValue({ sent: false, reason: 'boom' });
    svc.enqueue({ tenantId: 't1', to: '5511999999999', message: 'oi' });

    // tentativa 1 (imediata)
    await vi.advanceTimersByTimeAsync(2_100);
    expect(channel.sendTo).toHaveBeenCalledTimes(1);
    expect(svc.pending).toBe(1); // aguardando backoff de 30s

    // tentativa 2 (após 30s)
    await vi.advanceTimersByTimeAsync(31_000);
    expect(channel.sendTo).toHaveBeenCalledTimes(2);

    // tentativa 3 (após +2min) → desiste e loga falha
    await vi.advanceTimersByTimeAsync(121_000);
    expect(channel.sendTo).toHaveBeenCalledTimes(3);
    expect(svc.pending).toBe(0);
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false, error: 'boom' }) }),
    );
  });

  it('respeita o rate-limit por minuto', async () => {
    process.env.DISPATCH_MAX_PER_MINUTE = '2';
    for (let i = 0; i < 5; i++) {
      svc.enqueue({ tenantId: 't1', to: `551199999990${i}`, message: 'oi' });
    }

    await vi.advanceTimersByTimeAsync(2_100);
    expect(channel.sendTo).toHaveBeenCalledTimes(2); // teto da janela
    expect(svc.pending).toBe(3);

    // Próxima janela de 1 min libera mais 2
    await vi.advanceTimersByTimeAsync(60_000);
    expect(channel.sendTo).toHaveBeenCalledTimes(4);
  });

  it('jitter adia o envio (notBefore no futuro)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    svc.enqueue({ tenantId: 't1', to: '5511999999999', message: 'oi' }, 120_000);

    await vi.advanceTimersByTimeAsync(2_100);
    expect(channel.sendTo).not.toHaveBeenCalled(); // ainda dentro do jitter (~119s)

    await vi.advanceTimersByTimeAsync(120_000);
    expect(channel.sendTo).toHaveBeenCalledTimes(1);
  });
});
