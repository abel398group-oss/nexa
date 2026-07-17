/**
 * ClosingReportService — T8 (2026-07-16): testes mínimos do doc
 * docs/monitor/t8-fechamento-scheduler-2026-07.md:
 *   (a) dia comum → não faz nada
 *   (b) dia 16 → só biweekly recebem
 *   (c) dia 1º → biweekly (com bloco do mês) e monthly
 *   (d) dedup por lastClosingDate (rodar 2x no mesmo dia → 1 envio)
 *   (e) TMS null → zero envios + warn
 *   (f) variações ▲/▼ e divisão por zero (nunca "Infinity%"/"NaN")
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClosingReportService } from './closing-report.service';
import type { ContactRecipient } from './contact-recipient.types';
import type { TmsClosingReport } from '@/application/connectors/hipertms.connector';

function makeReport(overrides?: Partial<TmsClosingReport>): TmsClosingReport {
  return {
    period: { start: '2026-07-01', end: '2026-07-15', label: '1ª quinzena de julho' },
    previous: { start: '2026-06-16', end: '2026-06-30', label: '2ª quinzena de junho' },
    revenue: { current: 148200, previous: 132300 },
    costs: { current: 96500, previous: 92800 },
    sales: {
      quotesCreated: 118,
      quotesConverted: 41,
      conversionRate: 0.35,
      avgTicket: { current: 2510, previous: 2340 },
      shipmentsCreated: 70,
      shipmentsCompleted: 63,
    },
    cash: { receivedInPeriod: 132000, overdueOpenAmount: 12400, overdueOpenCount: 3, delinquencyRate: 0.086 },
    ...overrides,
  };
}

function makeContact(overrides?: Partial<ContactRecipient>): ContactRecipient {
  return {
    id: 'c1',
    whatsapp: '5511999990001',
    emails: [],
    sectors: ['fiscal'],
    sendTimes: [{ hour: 8, minute: 0 }],
    sendDays: [1, 2, 3, 4, 5],
    closingReport: 'biweekly',
    ...overrides,
  };
}

function makeService(overrides?: {
  contacts?: ContactRecipient[];
  getClosingReport?: any;
  notifyPhone?: any;
  sendAlertEmail?: any;
}) {
  const contacts = overrides?.contacts ?? [makeContact()];
  const tenantFindMany = vi.fn().mockResolvedValue([{ id: 'tenant-1', slug: 'acme' }]);
  const configFindMany = vi.fn().mockResolvedValue([{ tenantId: 'tenant-1', contacts }]);
  const update = vi.fn().mockResolvedValue({});

  const prisma = {
    tenant: { findMany: tenantFindMany },
    tenantNotificationConfig: { findMany: configFindMany, update },
  } as any;

  const tms = {
    getClosingReport: overrides?.getClosingReport ?? vi.fn().mockResolvedValue(makeReport()),
  } as any;

  const notification = {
    notifyPhone: overrides?.notifyPhone ?? vi.fn().mockResolvedValue(undefined),
  } as any;

  const emailReply = {
    sendAlertEmail: overrides?.sendAlertEmail ?? vi.fn().mockResolvedValue({ sent: true }),
  } as any;

  const lock = { acquire: vi.fn().mockResolvedValue(async () => {}) } as any;

  const svc: any = new ClosingReportService(prisma, tms, notification, emailReply, lock);
  const logLog = vi.fn();
  const logWarn = vi.fn();
  svc['logger'] = { log: logLog, warn: logWarn, debug: vi.fn(), error: vi.fn() };

  return { svc, prisma, tms, notification, emailReply, configFindMany, update, logWarn };
}

beforeEach(() => {
  process.env.MONITOR_ENABLED = 'true';
});

describe('ClosingReportService', () => {
  it('MONITOR_ENABLED != true → não faz nada em nenhum dia', async () => {
    process.env.MONITOR_ENABLED = 'false';
    const { svc, tms } = makeService();
    const result = await svc.runDailyLocked(new Date(2026, 6, 16, 7, 0)); // dia 16 — bateria se enabled
    expect(result).toEqual({ tenants: 0, sent: 0 });
    expect(tms.getClosingReport).not.toHaveBeenCalled();
  });

  it('(a) dia comum (não é 1º nem 16) → não faz nada, nunca chama o TMS', async () => {
    const { svc, tms } = makeService();
    const result = await svc.runDailyLocked(new Date(2026, 6, 10, 7, 0));
    expect(result).toEqual({ tenants: 0, sent: 0 });
    expect(tms.getClosingReport).not.toHaveBeenCalled();
  });

  it('(b) dia 16 → só contatos biweekly recebem; monthly nem entra na iteração', async () => {
    const contacts = [
      makeContact({ id: 'c-bi', closingReport: 'biweekly' }),
      makeContact({ id: 'c-mo', whatsapp: '5511999990002', closingReport: 'monthly' }),
    ];
    const { svc, tms, notification } = makeService({ contacts });
    await svc.runDailyLocked(new Date(2026, 6, 16, 7, 0));

    expect(tms.getClosingReport).toHaveBeenCalledOnce();
    expect(tms.getClosingReport).toHaveBeenCalledWith(expect.any(String), 'biweekly', expect.any(String));
    expect(notification.notifyPhone).toHaveBeenCalledOnce();
    expect(notification.notifyPhone).toHaveBeenCalledWith('tenant-1', '5511999990001', expect.any(String));
  });

  it('(c) dia 1º → biweekly (com bloco do mês) E monthly, 1 chamada TMS por kind', async () => {
    const contacts = [
      makeContact({ id: 'c-bi', closingReport: 'biweekly' }),
      makeContact({ id: 'c-mo', whatsapp: '5511999990002', closingReport: 'monthly' }),
    ];
    const getClosingReport = vi.fn().mockImplementation((_id: string, kind: string) =>
      Promise.resolve(
        kind === 'biweekly'
          ? makeReport({ monthSummary: { revenue: 281400, costs: 189200 } })
          : makeReport({ period: { start: '2026-06-01', end: '2026-06-30', label: 'Junho de 2026' } }),
      ),
    );
    const { svc, tms, notification } = makeService({ contacts, getClosingReport });
    await svc.runDailyLocked(new Date(2026, 6, 1, 7, 0));

    expect(tms.getClosingReport).toHaveBeenCalledTimes(2);
    expect(tms.getClosingReport).toHaveBeenCalledWith(expect.any(String), 'biweekly', expect.any(String));
    expect(tms.getClosingReport).toHaveBeenCalledWith(expect.any(String), 'monthly', expect.any(String));
    expect(notification.notifyPhone).toHaveBeenCalledTimes(2);

    const biweeklyCall = notification.notifyPhone.mock.calls.find((c: any[]) => c[1] === '5511999990001');
    expect(biweeklyCall[2]).toContain('📅 MÊS DE');

    const monthlyCall = notification.notifyPhone.mock.calls.find((c: any[]) => c[1] === '5511999990002');
    expect(monthlyCall[2]).not.toContain('📅 MÊS DE'); // monthly não tem monthSummary — nunca mostra o bloco
  });

  it('(d) dedup por lastClosingDate — rodar 2x no mesmo dia envia só 1 vez e não chama o TMS de novo', async () => {
    const contact = makeContact();
    const { svc, tms, notification } = makeService({ contacts: [contact] });
    const now = new Date(2026, 6, 16, 7, 0);

    await svc.runDailyLocked(now);
    expect(notification.notifyPhone).toHaveBeenCalledTimes(1);
    expect(tms.getClosingReport).toHaveBeenCalledTimes(1);

    await svc.runDailyLocked(now);
    expect(notification.notifyPhone).toHaveBeenCalledTimes(1); // não duplicou
    expect(tms.getClosingReport).toHaveBeenCalledTimes(1); // dedup corta ANTES de chamar o TMS de novo
  });

  it('(e) TMS retorna null → zero envios + warn, nenhum contato marcado como enviado', async () => {
    const { svc, notification, logWarn } = makeService({ getClosingReport: vi.fn().mockResolvedValue(null) });
    const result = await svc.runDailyLocked(new Date(2026, 6, 16, 7, 0));
    expect(result.sent).toBe(0);
    expect(notification.notifyPhone).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('TMS retornou null'));
  });

  it('(f) sem `previous` (zero/ausente) → nenhuma seta ▲/▼, nunca "Infinity%"/"NaN"', async () => {
    const report = makeReport({
      revenue: { current: 1000, previous: 0 },
      costs: { current: 500, previous: 0 },
      sales: {
        quotesCreated: 0,
        quotesConverted: 0,
        conversionRate: 0,
        avgTicket: { current: 0, previous: 0 },
        shipmentsCreated: 0,
        shipmentsCompleted: 0,
      },
      cash: { receivedInPeriod: 0, overdueOpenAmount: 0, overdueOpenCount: 0, delinquencyRate: 0 },
    });
    const { svc, notification } = makeService({ getClosingReport: vi.fn().mockResolvedValue(report) });
    await svc.runDailyLocked(new Date(2026, 6, 16, 7, 0));

    const [, , msg] = notification.notifyPhone.mock.calls[0];
    expect(msg).not.toContain('Infinity');
    expect(msg).not.toContain('NaN');
    expect(msg).not.toMatch(/▲|▼/);
  });

  it('e-mail: contato só com e-mail recebe via sendAlertEmail com assunto e corpo esperados', async () => {
    const contact = makeContact({ whatsapp: undefined, emails: ['financeiro@empresa.com'] });
    const { svc, emailReply } = makeService({ contacts: [contact] });
    await svc.runDailyLocked(new Date(2026, 6, 16, 7, 0));

    expect(emailReply.sendAlertEmail).toHaveBeenCalledOnce();
    const [to, subject, body] = emailReply.sendAlertEmail.mock.calls[0];
    expect(to).toBe('financeiro@empresa.com');
    expect(subject).toContain('Fechamento');
    expect(body).toContain('📊 HiperTMS — Fechamento');
  });

  it('tenant sem contatos elegíveis pro kind do dia → não chama o TMS', async () => {
    const { svc, tms } = makeService({ contacts: [makeContact({ closingReport: 'off' })] });
    await svc.runDailyLocked(new Date(2026, 6, 16, 7, 0));
    expect(tms.getClosingReport).not.toHaveBeenCalled();
  });
});
