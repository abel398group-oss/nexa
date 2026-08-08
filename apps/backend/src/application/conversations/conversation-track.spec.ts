import { describe, it, expect } from 'vitest';
import { isSupportConversation, trackWhere } from './conversation-track';

/**
 * O predicado e o filtro Prisma têm que expressar o MESMO critério. Antes existia
 * só o filtro (privado no ConversationsService) e o ConversationAgent não tinha
 * como classificar uma conversa em memória — foi por isso que `loadPriorHistory`
 * misturava conversa de vendas com chamado de suporte.
 */
describe('trilha de uma conversa', () => {
  const vendas = { ticketCategory: null, customerStage: 'lead', status: 'open', sourceChannel: 'whatsapp' };

  it('conversa de vendas não é suporte', () => {
    expect(isSupportConversation(vendas)).toBe(false);
  });

  it('qualquer uma das quatro condições torna a conversa de suporte', () => {
    expect(isSupportConversation({ ...vendas, ticketCategory: 'cte' })).toBe(true);
    expect(isSupportConversation({ ...vendas, customerStage: 'cliente_ativo' })).toBe(true);
    expect(isSupportConversation({ ...vendas, status: 'escalated' })).toBe(true);
    expect(isSupportConversation({ ...vendas, sourceChannel: 'web_chat' })).toBe(true);
    expect(isSupportConversation({ ...vendas, sourceChannel: 'portal' })).toBe(true);
  });

  it('campos ausentes não classificam como suporte', () => {
    expect(isSupportConversation({})).toBe(false);
  });

  it('vendas é o complemento exato de suporte — sem lacuna e sem sobreposição', () => {
    const s = trackWhere('support') as any;
    const v = trackWhere('sales') as any;
    expect(s.OR).toBeDefined();
    expect(v.NOT.OR).toEqual(s.OR);
  });

  it('e-mail e whatsapp não são canais de suporte por si', () => {
    expect(isSupportConversation({ ...vendas, sourceChannel: 'email' })).toBe(false);
    expect(isSupportConversation({ ...vendas, sourceChannel: 'whatsapp' })).toBe(false);
  });
});
