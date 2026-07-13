import { describe, it, expect, vi } from 'vitest';
import { ConsolidationService } from './consolidation.service';

/**
 * A1 — resolução de destinatários por setor (recipients[] > phone/email legados).
 * Testa o método privado via bracket access — comportamento puro, sem I/O.
 */
function makeSvc(): any {
  return new ConsolidationService({} as any, {} as any, {} as any, { acquire: async () => async () => {} } as any);
}

describe('ConsolidationService — resolveSectorRecipients (A1)', () => {
  const resolve = (sc: any) => makeSvc()['resolveSectorRecipients'](sc);

  it('recipients[] tem prioridade sobre phone/email legados', () => {
    const out = resolve({
      phone: '5511900000000',
      email: 'legado@x.com',
      recipients: [
        { label: 'A', contact: '5511911111111', channel: 'whatsapp' },
        { label: 'B', contact: 'b@x.com', channel: 'email' },
        { label: 'C', contact: '5511922222222', channel: 'whatsapp' },
      ],
    });
    expect(out.phones).toEqual(['5511911111111', '5511922222222']);
    expect(out.emails).toEqual(['b@x.com']);
  });

  it('sem recipients → usa phone/email legados', () => {
    const out = resolve({ phone: '5511900000000', email: 'legado@x.com' });
    expect(out.phones).toEqual(['5511900000000']);
    expect(out.emails).toEqual(['legado@x.com']);
  });

  it('recipients vazio/inválido → cai no legado', () => {
    const out = resolve({ phone: '5511900000000', recipients: [{ contact: '', channel: 'whatsapp' }] });
    expect(out.phones).toEqual(['5511900000000']);
  });

  it('cap de 10 destinatários por setor', () => {
    const recipients = Array.from({ length: 15 }, (_, i) => ({
      contact: `551190000000${i}`,
      channel: 'whatsapp' as const,
    }));
    const out = resolve({ recipients });
    expect(out.phones).toHaveLength(10);
  });

  it('setor sem nada configurado → listas vazias', () => {
    expect(resolve(undefined)).toEqual({ phones: [], emails: [] });
    expect(resolve({})).toEqual({ phones: [], emails: [] });
  });

  it('e-mail sem @ em recipients é descartado', () => {
    const out = resolve({ recipients: [{ contact: 'nao-e-email', channel: 'email' }] });
    expect(out.emails).toEqual([]);
    expect(out.phones).toEqual([]);
  });
});
