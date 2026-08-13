import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WahaClientService, LINHA_PRINCIPAL } from './waha-client.service';

/**
 * Divisão de números (2026-08-13) — resolução de LINHA.
 *
 * Linha é o número, não a sessão do WAHA: com dois containers as duas sessões se
 * chamam `default`, então o nome da sessão não distingue nada. Quem distingue é
 * a linha, que vem da query do webhook registrado naquele container.
 *
 * O invariante que tudo isto sustenta — a resposta sai pela linha por onde a
 * mensagem entrou — é garantido no despacho de `conversations.service`, que lê
 * `conv.wahaLine`. Aqui prendemos a metade de baixo: dado um nome de linha, o
 * cliente fala com o container certo.
 */
describe('WahaClientService — resolução de linha', () => {
  const OLD = process.env;

  beforeEach(() => {
    process.env = {
      ...OLD,
      WAHA_API_URL: 'http://waha:3000',
      WAHA_API_KEY: 'chave-principal',
      WAHA_SESSION: 'default',
    };
  });

  afterEach(() => {
    process.env = OLD;
  });

  const svc = () => new WahaClientService();

  it('sem linha, resolve a principal — o comportamento de sempre', () => {
    const alvo = svc().resolveLinha();
    expect(alvo).toEqual({ baseUrl: 'http://waha:3000', apiKey: 'chave-principal', session: 'default' });
  });

  it('o nome explícito da principal dá no mesmo', () => {
    expect(svc().resolveLinha(LINHA_PRINCIPAL)).toEqual(svc().resolveLinha());
  });

  it('linha configurada aponta para o container dela', () => {
    process.env.WAHA_VENDAS_API_URL = 'http://waha-vendas:3000';
    process.env.WAHA_VENDAS_API_KEY = 'chave-vendas';

    const alvo = svc().resolveLinha('vendas');

    expect(alvo.baseUrl).toBe('http://waha-vendas:3000');
    expect(alvo.apiKey).toBe('chave-vendas');
    // As duas sessões se chamam `default` — é exatamente por isso que a sessão
    // não serve como identificador de linha.
    expect(alvo.session).toBe('default');
  });

  it('herda a chave da principal quando a linha não tem a sua', () => {
    process.env.WAHA_VENDAS_API_URL = 'http://waha-vendas:3000';
    expect(svc().resolveLinha('vendas').apiKey).toBe('chave-principal');
  });

  // Erra para o lado de ENVIAR: mandar pelo número principal é errado, não mandar
  // é pior — o lead fica sem resposta e ninguém percebe. O warn no log diz qual foi.
  it('linha desconhecida cai na principal em vez de falhar', () => {
    expect(svc().resolveLinha('inexistente').baseUrl).toBe('http://waha:3000');
  });

  it('nome com hífen vira env com underscore', () => {
    process.env.WAHA_PRE_VENDAS_API_URL = 'http://waha-pre:3000';
    expect(svc().resolveLinha('pre-vendas').baseUrl).toBe('http://waha-pre:3000');
  });
});

// Pareamento da segunda linha — sem isto o número novo não teria como ser
// vinculado pela tela, nem no primeiro dia nem nas quedas seguintes, que é o
// caso que mais dói: sessão cai e quem recupera precisa do QR na hora.
describe('WahaClientService — sessão por linha', () => {
  const OLD = process.env;
  let chamadas: string[];

  beforeEach(() => {
    process.env = {
      ...OLD,
      WAHA_API_URL: 'http://waha:3000',
      WAHA_API_KEY: 'chave-principal',
      WAHA_SESSION: 'default',
      WAHA_VENDAS_API_URL: 'http://waha-vendas:3000',
      WAHA_VENDAS_API_KEY: 'chave-vendas',
    };
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      chamadas.push(String(url));
      return { ok: true, json: async () => ({ status: 'SCAN_QR_CODE' }), arrayBuffer: async () => new ArrayBuffer(4) };
    }));
  });

  afterEach(() => {
    process.env = OLD;
    vi.unstubAllGlobals();
  });

  it('o QR da linha de vendas vem do container de vendas', async () => {
    await new WahaClientService().getQr('vendas');
    expect(chamadas.every((u) => u.startsWith('http://waha-vendas:3000'))).toBe(true);
  });

  it('sem linha, continua olhando o número principal', async () => {
    await new WahaClientService().getQr();
    expect(chamadas.every((u) => u.startsWith('http://waha:3000'))).toBe(true);
  });

  it('o restart também respeita a linha — reiniciar o número errado derruba quem está online', async () => {
    await new WahaClientService().restartSession('vendas');
    expect(chamadas[0]).toBe('http://waha-vendas:3000/api/sessions/default/restart');
  });
});
