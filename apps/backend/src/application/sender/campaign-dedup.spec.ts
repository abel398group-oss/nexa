import { describe, it, expect } from 'vitest';
import { dedupWindowDays, dedupSentAtFilter, dedupWindowLabel, podeIgnorarDedup } from './campaign-dedup';

const AGORA = new Date('2026-08-08T12:00:00Z');

describe('dedupWindowDays', () => {
  it('sem a variável: sem janela (bloqueia para sempre, comportamento atual)', () => {
    expect(dedupWindowDays({} as any)).toBeNull();
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: '' } as any)).toBeNull();
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: '   ' } as any)).toBeNull();
  });

  it('lê o número de dias', () => {
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: '45' } as any)).toBe(45);
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: ' 30 ' } as any)).toBe(30);
  });

  it('trunca fração (meio dia de janela não significa nada aqui)', () => {
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: '30.9' } as any)).toBe(30);
  });

  // Um typo não pode virar disparo em massa: valor inválido cai em "bloquear para
  // sempre", nunca em "liberar tudo".
  it('valor inválido cai no lado seguro', () => {
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: '3o' } as any)).toBeNull();
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: '0' } as any)).toBeNull();
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: '-10' } as any)).toBeNull();
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: 'true' } as any)).toBeNull();
    expect(dedupWindowDays({ CAMPAIGN_DEDUP_DAYS: 'Infinity' } as any)).toBeNull();
  });
});

describe('dedupSentAtFilter', () => {
  it('sem janela: sem filtro (o where do Prisma fica como está hoje)', () => {
    expect(dedupSentAtFilter(AGORA, {} as any)).toBeUndefined();
  });

  it('com janela: corta em agora menos os dias', () => {
    const f = dedupSentAtFilter(AGORA, { CAMPAIGN_DEDUP_DAYS: '30' } as any);
    expect(f?.gte.toISOString()).toBe('2026-07-09T12:00:00.000Z');
  });

  it('janela de 1 dia', () => {
    const f = dedupSentAtFilter(AGORA, { CAMPAIGN_DEDUP_DAYS: '1' } as any);
    expect(f?.gte.toISOString()).toBe('2026-08-07T12:00:00.000Z');
  });
});

describe('dedupWindowLabel', () => {
  it('diz a regra em português para o log', () => {
    expect(dedupWindowLabel({} as any)).toBe('sem janela (nunca reenviar)');
    expect(dedupWindowLabel({ CAMPAIGN_DEDUP_DAYS: '45' } as any)).toBe('últimos 45 dia(s)');
  });
});

// ── Ignorar o "já enviado" numa campanha (10/08/2026) ───────────────────────
// Sem isto, testar o fluxo ponta a ponta com um endereço real é impossível depois do
// primeiro envio: o dedup bloqueia para sempre e a campanha nasce sem sair. Aconteceu
// duas vezes em dois dias.
describe('podeIgnorarDedup', () => {
  const LIGADO = { CAMPAIGN_RESEND_ALL_ENABLED: 'true' } as any;

  it('pedido + ambiente liberado = ignora', () => {
    expect(podeIgnorarDedup(true, LIGADO)).toBe(true);
  });

  // Produção nasce protegida: pedir sem a variável não fura a proteção anti-spam,
  // simplesmente não faz nada.
  it('pedido SEM o ambiente liberado = não ignora', () => {
    expect(podeIgnorarDedup(true, {} as any)).toBe(false);
    expect(podeIgnorarDedup(true, { CAMPAIGN_RESEND_ALL_ENABLED: 'false' } as any)).toBe(false);
  });

  it('sem pedido, o ambiente liberado não muda nada', () => {
    expect(podeIgnorarDedup(false, LIGADO)).toBe(false);
    expect(podeIgnorarDedup(undefined, LIGADO)).toBe(false);
  });

  // Mesmo interruptor do reenvio total: uma variável só para desligar quando o teste
  // acabar, em vez de duas para alguém esquecer uma.
  it('usa o mesmo interruptor do reenvio total', () => {
    expect(podeIgnorarDedup(true, { CAMPAIGN_RESEND_ALL_ENABLED: 'TRUE' } as any)).toBe(true);
  });
});
