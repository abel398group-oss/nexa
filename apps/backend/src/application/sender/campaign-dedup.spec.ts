import { describe, it, expect } from 'vitest';
import { dedupWindowDays, dedupSentAtFilter, dedupWindowLabel } from './campaign-dedup';

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
