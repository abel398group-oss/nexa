import { describe, it, expect } from 'vitest';
import { rejectionReason, canReceiveCampaign } from './phone-eligibility';

// ─── Elegibilidade de disparo (auditoria pré go-live, 2026-08-01) ────────────
// Casos tirados do CSV real de 1.976 leads raspados de grupos de WhatsApp.

describe('rejectionReason — números que PODEM receber', () => {
  it('celular com 9º dígito (13 dígitos)', () => {
    expect(rejectionReason('5511947518422')).toBeNull();
    expect(rejectionReason('5521970659833')).toBeNull();
  });

  it('celular formato antigo, 8 dígitos começando com 6-9', () => {
    // No CSV real: 542 começam com 9, 225 com 8, 23 com 7, 1 com 6.
    // Em grupo de WhatsApp esse costuma ser o ID real do contato.
    expect(rejectionReason('553592013225')).toBeNull(); // 9…
    expect(rejectionReason('553198566246')).toBeNull(); // 8…
    expect(rejectionReason('553171445211')).toBeNull(); // 7…
    expect(rejectionReason('554791042086')).toBeNull(); // 9…
  });

  it('aceita telefone formatado (limpa a máscara)', () => {
    expect(rejectionReason('+55 (11) 94751-8422')).toBeNull();
    expect(canReceiveCampaign('55 12 99626-2968')).toBe(true);
  });
});

describe('rejectionReason — números RECUSADOS', () => {
  it('estrangeiro: o bug do "55" colado na frente', () => {
    // normalizePhone("639616524149") devolvia "55639616524149" — inexistente.
    expect(rejectionReason('639616524149')).toBe('nao_brasileiro'); // Filipinas
    expect(rejectionReason('628582938537')).toBe('nao_brasileiro'); // Indonésia
    expect(rejectionReason('595991484190')).toBe('nao_brasileiro'); // Paraguai
    expect(rejectionReason('2349130804430')).toBe('nao_brasileiro'); // Nigéria
  });

  it('tamanho inválido', () => {
    expect(rejectionReason('62858293853735')).toBe('nao_brasileiro'); // 14 díg, lixo
    expect(rejectionReason('5511999')).toBe('tamanho_invalido');
    expect(rejectionReason('551194751842212')).toBe('tamanho_invalido');
    // 13 dígitos precisa do 9 na frente da linha
    expect(rejectionReason('5511747518422')).toBe('tamanho_invalido');
  });

  it('DDD que não existe', () => {
    expect(rejectionReason('5520999887766')).toBe('ddd_invalido');
    expect(rejectionReason('5510999887766')).toBe('ddd_invalido');
    expect(rejectionReason('5599999887766')).toBeNull(); // 99 é válido (MA)
  });

  it('telefone fixo (não tem WhatsApp)', () => {
    expect(rejectionReason('551129491169')).toBe('telefone_fixo'); // 2…
    expect(rejectionReason('553134567890')).toBe('telefone_fixo'); // 3…
    expect(rejectionReason('554145678901')).toBe('telefone_fixo'); // 4…
    expect(rejectionReason('551156789012')).toBe('telefone_fixo'); // 5…
  });

  it('vazio / lixo', () => {
    expect(rejectionReason('')).toBe('nao_brasileiro');
    expect(rejectionReason(null)).toBe('nao_brasileiro');
    expect(rejectionReason('abc')).toBe('nao_brasileiro');
  });
});
