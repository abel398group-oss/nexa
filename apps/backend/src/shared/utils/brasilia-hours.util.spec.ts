import { describe, it, expect } from 'vitest';
import {
  brasiliaHour,
  brasiliaDayStamp,
  brasiliaHourStamp,
  withinBusinessHours,
} from './brasilia-hours.util';

// Todas as datas são construídas em UTC (`Date.UTC` / sufixo `Z`) de propósito:
// o ponto do módulo é justamente NÃO depender do fuso de quem roda o teste.
// Construir com `new Date(2026, 7, 9, 3)` deixaria o resultado variar entre a
// máquina do Abel (UTC-3) e um runner de CI em UTC.

describe('brasiliaHour', () => {
  it('converte UTC para o relógio de Brasília (UTC-3)', () => {
    expect(brasiliaHour(new Date('2026-08-09T12:00:00Z'))).toBe(9);
    expect(brasiliaHour(new Date('2026-08-09T03:00:00Z'))).toBe(0);
  });

  it('atravessa a meia-noite para o dia anterior sem virar hora negativa', () => {
    // 01:00Z = 22:00 do dia ANTERIOR em Brasília
    expect(brasiliaHour(new Date('2026-08-09T01:00:00Z'))).toBe(22);
  });
});

describe('brasiliaDayStamp', () => {
  it('usa o dia do fuso de Brasília, não o de UTC', () => {
    // 02:00Z de dia 09 ainda é dia 08 em Brasília — este é exatamente o caso que
    // faria o contador diário zerar 3 horas cedo se lesse o dia em UTC.
    expect(brasiliaDayStamp(new Date('2026-08-09T02:00:00Z'))).toBe('2026-08-08');
    expect(brasiliaDayStamp(new Date('2026-08-09T03:00:00Z'))).toBe('2026-08-09');
  });

  it('zera-pad mês e dia', () => {
    expect(brasiliaDayStamp(new Date('2026-01-05T15:00:00Z'))).toBe('2026-01-05');
  });
});

describe('brasiliaHourStamp', () => {
  it('combina dia de Brasília com hora de Brasília', () => {
    expect(brasiliaHourStamp(new Date('2026-08-09T02:30:00Z'))).toBe('2026-08-08-23');
    expect(brasiliaHourStamp(new Date('2026-08-09T12:30:00Z'))).toBe('2026-08-09-09');
  });
});

describe('withinBusinessHours', () => {
  it('aceita o começo da janela e recusa o fim (endHour exclusivo)', () => {
    // 10:00Z = 07:00 BRT — primeiro minuto válido da janela 7–19
    expect(withinBusinessHours(new Date('2026-08-09T10:00:00Z'), 7, 19)).toBe(true);
    // 22:00Z = 19:00 BRT — já fora
    expect(withinBusinessHours(new Date('2026-08-09T22:00:00Z'), 7, 19)).toBe(false);
    // 21:59Z = 18:59 BRT — último minuto válido
    expect(withinBusinessHours(new Date('2026-08-09T21:59:00Z'), 7, 19)).toBe(true);
  });

  it('recusa madrugada — o caso que fazia o janitor mandar mensagem às 3h', () => {
    // 06:00Z = 03:00 BRT
    expect(withinBusinessHours(new Date('2026-08-09T06:00:00Z'), 7, 19)).toBe(false);
  });
});
