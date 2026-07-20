import { describe, it, expect, vi } from 'vitest';
import { InternalNumbersService, phonesMatch } from './internal-numbers.service';

// ─── Gate de números internos (ADR 034/035, brainstorm 2026-07-20) ───────────
// Vendedores e contatos de alerta do Monitor nunca viram lead: o inbound é
// classificado ANTES de criar contato/conversa. Estes testes cobrem a
// classificação; o descarte em si (log + ignored) vive no WhatsappService.

function makeService(opts: {
  sellers?: Array<{ name: string; phone: string; tenantId: string }>;
  configs?: Array<{
    tenantId: string;
    notificationPhone?: string | null;
    sectorConfig?: Record<string, any> | null;
    contacts?: Array<{ name?: string; whatsapp?: string }> | null;
  }>;
} = {}) {
  const prisma = {
    seller: { findMany: vi.fn().mockResolvedValue(opts.sellers ?? []) },
    tenantNotificationConfig: {
      findMany: vi.fn().mockResolvedValue(
        (opts.configs ?? []).map((c) => ({
          notificationPhone: null,
          sectorConfig: null,
          contacts: null,
          ...c,
        })),
      ),
    },
  } as any;
  return { svc: new InternalNumbersService(prisma), prisma };
}

describe('phonesMatch — comparação tolerante', () => {
  it('match exato de dígitos', () => {
    expect(phonesMatch('5511988073788', '5511988073788')).toBe(true);
  });

  it('ignora formatação (máscara, espaços, +)', () => {
    expect(phonesMatch('5511988073788', '+55 (11) 98807-3788')).toBe(true);
  });

  it('tolera contato salvo sem o código do país (sufixo >= 10 dígitos)', () => {
    expect(phonesMatch('5511988073788', '11988073788')).toBe(true);
  });

  it('não casa números curtos por sufixo (mínimo 10 dígitos)', () => {
    expect(phonesMatch('5511988073788', '073788')).toBe(false);
  });

  it('não casa números diferentes', () => {
    expect(phonesMatch('5511988073788', '5511999999999')).toBe(false);
  });

  it('vazio nunca casa', () => {
    expect(phonesMatch('', '5511988073788')).toBe(false);
    expect(phonesMatch('5511988073788', '')).toBe(false);
  });
});

describe('InternalNumbersService.classify', () => {
  it('vendedor (qualquer tenant) → interno', async () => {
    const { svc } = makeService({
      sellers: [{ name: 'João', phone: '5511988073788', tenantId: 't2' }],
    });
    const r = await svc.classify('5511988073788');
    expect(r.internal).toBe(true);
    expect(r.reason).toContain('vendedor João');
  });

  it('contato de alerta em contacts[].whatsapp → interno', async () => {
    const { svc } = makeService({
      configs: [{ tenantId: 't1', contacts: [{ name: 'Maria', whatsapp: '5511977776666' }] }],
    });
    const r = await svc.classify('5511977776666');
    expect(r.internal).toBe(true);
    expect(r.reason).toContain('Maria');
  });

  it('telefone legado em sectorConfig[setor].phone → interno', async () => {
    const { svc } = makeService({
      configs: [{ tenantId: 't1', sectorConfig: { fiscal: { phone: '5511966665555' } } }],
    });
    const r = await svc.classify('5511966665555');
    expect(r.internal).toBe(true);
    expect(r.reason).toContain('setor fiscal');
  });

  it('recipient whatsapp em sectorConfig[setor].recipients → interno; canal email não conta', async () => {
    const { svc } = makeService({
      configs: [{
        tenantId: 't1',
        sectorConfig: {
          frota: {
            recipients: [
              { contact: 'a@b.com', channel: 'email' },
              { contact: '5511955554444', channel: 'whatsapp' },
            ],
          },
        },
      }],
    });
    expect((await svc.classify('5511955554444')).internal).toBe(true);
    // e-mail como "contact" jamais casa com telefone
    expect((await svc.classify('5511900000000')).internal).toBe(false);
  });

  it('notificationPhone raiz → interno', async () => {
    const { svc } = makeService({
      configs: [{ tenantId: 't1', notificationPhone: '5511944443333' }],
    });
    expect((await svc.classify('5511944443333')).internal).toBe(true);
  });

  it('lead normal → não interno (fluxo da Lia intacto)', async () => {
    const { svc } = makeService({
      sellers: [{ name: 'João', phone: '5511988073788', tenantId: 't1' }],
      configs: [{ tenantId: 't1', contacts: [{ name: 'Maria', whatsapp: '5511977776666' }] }],
    });
    const r = await svc.classify('5512911112222');
    expect(r.internal).toBe(false);
    expect(r.reason).toBeUndefined();
  });

  it('contato de alerta salvo sem código do país ainda é reconhecido', async () => {
    const { svc } = makeService({
      configs: [{ tenantId: 't1', contacts: [{ name: 'Ana', whatsapp: '11933332222' }] }],
    });
    expect((await svc.classify('5511933332222')).internal).toBe(true);
  });

  it('config vazia / campos nulos → não interno, sem explodir', async () => {
    const { svc } = makeService({
      configs: [{ tenantId: 't1', notificationPhone: null, sectorConfig: null, contacts: null }],
    });
    expect((await svc.classify('5511922221111')).internal).toBe(false);
  });
});
