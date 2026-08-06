import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// C1 (auditoria 2026-07-08): garante o timeout + retry das chamadas à Anthropic.
// Sem esta lógica, uma requisição pendurada segurava o webhook e derrubava a Lia
// para todos os tenants. Os consts de timeout/retry são lidos no load do módulo,
// então usamos vi.resetModules() + import dinâmico para injetar env por teste.
describe('AnthropicService — timeout & retry (C1)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...OLD_ENV,
      ANTHROPIC_API_KEY: 'sk-ant-test',
      AI_MAX_RETRIES: '1',
      AI_RETRY_BASE_MS: '1', // backoff quase instantâneo no teste
      AI_TIMEOUT_MS: '50',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const okResponse = (text = 'ok') => ({
    ok: true,
    json: async () => ({ content: [{ text }], usage: { input_tokens: 3, output_tokens: 5 } }),
  });

  // CI fix (2026-08-06): estes dois testes esperavam o backoff real
  // (setTimeout de até ~1s, base 500ms + jitter — anthropic.service.ts:178)
  // dentro do timeout padrão de 5s do vitest. Sob CI carregado/lento, um
  // setTimeout de ~1s pode legitimamente não disparar a tempo — não é bug de
  // aplicação, é teste dependente de relógio real. Mesmo padrão já usado em
  // monitor-dispatch.service.spec.ts: fake timers + advanceTimersByTimeAsync,
  // pra rodar em milissegundos de tempo real, imune à carga da máquina.
  it('retenta uma vez em 429 e então tem sucesso', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
        .mockResolvedValueOnce(okResponse('resposta'));
      vi.stubGlobal('fetch', fetchMock);

      const { AnthropicService } = await import('./anthropic.service');
      const svc = new AnthropicService();

      const promise = svc.complete('sys', 'user');
      await vi.advanceTimersByTimeAsync(2_000); // > backoff máximo (base 500ms + jitter até 500ms)
      await expect(promise).resolves.toBe('resposta');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retenta em 503 (5xx) e propaga usage no completeWithUsage', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' })
        .mockResolvedValueOnce(okResponse('oi'));
      vi.stubGlobal('fetch', fetchMock);

      const { AnthropicService } = await import('./anthropic.service');
      const svc = new AnthropicService();

      const promise = svc.completeWithUsage('sys', 'user');
      await vi.advanceTimersByTimeAsync(2_000);
      const out = await promise;
      expect(out.text).toBe('oi');
      expect(out.tokensIn).toBe(3);
      expect(out.tokensOut).toBe(5);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('NÃO retenta em 400 (erro do cliente) — falha na 1ª tentativa', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' });
    vi.stubGlobal('fetch', fetchMock);

    const { AnthropicService } = await import('./anthropic.service');
    const svc = new AnthropicService();

    await expect(svc.complete('sys', 'user')).rejects.toThrow(/Anthropic 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passa um AbortSignal (timeout) ao fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { AnthropicService } = await import('./anthropic.service');
    const svc = new AnthropicService();

    await svc.complete('s', 'u');
    const optsArg = fetchMock.mock.calls[0][1];
    expect(optsArg.signal).toBeInstanceOf(AbortSignal);
  });

  it('retenta em timeout/rede (AbortError) e então tem sucesso', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn().mockRejectedValueOnce(abortErr).mockResolvedValueOnce(okResponse('recuperou'));
    vi.stubGlobal('fetch', fetchMock);

    const { AnthropicService } = await import('./anthropic.service');
    const svc = new AnthropicService();

    await expect(svc.complete('s', 'u')).resolves.toBe('recuperou');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('esgota os retries e lança, contabilizando a falha em getStats()', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    vi.stubGlobal('fetch', fetchMock);

    const { AnthropicService } = await import('./anthropic.service');
    const svc = new AnthropicService();

    await expect(svc.complete('s', 'u')).rejects.toThrow(/Anthropic 500/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 tentativa + 1 retry
    expect(svc.getStats().failures).toBe(1);
  });
});
