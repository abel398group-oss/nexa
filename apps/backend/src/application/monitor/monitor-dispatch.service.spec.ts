import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonitorDispatchService } from './monitor-dispatch.service';

function makePrisma(contacts: any[] | null = null) {
  return {
    notificationLog: { create: vi.fn().mockResolvedValue({}) },
    tenantNotificationConfig: {
      findUnique: vi.fn().mockResolvedValue(contacts === null ? null : { contacts }),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
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

  // ── Rastreio de falha por contato (2026-07-20) ─────────────────────────────
  // Falha DEFINITIVA grava contacts[].lastSendFailure; sucesso limpa o selo.

  describe('lastSendFailure por contato', () => {
    it('falha definitiva grava o selo no contato dono do número', async () => {
      const contacts = [
        { id: 'c1', whatsapp: '5511999999999', emails: [], sectors: ['fiscal'], sendTimes: [], sendDays: [] },
        { id: 'c2', whatsapp: '5511888888888', emails: [], sectors: ['fiscal'], sendTimes: [], sendDays: [] },
      ];
      prisma = makePrisma(contacts);
      channel = { sendTo: vi.fn().mockResolvedValue({ sent: false, reason: 'numero invalido' }) };
      svc.onModuleDestroy();
      svc = new MonitorDispatchService(prisma, channel);

      svc.enqueue({ tenantId: 't1', to: '5511999999999', message: 'oi' });
      // 3 tentativas: imediata + 30s + 2min
      await vi.advanceTimersByTimeAsync(2_100);
      await vi.advanceTimersByTimeAsync(31_000);
      await vi.advanceTimersByTimeAsync(121_000);

      expect(prisma.tenantNotificationConfig.update).toHaveBeenCalledOnce();
      const saved = prisma.tenantNotificationConfig.update.mock.calls[0][0].data.contacts;
      const c1 = saved.find((c: any) => c.id === 'c1');
      const c2 = saved.find((c: any) => c.id === 'c2');
      expect(c1.lastSendFailure?.reason).toBe('numero invalido');
      expect(c1.lastSendFailure?.at).toBeTruthy();
      expect(c2.lastSendFailure).toBeUndefined(); // outro contato intacto
    });

    it('sucesso limpa o selo de falha existente', async () => {
      const contacts = [
        {
          id: 'c1', whatsapp: '5511999999999', emails: [], sectors: ['fiscal'], sendTimes: [], sendDays: [],
          lastSendFailure: { at: '2026-07-19T08:00:00Z', reason: 'waha_down' },
        },
      ];
      prisma = makePrisma(contacts);
      channel = { sendTo: vi.fn().mockResolvedValue({ sent: true }) };
      svc.onModuleDestroy();
      svc = new MonitorDispatchService(prisma, channel);

      svc.enqueue({ tenantId: 't1', to: '5511999999999', message: 'oi' });
      await vi.advanceTimersByTimeAsync(2_100);

      expect(prisma.tenantNotificationConfig.update).toHaveBeenCalledOnce();
      const saved = prisma.tenantNotificationConfig.update.mock.calls[0][0].data.contacts;
      expect(saved[0].lastSendFailure).toBeNull();
    });

    it('sucesso SEM selo prévio não grava nada (evita write à toa)', async () => {
      const contacts = [
        { id: 'c1', whatsapp: '5511999999999', emails: [], sectors: ['fiscal'], sendTimes: [], sendDays: [] },
      ];
      prisma = makePrisma(contacts);
      channel = { sendTo: vi.fn().mockResolvedValue({ sent: true }) };
      svc.onModuleDestroy();
      svc = new MonitorDispatchService(prisma, channel);

      svc.enqueue({ tenantId: 't1', to: '5511999999999', message: 'oi' });
      await vi.advanceTimersByTimeAsync(2_100);
      expect(prisma.tenantNotificationConfig.update).not.toHaveBeenCalled();
    });

    it('número sem contato correspondente (adminPhone legado) → ignora sem erro', async () => {
      prisma = makePrisma([]); // config sem contatos
      channel = { sendTo: vi.fn().mockResolvedValue({ sent: false, reason: 'boom' }) };
      svc.onModuleDestroy();
      svc = new MonitorDispatchService(prisma, channel);

      svc.enqueue({ tenantId: 't1', to: '5511999999999', message: 'oi' });
      await vi.advanceTimersByTimeAsync(2_100);
      await vi.advanceTimersByTimeAsync(31_000);
      await vi.advanceTimersByTimeAsync(121_000);
      expect(prisma.tenantNotificationConfig.update).not.toHaveBeenCalled();
      expect(svc.pending).toBe(0);
    });
  });
});
