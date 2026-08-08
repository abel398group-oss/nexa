import { describe, it, expect } from 'vitest';
import { isSupportTicket, SUPPORT_CHANNELS } from './conversation';

/**
 * A trilha é o CANAL (decisão de produto, 08/08/2026): suporte vive no chat do
 * HiperTMS e no portal; WhatsApp e e-mail são comerciais.
 *
 * Antes eram quatro condições e três ignoravam o canal. Isso fazia cliente do TMS
 * mandando WhatsApp virar chamado de suporte e sair da fila de vendas, e lead que
 * pedia atendente (status `escalated`) ser contado como chamado sendo lead quente.
 *
 * Espelho de `apps/backend/src/application/conversations/conversation-track.ts`.
 */
describe('isSupportTicket', () => {
  it('portal e web_chat são suporte', () => {
    expect(isSupportTicket({ sourceChannel: 'portal' })).toBe(true);
    expect(isSupportTicket({ sourceChannel: 'web_chat' })).toBe(true);
  });

  it('whatsapp e email são comerciais', () => {
    expect(isSupportTicket({ sourceChannel: 'whatsapp' })).toBe(false);
    expect(isSupportTicket({ sourceChannel: 'email' })).toBe(false);
  });

  // O ponto da mudança: nenhum destes campos tira a conversa da trilha do canal.
  it('ticketCategory, cliente_ativo e escalated NÃO fazem WhatsApp virar suporte', () => {
    expect(isSupportTicket({ sourceChannel: 'whatsapp', ticketCategory: 'treinamento' })).toBe(false);
    expect(isSupportTicket({ sourceChannel: 'whatsapp', customerStage: 'cliente_ativo' })).toBe(false);
    expect(isSupportTicket({ sourceChannel: 'whatsapp', status: 'escalated' })).toBe(false);
  });

  it('sem canal é comercial — nunca abre suporte por omissão', () => {
    expect(isSupportTicket({})).toBe(false);
    expect(isSupportTicket({ status: 'open', customerStage: 'lead' })).toBe(false);
  });

  it('só dois canais fazem suporte', () => {
    expect([...SUPPORT_CHANNELS]).toEqual(['portal', 'web_chat']);
  });
});
