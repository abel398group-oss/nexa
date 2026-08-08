import { describe, it, expect } from 'vitest';
import { isSupportChannel, isSupportConversation, trackWhere, SUPPORT_CHANNELS } from './conversation-track';

/**
 * Decisão de produto (08/08/2026): a trilha é o CANAL.
 *   widget do HiperTMS e portal → suporte
 *   WhatsApp e e-mail           → comercial
 *
 * A regra antiga tinha quatro condições e três não olhavam o canal, então cliente
 * do TMS no WhatsApp virava chamado de suporte e saía da fila de vendas.
 */
describe('trilha de uma conversa', () => {
  it('widget e portal são suporte', () => {
    expect(isSupportConversation({ sourceChannel: 'web_chat' })).toBe(true);
    expect(isSupportConversation({ sourceChannel: 'portal' })).toBe(true);
  });

  it('WhatsApp e e-mail são comerciais', () => {
    expect(isSupportConversation({ sourceChannel: 'whatsapp' })).toBe(false);
    expect(isSupportConversation({ sourceChannel: 'email' })).toBe(false);
  });

  // O ponto da mudança: nenhum destes campos tira a conversa da trilha do canal.
  it('ticket, cliente_ativo e escalated NÃO fazem uma conversa de WhatsApp virar suporte', () => {
    const base = { sourceChannel: 'whatsapp' } as any;
    expect(isSupportConversation({ ...base, ticketCategory: 'cte' })).toBe(false);
    expect(isSupportConversation({ ...base, customerStage: 'cliente_ativo' })).toBe(false);
    expect(isSupportConversation({ ...base, status: 'escalated' })).toBe(false);
  });

  it('canal ausente é comercial — nunca abre suporte por omissão', () => {
    expect(isSupportConversation({})).toBe(false);
    expect(isSupportChannel(null)).toBe(false);
    expect(isSupportChannel(undefined)).toBe(false);
  });

  it('vendas é o complemento exato de suporte — sem lacuna e sem sobreposição', () => {
    const s = trackWhere('support') as any;
    const v = trackWhere('sales') as any;
    expect(v.NOT.OR).toEqual(s.OR);
  });

  it('só dois canais fazem suporte', () => {
    expect([...SUPPORT_CHANNELS]).toEqual(['portal', 'web_chat']);
  });
});
