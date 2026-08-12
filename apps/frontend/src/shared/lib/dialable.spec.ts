import { describe, expect, it } from 'vitest';
import { podeDiscar } from './dialable';

describe('podeDiscar', () => {
  it.each([
    '5511999887766',
    '11999887766',
    '(11) 99988-7766',
    '11 3333-4444',
    '+55 11 99988-7766',
  ])('aceita %s', (v) => {
    expect(podeDiscar(v)).toBe(true);
  });

  it('recusa o campo de telefone com e-mail dentro', () => {
    // O caso real que motivou isto: uma oportunidade guardava
    // "email:abel.ramos@hipertms.com.br" no campo de telefone, e o link virava
    // `tel:email:abel.ramos@...`.
    expect(podeDiscar('email:abel.ramos@hipertms.com.br')).toBe(false);
    expect(podeDiscar('abel.ramos@hipertms.com.br')).toBe(false);
  });

  it.each(['', null, undefined, 'abc', 'não tem', '1234', 'ramal 22'])(
    'recusa %s',
    (v) => {
      expect(podeDiscar(v as string | null | undefined)).toBe(false);
    },
  );
});
