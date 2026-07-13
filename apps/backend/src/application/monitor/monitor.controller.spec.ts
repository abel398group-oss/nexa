// monitor.controller.spec.ts — M2/M3: WA number gate + Essencial unlock
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

// ─── Stub NestJS Logger ──────────────────────────────────────────────────────
vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>();
  return {
    ...actual,
    Logger: class {
      log = vi.fn(); warn = vi.fn(); debug = vi.fn(); error = vi.fn();
    },
  };
});

// ─── Stub normalizePhone (returns input stripped to digits, min 12) ───────────
vi.mock('@/shared/utils/phone.util', () => ({
  normalizePhone: (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 12 ? digits : null;
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SectorRecipient = { contact: string; channel: string };
type SectorCfg = { recipients?: SectorRecipient[]; phone?: string };

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    tenantNotificationConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
    planLimit: {
      findUnique: vi.fn(),
    },
    alertState: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    user: { findFirst: vi.fn().mockResolvedValue(null) },
    seller: { findFirst: vi.fn().mockResolvedValue(null) },
    notificationLog: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

function makeController(prisma: any) {
  const { MonitorController } = require('./monitor.controller');
  const monitor = {} as any;
  const consolidation = {} as any;
  const waha = {} as any;
  return new MonitorController(prisma, monitor, consolidation, waha);
}

// ─── U5: extractUniqueWaNumbers dedup ────────────────────────────────────────
// Tested indirectly via updateConfig: same number in 2 sectors = 1 unique
describe('MonitorController — WA number gate (M2)', () => {
  const TENANT = 'tenant-gate-test';

  // U5: mesmo número em dois setores conta 1 vez
  it('U5: mesmo número WA em dois setores → conta 1, não 2', async () => {
    const prisma = makePrisma();
    // Plan: essencial (limit=1). Config existing: 0 numbers.
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false,
      sectorConfig: null,
      notificationPhone: null,
    });

    const ctrl = makeController(prisma);

    // Send sectorConfig with same WA number in fiscal AND logistic
    const sameNumber = '5511999990001';
    const dto = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: sameNumber, channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: sameNumber, channel: 'whatsapp' }] },
      },
    };

    // Should NOT throw — same number deduped to 1, limit=1 → OK
    await expect(ctrl.updateConfig(TENANT, dto)).resolves.not.toThrow();
    expect(prisma.tenantNotificationConfig.upsert).toHaveBeenCalledOnce();
  });

  // U6: N+1 números → 400 BadRequestException com mensagem clara
  it('U6: N+1 números únicos → 400 com mensagem de limite', async () => {
    const prisma = makePrisma();
    // Plan: essencial (limit=1)
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false,
      sectorConfig: null,
      notificationPhone: null,
    });

    const ctrl = makeController(prisma);

    const dto = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
      },
    };

    await expect(ctrl.updateConfig(TENANT, dto)).rejects.toThrow(BadRequestException);
    await expect(ctrl.updateConfig(TENANT, dto)).rejects.toThrow('Limite de números WhatsApp');
  });

  // U7: exatamente no limite → salva sem erro
  it('U7: exatamente no limite (profissional + 3 únicos) → 200', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'profissional', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });

    const ctrl = makeController(prisma);

    const dto = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
        frota:    { recipients: [{ contact: '5511999990003', channel: 'whatsapp' }] },
      },
    };

    await expect(ctrl.updateConfig(TENANT, dto)).resolves.not.toThrow();
  });

  // U8: GET em tenant com config acima do limite → 200 (grandfathering)
  it('U8: GET com config acima do limite → retorna sem erro (grandfathering)', async () => {
    const prisma = makePrisma();
    // Plan: essencial (limit=1) but config has 2 WA numbers
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      enabled: true,
      sendHour: 8, sendMinute: 0,
      notificationPhone: null,
      recipients: [],
      sendWeekends: false,
      channel: 'whatsapp',
      fiscalEnabled: true, logisticEnabled: true, frotaEnabled: true, financeEnabled: true,
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
      },
      monitorOverride: false,
    });

    const ctrl = makeController(prisma);
    const result = await ctrl.getConfig(TENANT);

    // GET succeeds — no error. Returns waNumbersUsed=2 and waNumbersLimit=1 (grandfathered)
    expect(result).toBeDefined();
    expect(result.waNumbersUsed).toBe(2);
    expect(result.waNumbersLimit).toBe(1);
    expect(result.planAllowed).toBe(true);
  });

  // override → limite = 10
  it('monitorOverride=true → waNumbersLimit = 10 no GET', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      enabled: true, sendHour: 8, sendMinute: 0, notificationPhone: null,
      recipients: [], sendWeekends: false, channel: 'whatsapp',
      fiscalEnabled: true, logisticEnabled: true, frotaEnabled: true, financeEnabled: true,
      sectorConfig: null,
      monitorOverride: true,
    });

    const ctrl = makeController(prisma);
    const result = await ctrl.getConfig(TENANT);

    expect(result.waNumbersLimit).toBe(10);
    expect(result.monitorOverride).toBe(true);
  });

  // tenant sem PlanLimit → gate liberado (planAllowed=false)
  it('tenant sem PlanLimit → waNumbersLimit = 0', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue(null);
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue(null);

    const ctrl = makeController(prisma);
    const result = await ctrl.getConfig(TENANT);

    expect(result.waNumbersLimit).toBe(0);
    expect(result.planAllowed).toBe(false);
  });
});

// ─── U11/U12: abertura do Essencial (M3) ─────────────────────────────────────
describe('MonitorController — Essencial unlock (M3)', () => {
  const TENANT = 'tenant-essencial';

  // U11: essencial passa isPlanAllowed → pode habilitar Monitor
  it('U11: plano essencial pode habilitar enabled=true', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).resolves.not.toThrow();
  });

  // U12: free / starter → ForbiddenException ao tentar enabled=true
  it('U12: plano free → ForbiddenException ao tentar enabled=true', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'free', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).rejects.toThrow(ForbiddenException);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).rejects.toThrow('Essencial');
  });

  it('U12b: plano starter → ForbiddenException', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'starter', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });
    const ctrl = makeController(prisma);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).rejects.toThrow(ForbiddenException);
  });

  // extras contam para o limite: essencial + 1 extra = 2
  it('extras somam ao incluso: essencial + 1 extra → aceita 2 números', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 1 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    const dto = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
      },
    };

    await expect(ctrl.updateConfig(TENANT, dto)).resolves.not.toThrow();
  });
});
