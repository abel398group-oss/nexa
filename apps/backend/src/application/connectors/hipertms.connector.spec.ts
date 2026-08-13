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

// ─── F9: syncTicket() — primeiro método de ESCRITA do conector ───────────────
describe('HiperTmsConnector — syncTicket() (F9)', () => {
  let connector: HiperTmsConnector;
  const origFetch = global.fetch;

  beforeEach(() => {
    connector = makeConnector();
    process.env.TMS_BASE_URL = 'http://tms-host';
    process.env.NEXA_TICKET_WEBHOOK_SECRET = 'segredo-de-teste';
  });

  afterEach(() => {
    global.fetch = origFetch;
    delete process.env.TMS_BASE_URL;
    delete process.env.NEXA_TICKET_WEBHOOK_SECRET;
  });

  it('sem TMS_BASE_URL configurado: falha sem tentar rede', async () => {
    delete process.env.TMS_BASE_URL;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const r = await connector.syncTicket({ ticketNumber: 1 });

    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sem NEXA_TICKET_WEBHOOK_SECRET: falha sem tentar rede', async () => {
    delete process.env.NEXA_TICKET_WEBHOOK_SECRET;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    const r = await connector.syncTicket({ ticketNumber: 1 });

    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('assina o CORPO BRUTO enviado — mesmos bytes no hash e na requisição', async () => {
    let corpoEnviado = '';
    let headerRecebido = '';
    global.fetch = vi.fn().mockImplementation((_url: string, init: any) => {
      corpoEnviado = init.body;
      headerRecebido = init.headers['X-Nexa-Signature'];
      return Promise.resolve({ ok: true, status: 200 } as any);
    }) as any;

    const payload = { ticketNumber: 47, category: 'cte' };
    await connector.syncTicket(payload);

    const { createHmac } = await import('crypto');
    const esperado = `sha256=${createHmac('sha256', 'segredo-de-teste').update(corpoEnviado).digest('hex')}`;
    expect(headerRecebido).toBe(esperado);
    expect(JSON.parse(corpoEnviado)).toEqual(payload);
  });

  it('chama POST /nexa/tickets com Content-Type json', async () => {
    let urlChamada = '';
    let metodo = '';
    global.fetch = vi.fn().mockImplementation((url: string, init: any) => {
      urlChamada = url; metodo = init.method;
      return Promise.resolve({ ok: true, status: 200 } as any);
    }) as any;

    await connector.syncTicket({ ticketNumber: 1 });

    expect(urlChamada).toBe('http://tms-host/nexa/tickets');
    expect(metodo).toBe('POST');
  });

  it('2xx: ok=true com o status HTTP', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    const r = await connector.syncTicket({ ticketNumber: 1 });
    expect(r).toEqual({ ok: true, status: 200 });
  });

  it('4xx/5xx: ok=false com status e erro — não lança', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '' } as any);
    const r = await connector.syncTicket({ ticketNumber: 1 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  // Achado em produção (2026-08-06): o erro só guardava "HTTP 400", sem o
  // detalhe da validação — descobrir a causa exigia pedir log de dentro do
  // TMS. O corpo da resposta já vem com a lista de erros; só faltava ler.
  it('400 de validação: inclui o corpo da resposta no erro', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      text: async () => '{"message":["status must be one of: open, closed"]}',
    } as any);
    const r = await connector.syncTicket({ ticketNumber: 1, status: 'escalated' });
    expect(r.error).toContain('status must be one of');
  });

  it('corpo da resposta indisponível (stream já consumido etc): não quebra', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      text: async () => { throw new Error('stream consumido'); },
    } as any);
    const r = await connector.syncTicket({ ticketNumber: 1 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.error).toBe('HTTP 500');
  });

  it('rede falha (timeout/DNS): ok=false com a mensagem do erro, não lança', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
    const r = await connector.syncTicket({ ticketNumber: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('timeout');
  });
});

// ─── F15: getRejectionInfo() — tabela local de códigos SEFAZ (2026-08-06) ────
// Conferida contra o catálogo oficial do MOC-CTe; 9 códigos da tabela antiga
// (21 entradas) estavam com significado errado (não erro de digitação — código
// apontando pra causa completamente diferente da real). Corrigidos + tabela
// ampliada pra 30 entradas. Testes cobrem: um código corrigido de fato (não só
// renomeado), o código removido por falta de fonte confiável, um código novo,
// e o caso "não encontrado".
describe('HiperTmsConnector — getRejectionInfo() (F15)', () => {
  let connector: HiperTmsConnector;

  beforeEach(() => {
    connector = makeConnector();
  });

  it('código corrigido: 205 agora é "CT-e denegado", não mais o significado antigo errado', async () => {
    const info = await connector.getRejectionInfo('205');
    expect(info).not.toBeNull();
    expect(info!.message.toLowerCase()).toContain('denegado');
  });

  it('código 519 é o CFOP inválido (antes documentado incorretamente como 539)', async () => {
    const info = await connector.getRejectionInfo('519');
    expect(info).not.toBeNull();
    expect(info!.message.toLowerCase()).toContain('cfop');
  });

  it('código 218 é "CT-e já cancelado" (antes documentado incorretamente como 562)', async () => {
    const info = await connector.getRejectionInfo('218');
    expect(info).not.toBeNull();
    expect(info!.message.toLowerCase()).toContain('cancelado');
  });

  it('códigos 280/281 cobrem certificado inválido vs expirado separadamente', async () => {
    const invalido = await connector.getRejectionInfo('280');
    const expirado = await connector.getRejectionInfo('281');
    expect(invalido).not.toBeNull();
    expect(expirado).not.toBeNull();
    expect(expirado!.message.toLowerCase()).toContain('vencida');
  });

  it('código 302 foi removido: não havia fonte confiável pra confirmar o mapeamento antigo', async () => {
    const info = await connector.getRejectionInfo('302');
    expect(info).toBeNull();
  });

  it('código desconhecido retorna null (não inventa resposta)', async () => {
    const info = await connector.getRejectionInfo('123456');
    expect(info).toBeNull();
  });

  it('código novo (999, genérico) retorna categoria e ação sugerida', async () => {
    const info = await connector.getRejectionInfo('999');
    expect(info).not.toBeNull();
    expect(info!.category).toBeTruthy();
    expect(info!.suggestedAction).toBeTruthy();
  });
});

// ── Posicionamento de agosto/2026 na base de vendas ──────────────────────────
//
// A Lia só pode afirmar o que está no catálogo ou na BASE. Estes artigos existem
// para que as declarações oficiais do posicionamento sejam DELA por direito — em
// vez de coladas no playbook, onde virariam fato por decreto e ficariam fora do
// alcance da Supervisora, que audita contra o que foi recuperado.
describe('HiperTmsConnector — getKnowledge(): posicionamento 2026-08', () => {
  const artigo = async (titulo: string) => {
    const kb = await makeConnector().getKnowledge();
    return kb.find((k) => k.title === titulo);
  };

  it('a tabela nacional e os 30 anos estão na base, com fonte', async () => {
    const a = await artigo('Inteligência de precificação — a tabela nacional viva');
    expect(a, 'artigo de posicionamento sumiu da base').toBeDefined();
    expect(a!.content).toMatch(/5\.500 munic/i);
    expect(a!.content).toMatch(/30 anos/i);
    expect(a!.content).toMatch(/O TMS feito para vender frete/i);
  });

  it('o artigo proíbe o que o posicionamento proíbe', async () => {
    const a = await artigo('Inteligência de precificação — a tabela nacional viva');
    expect(a!.content).toMatch(/service as a software/i); // citado como proibido
    expect(a!.content).toMatch(/reajuste autom[áa]tico do contrato/i);
  });

  // O guard barra "aplicativo mobile". Sem este artigo a Lia fica sem a resposta
  // certa para uma pergunta comum e pode tentar justamente a que é bloqueada.
  it('a resposta de celular é navegador, e nega app explicitamente', async () => {
    const a = await artigo('Funciona no celular? — navegador, sem instalar nada');
    expect(a, 'artigo de acesso mobile sumiu da base').toBeDefined();
    expect(a!.content).toMatch(/NAVEGADOR do celular, sem instalar/i);
    expect(a!.content).toMatch(/N[ÃA]O existe aplicativo nativo/i);
  });

  it('os dois artigos são alcançáveis pela trilha de vendas', async () => {
    const kb = await makeConnector().getKnowledge();
    const vendas = new Set(['comercial', 'precificacao', 'vendas', 'produto', 'modulo', 'conceitos']);
    for (const t of [
      'Inteligência de precificação — a tabela nacional viva',
      'Funciona no celular? — navegador, sem instalar nada',
    ]) {
      const a = kb.find((k) => k.title === t)!;
      expect(vendas.has(a.category as string), `${t} está em categoria fora da trilha de vendas`).toBe(true);
    }
  });
});
