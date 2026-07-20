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
import { sanitizeContacts, cashViewIsOn, effectiveDelivery, type ContactRecipient } from './contact-recipient.types';

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

// ─── Throttle do digest (2026-07-20): lastBandInclude é estado interno ───────
// e DEVE sobreviver a qualquer edição vinda do TMS (que nunca envia o campo) —
// mesmo princípio de lastDigestDate/lastClosingDate. Sem isso, cada save do TMS
// resetaria o ciclo e o throttle nunca throttlearia nada.

describe('sanitizeContacts — lastBandInclude (throttle do digest)', () => {
  it('edição vinda do TMS (sem o campo) preserva o ciclo do throttle', () => {
    const existing = [makeExisting({ lastBandInclude: { DUE_SOON: '2026-07-12', INFO: '2026-07-01' } })];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 9, minute: 0 }], // TMS só mudou o horário
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    expect(result.lastBandInclude).toEqual({ DUE_SOON: '2026-07-12', INFO: '2026-07-01' });
  });

  it("setor 'procurement' (Compras, 2026-07-20) passa pelo sanitize — não é filtrado", () => {
    const input = [
      {
        id: 'c-proc',
        whatsapp: '5511999990003',
        emails: [],
        sectors: ['procurement', 'fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, null);
    expect(result.sectors).toEqual(['procurement', 'fiscal']);
  });

  it('contato novo nasce sem ciclo (primeira inclusão sempre sai)', () => {
    const input = [
      {
        id: 'novo',
        whatsapp: '5511999990002',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, null);
    expect(result.lastBandInclude).toBeUndefined();
  });
});

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
        closingReport: 'yearly', // inválido
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

describe('T9-ADENDO (2026-07-17) — cashView on/off + compat lastSlot, closingReport weekly', () => {
  it("cashViewIsOn: true para 'on' e para o alias legado 'lastSlot'; false para 'off'/undefined", () => {
    expect(cashViewIsOn('on')).toBe(true);
    expect(cashViewIsOn('lastSlot')).toBe(true);
    expect(cashViewIsOn('off')).toBe(false);
    expect(cashViewIsOn(undefined)).toBe(false);
  });

  it("edição envia 'lastSlot' explicitamente → sanitize normaliza para 'on' (higiene de dados daqui pra frente)", () => {
    const existing = [makeExisting({ cashView: 'off' })];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        cashView: 'lastSlot',
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    expect(result.cashView).toBe('on');
  });

  it("contato antigo com prior 'lastSlot' preservado (edição sem reenviar o campo) continua legível via cashViewIsOn", () => {
    const existing = [makeExisting({ cashView: 'lastSlot' })];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 9, minute: 0 }], // não reenvia cashView
        sendDays: [1, 2, 3, 4, 5],
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    // prior NÃO é normalizado — continua 'lastSlot', mas cashViewIsOn trata como 'on'.
    expect(result.cashView).toBe('lastSlot');
    expect(cashViewIsOn(result.cashView)).toBe(true);
  });

  it("closingReport aceita 'weekly' como valor explícito válido", () => {
    const existing = [makeExisting({ closingReport: 'off' })];
    const input = [
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'weekly',
      },
    ];
    const [result] = sanitizeContacts(input, existing);
    expect(result.closingReport).toBe('weekly');
  });
});

describe('T9-WIZARD (2026-07-17) — effectiveDelivery: caixa herda os canais do digest', () => {
  function makeContact(overrides?: Partial<ContactRecipient>): ContactRecipient {
    return {
      id: 'c1',
      whatsapp: '5511999990001',
      emails: ['a@b.com'],
      sectors: ['fiscal'],
      sendTimes: [{ hour: 8, minute: 0 }],
      sendDays: [1, 2, 3, 4, 5],
      ...overrides,
    };
  }

  it("delivery explícito + cashView='on' → cash herda os canais efetivos do digest (não tem entrada própria no JSON)", () => {
    const contact = makeContact({
      cashView: 'on',
      delivery: {
        digest: { whatsapp: true, email: false },
        closing: { whatsapp: false, email: false },
      },
    });
    const result = effectiveDelivery(contact);
    expect(result.cash).toEqual({ whatsapp: true, email: false });
  });

  it("cashView='off' → cash sempre {false,false}, mesmo com digest ligado nos dois canais", () => {
    const contact = makeContact({
      cashView: 'off',
      delivery: {
        digest: { whatsapp: true, email: true },
        closing: { whatsapp: false, email: false },
      },
    });
    const result = effectiveDelivery(contact);
    expect(result.cash).toEqual({ whatsapp: false, email: false });
  });

  it("compat 'lastSlot' (alias legado) também liga o cash herdado do digest", () => {
    const contact = makeContact({
      cashView: 'lastSlot',
      delivery: {
        digest: { whatsapp: true, email: true },
        closing: { whatsapp: false, email: false },
      },
    });
    const result = effectiveDelivery(contact);
    expect(result.cash).toEqual({ whatsapp: true, email: true });
  });

  it('digest sem nenhum canal → cash nunca liga, mesmo com cashView on (nada pra herdar)', () => {
    const contact = makeContact({
      cashView: 'on',
      delivery: {
        digest: { whatsapp: false, email: false },
        closing: { whatsapp: true, email: true },
      },
    });
    const result = effectiveDelivery(contact);
    expect(result.cash).toEqual({ whatsapp: false, email: false });
  });

  it('sem `delivery` (compat pré-T9) — cash ainda deriva corretamente a partir dos canais reais do contato', () => {
    const contact = makeContact({ whatsapp: '5511999990001', emails: [], cashView: 'on' });
    const result = effectiveDelivery(contact);
    expect(result.digest).toEqual({ whatsapp: true, email: false });
    expect(result.cash).toEqual({ whatsapp: true, email: false });
  });

  it('trava defensiva: delivery salvo com WhatsApp mas contato não tem mais o canal → cash não vaza pra WhatsApp', () => {
    const contact = makeContact({
      whatsapp: undefined,
      cashView: 'on',
      delivery: {
        digest: { whatsapp: true, email: true }, // salvo quando o contato ainda tinha WhatsApp
        closing: { whatsapp: false, email: false },
      },
    });
    const result = effectiveDelivery(contact);
    expect(result.digest.whatsapp).toBe(false); // trava zera o canal que não existe mais
    expect(result.cash).toEqual({ whatsapp: false, email: true });
  });
});
