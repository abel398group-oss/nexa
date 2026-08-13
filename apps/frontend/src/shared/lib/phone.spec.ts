import { describe, it, expect } from 'vitest';
import { displayPhone, isPhoneLike, toBrPhone, toLocalPhone } from './phone';

describe('displayPhone', () => {
  it('formata celular BR com DDI 55', () => {
    expect(displayPhone('5511974869142')).toBe('(11) 97486-9142');
  });

  it('formata fixo BR com DDI 55', () => {
    expect(displayPhone('551134567890')).toBe('(11) 3456-7890');
  });

  it('formata sem DDI (11 digitos)', () => {
    expect(displayPhone('11974869142')).toBe('(11) 97486-9142');
  });

  it('formata sem DDI (10 digitos)', () => {
    expect(displayPhone('1134567890')).toBe('(11) 3456-7890');
  });

  it('retorna email sem prefixo email:', () => {
    expect(displayPhone('email:lia@hipertms.com.br')).toBe('lia@hipertms.com.br');
  });

  it('retorna string vazia para null', () => {
    expect(displayPhone(null)).toBe('');
  });

  it('retorna string vazia para undefined', () => {
    expect(displayPhone(undefined)).toBe('');
  });

  it('retorna raw se nao reconhecer o formato', () => {
    expect(displayPhone('abc')).toBe('abc');
  });

  // O bug de 13/08/2026: a conversa de web chat guarda um UUID na coluna
  // `phone`. Arrancar os dígitos dele FABRICAVA um telefone que nunca existiu —
  // "988354311937846295" aparecia embaixo do nome de um cliente real na tela de
  // Clientes, com 18 dígitos e cara de número discável.
  it('NAO fabrica telefone a partir de um UUID', () => {
    const uuid = '9f88be3f-5fac-4311-9d3e-ea78a4c6c295';
    expect(displayPhone(uuid)).toBe(uuid);
    expect(displayPhone(uuid)).not.toBe('988354311937846295');
  });

  it('digito solto so sai quando a entrada ja era so digito', () => {
    // número parcial/estrangeiro: segue devolvendo os dígitos, como antes
    expect(displayPhone('123456')).toBe('123456');
    // com letra no meio, devolve cru em vez de inventar
    expect(displayPhone('ID-12-AB-345')).toBe('ID-12-AB-345');
  });

  it('mascara digitada continua sendo formatada', () => {
    expect(displayPhone('(11) 97486-9142')).toBe('(11) 97486-9142');
    expect(displayPhone('+55 11 97486-9142')).toBe('(11) 97486-9142');
  });
});

describe('isPhoneLike', () => {
  it.each(['5511974869142', '11974869142', '551134567890', '1134567890', '(11) 97486-9142', '+55 11 97486-9142'])(
    'reconhece %s como telefone',
    (v) => expect(isPhoneLike(v)).toBe(true),
  );

  it.each([
    ['UUID do web chat', '9f88be3f-5fac-4311-9d3e-ea78a4c6c295'],
    ['e-mail', 'email:lia@hipertms.com.br'],
    ['texto', 'abc'],
    ['vazio', ''],
    ['curto demais', '12345'],
    ['longo demais', '988354311937846295'],
  ])('nao reconhece %s', (_, v) => expect(isPhoneLike(v)).toBe(false));

  it('nao reconhece null nem undefined', () => {
    expect(isPhoneLike(null)).toBe(false);
    expect(isPhoneLike(undefined)).toBe(false);
  });
});

describe('toBrPhone', () => {
  it('adiciona DDI 55 para celular BR (11 digitos)', () => {
    expect(toBrPhone('11974869142')).toBe('5511974869142');
  });

  it('adiciona DDI 55 para fixo BR (10 digitos)', () => {
    expect(toBrPhone('1134567890')).toBe('551134567890');
  });

  it('nao duplica DDI se ja comeca com 55', () => {
    expect(toBrPhone('5511974869142')).toBe('5511974869142');
  });

  it('retorna string vazia para input vazio', () => {
    expect(toBrPhone('')).toBe('');
  });
});

// ─── toLocalPhone — par do toBrPhone pra EXIBIÇÃO editável (DDI fixo, 2026-07-21)

describe('toLocalPhone', () => {
  it('remove o DDI 55 do valor salvo (celular, 13 dígitos)', () => {
    expect(toLocalPhone('5511974869142')).toBe('11974869142');
  });

  it('remove o DDI 55 do valor salvo (fixo, 12 dígitos)', () => {
    expect(toLocalPhone('551134567890')).toBe('1134567890');
  });

  it('valor já local (11 dígitos) fica intacto — mesmo começando com 55', () => {
    expect(toLocalPhone('11974869142')).toBe('11974869142');
    expect(toLocalPhone('55974869142')).toBe('55974869142'); // defensivo: nunca mutila
  });

  it('null/undefined/vazio → string vazia', () => {
    expect(toLocalPhone(null)).toBe('');
    expect(toLocalPhone(undefined)).toBe('');
    expect(toLocalPhone('')).toBe('');
  });

  it('round-trip: toBrPhone(toLocalPhone(x)) devolve o valor salvo — nunca 5555…', () => {
    for (const stored of ['5511974869142', '551134567890']) {
      expect(toBrPhone(toLocalPhone(stored))).toBe(stored);
    }
  });
});
