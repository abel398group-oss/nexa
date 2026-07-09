import { describe, it, expect } from 'vitest';
import { safeEqual } from './safe-compare';

describe('safeEqual (B1)', () => {
  it('true para strings iguais', () => {
    expect(safeEqual('token-abc-123', 'token-abc-123')).toBe(true);
  });

  it('false para strings diferentes de mesmo tamanho', () => {
    expect(safeEqual('token-abc-123', 'token-xyz-123')).toBe(false);
  });

  it('false para tamanhos diferentes (sem lançar)', () => {
    expect(safeEqual('curto', 'bem-mais-comprido')).toBe(false);
  });

  it('false quando algum valor é ausente', () => {
    expect(safeEqual(undefined, 'x')).toBe(false);
    expect(safeEqual('x', null)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });

  it('true para strings vazias iguais', () => {
    expect(safeEqual('', '')).toBe(true);
  });
});
