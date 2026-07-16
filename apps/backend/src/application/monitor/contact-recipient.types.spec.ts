/**
 * contact-recipient.types.spec.ts — sanitizeContacts()
 *
 * T8-FIX (2026-07-16): bug real encontrado em teste manual — editar um contato
 * (ex.: pelo proxy do TMS) sem reenviar `closingReport`/`cashView` resetava os
 * dois campos pra 'off', mesmo que o usuário nunca tivesse mexido neles. Regra
 * correta: ausente em EDIÇÃO preserva o valor anterior; presente-mas-inválido
 * sempre vira 'off'; ausente em contato NOVO (sem `prior`) também vira 'off'.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeContacts, type ContactRecipient } from './contact-recipient.types';

function makeExisting(overrides?: Partial<ContactRecipient>): ContactRecipient {
  return {
    id: 'c1',
    whatsapp: '5511999990001',
    emails: [],
    sectors: ['fiscal'],
    sendTimes: [{ hour: 8, minute: 0 }],
    sendDays: [1, 2, 3, 4, 5],
    closingReport: 'biweekly',
    cashView: 'lastSlot',
    ...overrides,
  };
}

describe('sanitizeContacts — closingReport/cashView (T8-FIX)', () => {
  it('(a) edição SEM o campo preserva o valor anterior (\'biweekly\'/\'lastSlot\')', () => {
    const existing = [makeExisting()];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 9, minute: 0 }], // só mudou o horário — não mandou closingReport/cashView
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    expect(result.closingReport).toBe('biweekly');
    expect(result.cashView).toBe('lastSlot');
  });

  it('(b) edição com \'off\' EXPLÍCITO desliga de verdade (não é tratado como ausente)', () => {
    const existing = [makeExisting()];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'off',
        cashView: 'off',
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    expect(result.closingReport).toBe('off');
    expect(result.cashView).toBe('off');
  });

  it('(c) contato NOVO (sem prior) sem o campo nasce \'off\'', () => {
    const input = [
      {
        whatsapp: '5511988880000',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, null);
    expect(result.closingReport).toBe('off');
    expect(result.cashView).toBe('off');
  });

  it('(d) valor PRESENTE mas fora do enum vira \'off\', mesmo em edição com prior válido', () => {
    const existing = [makeExisting()];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'weekly', // inválido
        cashView: 'always', // inválido
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    expect(result.closingReport).toBe('off');
    expect(result.cashView).toBe('off');
  });

  it('edição sem o campo, mas SEM prior correspondente (id novo que por acaso não existia) → off', () => {
    const input = [
      {
        id: 'c-desconhecido',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, [makeExisting({ id: 'outro-id' })]);
    expect(result.closingReport).toBe('off');
    expect(result.cashView).toBe('off');
  });

  it('edição sem o campo preserva também quando o valor anterior já era \'off\' (não vaza um "ligado" por engano)', () => {
    const existing = [makeExisting({ closingReport: 'off', cashView: 'off' })];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    expect(result.closingReport).toBe('off');
    expect(result.cashView).toBe('off');
  });
});
