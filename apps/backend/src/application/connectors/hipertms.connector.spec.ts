// K1: testes para getPlans() — comportamento com conector ok e com conector fora.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HiperTmsConnector } from './hipertms.connector';

// Stub mínimo do NestJS Logger
vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/common')>();
  return {
    ...actual,
    Logger: class {
      log = vi.fn();
      warn = vi.fn();
      debug = vi.fn();
      error = vi.fn();
    },
  };
});

function makeConnector() {
  return new HiperTmsConnector();
}

describe('HiperTmsConnector — getPlans() (K1)', () => {
  let connector: HiperTmsConnector;
  const origFetch = global.fetch;

  beforeEach(() => {
    connector = makeConnector();
  });

  afterEach(() => {
    global.fetch = origFetch;
    delete process.env.TMS_BASE_URL;
    delete process.env.TMS_INTERNAL_TOKEN;
  });

  // Cenário 1: TMS não configurado → retorna defaultPlans (inclui Corporativo)
  it('nao configurado: retorna defaultPlans com 4 planos incluindo Corporativo', async () => {
    delete process.env.TMS_BASE_URL;
    delete process.env.TMS_INTERNAL_TOKEN;

    const plans = await connector.getPlans();

    expect(plans.length).toBe(4);
    const codes = plans.map((p) => p.code);
    expect(codes).toContain('basic');
    expect(codes).toContain('essencial');
    expect(codes).toContain('profissional');
    expect(codes).toContain('corporativo');
    // Nenhum plano deve ter preço 0 no fallback
    plans.forEach((p) => expect(p.price).toBeGreaterThan(0));
  });

  // Cenário 2: TMS configurado + API ok → retorna planos do TMS (inclui Corporativo do banco)
  it('configurado + ok: retorna planos ao vivo do TMS', async () => {
    process.env.TMS_BASE_URL = 'http://tms-host';
    process.env.TMS_INTERNAL_TOKEN = 'secret';

    const livePlans = [
      { code: 'basic',       name: 'Básico',       price: 89,  maxUsers: 5,  features: ['CT-e'] },
      { code: 'essencial',   name: 'Essencial',    price: 199, maxUsers: 8,  features: ['CT-e', 'multi-filial'] },
      { code: 'profissional',name: 'Profissional', price: 299, maxUsers: 15, features: ['CT-e', 'API'] },
      { code: 'corporativo', name: 'Corporativo',  price: 499, features: ['CT-e', 'API', 'SLA'] },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plans: livePlans }),
    } as any);

    const plans = await connector.getPlans();

    expect(plans).toHaveLength(4);
    expect(plans.find((p) => p.code === 'corporativo')).toBeDefined();
    expect(plans[0].price).toBe(89);
  });

  // Cenário 3: TMS configurado + API falha → retorna [] (forçar escalação, nunca preço desatualizado)
  it('configurado + falha: retorna [] para forçar escalacao (K1 — nunca preço desatualizado)', async () => {
    process.env.TMS_BASE_URL = 'http://tms-host';
    process.env.TMS_INTERNAL_TOKEN = 'secret';

    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const plans = await connector.getPlans();

    // K1: deve retornar lista vazia, não defaultPlans()
    // Isso garante que a Lia vai dizer "vou confirmar" e escalar, sem citar preço fixo.
    expect(plans).toHaveLength(0);
  });

  // Cenário extra: TMS configurado + API retorna status 503 → também retorna []
  it('configurado + 503: retorna [] (status nao-ok é tratado como falha)', async () => {
    process.env.TMS_BASE_URL = 'http://tms-host';
    process.env.TMS_INTERNAL_TOKEN = 'secret';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as any);

    const plans = await connector.getPlans();

    expect(plans).toHaveLength(0);
  });
});

// K2: getProactivityEvents — dedupeKey mapping
describe('HiperTmsConnector — getProactivityEvents() (K2)', () => {
  let connector: HiperTmsConnector;
  const origFetch = global.fetch;

  beforeEach(() => {
    connector = makeConnector();
    process.env.TMS_BASE_URL = 'http://tms-host';
    process.env.TMS_INTERNAL_TOKEN = 'secret';
  });

  afterEach(() => {
    global.fetch = origFetch;
    delete process.env.TMS_BASE_URL;
    delete process.env.TMS_INTERNAL_TOKEN;
  });

  // Cenário 1: TMS retorna dedupeKey — event.id deve ser o dedupeKey (não o UUID)
  it('usa dedupeKey quando presente: id = dedupeKey (nao o UUID)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 'uuid-550e8400',
          dedupeKey: 'fiscal-cte-123456',
          severity: 'CRITICAL',
          domain: 'fiscal',
          title: 'CT-e vencido',
        },
      ]),
    } as any);

    const events = await connector.getProactivityEvents('tenant-ext-1');

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('fiscal-cte-123456');
    expect(events[0].category).toBe('fiscal');
    expect(events[0].severity).toBe('CRITICAL');
  });

  // Cenário 2: TMS antigo sem dedupeKey — fallback para e.id (retrocompat)
  it('fallback para id quando dedupeKey ausente (TMS antigo)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: 'uuid-legacy-abc',
          severity: 'OVERDUE',
          domain: 'logistic',
          title: 'Entrega atrasada',
          // sem dedupeKey
        },
      ]),
    } as any);

    const events = await connector.getProactivityEvents('tenant-ext-2');

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('uuid-legacy-abc');
    expect(events[0].category).toBe('logistic');
  });

  // Cenário 3: TMS não configurado → retorna []
  it('nao configurado: retorna []', async () => {
    delete process.env.TMS_BASE_URL;
    const events = await connector.getProactivityEvents('tenant-ext-3');
    expect(events).toHaveLength(0);
  });

  // Cenário 4: TMS retorna erro HTTP → retorna []
  it('TMS retorna 500: retorna []', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as any);

    const events = await connector.getProactivityEvents('tenant-ext-4');
    expect(events).toHaveLength(0);
  });
});
