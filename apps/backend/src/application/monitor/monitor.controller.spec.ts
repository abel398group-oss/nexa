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

// ─── Stub normalizePhone ─────────────────────────────────────────────────────
vi.mock('@/shared/utils/phone.util', () => ({
  normalizePhone: (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 12 ? digits : null;
  },
}));

// ─── Static import (Vitest ESM requires top-level import) ────────────────────
import { MonitorController } from './monitor.controller';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma() {
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
  } as any;
}

function makeController(prisma: any) {
  const monitor = {} as any;
  const consolidation = {} as any;
  const waha = {} as any;
  return new MonitorController(prisma, monitor, consolidation, waha);
}

// ─── WA number gate (M2 + N2 grandfathering) ─────────────────────────────────
describe('MonitorController — WA number gate', () => {
  const TENANT = 'tenant-gate-test';

  // U5: mesmo número em dois setores conta 1 vez (dedup)
  it('U5: mesmo número WA em dois setores → conta 1, não 2', async () => {
    const prisma = makePrisma();
    // essencial = 3 (v2 2026-07-14)
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    const sameNumber = '5511999990001';
    const dto = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: sameNumber, channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: sameNumber, channel: 'whatsapp' }] },
      },
    };

    // dedup → 1 número, limit essencial = 3 → OK
    await expect(ctrl.updateConfig(TENANT, dto)).resolves.not.toThrow();
    expect(prisma.tenantNotificationConfig.upsert).toHaveBeenCalledOnce();
  });

  // U6: N+1 únicos, de zero → 400
  it('U6: N+1 números únicos (sem config anterior) → 400', async () => {
    const prisma = makePrisma();
    // basico = 1 (v2); 2 números únicos → excede limit=1 e previousCount=0
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'basico', monitorExtraNumbers: 0 });
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

    await expect(ctrl.updateConfig(TENANT, dto)).rejects.toThrow(BadRequestException);
    await expect(ctrl.updateConfig(TENANT, dto)).rejects.toThrow('Limite de números WhatsApp');
  });

  // U7: exatamente no limite → 200
  it('U7: exatamente no limite (essencial + 3 únicos) → 200', async () => {
    const prisma = makePrisma();
    // essencial = 3 (v2)
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
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

  // U8: GET com config acima do limite → 200 (grandfathering no GET)
  it('U8: GET com config acima do limite → retorna sem erro (grandfathering)', async () => {
    const prisma = makePrisma();
    // basico = 1, mas tem 2 números configurados (grandfathered)
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'basico', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      enabled: true, sendHour: 8, sendMinute: 0, notificationPhone: null,
      recipients: [], sendWeekends: false, channel: 'whatsapp',
      fiscalEnabled: true, logisticEnabled: true, frotaEnabled: true, financeEnabled: true,
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511999990001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511999990002', channel: 'whatsapp' }] },
      },
      monitorOverride: false,
    });

    const ctrl = makeController(prisma);
    const result = await ctrl.getConfig(TENANT);

    expect(result).toBeDefined();
    expect(result.waNumbersUsed).toBe(2);
    expect(result.waNumbersLimit).toBe(1);
    expect(result.planAllowed).toBe(true);
  });

  // N2-a: PUT em tenant grandfathered sem aumentar → 200 (editar horário, etc.)
  it('N2-a: tenant grandfathered (6 núm, limit=3) pode salvar sem aumentar', async () => {
    const prisma = makePrisma();
    const existingSector = {
      fiscal:   { recipients: [{ contact: '5511000000001', channel: 'whatsapp' }] },
      logistic: { recipients: [{ contact: '5511000000002', channel: 'whatsapp' }] },
      frota:    { recipients: [{ contact: '5511000000003', channel: 'whatsapp' }] },
      finance:  { recipients: [{ contact: '5511000000004', channel: 'whatsapp' }] },
      compras:  { recipients: [{ contact: '5511000000005', channel: 'whatsapp' }] },
      rh:       { recipients: [{ contact: '5511000000006', channel: 'whatsapp' }] },
    };
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 }); // limit=3
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false,
      sectorConfig: existingSector,
      notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    // Salva os mesmos 6 números (não aumentou) → deve passar
    await expect(ctrl.updateConfig(TENANT, { sectorConfig: existingSector })).resolves.not.toThrow();
  });

  // N2-b: PUT removendo 1 número de config grandfathered → 200
  it('N2-b: tenant grandfathered pode remover 1 número (de 6 para 5)', async () => {
    const prisma = makePrisma();
    const existingSector = {
      fiscal:   { recipients: [{ contact: '5511000000001', channel: 'whatsapp' }] },
      logistic: { recipients: [{ contact: '5511000000002', channel: 'whatsapp' }] },
      frota:    { recipients: [{ contact: '5511000000003', channel: 'whatsapp' }] },
      finance:  { recipients: [{ contact: '5511000000004', channel: 'whatsapp' }] },
      compras:  { recipients: [{ contact: '5511000000005', channel: 'whatsapp' }] },
      rh:       { recipients: [{ contact: '5511000000006', channel: 'whatsapp' }] },
    };
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 }); // limit=3
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: existingSector, notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    // Remove rh → fica com 5 (ainda > limit, mas <= previousCount=6 → OK)
    const reducedSector = { ...existingSector, rh: { recipients: [] } };
    await expect(ctrl.updateConfig(TENANT, { sectorConfig: reducedSector })).resolves.not.toThrow();
  });

  // N2-c: PUT adicionando 7º número em config grandfathered com 6 → 400
  it('N2-c: tenant grandfathered NÃO pode adicionar além do previousCount', async () => {
    const prisma = makePrisma();
    const existingSector = {
      fiscal:   { recipients: [{ contact: '5511000000001', channel: 'whatsapp' }] },
      logistic: { recipients: [{ contact: '5511000000002', channel: 'whatsapp' }] },
      frota:    { recipients: [{ contact: '5511000000003', channel: 'whatsapp' }] },
      finance:  { recipients: [{ contact: '5511000000004', channel: 'whatsapp' }] },
      compras:  { recipients: [{ contact: '5511000000005', channel: 'whatsapp' }] },
      rh:       { recipients: [{ contact: '5511000000006', channel: 'whatsapp' }] },
    };
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 }); // limit=3
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: existingSector, notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    // Adiciona 7º → newCount=7 > limit=3 E newCount=7 > previousCount=6 → 400
    const expandedSector = {
      ...existingSector,
      vendas: { recipients: [{ contact: '5511000000007', channel: 'whatsapp' }] },
    };
    await expect(ctrl.updateConfig(TENANT, { sectorConfig: expandedSector })).rejects.toThrow(BadRequestException);
  });

  // N2-d: tenant dentro do limite não consegue exceder
  it('N2-d: tenant dentro do limite não pode exceder (basico: 1 → 2)', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'basico', monitorExtraNumbers: 0 }); // limit=1
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false,
      sectorConfig: { fiscal: { recipients: [{ contact: '5511000000001', channel: 'whatsapp' }] } },
      notificationPhone: null,
    });

    const ctrl = makeController(prisma);
    const dto = {
      sectorConfig: {
        fiscal:   { recipients: [{ contact: '5511000000001', channel: 'whatsapp' }] },
        logistic: { recipients: [{ contact: '5511000000002', channel: 'whatsapp' }] },
      },
    };
    // previousCount=1 (at limit), newCount=2 > limit=1 AND newCount=2 > previousCount=1 → 400
    await expect(ctrl.updateConfig(TENANT, dto)).rejects.toThrow(BadRequestException);
  });

  it('monitorOverride=true → waNumbersLimit = 10 no GET', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      enabled: true, sendHour: 8, sendMinute: 0, notificationPhone: null,
      recipients: [], sendWeekends: false, channel: 'whatsapp',
      fiscalEnabled: true, logisticEnabled: true, frotaEnabled: true, financeEnabled: true,
      sectorConfig: null, monitorOverride: true,
    });

    const ctrl = makeController(prisma);
    const result = await ctrl.getConfig(TENANT);

    expect(result.waNumbersLimit).toBe(10);
    expect(result.monitorOverride).toBe(true);
  });

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

// ─── Plano unlock (N1 v2 — basico agora libera Monitor) ──────────────────────
describe('MonitorController — plan unlock (N1 v2)', () => {
  const TENANT = 'tenant-plan-test';

  it('U11: plano basico pode habilitar enabled=true (N1 — Monitor disponível no Básico)', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'basico', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });
    const ctrl = makeController(prisma);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).resolves.not.toThrow();
  });

  it('plano essencial pode habilitar enabled=true', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'essencial', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });
    const ctrl = makeController(prisma);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).resolves.not.toThrow();
  });

  it('U12: plano free → ForbiddenException ao tentar enabled=true', async () => {
    const prisma = makePrisma();
    prisma.planLimit.findUnique.mockResolvedValue({ plan: 'free', monitorExtraNumbers: 0 });
    prisma.tenantNotificationConfig.findUnique.mockResolvedValue({
      monitorOverride: false, sectorConfig: null, notificationPhone: null,
    });
    const ctrl = makeController(prisma);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).rejects.toThrow(ForbiddenException);
    await expect(ctrl.updateConfig(TENANT, { enabled: true })).rejects.toThrow('assinatura ativa');
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

  // essencial (3 inclusos) + 1 extra = aceita 4 números
  it('extras somam ao incluso: essencial + 1 extra → aceita 4 números', async () => {
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
        frota:    { recipients: [{ contact: '5511999990003', channel: 'whatsapp' }] },
        finance:  { recipients: [{ contact: '5511999990004', channel: 'whatsapp' }] },
      },
    };
    await expect(ctrl.updateConfig(TENANT, dto)).resolves.not.toThrow();
  });
});
