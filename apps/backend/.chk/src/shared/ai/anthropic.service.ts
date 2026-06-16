import { Injectable, Logger } from '@nestjs/common';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const AI_MODEL = process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001';

// Preço aproximado Haiku (USD por milhão de tokens) — configurável por env.
const USD_PER_MTOK_IN = Number(process.env.AI_PRICE_IN ?? 1);
const USD_PER_MTOK_OUT = Number(process.env.AI_PRICE_OUT ?? 5);

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

  get configured(): boolean {
    const k = process.env.ANTHROPIC_API_KEY;
    return !!k && !k.includes('xxxxx');
  }

  // Completa um prompt; lança se a API falhar (chamador decide fallback).
  async complete(
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<string> {
    if (!this.configured) throw new Error('ANTHROPIC_API_KEY ausente/placeholder');

    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 160)}`);
    }
    const data: any = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text) throw new Error('Resposta vazia da Anthropic');
    return text;
  }

  // Igual ao complete(), mas também devolve uso de tokens + custo estimado.
  async completeWithUsage(
    system: string,
    user: string,
    opts: { maxTokens?: number; temperature?: number } = {},
  ): Promise<AiUsage> {
    if (!this.configured) throw new Error('ANTHROPIC_API_KEY ausente/placeholder');
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: opts.maxTokens ?? 400,
        temperature: opts.temperature ?? 0.4,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 160)}`);
    }
    const data: any = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text) throw new Error('Resposta vazia da Anthropic');
    const tokensIn = data?.usage?.input_tokens ?? 0;
    const tokensOut = data?.usage?.output_tokens ?? 0;
    return { text, tokensIn, tokensOut, costUsd: estimateCost(tokensIn, tokensOut) };
  }

  // Completa esperando JSON; extrai e parseia o 1º objeto JSON válido da resposta.
  // BUG-10 fix: regex greedy /\{[\s\S]*\}/ podia capturar do 1º ao último '}', produzindo
  // JSON inválido quando o modelo incluía múltiplos objetos ou explicava exemplos.
  // Solução: tenta parsear candidatos em ordem até encontrar um JSON válido.
  async completeJson<T = any>(
    system: string,
    user: string,
    opts: { maxTokens?: number } = {},
  ): Promise<T> {
    const raw = await this.complete(system, user, { maxTokens: opts.maxTokens ?? 300, temperature: 0 });
    // Extrai todos os candidatos {...} em ordem de aparição (non-greedy)
    const candidates = [...raw.matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
    // Tenta parsear do maior para o menor (objeto mais completo primeiro)
    const sorted = candidates.sort((a, b) => b.length - a.length);
    for (const candidate of sorted) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // tenta o próximo candidato
      }
    }
    // Fallback: tenta parsear a resposta inteira
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`JSON não encontrado na resposta: ${raw.slice(0, 120)}`);
    }
  }
}
