import { describe, it, expect } from 'vitest';
import { isBandDue, DIGEST_THROTTLE_DAYS } from './digest-throttle.const';

// ─── Throttle por severidade do digest WhatsApp (2026-07-20) ─────────────────
// CRITICAL/OVERDUE → sempre; DUE_SOON → 7 dias; INFO → 28 dias. Por contato.

const NOW = new Date(2026, 6, 20, 8, 0, 0); // 2026-07-20 08:00

describe('DIGEST_THROTTLE_DAYS — limiares', () => {
  it('só DUE_SOON e INFO são throttled', () => {
    expect(Object.keys(DIGEST_THROTTLE_DAYS).sort()).toEqual(['DUE_SOON', 'INFO']);
    expect(DIGEST_THROTTLE_DAYS.DUE_SOON).toBe(7);
    expect(DIGEST_THROTTLE_DAYS.INFO).toBe(28);
  });
});

describe('isBandDue', () => {
  it('CRITICAL e OVERDUE: sempre devidos, mesmo com inclusão recente', () => {
    expect(isBandDue('CRITICAL', '2026-07-20', NOW)).toBe(true);
    expect(isBandDue('OVERDUE', '2026-07-20', NOW)).toBe(true);
  });

  it('severidade desconhecida: nunca esconder — sempre devida', () => {
    expect(isBandDue('WHATEVER', '2026-07-20', NOW)).toBe(true);
  });

  it('DUE_SOON: sem histórico → devida (primeira vez sempre sai)', () => {
    expect(isBandDue('DUE_SOON', undefined, NOW)).toBe(true);
  });

  it('DUE_SOON: incluída ontem → suprimida (ciclo de 7 dias em curso)', () => {
    expect(isBandDue('DUE_SOON', '2026-07-19', NOW)).toBe(false);
  });

  it('DUE_SOON: incluída há exatamente 7 dias → devida de novo', () => {
    expect(isBandDue('DUE_SOON', '2026-07-13', NOW)).toBe(true);
  });

  it('DUE_SOON: incluída há 6 dias → ainda suprimida', () => {
    expect(isBandDue('DUE_SOON', '2026-07-14', NOW)).toBe(false);
  });

  it('INFO: incluída há 27 dias → suprimida; há 28 → devida', () => {
    expect(isBandDue('INFO', '2026-06-23', NOW)).toBe(false); // 27 dias
    expect(isBandDue('INFO', '2026-06-22', NOW)).toBe(true);  // 28 dias
  });

  it('data corrompida no estado → devida (nunca esconder alerta por dado ruim)', () => {
    expect(isBandDue('DUE_SOON', 'garbage', NOW)).toBe(true);
  });
});
