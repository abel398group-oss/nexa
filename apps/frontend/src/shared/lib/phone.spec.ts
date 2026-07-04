import { describe, it, expect } from 'vitest';
import { displayPhone, toBrPhone } from './phone';

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
