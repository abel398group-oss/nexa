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

// ── Cache + disjuntor (tms-resilience.ts) ────────────────────────────────────
// Testam o COMPORTAMENTO no connector, não a classe isolada: é aqui que um
// refactor futuro poderia religar uma chamada direta e desfazer a proteção sem
// nenhum teste acusar.
describe('HiperTmsConnector — cache e disjuntor', () => {
  let connector: HiperTmsConnector;
  const origFetch = global.fetch;

  beforeEach(() => {
    process.env.TMS_BASE_URL = 'http://tms.local/api';
    process.env.TMS_INTERNAL_TOKEN = 'tok';
    connector = new HiperTmsConnector();
  });

  afterEach(() => {
    global.fetch = origFetch;
    delete process.env.TMS_BASE_URL;
    delete process.env.TMS_INTERNAL_TOKEN;
  });

  const customerOk = () =>
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        found: true,
        customer: { externalId: 'ext-1', name: 'Transportadora X', status: 'active' },
      }),
    } as any);

  it('segunda consulta do mesmo telefone NÃO chama o TMS de novo', async () => {
    const fetchMock = customerOk();
    global.fetch = fetchMock;

    const a = await connector.lookupCustomer('5511999999999');
    const b = await connector.lookupCustomer('5511999999999');

    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 2ª veio do cache
  });

  it('telefone diferente é consulta diferente — cache não mistura clientes', async () => {
    const fetchMock = customerOk();
    global.fetch = fetchMock;

    await connector.lookupCustomer('5511111111111');
    await connector.lookupCustomer('5522222222222');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('TMS fora depois de uma leitura boa: serve o último valor conhecido', async () => {
    global.fetch = customerOk();
    const antes = await connector.lookupCustomer('5511999999999');

    // TTL do cliente é 5 min; avança o relógio para vencer o valor fresco.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 6 * 60_000));
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const depois = await connector.lookupCustomer('5511999999999');
    vi.useRealTimers();

    expect(depois).toEqual(antes); // vencido, mas melhor que nada
  });

  it('disjuntor abre e para de bater no TMS caído', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('timeout'));
    global.fetch = fetchMock;

    // Limiar padrão = 5 falhas consecutivas.
    for (let i = 0; i < 5; i++) await connector.lookupCustomer(`551100000000${i}`);
    expect(connector.resilienceStats().circuitOpen).toBe(true);

    const chamadasAteAbrir = fetchMock.mock.calls.length;
    await connector.lookupCustomer('5511777777777');
    await connector.lookupCustomer('5511888888888');

    // Com o disjuntor aberto ninguém mais paga o timeout.
    expect(fetchMock.mock.calls.length).toBe(chamadasAteAbrir);
  });

  it('K1 preservado: getPlans NÃO serve preço vencido quando o TMS falha', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plans: [{ code: 'essencial', name: 'Essencial', price: 199, features: [] }] }),
    } as any);
    const ok = await connector.getPlans();
    expect(ok).toHaveLength(1);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 11 * 60_000)); // vence o TTL de planos
    global.fetch = vi.fn().mockRejectedValue(new Error('TMS fora'));

    const fora = await connector.getPlans();
    vi.useRealTimers();

    // Preço velho JAMAIS sai: a Lia recebe [] e escala (casos Chevrolet/Air Canada).
    expect(fora).toEqual([]);
  });
});
