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

// ─── Reconciliação automática — factories estendidas ─────────────────────────
// Os testes abaixo precisam de tenantNotificationConfig.findMany e tenant.findFirst
// não presentes no makeService() acima. Usamos makeServiceR() dedicado.

function makeServiceR(configOverrides: Record<string, any> = {}) {
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
    ...configOverrides,
  };

  const prisma = {
    tenant: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    alertState: {
      findUnique: vi.fn().mockResolvedValue(null),
      // findFirst: used by soft-migration path (UUID → dedupeKey)
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    tenantNotificationConfig: {
      findUnique: vi.fn().mockResolvedValue(config),
      findMany:   vi.fn().mockResolvedValue([]),
    },
  } as any;

  const channel = { sendTo: vi.fn().mockResolvedValue({ sent: true }) } as any;
  const tms     = { getProactivityEvents: vi.fn().mockResolvedValue([]) } as any;

  const svc = new MonitorService(prisma, tms, channel);

  const logLog  = vi.fn();
  const logWarn = vi.fn();
  (svc as any)['logger'] = { log: logLog, warn: logWarn, debug: vi.fn(), error: vi.fn() };

  return { svc, prisma, tms, channel, logLog, logWarn };
}

// ─── Comportamento 1: runReconciliation — iteração de tenants ─────────────────

describe('MonitorService.runReconciliation — iteração de tenants (comportamento 1)', () => {
  it('chama syncNow para cada tenant com enabled=true', async () => {
    const { svc } = makeServiceR();

    (svc as any)['prisma'].tenantNotificationConfig.findMany.mockResolvedValue([
      { tenantId: 'tenant-a' },
      { tenantId: 'tenant-b' },
    ]);

    const spySyncNow = vi
      .spyOn(svc, 'syncNow')
      .mockResolvedValue({ synced: 1, resolved: 0, notified: 0, newEventsCount: 0 });

    const result = await svc.runReconciliation();

    expect(spySyncNow).toHaveBeenCalledTimes(2);
    expect(spySyncNow).toHaveBeenCalledWith('tenant-a');
    expect(spySyncNow).toHaveBeenCalledWith('tenant-b');
    expect(result.tenants).toBe(2);
    expect(result.synced).toBe(2);
  });

  it('continua para o próximo tenant quando um lança exceção', async () => {
    const { svc, logWarn } = makeServiceR();

    (svc as any)['prisma'].tenantNotificationConfig.findMany.mockResolvedValue([
      { tenantId: 'tenant-err' },
      { tenantId: 'tenant-ok' },
    ]);

    vi.spyOn(svc, 'syncNow')
      .mockRejectedValueOnce(new Error('TMS timeout'))
      .mockResolvedValueOnce({ synced: 3, resolved: 1, notified: 0, newEventsCount: 0 });

    const result = await svc.runReconciliation();

    expect(result.tenants).toBe(2);
    expect(result.synced).toBe(3); // só tenant-ok contribuiu
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('tenant-err'));
  });

  it('retorna totais corretos acumulados de todos os tenants', async () => {
    const { svc } = makeServiceR();

    (svc as any)['prisma'].tenantNotificationConfig.findMany.mockResolvedValue([
      { tenantId: 'ta' },
      { tenantId: 'tb' },
      { tenantId: 'tc' },
    ]);

    vi.spyOn(svc, 'syncNow')
      .mockResolvedValueOnce({ synced: 5, resolved: 2, notified: 1, newEventsCount: 1 })
      .mockResolvedValueOnce({ synced: 3, resolved: 0, notified: 2, newEventsCount: 2 })
      .mockResolvedValueOnce({ synced: 0, resolved: 1, notified: 0, newEventsCount: 0 });

    const result = await svc.runReconciliation();

    expect(result.tenants).toBe(3);
    expect(result.synced).toBe(8);
    expect(result.resolved).toBe(3);
    expect(result.notified).toBe(3);
  });
});

// ─── Comportamento 2: syncNow dispara sendAlertsToAdmins (mesmo fluxo do ingest)

describe('MonitorService.syncNow — notificação via channel.sendTo (comportamento 2)', () => {
  it('chama channel.sendTo para evento CRITICAL novo (mesmo caminho do ingest)', async () => {
    const { svc, prisma, tms, channel } = makeServiceR();

    prisma.tenant.findFirst.mockResolvedValue({ id: 'ta', slug: 'test', status: 'active' });
    tms.getProactivityEvents.mockResolvedValue([
      makeEvent({ id: 'e1', severity: 'CRITICAL', category: 'fiscal', adminPhone: '5511999999999' }),
    ]);
    // fiscal habilitado, immediateSeverity CRITICAL — já no default do makeServiceR
    prisma.alertState.findUnique.mockResolvedValue(null); // evento novo

    const result = await svc.syncNow('ta');

    expect(channel.sendTo).toHaveBeenCalledTimes(1);
    expect(channel.sendTo).toHaveBeenCalledWith('ta', '5511999999999', expect.any(String));
    expect(result.notified).toBe(1);
    expect(result.newEventsCount).toBe(1);
  });

  it('NÃO chama channel.sendTo quando evento já existe (não é novo)', async () => {
    const { svc, prisma, tms, channel } = makeServiceR();

    prisma.tenant.findFirst.mockResolvedValue({ id: 'ta', slug: 'test', status: 'active' });
    tms.getProactivityEvents.mockResolvedValue([
      makeEvent({ id: 'e1', severity: 'CRITICAL', category: 'fiscal', adminPhone: '5511999999999' }),
    ]);
    prisma.alertState.findUnique.mockResolvedValue({ status: 'open' }); // evento já existe

    const result = await svc.syncNow('ta');

    expect(channel.sendTo).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
    expect(result.newEventsCount).toBe(0);
  });

  it('retorna zeros quando tenant não encontrado', async () => {
    const { svc } = makeServiceR();
    (svc as any)['prisma'].tenant.findFirst.mockResolvedValue(null);

    const result = await svc.syncNow('ghost');

    expect(result).toEqual({ synced: 0, resolved: 0, notified: 0, newEventsCount: 0 });
  });
});

// ─── Comportamento 3: warn de degradação do push TMS→Nexa ────────────────────

describe('MonitorService.runReconciliation — sinal de degradação push (comportamento 3)', () => {
  it('emite logger.warn quando newEventsCount > 10', async () => {
    const { svc, logWarn } = makeServiceR();

    (svc as any)['prisma'].tenantNotificationConfig.findMany.mockResolvedValue([
      { tenantId: 'ta' },
    ]);
    vi.spyOn(svc, 'syncNow').mockResolvedValue({
      synced: 11, resolved: 0, notified: 5, newEventsCount: 11,
    });

    await svc.runReconciliation();

    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('possivelmente degradado'));
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('11'));
  });

  it('NÃO emite warn quando newEventsCount === 10 (threshold é > 10, não >=)', async () => {
    const { svc, logWarn } = makeServiceR();

    (svc as any)['prisma'].tenantNotificationConfig.findMany.mockResolvedValue([
      { tenantId: 'ta' },
    ]);
    vi.spyOn(svc, 'syncNow').mockResolvedValue({
      synced: 10, resolved: 0, notified: 2, newEventsCount: 10,
    });

    await svc.runReconciliation();

    expect(logWarn).not.toHaveBeenCalledWith(expect.stringContaining('possivelmente degradado'));
  });

  it('warn identifica o tenant específico que ultrapassou o threshold', async () => {
    const { svc, logWarn } = makeServiceR();

    (svc as any)['prisma'].tenantNotificationConfig.findMany.mockResolvedValue([
      { tenantId: 'tenant-degradado' },
      { tenantId: 'tenant-normal' },
    ]);

    vi.spyOn(svc, 'syncNow')
      .mockResolvedValueOnce({ synced: 15, resolved: 0, notified: 3, newEventsCount: 15 })
      .mockResolvedValueOnce({ synced: 2,  resolved: 0, notified: 0, newEventsCount: 2 });

    await svc.runReconciliation();

    const degradCalls = (logWarn.mock.calls as string[][]).filter(args =>
      args[0]?.includes('possivelmente degradado'),
    );
    expect(degradCalls).toHaveLength(1);
    expect(degradCalls[0][0]).toContain('tenant-degradado');
  });
});
// ─── D1: dedupeKey — pull + push mesmo evento → sem duplicata nem re-notificação ───

describe('MonitorService.syncNow — dedupeKey deduplication (D1)', () => {
  /**
   * D1-A: push chegou primeiro com dedupeKey como id.
   * Pull retorna o mesmo dedupeKey → findUnique encontra existente → isNew=false → sem notificação.
   */
  it('D1-A: pull após push com mesmo dedupeKey NÃO notifica (isNew=false)', async () => {
    const { svc, prisma, tms, channel } = makeServiceR();

    prisma.tenant.findFirst.mockResolvedValue({ id: 'ta', slug: 'test', status: 'active' });
    // Pull retorna evento com dedupeKey (já mapeado pelo connector)
    tms.getProactivityEvents.mockResolvedValue([
      makeEvent({ id: 'fiscal-cte-123456', severity: 'CRITICAL', category: 'fiscal', adminPhone: '5511900000001' }),
    ]);
    // findUnique encontra: push já criou o alertState com tmsEventId = dedupeKey
    prisma.alertState.findUnique.mockResolvedValue({ status: 'open' });

    const result = await svc.syncNow('ta');

    // Nenhuma notificação — evento já existia
    expect(channel.sendTo).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
    expect(result.newEventsCount).toBe(0);
    // Upsert foi chamado (atualiza severity/title)
    expect(prisma.alertState.upsert).toHaveBeenCalledOnce();
  });

  /**
   * D1-B: alertState antigo com UUID (criado por push antes do dedupeKey).
   * Pull chega com dedupeKey diferente do UUID → findUnique falha → findFirst encontra UUID alias
   * → soft migration: update tmsEventId → sem notificação.
   */
  it('D1-B: UUID-keyed alert migrado ao chegar pull com dedupeKey — sem re-notificação', async () => {
    const UUID_LEGACY = '550e8400-e29b-41d4-a716-446655440000';
    const DEDUPE_KEY  = 'fiscal-cte-123456';

    const { svc, prisma, tms, channel } = makeServiceR({ immediateSeverity: 'CRITICAL' });

    prisma.tenant.findFirst.mockResolvedValue({ id: 'ta', slug: 'test', status: 'active' });
    tms.getProactivityEvents.mockResolvedValue([
      makeEvent({ id: DEDUPE_KEY, severity: 'CRITICAL', category: 'fiscal', adminPhone: '5511900000001' }),
    ]);
    // findUnique por dedupeKey → null (ainda não existe com essa chave)
    prisma.alertState.findUnique.mockResolvedValue(null);
    // findFirst encontra UUID alias com mesma category+title
    prisma.alertState.findFirst.mockResolvedValue({ tmsEventId: UUID_LEGACY });

    const result = await svc.syncNow('ta');

    // update deve ter sido chamado para renomear UUID → dedupeKey
    expect(prisma.alertState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_tmsEventId: { tenantId: 'ta', tmsEventId: UUID_LEGACY } },
        data: expect.objectContaining({ tmsEventId: DEDUPE_KEY }),
      }),
    );
    // Tratado como existente — sem notificação
    expect(channel.sendTo).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
    expect(result.newEventsCount).toBe(0);
  });

  /**
   * D1-C: novo evento genuíno (nem dedupeKey no DB, nem UUID alias).
   * Deve criar e notificar normalmente.
   */
  it('D1-C: evento genuinamente novo (sem alias UUID) é criado e notificado', async () => {
    const { svc, prisma, tms, channel } = makeServiceR({ immediateSeverity: 'CRITICAL' });

    prisma.tenant.findFirst.mockResolvedValue({ id: 'ta', slug: 'test', status: 'active' });
    tms.getProactivityEvents.mockResolvedValue([
      makeEvent({ id: 'fiscal-cte-new-999', severity: 'CRITICAL', category: 'fiscal', adminPhone: '5511900000001' }),
    ]);
    // findUnique → null (dedupeKey não existe)
    prisma.alertState.findUnique.mockResolvedValue(null);
    // findFirst → null (nenhum UUID alias)
    prisma.alertState.findFirst.mockResolvedValue(null);

    const result = await svc.syncNow('ta');

    // Evento novo → notifica
    expect(channel.sendTo).toHaveBeenCalledOnce();
    expect(result.notified).toBe(1);
    expect(result.newEventsCount).toBe(1);
    // update NÃO deve ter sido chamado (não houve migração)
    expect(prisma.alertState.update).not.toHaveBeenCalled();
  });
});
