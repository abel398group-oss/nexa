/**
 * ProactiveDetectorService — unit tests
 *
 * Covers rule detection logic:
 *   • evaluateAll iterates only active tenants
 *   • detectStaleOpen emits events for idle conversations
 *   • detectLeadNoReply only fires when last message is inbound
 *   • detectSlaBreach targets escalated conversations
 *   • detectAutoClose targets resolved conversations
 *   • evaluateDigest creates one daily-bucket event per tenant
 *   • upsertEvents is idempotent (dedupeKey collision silently ignored)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProactiveDetectorService } from './proactive-detector.service';
import type { EffectiveRuleConfig } from './proactive-rule-config.service';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCfg(overrides: Partial<EffectiveRuleConfig> = {}): EffectiveRuleConfig {
  return { enabled: true, level: 'L1', thresholdMin: 60, ...overrides };
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  tenant: { findMany: vi.fn() },
  aiConversation: { findMany: vi.fn() },
  campaignTarget: { findMany: vi.fn() },
  aiMessage: { findMany: vi.fn() },
  pendingConversationEvent: { upsert: vi.fn() },
};

const mockConfigSvc = { getConfig: vi.fn() };

function makeService() {
  return new ProactiveDetectorService(mockPrisma as any, mockConfigSvc as any);
}

// ── shared defaults ───────────────────────────────────────────────────────────

const defaultConfig: Map<string, EffectiveRuleConfig> = new Map([
  ['conversation.stale_open',    makeCfg()],
  ['conversation.lead_no_reply', makeCfg()],
  ['conversation.sla_breach',    makeCfg()],
  ['campaign.followup_due',      makeCfg({ thresholdMin: 2880 })],
  ['ticket.auto_close',          makeCfg()],
]);

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't1' }]);
  mockPrisma.aiConversation.findMany.mockResolvedValue([]);
  mockPrisma.campaignTarget.findMany.mockResolvedValue([]);
  mockPrisma.aiMessage.findMany.mockResolvedValue([]);
  mockPrisma.pendingConversationEvent.upsert.mockResolvedValue({});
  mockConfigSvc.getConfig.mockResolvedValue(defaultConfig);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ProactiveDetectorService.evaluateAll()', () => {
  it('queries only active tenants', async () => {
    const svc = makeService();
    await svc.evaluateAll();

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'active' } }),
    );
  });

  it('evaluates each active tenant independently', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

    const svc = makeService();
    await svc.evaluateAll();

    expect(mockConfigSvc.getConfig).toHaveBeenCalledTimes(2);
    expect(mockConfigSvc.getConfig).toHaveBeenCalledWith('t1');
    expect(mockConfigSvc.getConfig).toHaveBeenCalledWith('t2');
  });

  it('continues processing other tenants if one throws', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    mockConfigSvc.getConfig
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce(defaultConfig);

    const svc = makeService();
    await expect(svc.evaluateAll()).resolves.not.toThrow();
    expect(mockConfigSvc.getConfig).toHaveBeenCalledTimes(2);
  });
});

// Helper: mock the 4 sequential aiConversation.findMany calls inside evaluateTenant
// Order: stale_open → lead_no_reply → sla_breach → auto_close
function mockFindManySequence(
  staleOpenResult: any[],
  leadNoReplyResult: any[] = [],
  slaBreachResult: any[] = [],
  autoCloseResult: any[] = [],
) {
  mockPrisma.aiConversation.findMany
    .mockResolvedValueOnce(staleOpenResult)
    .mockResolvedValueOnce(leadNoReplyResult)
    .mockResolvedValueOnce(slaBreachResult)
    .mockResolvedValueOnce(autoCloseResult);
}

describe('detectStaleOpen', () => {
  it('creates event when conversation is idle > thresholdMin', async () => {
    const idleConv = { id: 'conv1', lastActivityAt: hoursAgo(3), ticketPriority: null };
    // Only return idle conv for stale_open query; return [] for all others
    mockFindManySequence([idleConv]);

    const svc = makeService();
    await svc.evaluateAll();

    expect(mockPrisma.pendingConversationEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ ruleId: 'conversation.stale_open', subjectId: 'conv1' }),
      }),
    );
  });

  it('sets severity CRITICAL when idle > 2x threshold', async () => {
    // threshold = 60min → 2x = 120min → 5h is definitely > 2x
    const veryIdleConv = { id: 'conv2', lastActivityAt: hoursAgo(5), ticketPriority: null };
    mockFindManySequence([veryIdleConv]);

    const svc = makeService();
    await svc.evaluateAll();

    const upsertCall = mockPrisma.pendingConversationEvent.upsert.mock.calls.find(
      (c) => c[0].create?.ruleId === 'conversation.stale_open',
    );
    expect(upsertCall?.[0].create?.severity).toBe('CRITICAL');
  });

  it('skips rule when disabled', async () => {
    const configWithDisabled = new Map(defaultConfig);
    configWithDisabled.set('conversation.stale_open', makeCfg({ enabled: false }));
    mockConfigSvc.getConfig.mockResolvedValue(configWithDisabled);

    mockPrisma.aiConversation.findMany.mockResolvedValue([
      { id: 'conv1', lastActivityAt: hoursAgo(3) },
    ]);

    const svc = makeService();
    await svc.evaluateAll();

    const staleUpsert = mockPrisma.pendingConversationEvent.upsert.mock.calls.filter(
      (c) => c[0].create?.ruleId === 'conversation.stale_open',
    );
    expect(staleUpsert).toHaveLength(0);
  });
});

describe('detectLeadNoReply', () => {
  it('creates event when last message is inbound and conversation is idle', async () => {
    const conv = {
      id: 'conv1',
      lastActivityAt: hoursAgo(3),
      messages: [{ direction: 'inbound' }], // last msg is from lead
    };
    // Return this conversation only for lead_no_reply query (status in open/waiting_internal)
    mockPrisma.aiConversation.findMany.mockImplementation((args: any) => {
      // stale_open: status = 'open'
      // lead_no_reply: status in ['open', 'waiting_internal']
      if (args?.where?.status?.in) return Promise.resolve([conv]);
      return Promise.resolve([]);
    });

    const svc = makeService();
    await svc.evaluateAll();

    const call = mockPrisma.pendingConversationEvent.upsert.mock.calls.find(
      (c) => c[0].create?.ruleId === 'conversation.lead_no_reply',
    );
    expect(call).toBeDefined();
    expect(call?.[0].create?.subjectId).toBe('conv1');
  });

  it('does NOT create event when last message is outbound (Lia spoke last)', async () => {
    const conv = {
      id: 'conv1',
      lastActivityAt: hoursAgo(3),
      messages: [{ direction: 'outbound' }], // Lia spoke last
    };
    mockPrisma.aiConversation.findMany.mockResolvedValue([conv]);

    const svc = makeService();
    await svc.evaluateAll();

    const noReplyCall = mockPrisma.pendingConversationEvent.upsert.mock.calls.find(
      (c) => c[0].create?.ruleId === 'conversation.lead_no_reply',
    );
    expect(noReplyCall).toBeUndefined();
  });
});

describe('detectSlaBreach', () => {
  it('creates CRITICAL event for escalated conversation over threshold', async () => {
    mockPrisma.aiConversation.findMany.mockImplementation((args: any) => {
      if (args?.where?.status === 'escalated') {
        return Promise.resolve([{ id: 'conv-esc', lastActivityAt: hoursAgo(5), ticketPriority: 'high' }]);
      }
      return Promise.resolve([]);
    });

    const svc = makeService();
    await svc.evaluateAll();

    const call = mockPrisma.pendingConversationEvent.upsert.mock.calls.find(
      (c) => c[0].create?.ruleId === 'conversation.sla_breach',
    );
    expect(call).toBeDefined();
    expect(call?.[0].create?.severity).toBe('CRITICAL');
  });
});

describe('detectAutoClose', () => {
  it('creates INFO event for resolved-but-open conversation past threshold', async () => {
    const resolvedConv = { id: 'conv-res', resolvedAt: hoursAgo(3) };
    // auto_close is the 4th findMany call in evaluateTenant
    mockFindManySequence([], [], [], [resolvedConv]);

    const svc = makeService();
    await svc.evaluateAll();

    const call = mockPrisma.pendingConversationEvent.upsert.mock.calls.find(
      (c) => c[0].create?.ruleId === 'ticket.auto_close',
    );
    expect(call).toBeDefined();
    expect(call?.[0].create?.severity).toBe('INFO');
  });
});

describe('evaluateDigest', () => {
  it('creates a digest event for each active tenant with daily dedupeKey', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);

    const svc = makeService();
    await svc.evaluateDigest();

    const digestCalls = mockPrisma.pendingConversationEvent.upsert.mock.calls.filter(
      (c) => c[0].create?.ruleId === 'conversation.digest',
    );
    expect(digestCalls).toHaveLength(2);

    // dedupeKey should contain today's date (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);
    for (const call of digestCalls) {
      expect(call[0].create?.dedupeKey).toContain(today);
    }
  });

  it('upsert with update={} makes it idempotent on same day', async () => {
    const svc = makeService();
    await svc.evaluateDigest();
    await svc.evaluateDigest();

    const updateArg = mockPrisma.pendingConversationEvent.upsert.mock.calls[0][0].update;
    expect(updateArg).toEqual({});
  });
});
