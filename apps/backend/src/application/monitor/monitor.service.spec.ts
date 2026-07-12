import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonitorService } from './monitor.service';
import type { TmsProactivityEvent } from '@/application/connectors/hipertms.connector';

// ─── MonitorService — G2/G3/G4 ───────────────────────────────────────────────
// G2: buildAlertMessage cap 10 + overflow note
// G3: destinatario por setor (recipients whatsapp) > sector.phone > adminPhone
// G4: immediateSeverity filtra eventos antes de enviar

function makeEvent(
  overrides: Partial<TmsProactivityEvent> & { id?: string } = {},
): TmsProactivityEvent {
  return {
    id: overrides.id ?? 'evt-1',
    severity: 'CRITICAL',
    category: 'finance',
    title: 'Conta vencida',
    adminPhone: '5511900000001',
    adminName: 'Abel',
    companyName: 'HiperTMS',
    ...overrides,
  };
}

function makeService(configOverrides: Record<string, any> = {}) {
  const config = {
    enabled: true,
    sendHour: 8,
    sendMinute: 0,
    sendWeekends: false,
    fiscalEnabled: true,
    logisticEnabled: true,
    frotaEnabled: true,
    financeEnabled: true,
    sectorConfig: null,
    immediateSeverity: 'CRITICAL',
    monitorOverride: false,
    ...configOverrides,
  };

  const prisma = {
    tenant: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    alertState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    tenantNotificationConfig: {
      findUnique: vi.fn().mockResolvedValue(config),
    },
  } as any;

  const channel = { sendTo: vi.fn().mockResolvedValue({ sent: true }) } as any;
  const tms = {} as any;

  const svc = new MonitorService(prisma, tms, channel);
  return { svc, prisma, channel, config };
}

// ─── G2: buildAlertMessage cap ───────────────────────────────────────────────

describe('MonitorService.buildAlertMessage — G2 cap 10', () => {
  it('mostra todos os eventos quando <= 10', () => {
    const { svc } = makeService();
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ id: `e${i}`, title: `Alerta ${i}`, severity: 'CRITICAL' }),
    );
    const msg = svc.buildAlertMessage(events);
    expect(msg).toContain('5 alertas');
    expect(msg).not.toContain('e mais');
    expect(msg).toContain('Acesse o sistema');
  });

  it('mostra top 10 e nota de overflow quando > 10', () => {
    const { svc } = makeService();
    const events = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ id: `e${i}`, title: `Alerta ${i}`, severity: 'OVERDUE' }),
    );
    const msg = svc.buildAlertMessage(events);
    expect(msg).toContain('15 alertas');
    expect(msg).toContain('e mais 5 pendência(s), veja o painel');
    expect(msg).not.toContain('Acesse o sistema');
    // so 10 linhas de alerta exibidas (nao e exato mas checa que nao lista tudo)
    const alertLines = (msg.match(/🔴|🟠|🟡|🔵|⚪/g) ?? []).length;
    expect(alertLines).toBe(10);
  });

  it('ordena CRITICAL primeiro mesmo que chegue em ordem inversa', () => {
    const { svc } = makeService();
    const events = [
      makeEvent({ id: 'e1', severity: 'INFO',     title: 'Info' }),
      makeEvent({ id: 'e2', severity: 'CRITICAL',  title: 'Critico' }),
      makeEvent({ id: 'e3', severity: 'DUE_SOON', title: 'DueSoon' }),
    ];
    const msg = svc.buildAlertMessage(events);
    const critiIdx = msg.indexOf('Critico');
    const infoIdx  = msg.indexOf('Info');
    const dueIdx   = msg.indexOf('DueSoon');
    expect(critiIdx).toBeLessThan(dueIdx);
    expect(dueIdx).toBeLessThan(infoIdx);
  });

  it('exatamente 10 eventos: sem overflow, com "Acesse o sistema"', () => {
    const { svc } = makeService();
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ id: `e${i}`, title: `A${i}` }),
    );
    const msg = svc.buildAlertMessage(events);
    expect(msg).toContain('Acesse o sistema');
    expect(msg).not.toContain('e mais');
  });
});

// ─── G4: immediateSeverity filter ────────────────────────────────────────────

describe('MonitorService.sendAlertsToAdmins — G4 immediateSeverity', () => {
  it('immediateSeverity=CRITICAL: envia so eventos CRITICAL', async () => {
    const { svc, channel } = makeService({ immediateSeverity: 'CRITICAL' });
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'c1', severity: 'CRITICAL' }),
      makeEvent({ id: 'c2', severity: 'OVERDUE' }),
      makeEvent({ id: 'c3', severity: 'DUE_SOON' }),
    ];
    await svc['sendAlertsToAdmins']('t1', events);
    // So o CRITICAL deve ter gerado envio
    expect(channel.sendTo).toHaveBeenCalledTimes(1);
    const [, , msg] = channel.sendTo.mock.calls[0];
    expect(msg).toContain('1 alerta');
  });

  it('immediateSeverity=CRITICAL: nenhum CRITICAL → nao envia', async () => {
    const { svc, channel } = makeService({ immediateSeverity: 'CRITICAL' });
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'o1', severity: 'OVERDUE' }),
      makeEvent({ id: 'o2', severity: 'DUE_SOON' }),
    ];
    const notified = await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).not.toHaveBeenCalled();
    expect(notified).toBe(0);
  });

  it('immediateSeverity=all: envia todos os eventos novos', async () => {
    const { svc, channel } = makeService({ immediateSeverity: 'all' });
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'a1', severity: 'OVERDUE',  adminPhone: '5511900000001' }),
      makeEvent({ id: 'a2', severity: 'DUE_SOON', adminPhone: '5511900000002' }),
    ];
    await svc['sendAlertsToAdmins']('t1', events);
    // Dois phones distintos → dois envios
    expect(channel.sendTo).toHaveBeenCalledTimes(2);
  });

  it('default (sem config) = comportamento CRITICAL', async () => {
    const { svc, channel, prisma } = makeService();
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue(null); // sem config
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'x1', severity: 'OVERDUE' }),
    ];
    await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).not.toHaveBeenCalled();
  });
});

// ─── G3: destinatario por setor ──────────────────────────────────────────────

describe('MonitorService.sendAlertsToAdmins — G3 destinatario por setor', () => {
  it('usa recipients whatsapp do setor quando configurado', async () => {
    const { svc, channel } = makeService({
      immediateSeverity: 'all',
      sectorConfig: {
        finance: {
          recipients: [
            { contact: '5511911111111', channel: 'whatsapp', label: 'Fin A' },
            { contact: 'fin@empresa.com', channel: 'email' },
          ],
        },
      },
    });
    const events = [makeEvent({ severity: 'OVERDUE', category: 'finance', adminPhone: '5511900000001' })];
    await svc['sendAlertsToAdmins']('t1', events);
    // Deve enviar so pro recipient whatsapp, nao pro adminPhone
    expect(channel.sendTo).toHaveBeenCalledWith('t1', '5511911111111', expect.any(String));
    expect(channel.sendTo).not.toHaveBeenCalledWith('t1', '5511900000001', expect.any(String));
  });

  it('falls back para sector.phone quando sem recipients[]', async () => {
    const { svc, channel } = makeService({
      immediateSeverity: 'all',
      sectorConfig: {
        finance: { phone: '5511922222222' },
      },
    });
    const events = [makeEvent({ severity: 'OVERDUE', category: 'finance', adminPhone: '5511900000001' })];
    await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).toHaveBeenCalledWith('t1', '5511922222222', expect.any(String));
    expect(channel.sendTo).not.toHaveBeenCalledWith('t1', '5511900000001', expect.any(String));
  });

  it('falls back para adminPhone quando sem sectorConfig para a categoria', async () => {
    const { svc, channel } = makeService({ immediateSeverity: 'all', sectorConfig: null });
    const events = [makeEvent({ severity: 'OVERDUE', category: 'finance', adminPhone: '5511900000001' })];
    await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).toHaveBeenCalledWith('t1', '5511900000001', expect.any(String));
  });

  it('sem destinatario em lugar nenhum → nao envia e loga warning', async () => {
    const { svc, channel } = makeService({ immediateSeverity: 'all', sectorConfig: null });
    const events = [makeEvent({ severity: 'CRITICAL', category: 'finance', adminPhone: undefined })];
    const notified = await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).not.toHaveBeenCalled();
    expect(notified).toBe(0);
  });

  it('multiplos recipients whatsapp: cada um recebe a mensagem', async () => {
    const { svc, channel } = makeService({
      immediateSeverity: 'all',
      sectorConfig: {
        frota: {
          recipients: [
            { contact: '5511911111111', channel: 'whatsapp' },
            { contact: '5511922222222', channel: 'whatsapp' },
          ],
        },
      },
    });
    const events = [makeEvent({ severity: 'OVERDUE', category: 'frota' })];
    await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).toHaveBeenCalledTimes(2);
  });
});
