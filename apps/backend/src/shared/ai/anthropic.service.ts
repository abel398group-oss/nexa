import { Injectable, Logger } from '@nestjs/common';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const AI_MODEL = process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001';

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

  // Completa esperando JSON; extrai o 1º objeto {...} da resposta.
  async completeJson<T = any>(
    system: string,
    user: string,
    opts: { maxTokens?: number } = {},
  ): Promise<T> {
    const raw = await this.complete(system, user, { maxTokens: opts.maxTokens ?? 300, temperature: 0 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`JSON não encontrado na resposta: ${raw.slice(0, 120)}`);
    return JSON.parse(match[0]) as T;
  }
}
