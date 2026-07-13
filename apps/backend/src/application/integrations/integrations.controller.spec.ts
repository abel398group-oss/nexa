// integrations.controller.spec.ts — U9/U10: plan-sync com monitorExtraNumbers
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub safeEqual — always returns true when both are equal, false otherwise
vi.mock('@/shared/utils/safe-compare', () => ({
  safeEqual: (a: string, b: string) => a === b,
}));

const SECRET = 'test-secret';

function makeController(prismaOverrides: Record<string, any> = {}) {
  // Minimal prisma stub
  const upsertResult = { tenantId: 'tenant-1', plan: 'essencial', monitorExtraNumbers: 0, updatedAt: new Date() };
  const prisma = {
    planLimit: {
      upsert: vi.fn().mockResolvedValue(upsertResult),
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  } as any;

  // Dynamic import to get the class (avoids NestJS DI)
  const { IntegrationsController } = require('./integrations.controller');
  const ctrl = new IntegrationsController(prisma);
  return { ctrl, prisma };
}

describe('IntegrationsController — plan-sync (U9/U10)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, TMS_SYNC_SECRET: SECRET };
    vi.resetModules();
  });

  // U9: monitorExtraNumbers é persistido quando enviado
  it('U9: plan-sync com monitorExtraNumbers=2 persiste o campo', async () => {
    const { ctrl, prisma } = makeController();
    prisma.planLimit.upsert.mockResolvedValue({
      tenantId: 'tenant-1',
      plan: 'essencial',
      monitorExtraNumbers: 2,
      updatedAt: new Date(),
    });

    const result = await ctrl.planSync(SECRET, {
      tenantId: 'tenant-1',
      plan: 'essencial',
      monitorExtraNumbers: 2,
    });

    expect(prisma.planLimit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ plan: 'essencial', monitorExtraNumbers: 2 }),
        create: expect.objectContaining({ monitorExtraNumbers: 2 }),
      }),
    );
    expect(result.monitorExtraNumbers).toBe(2);
    expect(result.synced).toBe(true);
  });

  // U10: sem monitorExtraNumbers → não reseta o valor existente
  it('U10: plan-sync sem monitorExtraNumbers não inclui o campo no update', async () => {
    const { ctrl, prisma } = makeController();

    await ctrl.planSync(SECRET, {
      tenantId: 'tenant-1',
      plan: 'profissional',
      // monitorExtraNumbers omitido
    });

    const [callArgs] = prisma.planLimit.upsert.mock.calls;
    const updateArg = callArgs[0].update;
    // monitorExtraNumbers NÃO deve estar no update quando omitido
    expect(updateArg).not.toHaveProperty('monitorExtraNumbers');
  });

  // essencial agora é plano válido
  it('plano essencial é aceito no VALID_PLANS', async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.planSync(SECRET, { tenantId: 'tenant-1', plan: 'essencial' }),
    ).resolves.not.toThrow();
  });

  // secret inválido → ForbiddenException
  it('secret inválido → ForbiddenException', async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.planSync('wrong-secret', { tenantId: 'tenant-1', plan: 'essencial' }),
    ).rejects.toThrow();
  });
});
