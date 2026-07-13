// integrations.controller.spec.ts — U9/U10: plan-sync com monitorExtraNumbers
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub safeEqual
vi.mock('@/shared/utils/safe-compare', () => ({
  safeEqual: (a: string, b: string) => a === b,
}));

// Static import (Vitest ESM requires top-level import)
import { IntegrationsController } from './integrations.controller';

const SECRET = 'test-secret';

function makePrisma() {
  return {
    planLimit: {
      upsert: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        plan: 'essencial',
        monitorExtraNumbers: 0,
        updatedAt: new Date(),
      }),
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('IntegrationsController — plan-sync (U9/U10)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, TMS_SYNC_SECRET: SECRET };
  });

  // U9: monitorExtraNumbers é persistido quando enviado
  it('U9: plan-sync com monitorExtraNumbers=2 persiste o campo', async () => {
    const prisma = makePrisma();
    prisma.planLimit.upsert.mockResolvedValue({
      tenantId: 'tenant-1',
      plan: 'essencial',
      monitorExtraNumbers: 2,
      updatedAt: new Date(),
    });

    const ctrl = new IntegrationsController(prisma);
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
    const prisma = makePrisma();
    const ctrl = new IntegrationsController(prisma);

    await ctrl.planSync(SECRET, {
      tenantId: 'tenant-1',
      plan: 'profissional',
      // monitorExtraNumbers omitido
    });

    const [callArgs] = prisma.planLimit.upsert.mock.calls;
    const updateArg = callArgs[0].update;
    expect(updateArg).not.toHaveProperty('monitorExtraNumbers');
  });

  // essencial é plano válido
  it('plano essencial é aceito no VALID_PLANS', async () => {
    const prisma = makePrisma();
    const ctrl = new IntegrationsController(prisma);
    await expect(
      ctrl.planSync(SECRET, { tenantId: 'tenant-1', plan: 'essencial' }),
    ).resolves.not.toThrow();
  });

  // secret inválido → rejeita
  it('secret inválido → ForbiddenException', async () => {
    const prisma = makePrisma();
    const ctrl = new IntegrationsController(prisma);
    await expect(
      ctrl.planSync('wrong-secret', { tenantId: 'tenant-1', plan: 'essencial' }),
    ).rejects.toThrow();
  });
});
