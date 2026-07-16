import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    expect(msg).toContain('⚡ *Alerta imediato · Financeiro*');
    expect(msg).toContain('CRÍTICO');
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

// ─── H1: alerta imediato vs agendado — título diferenciado ──────────────────
// Evento CRÍTICO dispara fora do ciclo (via sendAlertsToAdmins, já chamado pelo
// ingest/reconciliação) com título "⚡ Alerta imediato · {Setor}". Item não
// crítico nunca dispara por esse caminho — só no digest agendado
// (ConsolidationService, testado à parte). Corpo da mensagem (severidade
// agrupada + link do painel) é o mesmo do digest — só o título muda.

describe('MonitorService.buildImmediateMessage — H1 título imediato', () => {
  it('título é "⚡ Alerta imediato · {Setor}", sem data (diferente do agendado)', () => {
    const { svc } = makeService();
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'e1', severity: 'CRITICAL', category: 'fiscal', title: 'CT-e 123 foi rejeitado pela SEFAZ' }),
    ];
    const msg = svc.buildImmediateMessage('fiscal', events);
    expect(msg).toContain('⚡ *Alerta imediato · Fiscal*');
    expect(msg).not.toMatch(/Alertas Fiscal — \d/); // não usa o formato do título agendado
  });

  it('corpo agrupa por severidade (igual ao digest agendado) e termina com o link do painel', () => {
    const { svc } = makeService();
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'e1', severity: 'CRITICAL', category: 'fiscal', title: 'CT-e 111 rejeitado' }),
      makeEvent({ id: 'e2', severity: 'CRITICAL', category: 'fiscal', title: 'CT-e 222 rejeitado' }),
    ];
    const msg = svc.buildImmediateMessage('fiscal', events);
    expect(msg).toContain('🔴 *CRÍTICO* (2)');
    expect(msg).toContain('CT-e 111 rejeitado');
    expect(msg).toContain('CT-e 222 rejeitado');
    expect(msg).toContain('Acesse o painel do HiperTMS para mais detalhes: https://www.hipertms.com.br');
  });

  it('categoria desconhecida usa o próprio valor como rótulo (fallback seguro)', () => {
    const { svc } = makeService();
    const msg = svc.buildImmediateMessage('outro', [
      makeEvent({ severity: 'CRITICAL', category: 'outro' as any, title: 'X' }),
    ]);
    expect(msg).toContain('⚡ *Alerta imediato · outro*');
  });
});

describe('MonitorService.sendAlertsToAdmins — H1 disparo imediato x agendado', () => {
  it('evento CRÍTICO novo → dispara na hora com título imediato (fora do ciclo do scheduler)', async () => {
    const { svc, channel } = makeService();
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'c1', severity: 'CRITICAL', category: 'fiscal', title: 'CT-e rejeitado' }),
    ];
    await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).toHaveBeenCalledTimes(1);
    const [, , msg] = channel.sendTo.mock.calls[0];
    expect(msg).toContain('⚡ *Alerta imediato · Fiscal*');
  });

  it('item não-crítico NÃO dispara fora do ciclo — fica só para o digest agendado', async () => {
    const { svc, channel } = makeService(); // immediateSeverity default = CRITICAL
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'd1', severity: 'DUE_SOON', category: 'fiscal', title: 'Certificado vence em 10d' }),
    ];
    const notified = await svc['sendAlertsToAdmins']('t1', events);
    expect(channel.sendTo).not.toHaveBeenCalled();
    expect(notified).toBe(0);
  });

  it('mesmo telefone com eventos de dois setores → duas mensagens, cada uma com o título do próprio setor', async () => {
    const { svc, channel } = makeService({
      immediateSeverity: 'CRITICAL',
      sectorConfig: {
        fiscal:   { phone: '5511900000009' },
        logistic: { phone: '5511900000009' }, // mesmo número nos dois setores
      },
    });
    const events: TmsProactivityEvent[] = [
      makeEvent({ id: 'f1', severity: 'CRITICAL', category: 'fiscal',   title: 'CT-e rejeitado' }),
      makeEvent({ id: 'l1', severity: 'CRITICAL', category: 'logistic', title: 'Coleta vencida' }),
    ];
    await svc['sendAlertsToAdmins']('t1', events);

    // Duas mensagens distintas para o mesmo telefone — não uma combinada.
    expect(channel.sendTo).toHaveBeenCalledTimes(2);
    const messages = channel.sendTo.mock.calls.map((c: any[]) => c[2] as string);
    expect(messages.some((m) => m.includes('⚡ *Alerta imediato · Fiscal*') && m.includes('CT-e rejeitado'))).toBe(true);
    expect(messages.some((m) => m.includes('⚡ *Alerta imediato · Logística*') && m.includes('Coleta vencida'))).toBe(true);
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

// ─── external-config (TMS proxy, ADR 022) — paridade com MonitorController ───
// Bug: GET/PUT /monitor/external-config (MonitorIngestController, chamado pelo
// TMS via proxy) não aplicava os mesmos Gate 1 (plano) / Gate 2 (limite de
// números) que MonitorController.updateConfig() já aplica no painel próprio do
// Nexa. Ver docs/monitor/ajuste-limites-planos-v2-2026-07-14.md.

const TMS_TENANT_ID_ENV = 'TMS_TENANT_ID_TESTCO';
const TMS_TENANT_ID = 'tms-uuid-1';
const NEXA_TENANT_ID = 'nexa-tenant-1';

function makeExternalService(overrides: { planLimit?: any; config?: any } = {}) {
  const prisma = {
    tenant: {
      findMany: vi.fn().mockResolvedValue([{ id: NEXA_TENANT_ID, slug: 'testco' }]),
    },
    planLimit: {
      findUnique: vi.fn().mockResolvedValue(overrides.planLimit ?? null),
    },
    tenantNotificationConfig: {
      findUnique: vi.fn().mockResolvedValue(overrides.config ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as any;

  const channel = { sendTo: vi.fn() } as any;
  const tms = {} as any;
  const svc = new MonitorService(prisma, tms, channel);
  return { svc, prisma };
}

describe('MonitorService.getExternalConfig/updateExternalConfig — paridade TMS proxy', () => {
  beforeEach(() => {
    process.env[TMS_TENANT_ID_ENV] = TMS_TENANT_ID;
  });
  afterEach(() => {
    delete process.env[TMS_TENANT_ID_ENV];
  });

  // ── getExternalConfig: waNumbersUsed/waNumbersLimit ────────────────────────

  it('getExternalConfig retorna waNumbersUsed e waNumbersLimit calculados do PlanLimit', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 }, // limit=3
      config: {
        enabled: true, sendHour: 8, sendMinute: 0, sendWeekends: false,
        fiscalEnabled: true, logisticEnabled: true, frotaEnabled: true, financeEnabled: true,
        sectorConfig: {
          fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
          logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
        },
        notificationPhone: null,
        monitorOverride: false,
      },
    });

    const result = await svc.getExternalConfig(TMS_TENANT_ID);
    expect(result.waNumbersUsed).toBe(2);
    expect(result.waNumbersLimit).toBe(3);
    // Campos usados só para o cálculo não vazam no shape exposto ao TMS
    expect((result as any).notificationPhone).toBeUndefined();
    expect((result as any).monitorOverride).toBeUndefined();
  });

  it('getExternalConfig sem PlanLimit e sem config → waNumbersLimit = 0 (default free bloqueado)', async () => {
    const { svc } = makeExternalService({ planLimit: null, config: null });
    const result = await svc.getExternalConfig(TMS_TENANT_ID);
    expect(result.waNumbersUsed).toBe(0);
    expect(result.waNumbersLimit).toBe(0);
  });

  it('getExternalConfig com config acima do limite → 200 (grandfathering no GET)', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'basico', monitorExtraNumbers: 0 }, // limit=1
      config: {
        enabled: true, sendHour: 8, sendMinute: 0, sendWeekends: false,
        fiscalEnabled: true, logisticEnabled: true, frotaEnabled: true, financeEnabled: true,
        sectorConfig: {
          fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
          logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
        },
        notificationPhone: null,
        monitorOverride: false,
      },
    });
    const result = await svc.getExternalConfig(TMS_TENANT_ID);
    expect(result.waNumbersUsed).toBe(2);
    expect(result.waNumbersLimit).toBe(1);
  });

  it('getExternalConfig com monitorOverride=true → waNumbersLimit = 10 (cap técnico)', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 },
      config: {
        enabled: true, sendHour: 8, sendMinute: 0, sendWeekends: false,
        fiscalEnabled: true, logisticEnabled: true, frotaEnabled: true, financeEnabled: true,
        sectorConfig: null, notificationPhone: null, monitorOverride: true,
      },
    });
    const result = await svc.getExternalConfig(TMS_TENANT_ID);
    expect(result.waNumbersLimit).toBe(10);
  });

  it('tmsTenantId não mapeado → NotFoundException', async () => {
    const { svc, prisma } = makeExternalService();
    prisma.tenant.findMany.mockResolvedValue([]);
    await expect(svc.getExternalConfig('unknown-tms-id')).rejects.toThrow('não mapeado');
  });

  // ── updateExternalConfig — Gate 1: plano permite Monitor ───────────────────

  it('Gate 1: plano free → ForbiddenException ao habilitar via proxy TMS', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'free', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, { enabled: true }))
      .rejects.toThrow(ForbiddenException);
  });

  it('Gate 1: plano basico pode habilitar (Monitor disponível no Básico)', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'basico', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, { enabled: true }))
      .resolves.not.toThrow();
  });

  // ── updateExternalConfig — Gate 2: limite de números WhatsApp ──────────────

  it('Básico bloqueia no 2º número (limite=1)', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'basico', monitorExtraNumbers: 0 }, // limit=1
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    const input = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
      },
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).rejects.toThrow(BadRequestException);
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).rejects.toThrow('Limite de números WhatsApp');
  });

  it('Básico aceita exatamente 1 número (dentro do limite)', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'basico', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    const input = {
      sectorConfig: { fiscal: { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] } },
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).resolves.not.toThrow();
  });

  it('grandfathering: tenant com 6 números (limit=3) pode salvar sem aumentar a contagem', async () => {
    const existingSector = {
      fiscal:   { recipients: [{ contact: '5511000000001', channel: 'whatsapp' }] },
      logistic: { recipients: [{ contact: '5511000000002', channel: 'whatsapp' }] },
      frota:    { recipients: [{ contact: '5511000000003', channel: 'whatsapp' }] },
      finance:  { recipients: [{ contact: '5511000000004', channel: 'whatsapp' }] },
      compras:  { recipients: [{ contact: '5511000000005', channel: 'whatsapp' }] },
      rh:       { recipients: [{ contact: '5511000000006', channel: 'whatsapp' }] },
    };
    const { svc } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 }, // limit=3
      config: { monitorOverride: false, sectorConfig: existingSector, notificationPhone: null },
    });
    // Mesmos 6 números — não aumentou → passa mesmo acima do limite (congelado)
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, { sectorConfig: existingSector }))
      .resolves.not.toThrow();
  });

  it('grandfathering: tenant com 6 números (limit=3) NÃO pode adicionar o 7º', async () => {
    const existingSector = {
      fiscal:   { recipients: [{ contact: '5511000000001', channel: 'whatsapp' }] },
      logistic: { recipients: [{ contact: '5511000000002', channel: 'whatsapp' }] },
      frota:    { recipients: [{ contact: '5511000000003', channel: 'whatsapp' }] },
      finance:  { recipients: [{ contact: '5511000000004', channel: 'whatsapp' }] },
      compras:  { recipients: [{ contact: '5511000000005', channel: 'whatsapp' }] },
      rh:       { recipients: [{ contact: '5511000000006', channel: 'whatsapp' }] },
    };
    const { svc } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 }, // limit=3
      config: { monitorOverride: false, sectorConfig: existingSector, notificationPhone: null },
    });
    const expandedSector = {
      ...existingSector,
      vendas: { recipients: [{ contact: '5511000000007', channel: 'whatsapp' }] },
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, { sectorConfig: expandedSector }))
      .rejects.toThrow(BadRequestException);
  });

  it('Essencial (3 inclusos) permite até 3 números únicos', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    const input = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
        frota:    { recipients: [{ contact: '5511999990003', channel: 'whatsapp' }] },
      },
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).resolves.not.toThrow();
  });

  it('Profissional (5 inclusos) bloqueia no 6º número', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'profissional', monitorExtraNumbers: 0 }, // limit=5
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    const input = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
        frota:    { recipients: [{ contact: '5511999990003', channel: 'whatsapp' }] },
        finance:  { recipients: [{ contact: '5511999990004', channel: 'whatsapp' }] },
        compras:  { recipients: [{ contact: '5511999990005', channel: 'whatsapp' }] },
        rh:       { recipients: [{ contact: '5511999990006', channel: 'whatsapp' }] },
      },
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).rejects.toThrow(BadRequestException);
  });

  it('Profissional + 2 extras (limit=7) permite 7 números únicos', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'profissional', monitorExtraNumbers: 2 }, // limit=7
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    const input = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
        frota:    { recipients: [{ contact: '5511999990003', channel: 'whatsapp' }] },
        finance:  { recipients: [{ contact: '5511999990004', channel: 'whatsapp' }] },
        compras:  { recipients: [{ contact: '5511999990005', channel: 'whatsapp' }] },
        rh:       { recipients: [{ contact: '5511999990006', channel: 'whatsapp' }] },
        vendas:   { recipients: [{ contact: '5511999990007', channel: 'whatsapp' }] },
      },
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).resolves.not.toThrow();
  });

  it('mesmo número em dois setores conta 1 vez (dedup) — dentro do limite', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 }, // limit=3
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null },
    });
    const sameNumber = '5511999990001';
    const input = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: sameNumber, channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: sameNumber, channel: 'whatsapp' }] },
      },
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).resolves.not.toThrow();
  });
});

// ── T7.2: teto de horários por contato (paridade com MonitorController) ──────

describe('MonitorService.updateExternalConfig — T7.2 teto de horários por contato', () => {
  beforeEach(() => {
    process.env[TMS_TENANT_ID_ENV] = TMS_TENANT_ID;
  });
  afterEach(() => {
    delete process.env[TMS_TENANT_ID_ENV];
  });

  it('contato com 4 horários (> maxContactTimes) → 400 com mensagem clara, ANTES de salvar', async () => {
    const { svc, prisma } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null, contacts: null },
    });
    const input = {
      contacts: [
        {
          whatsapp: '5511999990001',
          emails: [],
          sectors: ['fiscal'],
          sendTimes: [
            { hour: 7, minute: 0 },
            { hour: 12, minute: 0 },
            { hour: 18, minute: 0 },
            { hour: 20, minute: 0 },
          ],
          sendDays: [1, 2, 3, 4, 5],
        },
      ],
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).rejects.toThrow(BadRequestException);
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).rejects.toThrow(/no máximo 3 horário/i);
    // Nunca chega a salvar — a validação corta antes do upsert.
    expect(prisma.tenantNotificationConfig.upsert).not.toHaveBeenCalled();
  });

  it('contato com exatamente 3 horários (teto) → OK', async () => {
    const { svc } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null, contacts: null },
    });
    const input = {
      contacts: [
        {
          whatsapp: '5511999990001',
          emails: [],
          sectors: ['fiscal'],
          sendTimes: [
            { hour: 7, minute: 0 },
            { hour: 12, minute: 0 },
            { hour: 18, minute: 0 },
          ],
          sendDays: [1, 2, 3, 4, 5],
        },
      ],
    };
    await expect(svc.updateExternalConfig(TMS_TENANT_ID, input)).resolves.not.toThrow();
  });
});

// T8-FIX (2026-07-16): bug real de teste manual — editar um contato PELO TMS
// (este proxy) sem reenviar closingReport/cashView estava resetando os dois pra
// 'off', porque sanitizeContacts tratava ausente sempre como 'off'. Corrigido em
// contact-recipient.types.ts (resolveOptionalEnum) — teste aqui cobre o caminho
// real onde o bug foi encontrado (updateExternalConfig), não só a função pura.
describe('MonitorService.updateExternalConfig — T8-FIX preserva closingReport/cashView em edição parcial', () => {
  beforeEach(() => {
    process.env[TMS_TENANT_ID_ENV] = TMS_TENANT_ID;
  });
  afterEach(() => {
    delete process.env[TMS_TENANT_ID_ENV];
  });

  it('editar um contato pelo TMS sem reenviar closingReport/cashView preserva o valor salvo', async () => {
    const existingContacts = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'biweekly',
        cashView: 'lastSlot',
      },
    ];
    const { svc, prisma } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null, contacts: existingContacts },
    });
    // TMS reenvia o contato só pra mudar o horário — não manda closingReport/cashView.
    const input = {
      contacts: [
        {
          id: 'c1',
          whatsapp: '5511999990001',
          emails: [],
          sectors: ['fiscal'],
          sendTimes: [{ hour: 9, minute: 0 }],
          sendDays: [1, 2, 3, 4, 5],
        },
      ],
    };
    await svc.updateExternalConfig(TMS_TENANT_ID, input);

    const saved = prisma.tenantNotificationConfig.upsert.mock.calls[0][0].update.contacts[0];
    expect(saved.closingReport).toBe('biweekly'); // preservado, não resetou pra 'off'
    expect(saved.cashView).toBe('lastSlot');
    expect(saved.sendTimes).toEqual([{ hour: 9, minute: 0 }]); // a mudança pedida foi aplicada normalmente
  });

  it('editar com closingReport/cashView="off" EXPLÍCITO desliga de verdade', async () => {
    const existingContacts = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'biweekly',
        cashView: 'lastSlot',
      },
    ];
    const { svc, prisma } = makeExternalService({
      planLimit: { plan: 'essencial', monitorExtraNumbers: 0 },
      config: { monitorOverride: false, sectorConfig: null, notificationPhone: null, contacts: existingContacts },
    });
    const input = {
      contacts: [
        {
          id: 'c1',
          whatsapp: '5511999990001',
          emails: [],
          sectors: ['fiscal'],
          sendTimes: [{ hour: 8, minute: 0 }],
          sendDays: [1, 2, 3, 4, 5],
          closingReport: 'off',
          cashView: 'off',
        },
      ],
    };
    await svc.updateExternalConfig(TMS_TENANT_ID, input);

    const saved = prisma.tenantNotificationConfig.upsert.mock.calls[0][0].update.contacts[0];
    expect(saved.closingReport).toBe('off');
    expect(saved.cashView).toBe('off');
  });
});
