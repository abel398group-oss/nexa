import { describe, it, expect } from 'vitest';
import { parseAdminPhones } from './admin-phones.util';

// ─── BUGFIX (2026-07-22): ALERT_ADMIN_PHONE com vários números ───────────────

describe('parseAdminPhones', () => {
  it('vários números por vírgula → lista separada (o bug real)', () => {
    expect(parseAdminPhones('5511917747429,5511974869142')).toEqual([
      '5511917747429',
      '5511974869142',
    ]);
  });

  it('um número só', () => {
    expect(parseAdminPhones('5511917747429')).toEqual(['5511917747429']);
  });

  it('tolera espaços e máscara', () => {
    expect(parseAdminPhones(' +55 (11) 91774-7429 , 5511974869142 ')).toEqual([
      '5511917747429',
      '5511974869142',
    ]);
  });

  it('descarta números inválidos (< 12 dígitos)', () => {
    expect(parseAdminPhones('123,5511974869142')).toEqual(['5511974869142']);
  });

  it('vazio / undefined / null → lista vazia', () => {
    expect(parseAdminPhones('')).toEqual([]);
    expect(parseAdminPhones(undefined)).toEqual([]);
    expect(parseAdminPhones(null)).toEqual([]);
  });
});
