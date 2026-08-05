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
    // Planos com preço de tabela não podem vir zerados no fallback.
    // Corporativo é a exceção deliberada: é SOB CONSULTA (ver defaultPlans em
    // hipertms.connector.ts) — price 0 é o sentinela de "sem preço fixo", e a
    // Lia não deve citar valor. Este teste é de 2026-07-10 e afirmava
    // `price > 0` para TODOS; o Corporativo virou sob consulta em 2026-08-01
    // (commit 82791a8) e a asserção ficou para trás, quebrando o CI.
    plans
      .filter((p) => p.code !== 'corporativo')
      .forEach((p) => expect(p.price).toBeGreaterThan(0));

    const corporativo = plans.find((p) => p.code === 'corporativo')!;
    expect(corporativo.price).toBe(0); // sob consulta — nunca um valor inventado
    expect(corporativo.features.join(' ')).toContain('SOB CONSULTA');
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

  // 2026-08-03: em produção o /nexa/plans devolve o Corporativo com price 0 (sob consulta).
  // O filtro exigia price > 0 e o derrubava — a Lia recebia 3 planos e não tinha o que
  // oferecer a lead grande. Preço 0 agora sobrevive; preço negativo continua descartado.
  it('configurado + ok: mantem plano com price 0 (sob consulta) e descarta preço negativo', async () => {
    process.env.TMS_BASE_URL = 'http://tms-host';
    process.env.TMS_INTERNAL_TOKEN = 'secret';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        plans: [
          { code: 'basic', name: 'Básico', price: 89, maxUsers: 5, features: ['CT-e'] },
          { code: 'corporativo', name: 'Corporativo', price: 0, features: ['SLA'] },
          { code: 'quebrado', name: 'Quebrado', price: -1, features: [] },
        ],
      }),
    } as any);

    const plans = await connector.getPlans();

    expect(plans.map((p) => p.code)).toEqual(['basic', 'corporativo']);
    expect(plans.find((p) => p.code === 'corporativo')!.price).toBe(0);
  });

  // 2026-08-03: o TMS de produção devolve `features: []` para todos os planos
  // (metadata.features vazio no banco). Sem fallback a Lia recebia só nome+preço.
  it('configurado + ok: usa features estáticas quando o TMS devolve lista vazia', async () => {
    process.env.TMS_BASE_URL = 'http://tms-host';
    process.env.TMS_INTERNAL_TOKEN = 'secret';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        plans: [
          { code: 'essencial', name: 'Essencial', price: 199, maxUsers: 8, features: [] },
          { code: 'basic', name: 'Básico', price: 89, maxUsers: 5, features: ['só isto'] },
        ],
      }),
    } as any);

    const plans = await connector.getPlans();

    const essencial = plans.find((p) => p.code === 'essencial')!;
    expect(essencial.features.length).toBeGreaterThan(0);
    expect(essencial.features.join(' ')).toContain('Viagens');
    // Quando o TMS MANDA features, elas mandam — o estático não sobrescreve.
    expect(plans.find((p) => p.code === 'basic')!.features).toEqual(['só isto']);
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
