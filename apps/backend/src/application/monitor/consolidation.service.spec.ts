/**
 * ConsolidationService — testes de robustez
 *
 * Cobre as duas melhorias de produção:
 *   1. Catch-up de janela perdida (lastDigestDate + janela de 2h)
 *   2. Observabilidade: resumo de skip por tenant em uma linha de log
 *   3. T6 (2026-07): horário de envio por CONTATO (até 3 horários independentes,
 *      múltiplos e-mails, isolamento de setor e de horário)
 */
import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { ConsolidationService } from './consolidation.service';
import type { ContactRecipient } from './contact-recipient.types';

// ─── Factory de service (sem NestJS DI) ──────────────────────────────────────

function makeService(overrides?: {
  prismaUpdate?: MockedFunction<any>;
  prismaFindMany?: MockedFunction<any>;
  notifyPhone?: MockedFunction<any>;
  logLog?: MockedFunction<any>;
  logWarn?: MockedFunction<any>;
  getCashView?: MockedFunction<any>;
  tenantFindUnique?: MockedFunction<any>;
}) {
  const prismaUpdate = overrides?.prismaUpdate ?? vi.fn().mockResolvedValue({});
  const prismaFindMany = overrides?.prismaFindMany ?? vi.fn().mockResolvedValue([]);
  // T8.6: usado só quando algum contato tem cashView='lastSlot' — default devolve
  // um slug qualquer, já que a maioria dos testes (pré-T8) nunca chama isto.
  const tenantFindUnique = overrides?.tenantFindUnique ?? vi.fn().mockResolvedValue({ slug: 'acme' });

  const prisma = {
    tenantNotificationConfig: { update: prismaUpdate },
    alertState: { findMany: prismaFindMany, updateMany: vi.fn().mockResolvedValue({}) },
    tenant: { findUnique: tenantFindUnique },
  } as any;

  const notification = {
    notifyPhone: overrides?.notifyPhone ?? vi.fn().mockResolvedValue(undefined),
  } as any;

  const emailReply = {
    sendAlertEmail: vi.fn().mockResolvedValue({ sent: false, reason: 'disabled' }),
  } as any;

  // T8.6: por default TMS não configurado → getCashView nunca é chamado de verdade
  // nos testes pré-T8 (só quando cashView='lastSlot' no contato + último slot).
  const tms = {
    getCashView: overrides?.getCashView ?? vi.fn().mockResolvedValue(null),
  } as any;

  const svc: any = new ConsolidationService(
    prisma,
    notification,
    emailReply,
    { acquire: async () => async () => {} } as any,
    tms,
  );

  // Captura de logs
  const logLog = overrides?.logLog ?? vi.fn();
  const logWarn = overrides?.logWarn ?? vi.fn();
  svc['logger'] = { log: logLog, warn: logWarn, debug: vi.fn(), error: vi.fn() };

  return { svc, prisma, notification, emailReply, tms, prismaUpdate, prismaFindMany, tenantFindUnique, logLog, logWarn };
}

// ─── Fixture de config ────────────────────────────────────────────────────────

const TENANT = 'tenant-test-1';

/** Gera um config de tenant com um setor fiscal configurado. */
function makeSectorConfig(overrides?: Partial<Record<string, any>>) {
  return {
    fiscal: {
      recipients: [{ contact: '5511999990001', channel: 'whatsapp' }],
      sendHour: 7,
      sendMinute: 0,
      sendDays: [0, 1, 2, 3, 4, 5, 6], // todos os dias
      ...overrides?.fiscal,
    },
    logistic: { sendHour: 8, sendMinute: 0, sendDays: [1, 2, 3, 4, 5] },
    frota:    { sendHour: 9, sendMinute: 0, sendDays: [1, 2, 3, 4, 5] },
    finance:  { sendHour: 10, sendMinute: 0, sendDays: [1, 2, 3, 4, 5] },
    ...overrides,
  };
}

/** Gera um config global de tenant. */
function makeTenantConfig(sectorConfig: any, extra?: Record<string, any>) {
  return {
    tenantId: TENANT,
    enabled: true,
    sendHour: 7,
    sendMinute: 0,
    sendWeekends: true,
    fiscalEnabled: true,
    logisticEnabled: false,
    frotaEnabled: false,
    financeEnabled: false,
    sectorConfig,
    ...extra,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Constrói um Date com hora e minuto explícitos (dia fixo = segunda-feira). */
function makeNow(hour: number, minute: number): Date {
  // 2026-07-13 = segunda-feira (weekday 1)
  return new Date(2026, 6, 13, hour, minute, 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 1 — toDateStr
// ─────────────────────────────────────────────────────────────────────────────

describe('toDateStr', () => {
  it('formata corretamente mês e dia com zero-padding', () => {
    const { svc } = makeService();
    expect(svc.toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(svc.toDateStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('usa hora local (não UTC) para determinar a data', () => {
    const { svc } = makeService();
    const d = new Date(2026, 6, 13, 23, 59);
    expect(svc.toDateStr(d)).toBe('2026-07-13');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 2 — Catch-up de janela perdida
// ─────────────────────────────────────────────────────────────────────────────

describe('Catch-up — janela perdida por restart', () => {
  const SECTOR_HOUR = 7;
  const SECTOR_MINUTE = 0;

  /**
   * Chama processPerSector diretamente via bracket notation (método privado).
   * now define o horário simulado do tick.
   */
  async function callPerSector(svc: any, {
    now,
    sectorConfig,
    config,
    force = false,
  }: {
    now: Date;
    sectorConfig: Record<string, any>;
    config: Record<string, any>;
    force?: boolean;
  }) {
    return svc['processPerSector'](
      TENANT,
      config,
      sectorConfig,
      now,
      now.getHours(),
      now.getMinutes(),
      force,
    );
  }

  it('não envia quando tick está antes do horário configurado', async () => {
    const { svc, notification, logLog } = makeService();
    const now = makeNow(6, 55); // 5 min antes do alvo (7h)
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    expect(notification.notifyPhone).not.toHaveBeenCalled();
    expect(logLog).toHaveBeenCalledWith(expect.stringMatching(/fora_da_hora/));
  });

  it('envia normalmente dentro da janela de 5 min (tick às 7h00)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const now = makeNow(SECTOR_HOUR, SECTOR_MINUTE); // exatamente 7h00
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
  });

  it('H1: digest agendado usa o título nomeado "🕐 Alerta programado · {Setor} — {data}"', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const now = makeNow(SECTOR_HOUR, SECTOR_MINUTE);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).toContain('🕐 *Alerta programado · Fiscal —');
    // Simétrico ao imediato (MonitorService.buildImmediateMessage) — nunca usa "⚡".
    expect(msg).not.toContain('⚡');
  });

  it('catch-up: envia quando tick caiu 30 min após o horário (restart simulado)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, notification, logLog } = makeService({ prismaFindMany: findMany });
    // Tick às 7h30 — backend voltou 30 min depois do alvo (7h00)
    const now = makeNow(7, 30);
    const sc = makeSectorConfig(); // sem lastDigestDate
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    // Deve logar a mensagem de catch-up
    expect(logLog).toHaveBeenCalledWith(expect.stringMatching(/catch-up/i));
  });

  it('catch-up envia apenas 1x: segundo tick após envio encontra lastDigestDate=hoje e pula', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const update = vi.fn().mockResolvedValue({});
    const { svc, notification } = makeService({ prismaFindMany: findMany, prismaUpdate: update });

    // 1º tick: catch-up às 7h30 → envia
    const now1 = makeNow(7, 30);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now: now1, sectorConfig: sc, config: cfg });

    // Simula o que o service persiste: lastDigestDate no sectorConfig
    const { svc: svc2, notification: notification2 } = makeService({ prismaFindMany: findMany, prismaUpdate: vi.fn() });
    const todayStr = svc2.toDateStr(now1);
    const sc2 = makeSectorConfig({ fiscal: { ...sc.fiscal, lastDigestDate: todayStr } });
    const cfg2 = makeTenantConfig(sc2);

    // 2º tick: 7h35 — já tem lastDigestDate=hoje → deve pular
    const now2 = makeNow(7, 35);
    await svc2['processPerSector'](TENANT, cfg2, sc2, now2, now2.getHours(), now2.getMinutes(), false);
    expect(notification2.notifyPhone).not.toHaveBeenCalled();
  });

  it('catch-up expirado: mais de 2h após o horário → warn e não envia', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, notification, logWarn } = makeService({ prismaFindMany: findMany });
    // Tick às 9h30 — mais de 2h após o alvo (7h00)
    const now = makeNow(9, 30);
    const sc = makeSectorConfig(); // sem lastDigestDate
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    expect(notification.notifyPhone).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringMatching(/catch-up expirada/i));
  });

  it('catch-up na fronteira: exatamente 119 min após → envia', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    // 7h00 + 119 min = 8h59
    const now = makeNow(8, 59);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
  });

  it('catch-up na fronteira: exatamente 120 min após → NÃO envia (expirado)', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    // 7h00 + 120 min = 9h00
    const now = makeNow(9, 0);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    expect(notification.notifyPhone).not.toHaveBeenCalled();
  });

  it('lastDigestDate de ontem não bloqueia envio de hoje', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const now = makeNow(7, 0); // dentro da janela normal
    const sc = makeSectorConfig({
      fiscal: {
        recipients: [{ contact: '5511999990001', channel: 'whatsapp' }],
        sendHour: 7,
        sendMinute: 0,
        sendDays: [0, 1, 2, 3, 4, 5, 6],
        lastDigestDate: '2026-07-12', // ontem
      },
    });
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
  });

  it('persiste lastDigestDate após envio bem-sucedido', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const update = vi.fn().mockResolvedValue({});
    const { svc } = makeService({ prismaFindMany: findMany, prismaUpdate: update });
    const now = makeNow(7, 0);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });

    // update deve ter sido chamado com sectorConfig.fiscal.lastDigestDate = '2026-07-13'
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT } }),
    );
    const updateCall = update.mock.calls[0][0];
    const updatedSc = updateCall.data.sectorConfig;
    expect(updatedSc.fiscal.lastDigestDate).toBe('2026-07-13');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 3 — Resumo de skip (observabilidade)
// ─────────────────────────────────────────────────────────────────────────────

describe('Resumo de skip — observabilidade', () => {
  async function callPerSector(svc: any, args: {
    now: Date; sectorConfig: Record<string, any>; config: Record<string, any>; force?: boolean;
  }) {
    return svc['processPerSector'](
      TENANT, args.config, args.sectorConfig, args.now,
      args.now.getHours(), args.now.getMinutes(), args.force ?? false,
    );
  }

  it('loga uma linha com o motivo "sem_alertas" quando não há alertas abertos', async () => {
    // findMany retorna [] → motivo sem_alertas
    const { svc, logLog } = makeService({ prismaFindMany: vi.fn().mockResolvedValue([]) });
    // Tick dentro da janela do fiscal (7h00)
    const now = makeNow(7, 0);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    // Deve ter UMA linha de resumo contendo "fiscal=sem_alertas"
    const summaryCall = logLog.mock.calls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('setores sem envio'),
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall[0]).toMatch(/fiscal=sem_alertas/);
  });

  it('loga "fora_da_hora" para setor cujo horário ainda não chegou', async () => {
    const { svc, logLog } = makeService();
    // Tick às 6h00 — todos os setores ainda não chegaram no horário
    const now = makeNow(6, 0);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    const summaryCall = logLog.mock.calls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('setores sem envio'),
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall[0]).toMatch(/fiscal=fora_da_hora/);
  });

  it('loga "sem_destinatario" para setor sem recipients configurados', async () => {
    const { svc, logLog } = makeService();
    const now = makeNow(7, 0);
    // fiscal sem recipients
    const sc = {
      fiscal: { sendHour: 7, sendMinute: 0, sendDays: [0,1,2,3,4,5,6] },
      logistic: {}, frota: {}, finance: {},
    };
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    const summaryCall = logLog.mock.calls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('setores sem envio'),
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall[0]).toMatch(/fiscal=sem_destinatario/);
  });

  it('não loga summary quando todos os setores enviaram com sucesso', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a1', severity: 'CRITICAL', title: 'CT-e vencido', snoozedUntil: null },
    ]);
    const { svc, logLog } = makeService({ prismaFindMany: findMany });
    const now = makeNow(7, 0);
    const sc = makeSectorConfig();
    const cfg = makeTenantConfig(sc);
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    const summaryCall = logLog.mock.calls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('setores sem envio'),
    );
    // fiscal enviou → não deve aparecer no summary
    // logistic/frota/finance têm desabilitado ou sem recipients → podem aparecer
    if (summaryCall) {
      expect(summaryCall[0]).not.toMatch(/fiscal=/);
    }
  });

  it('summary inclui múltiplos setores com razões diferentes', async () => {
    const { svc, logLog } = makeService({ prismaFindMany: vi.fn().mockResolvedValue([]) });
    const now = makeNow(7, 0);
    // fiscal: dentro da janela mas sem alertas → sem_alertas
    // logistic: tem recipients mas está fora da hora → fora_da_hora
    const sc = {
      fiscal: {
        recipients: [{ contact: '5511999990001', channel: 'whatsapp' }],
        sendHour: 7, sendMinute: 0, sendDays: [0,1,2,3,4,5,6],
      },
      logistic: {
        recipients: [{ contact: '5511999990002', channel: 'whatsapp' }],
        sendHour: 8, sendMinute: 0, sendDays: [0,1,2,3,4,5,6],
      },
      frota: {}, finance: {},
    };
    const cfg = { ...makeTenantConfig(sc), logisticEnabled: true };
    await callPerSector(svc, { now, sectorConfig: sc, config: cfg });
    const summaryCall = logLog.mock.calls.find((c: any[]) =>
      typeof c[0] === 'string' && c[0].includes('setores sem envio'),
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall[0]).toMatch(/fiscal=sem_alertas/);
    expect(summaryCall[0]).toMatch(/logistic=fora_da_hora/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 4 — T6/T7: horário de envio por CONTATO, unificado em T7 (2026-07-16)
// ─────────────────────────────────────────────────────────────────────────────

describe('processPerContact — T6/T7 horário por contato (unificado)', () => {
  function makeContact(overrides?: Partial<ContactRecipient>): ContactRecipient {
    return {
      id: 'c1',
      whatsapp: '5511999990001',
      emails: [],
      sectors: ['fiscal'],
      sendTimes: [{ hour: 8, minute: 0 }],
      sendDays: [0, 1, 2, 3, 4, 5, 6], // todos os dias — não é o foco destes testes
      ...overrides,
    };
  }

  function makeContactsConfig(contacts: ContactRecipient[], extra?: Record<string, any>) {
    return {
      tenantId: TENANT,
      enabled: true,
      fiscalEnabled: true,
      logisticEnabled: true,
      frotaEnabled: true,
      financeEnabled: true,
      contacts,
      ...extra,
    };
  }

  // category é obrigatório a partir do T7: o agrupamento por setor da mensagem
  // unificada (buildUnifiedMessage/buildUnifiedEmailHtml) filtra os alertas
  // retornados pela query única por `a.category === sector.key`.
  // severity NÃO é CRITICAL de propósito: o relatório programado (T7) exclui
  // CRITICAL (já foi mandado pelo canal imediato) — ver teste de regressão
  // "T7: CRITICAL nunca aparece" abaixo.
  const FISCAL_ALERT = { id: 'a1', category: 'fiscal', severity: 'OVERDUE', title: 'CT-e vencido', snoozedUntil: null };
  const LOGISTIC_ALERT = { id: 'a2', category: 'logistic', severity: 'DUE_SOON', title: 'Embarque atrasado', snoozedUntil: null };

  /**
   * T7: a query do modo per-contato agora é uma só, com `category: { in: [...] }`
   * cobrindo todos os setores habilitados do contato — este mock simula isso
   * devolvendo a união dos alertas de cada categoria pedida no `in`.
   */
  function makeFindManyByCategory(bySector: Record<string, any[]>) {
    return vi.fn().mockImplementation(({ where }: any) => {
      const cats: string[] = where?.category?.in ?? [];
      return Promise.resolve(cats.flatMap((c) => bySector[c] ?? []));
    });
  }

  async function callPerContact(svc: any, {
    now,
    contacts,
    config,
    force = false,
  }: {
    now: Date;
    contacts: ContactRecipient[];
    config: Record<string, any>;
    force?: boolean;
  }) {
    return svc['processPerContact'](
      TENANT,
      config,
      contacts,
      now,
      now.getHours(),
      now.getMinutes(),
      force,
    );
  }

  // ── 1 horário ──────────────────────────────────────────────────────────────

  it('contato com 1 horário: dispara exatamente nesse horário', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sendTimes: [{ hour: 8, minute: 0 }] });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
  });

  it('contato com 1 horário: NÃO dispara fora do horário (não vaza horário)', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sendTimes: [{ hour: 8, minute: 0 }] });
    const cfg = makeContactsConfig([contact]);
    // 13h — 5h de diferença, bem além da janela de catch-up (2h)
    await callPerContact(svc, { now: makeNow(13, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).not.toHaveBeenCalled();
  });

  // ── 2 horários / dedup por slot (T7: item b) ─────────────────────────────

  it('contato com 2 horários: ambos disparam em ticks diferentes, sem duplicar — dedup por slot unificado (T7)', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const update = vi.fn().mockResolvedValue({});
    const { svc, notification } = makeService({ prismaFindMany: findMany, prismaUpdate: update });
    const contact = makeContact({ sendTimes: [{ hour: 8, minute: 0 }, { hour: 13, minute: 0 }] });

    // Tick 1: 8h00 → dispara pro 1º horário
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: makeContactsConfig([contact]) });
    expect(notification.notifyPhone).toHaveBeenCalledTimes(1);

    // T7: chave de dedup/catch-up agora é "all|HH:MM" (slot unificado — todos os
    // setores do contato juntos), não mais "fiscal|HH:MM" por setor.
    const persistedContact = update.mock.calls[0][0].data.contacts[0];
    expect(persistedContact.lastDigestDate).toEqual({ 'all|08:00': '2026-07-13' });

    // Tick 2: 13h00 (mesmo dia) → dispara pro 2º horário — NÃO bloqueado pelo 1º já ter enviado
    await callPerContact(svc, { now: makeNow(13, 0), contacts: [persistedContact], config: makeContactsConfig([persistedContact]) });
    expect(notification.notifyPhone).toHaveBeenCalledTimes(2);

    // Tick 3: 8h05 (mesmo dia, mesmo slot 08:00 já enviado) → não duplica
    await callPerContact(svc, { now: makeNow(8, 5), contacts: [persistedContact], config: makeContactsConfig([persistedContact]) });
    expect(notification.notifyPhone).toHaveBeenCalledTimes(2);
  });

  // ── 3 horários ──────────────────────────────────────────────────────────────

  it('contato com 3 horários: os três disparam de forma independente', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({
      sendTimes: [{ hour: 7, minute: 0 }, { hour: 12, minute: 0 }, { hour: 19, minute: 0 }],
    });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(7, 0), contacts: [contact], config: cfg });
    await callPerContact(svc, { now: makeNow(12, 0), contacts: [contact], config: cfg });
    await callPerContact(svc, { now: makeNow(19, 0), contacts: [contact], config: cfg });

    expect(notification.notifyPhone).toHaveBeenCalledTimes(3);
  });

  // ── múltiplos e-mails ─────────────────────────────────────────────────────

  it('contato com múltiplos e-mails: todos recebem o mesmo digest', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const sendAlertEmail = vi.fn().mockResolvedValue({ sent: true });
    const { svc } = makeService({ prismaFindMany: findMany });
    (svc as any).emailReply = { sendAlertEmail };

    const contact = makeContact({
      whatsapp: undefined,
      emails: ['fiscal@empresa.com', 'copia@empresa.com'],
    });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    expect(sendAlertEmail).toHaveBeenCalledTimes(2);
    expect(sendAlertEmail.mock.calls.map((c: any[]) => c[0])).toEqual(
      expect.arrayContaining(['fiscal@empresa.com', 'copia@empresa.com']),
    );
  });

  // ── isolamento de setor ───────────────────────────────────────────────────

  it('contato marcado só pra "fiscal" NÃO recebe alerta de "logistic" mesmo com alertas abertos lá (não vaza setor)', async () => {
    const findMany = makeFindManyByCategory({ fiscal: [FISCAL_ALERT], logistic: [LOGISTIC_ALERT] });
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sectors: ['fiscal'] }); // NÃO inclui 'logistic'
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).toContain('CT-e vencido');
    expect(msg).not.toContain('Embarque atrasado');
    // T7: a query única só pede category:{in:['fiscal']} — 'logistic' nunca é consultado.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ category: { in: ['fiscal'] } }),
    }));
  });

  // ── T7 (a): 1 envio único consolidando ≥2 setores ────────────────────────

  it('T7: contato com 2 setores recebe 1 ÚNICA mensagem consolidando os alertas dos dois (antes eram 2 mensagens)', async () => {
    const findMany = makeFindManyByCategory({ fiscal: [FISCAL_ALERT], logistic: [LOGISTIC_ALERT] });
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sectors: ['fiscal', 'logistic'], sendTimes: [{ hour: 8, minute: 0 }] });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    // T7: 1 envio só (não mais 1 por setor).
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).toContain('CT-e vencido');
    expect(msg).toContain('Embarque atrasado');
    // T10: títulos de seção em CAIXA ALTA no formato tabular
    expect(msg).toContain('FISCAL');
    expect(msg).toContain('LOGÍSTICA');

    // 1 query só, com os dois setores no IN — não mais 1 query por (setor, horário).
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ category: { in: ['fiscal', 'logistic'] } }),
    }));
  });

  // ── T7 reformat: CRITICAL excluído do relatório programado ──────────────

  // 2026-07-20: a exclusão de CRITICAL do digest agora é CONDICIONAL ao canal
  // imediato estar ativo (MONITOR_IMMEDIATE_ALERTS=true). Com o imediato em
  // standby (default), o digest é o único canal e CRITICAL ENTRA — ver
  // monitor-flags.const.ts e docs/STANDBY.md.

  it('T7 (imediato ATIVO): alerta CRITICAL não aparece no relatório programado', async () => {
    const original = process.env.MONITOR_IMMEDIATE_ALERTS;
    process.env.MONITOR_IMMEDIATE_ALERTS = 'true';
    try {
      const criticalAlert = { id: 'a9', category: 'fiscal', severity: 'CRITICAL', title: 'CT-e cancelado', snoozedUntil: null };
      const findMany = vi.fn().mockResolvedValue([criticalAlert, FISCAL_ALERT]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('CT-e vencido'); // OVERDUE — aparece
      expect(msg).not.toContain('CT-e cancelado'); // CRITICAL — filtrado
      // where clause também exclui CRITICAL (otimização, além do filtro em memória)
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ severity: { notIn: ['CRITICAL'] } }),
      }));
    } finally {
      process.env.MONITOR_IMMEDIATE_ALERTS = original;
    }
  });

  it('T7 (imediato ATIVO): só CRITICAL no setor habilitado → não envia nada', async () => {
    const original = process.env.MONITOR_IMMEDIATE_ALERTS;
    process.env.MONITOR_IMMEDIATE_ALERTS = 'true';
    try {
      const criticalAlert = { id: 'a9', category: 'fiscal', severity: 'CRITICAL', title: 'CT-e cancelado', snoozedUntil: null };
      const findMany = vi.fn().mockResolvedValue([criticalAlert]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
      expect(notification.notifyPhone).not.toHaveBeenCalled();
    } finally {
      process.env.MONITOR_IMMEDIATE_ALERTS = original;
    }
  });

  it('STANDBY (default): CRITICAL ENTRA no digest — é o único canal ativo', async () => {
    const original = process.env.MONITOR_IMMEDIATE_ALERTS;
    delete process.env.MONITOR_IMMEDIATE_ALERTS;
    try {
      const criticalAlert = { id: 'a9', category: 'fiscal', severity: 'CRITICAL', title: 'CT-e cancelado', snoozedUntil: null };
      const findMany = vi.fn().mockResolvedValue([criticalAlert, FISCAL_ALERT]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('CT-e cancelado'); // CRITICAL — presente
      expect(msg).toContain('CT-e vencido');   // OVERDUE — presente
      // where clause NÃO exclui CRITICAL no standby
      const whereArg = findMany.mock.calls[0][0]?.where ?? {};
      expect(whereArg.severity).toBeUndefined();
    } finally {
      process.env.MONITOR_IMMEDIATE_ALERTS = original;
    }
  });

  it('STANDBY (default): só CRITICAL no setor → digest SAI mesmo assim', async () => {
    const original = process.env.MONITOR_IMMEDIATE_ALERTS;
    delete process.env.MONITOR_IMMEDIATE_ALERTS;
    try {
      const criticalAlert = { id: 'a9', category: 'fiscal', severity: 'CRITICAL', title: 'CT-e cancelado', snoozedUntil: null };
      const findMany = vi.fn().mockResolvedValue([criticalAlert]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('CT-e cancelado');
    } finally {
      process.env.MONITOR_IMMEDIATE_ALERTS = original;
    }
  });

  // ── Setor Compras / procurement (2026-07-20) ───────────────────────────────
  // 5º setor SEM coluna procurementEnabled: default-enabled — o opt-in real é a
  // assinatura do contato. Contato sem 'procurement' em sectors: intocado.

  describe('setor Compras (procurement)', () => {
    const PROC_ALERT = { id: 'p1', category: 'procurement', severity: 'OVERDUE', title: 'Cotação de pneus vencida', snoozedUntil: null };

    it('contato assinante recebe digest de Compras SEM procurementEnabled no config', async () => {
      const findMany = makeFindManyByCategory({ procurement: [PROC_ALERT] });
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sectors: ['procurement'] as any, sendTimes: [{ hour: 8, minute: 0 }] });
      const cfg = makeContactsConfig([contact]); // sem procurementEnabled
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('COMPRAS'); // T10: título de seção em caixa alta
      expect(msg).toContain('Cotação de pneus vencida');
    });

    it('procurementEnabled=false EXPLÍCITO desliga o setor (respeita opt-out futuro)', async () => {
      const findMany = makeFindManyByCategory({ procurement: [PROC_ALERT] });
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sectors: ['procurement'] as any, sendTimes: [{ hour: 8, minute: 0 }] });
      const cfg = makeContactsConfig([contact], { procurementEnabled: false });
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
      expect(notification.notifyPhone).not.toHaveBeenCalled();
    });

    it('contato SEM procurement nos sectors não recebe alerta de Compras (retrocompat)', async () => {
      const findMany = makeFindManyByCategory({ fiscal: [FISCAL_ALERT], procurement: [PROC_ALERT] });
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('CT-e vencido');
      expect(msg).not.toContain('Cotação de pneus'); // Compras não assinada → fora
    });
  });

  // ── THROTTLE por severidade + assimetria de canal (2026-07-20) ─────────────
  // WhatsApp: CRITICAL/OVERDUE sempre; DUE_SOON a cada 7 dias; INFO a cada 28
  // — ciclo POR CONTATO em `lastBandInclude`. E-mail: SEM throttle, recebe tudo.
  // makeNow() = 2026-07-13.

  describe('throttle por severidade (WhatsApp) × e-mail completo', () => {
    const DUE_SOON_ALERT = { id: 't1', category: 'fiscal', severity: 'DUE_SOON', title: 'Cotação vencendo amanhã', snoozedUntil: null };
    const OVERDUE_ALERT = { id: 't2', category: 'fiscal', severity: 'OVERDUE', title: 'CT-e vencido', snoozedUntil: null };
    const INFO_ALERT = { id: 't3', category: 'fiscal', severity: 'INFO', title: 'Aviso de rotina', snoozedUntil: null };

    it('DUE_SOON primeira vez: entra no WhatsApp e grava o ciclo no contato', async () => {
      const findMany = vi.fn().mockResolvedValue([DUE_SOON_ALERT]);
      const { svc, notification, prismaUpdate } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({ sendTimes: [{ hour: 8, minute: 0 }] }); // sem lastBandInclude
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('Cotação vencendo amanhã');
      // ciclo consumido: persistido com a data de hoje
      expect(contact.lastBandInclude?.DUE_SOON).toBe('2026-07-13');
      expect(prismaUpdate).toHaveBeenCalled();
    });

    it('DUE_SOON com ciclo em curso (ontem): suprimida no WhatsApp; OVERDUE passa', async () => {
      const findMany = vi.fn().mockResolvedValue([DUE_SOON_ALERT, OVERDUE_ALERT]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({
        sendTimes: [{ hour: 8, minute: 0 }],
        lastBandInclude: { DUE_SOON: '2026-07-12' }, // ontem — dentro dos 7 dias
      });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('CT-e vencido');            // OVERDUE — sempre
      expect(msg).not.toContain('Cotação vencendo');    // DUE_SOON — suprimida
      // ciclo NÃO regravado (não incluiu a faixa neste envio)
      expect(contact.lastBandInclude?.DUE_SOON).toBe('2026-07-12');
    });

    it('DUE_SOON com ciclo vencido (7 dias atrás): entra de novo', async () => {
      const findMany = vi.fn().mockResolvedValue([DUE_SOON_ALERT]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({
        sendTimes: [{ hour: 8, minute: 0 }],
        lastBandInclude: { DUE_SOON: '2026-07-06' }, // exatamente 7 dias
      });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      expect(contact.lastBandInclude?.DUE_SOON).toBe('2026-07-13');
    });

    it('INFO: ciclo de 28 dias (10 dias atrás → suprimida; 30 dias → entra)', async () => {
      const findMany = vi.fn().mockResolvedValue([INFO_ALERT, OVERDUE_ALERT]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({
        sendTimes: [{ hour: 8, minute: 0 }],
        lastBandInclude: { INFO: '2026-07-03' }, // 10 dias — em curso
      });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).not.toContain('Aviso de rotina');

      const findMany2 = vi.fn().mockResolvedValue([INFO_ALERT]);
      const { svc: svc2, notification: notification2 } = makeService({ prismaFindMany: findMany2 });
      const contact2 = makeContact({
        sendTimes: [{ hour: 8, minute: 0 }],
        lastBandInclude: { INFO: '2026-06-13' }, // 30 dias — venceu
      });
      await callPerContact(svc2, { now: makeNow(8, 0), contacts: [contact2], config: makeContactsConfig([contact2]) });
      const [, , msg2] = notification2.notifyPhone.mock.calls[0];
      expect(msg2).toContain('Aviso de rotina');
    });

    it('tudo suprimido e SEM e-mail: WhatsApp não sai e o slot NÃO é reivindicado', async () => {
      const findMany = vi.fn().mockResolvedValue([DUE_SOON_ALERT]);
      const { svc, notification, prismaUpdate } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({
        sendTimes: [{ hour: 8, minute: 0 }],
        lastBandInclude: { DUE_SOON: '2026-07-12' },
      });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).not.toHaveBeenCalled();
      expect(prismaUpdate).not.toHaveBeenCalled(); // slot livre pro próximo ciclo
    });

    it('assimetria: e-mail recebe o conjunto COMPLETO mesmo com WhatsApp suprimido', async () => {
      const findMany = vi.fn().mockResolvedValue([DUE_SOON_ALERT, OVERDUE_ALERT]);
      const { svc, notification, emailReply } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({
        sendTimes: [{ hour: 8, minute: 0 }],
        emails: ['gestor@empresa.com.br'],
        lastBandInclude: { DUE_SOON: '2026-07-12' }, // DUE_SOON suprimida no WA
      });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      // WhatsApp: só OVERDUE
      const [, , waMsg] = notification.notifyPhone.mock.calls[0];
      expect(waMsg).toContain('CT-e vencido');
      expect(waMsg).not.toContain('Cotação vencendo');

      // E-mail: texto e HTML completos, com a DUE_SOON suprimida do WA
      expect(emailReply.sendAlertEmail).toHaveBeenCalledOnce();
      const [, , emailText, , emailHtml] = emailReply.sendAlertEmail.mock.calls[0];
      expect(emailText).toContain('Cotação vencendo amanhã');
      expect(emailText).toContain('CT-e vencido');
      expect(emailHtml).toContain('Cotação vencendo amanhã');
    });

    it('escalação de faixa: evento que virou OVERDUE sai mesmo com ciclos todos em curso', async () => {
      // mesmo id que era DUE_SOON ontem — hoje o AlertState já está OVERDUE (sync atualiza severity)
      const escalated = { id: 't1', category: 'fiscal', severity: 'OVERDUE', title: 'Cotação venceu', snoozedUntil: null };
      const findMany = vi.fn().mockResolvedValue([escalated]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({
        sendTimes: [{ hour: 8, minute: 0 }],
        lastBandInclude: { DUE_SOON: '2026-07-12', INFO: '2026-07-12' },
      });
      const cfg = makeContactsConfig([contact]);
      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, , msg] = notification.notifyPhone.mock.calls[0];
      expect(msg).toContain('Cotação venceu');
    });
  });

  // ── T7 reformat: cap de 6 pendências por setor + overflow ───────────────

  it('T10: setor com mais de 3 pendências mostra só 3 + rodapé "+N no site"', async () => {
    const manyAlerts = Array.from({ length: 8 }, (_, i) => ({
      id: `f${i}`,
      category: 'fiscal',
      severity: 'OVERDUE',
      title: `Pendência fiscal ${i + 1}`,
      snoozedUntil: null,
    }));
    const findMany = vi.fn().mockResolvedValue(manyAlerts);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    // T10: cap caiu de 6 → 3; total do setor no título reflete os 8
    expect(msg).toContain('FISCAL (8)');
    for (let i = 1; i <= 3; i++) expect(msg).toContain(`Pendência fiscal ${i}`);
    for (let i = 4; i <= 8; i++) expect(msg).not.toContain(`Pendência fiscal ${i}`);
    expect(msg).toContain('+5 no site');
  });

  it('T10: setor com exatamente 3 pendências não mostra rodapé "+N no site"', async () => {
    const threeAlerts = Array.from({ length: 3 }, (_, i) => ({
      id: `f${i}`,
      category: 'fiscal',
      severity: 'OVERDUE',
      title: `Pendência fiscal ${i + 1}`,
      snoozedUntil: null,
    }));
    const findMany = vi.fn().mockResolvedValue(threeAlerts);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).toContain('FISCAL (3)');
    expect(msg).not.toContain('no site');
  });

  // ── T7 (d): setor desabilitado no tenant fica fora do relatório ─────────

  it('T7: setor desabilitado no tenant fica fora da mensagem mesmo que o contato o assine', async () => {
    const findMany = makeFindManyByCategory({ fiscal: [FISCAL_ALERT], logistic: [LOGISTIC_ALERT] });
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sectors: ['fiscal', 'logistic'], sendTimes: [{ hour: 8, minute: 0 }] });
    // logistic desabilitado globalmente pelo tenant — fiscal continua habilitado.
    const cfg = makeContactsConfig([contact], { logisticEnabled: false });
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).toContain('FISCAL');
    expect(msg).not.toContain('LOGÍSTICA');
    expect(msg).not.toContain('Embarque atrasado');
    // setor desabilitado nem entra na query — só fiscal é consultado.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ category: { in: ['fiscal'] } }),
    }));
  });

  it('setor desabilitado globalmente pelo tenant não dispara mesmo se o contato assina (nenhum setor sobra)', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sectors: ['fiscal'] });
    const cfg = makeContactsConfig([contact], { fiscalEnabled: false });
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).not.toHaveBeenCalled();
    // Nem chega a consultar o banco — não sobrou setor habilitado pra este contato.
    expect(findMany).not.toHaveBeenCalled();
  });

  // ── T7 (e): sem alertas em nenhum setor habilitado → sem envio ──────────

  it('T7: nenhum alerta em nenhum setor habilitado do contato → não envia nada no slot', async () => {
    const findMany = vi.fn().mockResolvedValue([]); // nenhum alerta aberto, nem fiscal nem logistic
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sectors: ['fiscal', 'logistic'], sendTimes: [{ hour: 8, minute: 0 }] });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).not.toHaveBeenCalled();
  });

  // ── T7 (c): compat com chave antiga do mesmo dia (dia do deploy) ────────

  it('T7 compat: chave antiga pré-T7 ("<setor>|HH:MM") de HOJE pro mesmo horário impede reenvio duplicado', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const todayStr = svc.toDateStr(makeNow(8, 0));
    // Simula um contato que já recebeu o digest de "fiscal" às 08:00 HOJE pelo
    // código pré-T7 (antes do redeploy) — chave antiga, formato "<setor>|HH:MM".
    const contact = makeContact({
      sectors: ['fiscal'],
      sendTimes: [{ hour: 8, minute: 0 }],
      lastDigestDate: { 'fiscal|08:00': todayStr },
    });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    // T7 lê a chave antiga como "já enviado" pro slot unificado — não duplica.
    expect(notification.notifyPhone).not.toHaveBeenCalled();
  });

  it('T7 compat: chave antiga de ONTEM não bloqueia o envio de hoje', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({
      sectors: ['fiscal'],
      sendTimes: [{ hour: 8, minute: 0 }],
      lastDigestDate: { 'fiscal|08:00': '2026-07-12' }, // ontem
    });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
  });

  // ── dia da semana ─────────────────────────────────────────────────────────

  it('respeita sendDays do contato — não dispara fora do dia configurado', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    // makeNow usa 2026-07-13 = segunda (weekday 1); contato só envia no fim de semana (0,6)
    const contact = makeContact({ sendDays: [0, 6] });
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).not.toHaveBeenCalled();
  });

  // ── catch-up ──────────────────────────────────────────────────────────────

  it('catch-up: dispara até 119min após o horário configurado, expira em 120min', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc: svcOk, notification: notifOk } = makeService({ prismaFindMany: findMany });
    const contactOk = makeContact({ sendTimes: [{ hour: 8, minute: 0 }] });
    await callPerContact(svcOk, { now: makeNow(9, 59), contacts: [contactOk], config: makeContactsConfig([contactOk]) }); // +119min
    expect(notifOk.notifyPhone).toHaveBeenCalledOnce();

    const { svc: svcExpired, notification: notifExpired } = makeService({ prismaFindMany: findMany });
    const contactExpired = makeContact({ sendTimes: [{ hour: 8, minute: 0 }] });
    await callPerContact(svcExpired, { now: makeNow(10, 0), contacts: [contactExpired], config: makeContactsConfig([contactExpired]) }); // +120min
    expect(notifExpired.notifyPhone).not.toHaveBeenCalled();
  });

  // ── força (notify-now) ────────────────────────────────────────────────────

  it('force=true ignora horário/dia e envia imediatamente', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification } = makeService({ prismaFindMany: findMany });
    const contact = makeContact({ sendTimes: [{ hour: 8, minute: 0 }], sendDays: [0, 6] }); // hoje é segunda, não bateria
    const cfg = makeContactsConfig([contact]);
    await callPerContact(svc, { now: makeNow(15, 37), contacts: [contact], config: cfg, force: true });
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
  });

  // ── regressão: routing em processForTenant ───────────────────────────────

  it('processForTenant roteia pra processPerContact (não pro sectorConfig legado) quando há contacts válido', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const update = vi.fn().mockResolvedValue({});
    const { svc, notification, prisma } = makeService({ prismaFindMany: findMany, prismaUpdate: update });
    // sectorConfig legado usa um telefone DIFERENTE do contato — se o roteamento
    // errasse e caísse no modo per-sector, o número enviado seria o do sectorConfig.
    const legacySectorConfig = makeSectorConfig({
      fiscal: { recipients: [{ contact: '5511777770000', channel: 'whatsapp' }], sendHour: 7, sendMinute: 0, sendDays: [0,1,2,3,4,5,6] },
    });
    prisma.tenantNotificationConfig = {
      ...prisma.tenantNotificationConfig,
      findUnique: vi.fn().mockResolvedValue(
        makeContactsConfig([makeContact()], { sectorConfig: legacySectorConfig }),
      ),
    };
    // force=true — só testando roteamento, não timing (processForTenant usa o relógio real).
    await svc['processForTenant'](TENANT, true);

    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    const [, phoneUsed] = notification.notifyPhone.mock.calls[0];
    expect(phoneUsed).toBe('5511999990001'); // número do CONTATO, não do sectorConfig legado
  });

  it('tenant sem contacts (null) continua no modo per-sector — sem regressão', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification, prisma } = makeService({ prismaFindMany: findMany });
    const sc = makeSectorConfig();
    prisma.tenantNotificationConfig = {
      ...prisma.tenantNotificationConfig,
      findUnique: vi.fn().mockResolvedValue(makeTenantConfig(sc, { contacts: null })),
    };
    await svc['processForTenant'](TENANT, true);
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    const [, phoneUsed] = notification.notifyPhone.mock.calls[0];
    expect(phoneUsed).toBe('5511999990001'); // vem do sectorConfig (fixture padrão de makeSectorConfig)
  });

  // ── T8.6: visão do caixa anexada ao último digest do dia ────────────────────

  const CASH_VIEW_OK = {
    inflow15d: { amount: 58300, count: 14 },
    outflow15d: { amount: 41700, count: 9 },
    overdueReceivable: { amount: 12400, count: 3 },
    unbilledCte: { amount: 34200, count: 12 },
    invoicedMonth: { amount: 148200 },
  };

  it('T9-ADENDO: bloco "💰 SEU CAIXA" aparece em TODOS os horários do dia do contato (não só no último)', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue(CASH_VIEW_OK);
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({
      sectors: ['fiscal'],
      sendTimes: [{ hour: 8, minute: 0 }, { hour: 18, minute: 0 }],
      cashView: 'on',
    });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    const [, , msgFirst] = notification.notifyPhone.mock.calls[0];
    // T10: bloco do caixa no formato tabular (sem emoji)
    expect(msgFirst).toContain(' SEU CAIXA — seg 13/07');
    expect(msgFirst).toContain('Sobra');

    await callPerContact(svc, { now: makeNow(18, 0), contacts: [contact], config: cfg });
    const [, , msgLast] = notification.notifyPhone.mock.calls[1];
    expect(msgLast).toContain(' SEU CAIXA — seg 13/07');
    expect(msgLast).toContain('Sobra');
  });

  it("T9-ADENDO: compat — cashView='lastSlot' (alias legado) continua ligando o bloco em TODOS os horários", async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue(CASH_VIEW_OK);
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({
      sectors: ['fiscal'],
      sendTimes: [{ hour: 8, minute: 0 }, { hour: 18, minute: 0 }],
      cashView: 'lastSlot',
    });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    const [, , msgFirst] = notification.notifyPhone.mock.calls[0];
    expect(msgFirst).toContain(' SEU CAIXA — seg 13/07');

    await callPerContact(svc, { now: makeNow(18, 0), contacts: [contact], config: cfg });
    const [, , msgLast] = notification.notifyPhone.mock.calls[1];
    expect(msgLast).toContain(' SEU CAIXA — seg 13/07');
  });

  it('T9-ADENDO: "Faturado hoje"/"Gasto hoje" aparecem quando o TMS manda invoicedToday/paidToday', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue({
      ...CASH_VIEW_OK,
      invoicedToday: { amount: 8400, count: 3 },
      paidToday: { amount: 5100, count: 2 },
    });
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }], cashView: 'on' });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    // T10: linhas do dia no formato coluna (inteiro BRL alinhado à direita)
    expect(msg).toContain('Faturado hoje');
    expect(msg).toContain('R$  8.400');
    expect(msg).toContain('Pago hoje');
    expect(msg).toContain('R$  5.100');
  });

  it('T9-ADENDO: TMS antigo sem invoicedToday/paidToday → linhas do dia omitidas, resto do bloco intacto', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue(CASH_VIEW_OK); // sem invoicedToday/paidToday
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }], cashView: 'on' });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).not.toContain('Faturado hoje');
    expect(msg).not.toContain('Pago hoje');
    expect(msg).toContain(' SEU CAIXA — seg 13/07');
    expect(msg).toContain('Sobra');
  });

  it('T9-ADENDO: apenas invoicedToday presente (sem paidToday) → só a linha de faturado aparece', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue({
      ...CASH_VIEW_OK,
      invoicedToday: { amount: 1200, count: 1 },
    });
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }], cashView: 'on' });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).toContain('Faturado hoje');
    expect(msg).toContain('R$  1.200');
    expect(msg).not.toContain('Pago hoje');
  });

  it('T8.6: cashView ausente/off → bloco nunca aparece, mesmo no último horário', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue(CASH_VIEW_OK);
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }] }); // cashView ausente
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).not.toContain('SEU CAIXA');
    expect(getCashView).not.toHaveBeenCalled(); // nem chama o TMS — feature desligada
  });

  it('T8.6: TMS retorna null pro cash-view → digest sai normal, sem o bloco', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue(null);
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }], cashView: 'lastSlot' });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledOnce(); // pendências saem normal
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).not.toContain('SEU CAIXA');
  });

  it('T8.6: saldo negativo (outflow > inflow) → linha "🔴 Falta: R$ X"', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue({
      inflow15d: { amount: 10000, count: 2 },
      outflow15d: { amount: 25000, count: 5 },
      overdueReceivable: { amount: 0, count: 0 },
      unbilledCte: { amount: 0, count: 0 },
      invoicedMonth: { amount: 0 },
    });
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    const contact = makeContact({ sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }], cashView: 'lastSlot' });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    const [, , msg] = notification.notifyPhone.mock.calls[0];
    // T10: coluna de dinheiro — "Falta" com valor inteiro alinhado
    expect(msg).toContain('Falta');
    expect(msg).toContain('R$ 15.000');
    expect(msg).not.toContain('Sobra');
  });

  it('T8.6: cache — 1 chamada TMS por tenant por dia mesmo com 2 contatos elegíveis no mesmo tenant', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const getCashView = vi.fn().mockResolvedValue(CASH_VIEW_OK);
    const { svc, notification } = makeService({ prismaFindMany: findMany, getCashView });
    // Dois contatos independentes, cada um com seu único horário (= último do próprio contato).
    const contactA = makeContact({ id: 'ca', whatsapp: '5511999990001', sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }], cashView: 'lastSlot' });
    const contactB = makeContact({ id: 'cb', whatsapp: '5511999990002', sectors: ['fiscal'], sendTimes: [{ hour: 8, minute: 0 }], cashView: 'lastSlot' });
    const cfg = makeContactsConfig([contactA, contactB]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contactA, contactB], config: cfg });

    expect(notification.notifyPhone).toHaveBeenCalledTimes(2);
    expect(getCashView).toHaveBeenCalledOnce(); // cacheado por tenant+dia — não 1 por contato
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 5 — T9-FIX (2026-07-17): investigação "envios parados"
//
// Causa raiz encontrada: `processPerContact` reivindicava o slot de dedup
// (dedupKey + lastDigestDate) e contava os alertas em `totalSent` ANTES de
// checar se `effectiveDelivery(contact).digest` tinha algum canal de fato
// ligado — um contato com o digest desligado nos dois canais (JSON salvo
// assim, ou uma regressão futura na derivação) "consumia" o horário do dia
// silenciosamente: nada saía, e o único log era nível debug (invisível no log
// level padrão de produção). Mesmo padrão existia em `closing-report.service`
// pra `lastClosingDate`. Fix: trava defensiva ANTES do claim + log explícito.
// ─────────────────────────────────────────────────────────────────────────────

describe('T9-FIX (2026-07-17) — trava defensiva de delivery zerado + log de skip da janela', () => {
  function makeContact(overrides?: Partial<ContactRecipient>): ContactRecipient {
    return {
      id: 'c1',
      whatsapp: '5511999990001',
      emails: [],
      sectors: ['fiscal'],
      sendTimes: [{ hour: 8, minute: 0 }],
      sendDays: [0, 1, 2, 3, 4, 5, 6],
      ...overrides,
    };
  }

  function makeContactsConfig(contacts: ContactRecipient[], extra?: Record<string, any>) {
    return {
      tenantId: TENANT,
      enabled: true,
      fiscalEnabled: true,
      logisticEnabled: true,
      frotaEnabled: true,
      financeEnabled: true,
      contacts,
      ...extra,
    };
  }

  const FISCAL_ALERT = { id: 'a1', category: 'fiscal', severity: 'OVERDUE', title: 'CT-e vencido', snoozedUntil: null };

  async function callPerContact(svc: any, {
    now, contacts, config, force = false,
  }: { now: Date; contacts: ContactRecipient[]; config: Record<string, any>; force?: boolean }) {
    return svc['processPerContact'](TENANT, config, contacts, now, now.getHours(), now.getMinutes(), force);
  }

  it(
    'suspeito (b) — contato EXATAMENTE como os de produção (sem `delivery`, com whatsapp e emails, ' +
      'closingReport/cashView presentes) RECEBE o digest normalmente',
    async () => {
      const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
      const { svc, notification } = makeService({ prismaFindMany: findMany });
      const contact = makeContact({
        whatsapp: '5511999990001',
        emails: ['financeiro@empresa.com.br'],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        closingReport: 'monthly',
        cashView: 'on',
        // delivery: AUSENTE de propósito — é exatamente o caso descrito por Abel.
      });
      const cfg = makeContactsConfig([contact]);

      await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

      expect(notification.notifyPhone).toHaveBeenCalledOnce();
      const [, phone] = notification.notifyPhone.mock.calls[0];
      expect(phone).toBe('5511999990001');
    },
  );

  it('trava: delivery.digest desligado nos DOIS canais → nada é enviado, slot NÃO é reivindicado, warn logado', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const update = vi.fn().mockResolvedValue({});
    const { svc, notification, emailReply, logWarn } = makeService({ prismaFindMany: findMany, prismaUpdate: update });
    const contact = makeContact({
      whatsapp: '5511999990001',
      emails: ['financeiro@empresa.com.br'],
      delivery: {
        digest: { whatsapp: false, email: false },
        closing: { whatsapp: true, email: true },
      },
    });
    const cfg = makeContactsConfig([contact]);

    const sent = await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    expect(notification.notifyPhone).not.toHaveBeenCalled();
    expect(emailReply.sendAlertEmail).not.toHaveBeenCalled();
    expect(sent).toBe(0);

    // Slot NÃO reivindicado: nenhum update grava lastDigestDate pro slot 08:00.
    const persistedLastDigest = update.mock.calls.map((c: any[]) => c[0]?.data?.contacts?.[0]?.lastDigestDate);
    expect(persistedLastDigest.every((d: any) => !d?.['all|08:00'])).toBe(true);

    expect(logWarn).toHaveBeenCalled();
    const warnMsg = logWarn.mock.calls.map((c: any[]) => c[0]).find((m: string) => m.includes('delivery.digest sem canal habilitado'));
    expect(warnMsg).toBeDefined();
    expect(warnMsg).toMatch(/slot 08:00 pulado/);
    expect(warnMsg).toContain(`tenant=${TENANT}`);
    expect(warnMsg).toContain('contato=c1');
  });

  it('trava: contato com só WhatsApp desligado (e-mail ligado) ainda envia por e-mail normalmente (não é bloqueado)', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const { svc, notification, emailReply } = makeService({
      prismaFindMany: findMany,
      // sendAlertEmail precisa "ter sucesso" pra este teste — default do mock é sent:false.
    });
    (emailReply.sendAlertEmail as any).mockResolvedValue({ sent: true });
    const contact = makeContact({
      whatsapp: '5511999990001',
      emails: ['financeiro@empresa.com.br'],
      delivery: {
        digest: { whatsapp: false, email: true },
        closing: { whatsapp: false, email: false },
      },
    });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    expect(notification.notifyPhone).not.toHaveBeenCalled();
    expect(emailReply.sendAlertEmail).toHaveBeenCalledOnce();
  });

  it('suspeito (a) — janela de envio: skip da janela loga IMEDIATAMENTE (não só no resumo agregado do fim do tick)', async () => {
    const { svc, logLog } = makeService();
    const contact = makeContact({ sendTimes: [{ hour: 8, minute: 0 }] });
    // Config com janela custom 9h-18h — 8h00 fica FORA da janela.
    const cfg = makeContactsConfig([contact], { sendWindowStart: 9, sendWindowEnd: 18 });

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });

    const explicitSkipLog = logLog.mock.calls
      .map((c: any[]) => c[0])
      .find((m: string) => typeof m === 'string' && m.startsWith('Monitor: slot 08:00 pulado'));
    expect(explicitSkipLog).toBeDefined();
    expect(explicitSkipLog).toContain('fora da janela de envio (9-18h)');
    expect(explicitSkipLog).toContain(`tenant=${TENANT}`);
    expect(explicitSkipLog).toContain('contato=c1');
  });

  it('suspeito (c) — dedup por slot não quebra com cashView=\'on\' (compat pós \'lastSlot\'→\'on\'): 2º tick no mesmo slot não duplica', async () => {
    const findMany = vi.fn().mockResolvedValue([FISCAL_ALERT]);
    const update = vi.fn().mockResolvedValue({});
    const { svc, notification } = makeService({ prismaFindMany: findMany, prismaUpdate: update });
    const contact = makeContact({ sendTimes: [{ hour: 8, minute: 0 }], cashView: 'on' });
    const cfg = makeContactsConfig([contact]);

    await callPerContact(svc, { now: makeNow(8, 0), contacts: [contact], config: cfg });
    expect(notification.notifyPhone).toHaveBeenCalledTimes(1);

    const persistedContact = update.mock.calls[0][0].data.contacts[0];
    expect(persistedContact.lastDigestDate).toEqual({ 'all|08:00': '2026-07-13' });

    // Mesmo slot, 3min depois (mesmo tick de 5min) — não deve duplicar.
    await callPerContact(svc, { now: makeNow(8, 3), contacts: [persistedContact], config: makeContactsConfig([persistedContact]) });
    expect(notification.notifyPhone).toHaveBeenCalledTimes(1);
  });
});
