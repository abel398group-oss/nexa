import { Injectable, Logger } from '@nestjs/common';
import { extrairJson } from './json-extract';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const AI_MODEL = process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001';

// Preço aproximado Haiku (USD por milhão de tokens) — configurável por env.
const USD_PER_MTOK_IN = Number(process.env.AI_PRICE_IN ?? 1);
const USD_PER_MTOK_OUT = Number(process.env.AI_PRICE_OUT ?? 5);

// C1 (auditoria 2026-07-08): timeout + retry nas chamadas à Anthropic.
// Sem timeout, uma requisição pendurada segurava o request do webhook indefinidamente
// e, num incidente da API, esgotava os workers — a Lia parava para TODOS os tenants.
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 20_000);
// 1 retry (2 tentativas no total) só para falhas transitórias: 429 e 5xx, ou timeout/rede.
const AI_MAX_RETRIES = Number(process.env.AI_MAX_RETRIES ?? 1);
const AI_RETRY_BASE_MS = Number(process.env.AI_RETRY_BASE_MS ?? 500);
// Concurrency cap: máximo de chamadas simultâneas à Anthropic. Sem isso, um pico de
// mensagens vira centenas de requests paralelos → rate-limit (429), custo e memória.
// O excesso entra numa fila FIFO até liberar um slot.
const AI_MAX_CONCURRENCY = Math.max(1, Number(process.env.AI_MAX_CONCURRENCY ?? 8));

export interface AiUsage {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * USD_PER_MTOK_IN + (tokensOut / 1_000_000) * USD_PER_MTOK_OUT;
}

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger('Anthropic');
  // In-memory failure counters (reset on process restart) — consumed by /health.
  private _failureCount = 0;
  private _lastFailAt: Date | null = null;
  // Concurrency gate (AI_MAX_CONCURRENCY): in-memory semaphore, no external dep.
  private active = 0;
  private readonly queue: Array<() => void> = [];
  // Observabilidade da fila (2026-08-08): com muitos leads simultâneos o teto de
  // concorrência vira o gargalo real de latência, e antes disso não aparecia em
  // lugar nenhum — "a Lia está lenta" ficava indistinguível de "a Anthropic está
  // lenta". Cada mensagem do lead consome ~3 slots (roteador + vendedora +
  // supervisora), então o teto satura bem antes do número de leads sugerir.
  private peakQueued = 0;
  private lastQueueWarnAt = 0;

  get configured(): boolean {
    const k = process.env.ANTHROPIC_API_KEY;
    return !!k && !k.includes('xxxxx');
  }

  // Stats exposed to /health for monitoring.
  getStats() {
    return {
      failures: this._failureCount,
      lastFailAt: this._lastFailAt?.toISOString() ?? null,
      // `peakQueued` > 0 no /health é o sinal de que AI_MAX_CONCURRENCY está apertado.
      concurrency: {
        limit: AI_MAX_CONCURRENCY,
        active: this.active,
        queued: this.queue.length,
        peakQueued: this.peakQueued,
      },
    };
  }

  private recordFailure() {
    this._failureCount++;
    this._lastFailAt = new Date();
  }

  // Falhas transitórias que valem 1 retry: rate limit (429), erros de servidor (5xx),
  // ou timeout/rede (AbortError / TypeError do fetch). 4xx (exceto 429) NÃO retenta.
  private isRetryable(status: number | null, err: unknown): boolean {
    if (status === 429) return true;
    if (status !== null && status >= 500) return true;
    const name = (err as { name?: string })?.name;
    return name === 'AbortError' || name === 'TimeoutError' || name === 'TypeError';
  }

  // Adquire um slot de concorrência; resolve na hora se houver folga, senão espera
  // na fila FIFO até outra chamada liberar.
  private acquireSlot(): Promise<void> {
    if (this.active < AI_MAX_CONCURRENCY) {
      this.active++;
      return Promise.resolve();
    }
    const waiting = new Promise<void>((resolve) => this.queue.push(resolve));
    if (this.queue.length > this.peakQueued) this.peakQueued = this.queue.length;
    this.warnIfBacklogged();
    return waiting;
  }

  // Avisa quando a fila passa do teto: a partir daí toda chamada nova espera pelo
  // menos um ciclo inteiro antes de começar, e o lead sente isso como demora.
  // Limitado a 1 aviso por minuto para não poluir o log num pico.
  private warnIfBacklogged() {
    if (this.queue.length < AI_MAX_CONCURRENCY) return;
    const now = Date.now();
    if (now - this.lastQueueWarnAt < 60_000) return;
    this.lastQueueWarnAt = now;
    this.logger.warn(
      `Fila de IA: ${this.queue.length} chamada(s) esperando (teto ${AI_MAX_CONCURRENCY} simultâneas). ` +
        `Se persistir sob carga, aumente AI_MAX_CONCURRENCY.`,
    );
  }

  // Libera o slot: se há alguém esperando, passa o slot direto (active constante);
  // senão, decrementa (slot realmente livre).
  private releaseSlot(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.active--;
  }

  // Wrapper de concorrência sobre requestInner — garante no máx. AI_MAX_CONCURRENCY
  // chamadas simultâneas. Timeout/retry ficam intactos no requestInner.
  private async request(
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<any> {
    await this.acquireSlot();
    try {
      return await this.requestInner(system, user, opts);
    } finally {
      this.releaseSlot();
    }
  }

  // Núcleo único das chamadas: monta o request, aplica timeout por tentativa e faz
  // até AI_MAX_RETRIES retries com backoff exponencial para falhas transitórias.
  // Retorna o JSON bruto da Anthropic; o chamador extrai texto/usage. Lança em falha
  // definitiva (o chamador decide o fallback seguro — ADR 012).
  private async requestInner(
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<any> {
    if (!this.configured) throw new Error('ANTHROPIC_API_KEY ausente/placeholder');

    const body = JSON.stringify({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.4,
      system,
      messages: [{ role: 'user', content: user }],
    });

    let lastErr: unknown;
    for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
      // Só o fetch (erros de rede/timeout) fica no try — o tratamento da resposta
      // HTTP fica fora dele para não ser recapturado pelo catch (evita dupla contagem).
      let res: Response;
      try {
        res = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY as string,
            'anthropic-version': '2023-06-01',
          },
          body,
          // timeout por tentativa — aborta requisições penduradas (C1)
          signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        });
      } catch (err) {
        // timeout/rede: retenta se ainda houver tentativa; senão, propaga
        lastErr = err;
        if (attempt < AI_MAX_RETRIES && this.isRetryable(null, err)) {
          this.logger.warn(`Anthropic tentativa ${attempt + 1} falhou (${(err as Error)?.message}) — retry`);
          await this.backoff(attempt);
          continue;
        }
        this.recordFailure();
        throw err;
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const err = new Error(`Anthropic ${res.status}: ${errBody.slice(0, 160)}`);
        if (attempt < AI_MAX_RETRIES && this.isRetryable(res.status, null)) {
          lastErr = err;
          await this.backoff(attempt);
          continue;
        }
        this.recordFailure();
        throw err;
      }

      const data: any = await res.json();
      const text = data?.content?.[0]?.text?.trim();
      if (!text) {
        // resposta vazia não é transitória — não adianta retentar
        this.recordFailure();
        throw new Error('Resposta vazia da Anthropic');
      }
      return data;
    }
    // inalcançável (o loop sempre retorna ou lança), mas satisfaz o type-checker
    throw lastErr instanceof Error ? lastErr : new Error('Anthropic: falha desconhecida');
  }

  // Backoff exponencial com jitter: base * 2^attempt + [0, base).
  private backoff(attempt: number): Promise<void> {
    const delay = AI_RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * AI_RETRY_BASE_MS);
    return new Promise((r) => setTimeout(r, delay));
  }

  // Completa um prompt; lança se a API falhar (chamador decide fallback).
  async complete(
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    const data = await this.request(system, user, opts);
    return data.content[0].text.trim();
  }

  // Igual ao complete(), mas também devolve uso de tokens + custo estimado.
  async completeWithUsage(
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<AiUsage> {
    const data = await this.request(system, user, opts);
    const text = data.content[0].text.trim();
    const tokensIn = data?.usage?.input_tokens ?? 0;
    const tokensOut = data?.usage?.output_tokens ?? 0;
    return { text, tokensIn, tokensOut, costUsd: estimateCost(tokensIn, tokensOut) };
  }

  /**
   * Completa esperando JSON e devolve o valor já parseado.
   *
   * A extração vive em `json-extract.ts` — ver lá o porquê. Resumo: a versão
   * anterior recortava com regex non-greedy e não sobrevivia a JSON aninhado nem a
   * `{{nome}}` dentro do texto (que os nossos próprios prompts mandam escrever), e
   * o único fallback exigia resposta sem uma linha sequer em volta. Em 20/08/2026
   * isso derrubou o "Gerar do roteiro" com 400 em toda tentativa: o modelo
   * respondia certo, dentro de uma cerca de markdown que ninguém descascava.
   */
  async completeJson<T = any>(
    system: string,
    user: string,
    opts: { maxTokens?: number } = {},
  ): Promise<T> {
    const raw = await this.complete(system, user, { maxTokens: opts.maxTokens ?? 300, temperature: 0 });
    const parsed = extrairJson<T>(raw);
    if (parsed === null) {
      throw new Error(`JSON não encontrado na resposta: ${raw.slice(0, 120)}`);
    }
    return parsed;
  }
}
