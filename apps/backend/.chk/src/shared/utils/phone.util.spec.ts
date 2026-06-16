import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidBrazilPhone } from './phone.util';

describe('normalizePhone', () => {
  it('mantém número já canônico', () => {
    expect(normalizePhone('5511999887766')).toBe('5511999887766');
  });

  it('adiciona DDI 55 quando ausente', () => {
    expect(normalizePhone('11999887766')).toBe('5511999887766');
  });

  it('limpa formatação (+, espaços, parênteses, hífen)', () => {
    expect(normalizePhone('+55 (11) 99988-7766')).toBe('5511999887766');
  });

  it('remove sufixo de chatId do WAHA (@c.us)', () => {
    expect(normalizePhone('5511999887766@c.us')).toBe('5511999887766');
  });

  it('remove sufixo de device do WAHA (:N@c.us)', () => {
    expect(normalizePhone('5511999887766:5@c.us')).toBe('5511999887766');
  });

  it('retorna string vazia para entradas nulas/vazias', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('')).toBe('');
  });

  it('retorna string vazia quando não há dígitos', () => {
    expect(normalizePhone('abc-def')).toBe('');
  });
});

describe('isValidBrazilPhone', () => {
  it('aceita celular (13 dígitos com 55)', () => {
    expect(isValidBrazilPhone('5511999887766')).toBe(true);
  });

  it('aceita fixo (12 dígitos com 55)', () => {
    expect(isValidBrazilPhone('551133224455')).toBe(true);
  });

  it('normaliza antes de validar (sem DDI)', () => {
    expect(isValidBrazilPhone('11999887766')).toBe(true);
  });

  it('rejeita número curto demais', () => {
    expect(isValidBrazilPhone('5511999')).toBe(false);
  });

  it('rejeita número longo demais', () => {
    expect(isValidBrazilPhone('5511999887766551')).toBe(false);
  });

  it('rejeita entrada vazia', () => {
    expect(isValidBrazilPhone('')).toBe(false);
  });
});
