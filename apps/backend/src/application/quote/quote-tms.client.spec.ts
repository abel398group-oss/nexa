import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteTmsClient } from './quote-tms.client';

/**
 * Formato REAL da busca de cidade, copiado da resposta de produção em 19/08/2026.
 *
 * Este teste existe porque eu supus `{ cities: [ { code, name, state } ] }` e o TMS
 * devolve `{ success, data: [ { city_code, city, state } ] }`. A lista vinha dentro de um
 * objeto, `Array.isArray` dava falso, e TODA busca virava "não consegui consultar as
 * cidades" — com o endpoint respondendo 200 o tempo inteiro.
 *
 * O contrato de outro time não se adivinha: ou se confere, ou se prende num teste.
 */
const RESPOSTA_REAL = {
  success: true,
  data: [
    {
      geo_city_id: 'bb81ecff-1b3f-4e0d-a1ed-4b4473f3ec8d',
      ibge_code: '3509502',
      city_code: '3509502',
      city: 'Campinas',
      immediate_name: 'Campinas',
      immediate_code: '350038',
      state: 'SP',
      latitude: -22.90734,
      longitude: -47.060155,
    },
  ],
};

function respostaFake(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('cliente do TMS — busca de cidade', () => {
  const original = globalThis.fetch;

  beforeEach(() => {
    process.env.TMS_BASE_URL = 'http://tms:3000/api';
    process.env.TMS_SERVICE_TOKEN = 'token';
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('lê o formato REAL de produção', async () => {
    globalThis.fetch = vi.fn(async () => respostaFake(RESPOSTA_REAL)) as any;
    const cidades = await new QuoteTmsClient().buscarCidades('campinas');
    expect(cidades).toEqual([{ code: '3509502', name: 'Campinas', state: 'SP' }]);
  });

  it('continua lendo o formato que eu tinha suposto, se um dia vier', () => {
    // Os apelidos custam nada e o TMS já mudou formato antes.
    const cliente = new QuoteTmsClient();
    globalThis.fetch = vi.fn(async () =>
      respostaFake({ cities: [{ code: '1', name: 'Bauru', state: 'SP' }] }),
    ) as any;
    return expect(cliente.buscarCidades('bauru')).resolves.toEqual([
      { code: '1', name: 'Bauru', state: 'SP' },
    ]);
  });

  it('array puro também serve', async () => {
    globalThis.fetch = vi.fn(async () =>
      respostaFake([{ city_code: '9', city: 'Jacareí', state: 'SP' }]),
    ) as any;
    const r = await new QuoteTmsClient().buscarCidades('jacarei');
    expect(r).toEqual([{ code: '9', name: 'Jacareí', state: 'SP' }]);
  });

  it('registro sem código ou sem nome é descartado, não vira cidade vazia', async () => {
    globalThis.fetch = vi.fn(async () =>
      respostaFake({ data: [{ city_code: '', city: 'Sem código' }, { city_code: '5', city: '' }] }),
    ) as any;
    expect(await new QuoteTmsClient().buscarCidades('x')).toEqual([]);
  });

  it('HTTP ruim devolve null — que é "não consegui consultar", não "não achei"', async () => {
    globalThis.fetch = vi.fn(async () => respostaFake({}, 500)) as any;
    expect(await new QuoteTmsClient().buscarCidades('x')).toBeNull();
  });

  it('resposta que não é lista devolve null em vez de lista vazia', async () => {
    // Lista vazia diria "não achei essa cidade" e mandaria a pessoa corrigir um nome
    // certo. Era exatamente o que acontecia antes deste conserto.
    globalThis.fetch = vi.fn(async () => respostaFake({ success: true })) as any;
    expect(await new QuoteTmsClient().buscarCidades('x')).toBeNull();
  });
});

describe('cliente do TMS — tipos de carga e cotação', () => {
  const original = globalThis.fetch;

  beforeEach(() => {
    process.env.TMS_BASE_URL = 'http://tms:3000/api';
    process.env.TMS_SERVICE_TOKEN = 'token';
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('tipos de carga: com e sem o embrulho { success, data }', async () => {
    globalThis.fetch = vi.fn(async () => respostaFake({ cargoTypes: ['Carga Geral'] })) as any;
    expect(await new QuoteTmsClient().tiposDeCarga('u', 'carreta')).toEqual(['Carga Geral']);

    globalThis.fetch = vi.fn(async () =>
      respostaFake({ success: true, data: { cargoTypes: ['Frigorificada'] } }),
    ) as any;
    expect(await new QuoteTmsClient().tiposDeCarga('u', 'carreta')).toEqual(['Frigorificada']);
  });

  it('404 no catálogo é lista VAZIA, não falha — é tenant sem tabela de frete', async () => {
    globalThis.fetch = vi.fn(async () => respostaFake({}, 404)) as any;
    expect(await new QuoteTmsClient().tiposDeCarga('u', 'bitrem')).toEqual([]);
  });

  it('403 e 429 da cotação viram motivos diferentes', async () => {
    const cliente = new QuoteTmsClient();
    const corpo = { originCode: '1', destCode: '2', freightMode: 'FRACTIONAL', vehicleType: null, cargoType: null, weightKg: 500, merchandiseValue: 1000 } as any;

    globalThis.fetch = vi.fn(async () => respostaFake({}, 403)) as any;
    expect(await cliente.cotar('u', corpo, '55119')).toEqual({ ok: false, motivo: 'sem_permissao' });

    globalThis.fetch = vi.fn(async () => respostaFake({}, 429)) as any;
    expect(await cliente.cotar('u', corpo, '55119')).toEqual({ ok: false, motivo: 'cota_estourada' });
  });

  it('cotação sem preço utilizável NÃO vira sucesso com zero', async () => {
    // "R$ 0,00" dito ao cliente é pior que dizer que não deu.
    globalThis.fetch = vi.fn(async () => respostaFake({ price: 0, draftId: '1' })) as any;
    const corpo = { originCode: '1', destCode: '2', freightMode: 'DEDICATED', vehicleType: 'carreta', cargoType: null, weightKg: null, merchandiseValue: 1000 } as any;
    expect(await new QuoteTmsClient().cotar('u', corpo, '55119')).toEqual({
      ok: false,
      motivo: 'indisponivel',
    });
  });

  it('manda o telefone no corpo — proveniência do rascunho', async () => {
    const espiao = vi.fn(async () => respostaFake({ price: 100, draftId: '7' }));
    globalThis.fetch = espiao as any;
    const corpo = { originCode: '1', destCode: '2', freightMode: 'DEDICATED', vehicleType: 'truck', cargoType: 'Geral', weightKg: null, merchandiseValue: 1000 } as any;
    await new QuoteTmsClient().cotar('u', corpo, '5511917747429');
    const enviado = JSON.parse((espiao.mock.calls[0][1] as any).body);
    expect(enviado.phone).toBe('5511917747429');
    expect(enviado.userId).toBe('u');
  });
});

describe('cliente do TMS — campos aditivos da análise crítica (2026-08-19)', () => {
  const original = globalThis.fetch;
  const corpo = { originCode: '1', destCode: '2', freightMode: 'DEDICATED', vehicleType: 'carreta', cargoType: null, weightKg: null, merchandiseValue: 1000 } as any;

  beforeEach(() => {
    process.env.TMS_BASE_URL = 'http://tms:3000/api';
    process.env.TMS_SERVICE_TOKEN = 'token';
  });
  afterEach(() => {
    globalThis.fetch = original;
  });

  it('lê margem, receita, impostos e os dois formatos de link quando o TMS manda', async () => {
    globalThis.fetch = vi.fn(async () =>
      respostaFake({
        price: 5200,
        draftId: '017747',
        netMargin: 780.25,
        netRevenue: 4420.5,
        taxes: {
          total: 779.5,
          items: [{ acronym: 'ICMS', name: 'ICMS', rate: 0.12, value: 624.0 }],
        },
        draftPath: '/logistic/quotes/b3f1',
        draftUrl: 'https://app.hipertms.com.br/logistic/quotes/b3f1',
      }),
    ) as any;

    const r = await new QuoteTmsClient().cotar('u', corpo, '55119');
    expect(r).toMatchObject({
      ok: true,
      netMargin: 780.25,
      netRevenue: 4420.5,
      taxes: { total: 779.5, items: [{ acronym: 'ICMS', name: 'ICMS', rate: 0.12, value: 624.0 }] },
      draftPath: '/logistic/quotes/b3f1',
      draftUrl: 'https://app.hipertms.com.br/logistic/quotes/b3f1',
    });
  });

  it('sem análise crítica na resposta, os campos somem — não viram zero', async () => {
    // Zero seria lido como "cotação sem margem", que é uma mensagem bem diferente de
    // "o TMS não calculou isso".
    globalThis.fetch = vi.fn(async () => respostaFake({ price: 5200, draftId: '1' })) as any;
    const r = await new QuoteTmsClient().cotar('u', corpo, '55119');
    expect(r).toMatchObject({
      ok: true,
      netMargin: null,
      netRevenue: null,
      taxes: null,
      draftPath: null,
      draftUrl: null,
    });
  });

  it('taxes sem total utilizável descarta o bloco inteiro, mesmo com items presentes', async () => {
    // Impostos parciais na tela confundem mais que não mostrar nenhum.
    globalThis.fetch = vi.fn(async () =>
      respostaFake({
        price: 5200,
        draftId: '1',
        taxes: { total: 'não é número', items: [{ acronym: 'ICMS', name: 'ICMS', rate: 0.12, value: 624 }] },
      }),
    ) as any;
    const r = await new QuoteTmsClient().cotar('u', corpo, '55119');
    expect((r as any).taxes).toBeNull();
  });

  it('rate em PERCENTUAL (como a produção manda) é normalizado pra fração', async () => {
    // Contrato dizia fração (0.12), produção manda 12.00 — a mensagem chegou a exibir
    // "(1200%)" ao vivo em 20/08/2026. Alíquota > 1 só pode ser percentual.
    globalThis.fetch = vi.fn(async () =>
      respostaFake({
        price: 1310.82,
        draftId: '1',
        taxes: {
          total: 236.6,
          items: [
            { acronym: 'ICMS', name: 'ICMS', rate: 12.0, value: 157.3 },
            { acronym: 'PIS', name: 'PIS', rate: 0.0165, value: 10 },
          ],
        },
      }),
    ) as any;
    const r: any = await new QuoteTmsClient().cotar('u', corpo, '55119');
    expect(r.taxes.items[0].rate).toBe(0.12);
    // Fração de verdade passa intocada.
    expect(r.taxes.items[1].rate).toBe(0.0165);
  });

  it('item de imposto sem acronym é descartado da lista', async () => {
    globalThis.fetch = vi.fn(async () =>
      respostaFake({
        price: 5200,
        draftId: '1',
        taxes: {
          total: 100,
          items: [{ acronym: '', name: 'sem sigla', rate: 0.1, value: 50 }, { acronym: 'ICMS', name: 'ICMS', rate: 0.12, value: 50 }],
        },
      }),
    ) as any;
    const r = await new QuoteTmsClient().cotar('u', corpo, '55119');
    expect((r as any).taxes.items).toEqual([{ acronym: 'ICMS', name: 'ICMS', rate: 0.12, value: 50 }]);
  });
});
