import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevWatchService } from './dev-watch.service';
import { MonitorService } from './monitor.service';
import { ConsolidationService } from './consolidation.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { ConversationJanitorService } from '@/application/conversations/conversation-janitor.service';
import { ProactiveEngineCron } from '@/application/proactive-engine/proactive-engine.cron';
import { PrismaService } from '@/infra/prisma/prisma.service';

// ─── DevWatchService — 4 falhas silenciosas → alerta de dev ──────────────────

function resetSignals() {
  MonitorService.lastDegradedAt = null;
  ConsolidationService.lastTickAt = new Date(); // recém-rodou → cron saudável
  ConversationJanitorService.lastRunAt = new Date();
  ProactiveEngineCron.lastRunAt = new Date();
  PrismaService.slowQueryCount = 0;
  (ConversationAgentService.latency as any).reset?.();
  // zera latência forçando amostras baixas
  for (let i = 0; i < 20; i++) ConversationAgentService.latency.record(100);
}

function makeService(costSum = { estimatedCostUsd: 0, tokensIn: 0, tokensOut: 0 }) {
  const adminAlert = { notifyAdmin: vi.fn().mockResolvedValue({ whatsapp: true, email: true }) } as any;
  const prisma = {
    aiMessage: { aggregate: vi.fn().mockResolvedValue({ _sum: costSum }) },
  } as any;
  return { svc: new DevWatchService(adminAlert, prisma), adminAlert, prisma };
}

describe('DevWatchService.tick', () => {
  const orig = process.env.DEV_WATCH_ENABLED;
  beforeEach(() => {
    process.env.DEV_WATCH_ENABLED = 'true';
    resetSignals();
  });
  afterEach(() => {
    process.env.DEV_WATCH_ENABLED = orig;
    resetSignals();
  });

  it('tudo saudável → não avisa', async () => {
    const { svc, adminAlert } = makeService();
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('1) TMS degradado recente → avisa', async () => {
    MonitorService.lastDegradedAt = new Date(); // agora
    const { svc, adminAlert } = makeService();
    await svc.tick();
    const [, body] = adminAlert.notifyAdmin.mock.calls[0];
    expect(body).toContain('TMS→Nexa');
  });

  it('2) Lia lenta (p95 alto) → avisa', async () => {
    process.env.LIA_LATENCY_WARN_MS = '1000';
    for (let i = 0; i < 20; i++) ConversationAgentService.latency.record(9000);
    const { svc, adminAlert } = makeService();
    await svc.tick();
    const [, body] = adminAlert.notifyAdmin.mock.calls[0];
    expect(body).toContain('Lia lenta');
    delete process.env.LIA_LATENCY_WARN_MS;
  });

  it('3) queries lentas acumulando (delta ≥ limiar) → avisa', async () => {
    PrismaService.slowQueryCount = 50;
    const { svc, adminAlert } = makeService();
    await svc.tick();
    const [, body] = adminAlert.notifyAdmin.mock.calls[0];
    expect(body).toContain('query');
  });

  it('4) cron de digest parado (>15min) → avisa', async () => {
    ConsolidationService.lastTickAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min atrás
    const { svc, adminAlert } = makeService();
    await svc.tick();
    const [, body] = adminAlert.notifyAdmin.mock.calls[0];
    expect(body).toContain('Cron parado');
    expect(body).toContain('digest');
  });

  it('cron que NUNCA rodou (null) não gera falso-positivo', async () => {
    ConsolidationService.lastTickAt = null;
    const { svc, adminAlert } = makeService();
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('dedup: 2 ticks no mesmo dia = 1 aviso só', async () => {
    MonitorService.lastDegradedAt = new Date();
    const { svc, adminAlert } = makeService();
    await svc.tick();
    await svc.tick();
    expect(adminAlert.notifyAdmin).toHaveBeenCalledOnce();
  });

  it('DEV_WATCH_ENABLED=false → não avisa', async () => {
    process.env.DEV_WATCH_ENABLED = 'false';
    MonitorService.lastDegradedAt = new Date();
    const { svc, adminAlert } = makeService();
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
  });

  it('vários sinais no mesmo tick → um aviso com todos', async () => {
    MonitorService.lastDegradedAt = new Date();
    PrismaService.slowQueryCount = 100;
    const { svc, adminAlert } = makeService();
    await svc.tick();
    expect(adminAlert.notifyAdmin).toHaveBeenCalledOnce();
    const [, body] = adminAlert.notifyAdmin.mock.calls[0];
    expect(body).toContain('TMS→Nexa');
    expect(body).toContain('query');
  });

  // ── 5) orçamento Anthropic ────────────────────────────────────────────────

  it('gasto Anthropic ≥ orçamento diário → avisa', async () => {
    process.env.AI_BUDGET_DAILY_USD = '10';
    const { svc, adminAlert } = makeService({ estimatedCostUsd: 12.5, tokensIn: 500000, tokensOut: 100000 });
    await svc.tick();
    const [, body] = adminAlert.notifyAdmin.mock.calls[0];
    expect(body).toContain('Gasto Anthropic');
    expect(body).toContain('12.50');
    delete process.env.AI_BUDGET_DAILY_USD;
  });

  it('gasto abaixo do orçamento → não avisa', async () => {
    process.env.AI_BUDGET_DAILY_USD = '10';
    const { svc, adminAlert } = makeService({ estimatedCostUsd: 3, tokensIn: 100, tokensOut: 50 });
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
    delete process.env.AI_BUDGET_DAILY_USD;
  });

  it('sem AI_BUDGET_DAILY_USD (0) → nunca alerta de orçamento', async () => {
    delete process.env.AI_BUDGET_DAILY_USD;
    const { svc, adminAlert } = makeService({ estimatedCostUsd: 9999, tokensIn: 1, tokensOut: 1 });
    await svc.tick();
    expect(adminAlert.notifyAdmin).not.toHaveBeenCalled();
  });
});

describe('DevWatchService.aiCostSnapshot', () => {
  it('soma custo/tokens de hoje e do mês, com % do orçamento', async () => {
    process.env.AI_BUDGET_DAILY_USD = '20';
    const { svc } = makeService({ estimatedCostUsd: 5, tokensIn: 1000, tokensOut: 400 });
    const snap = await svc.aiCostSnapshot();
    expect(snap.today.costUsd).toBe(5);
    expect(snap.today.budgetUsd).toBe(20);
    expect(snap.today.pct).toBe(25);
    expect(snap.month.tokensIn).toBe(1000);
    delete process.env.AI_BUDGET_DAILY_USD;
  });
});
