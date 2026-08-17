import { describe, it, expect } from 'vitest';
import {
  canalPeloIdentificador,
  emailDoIdentificador,
  identidadeVisivel,
  isSupportTicket,
  SUPPORT_CHANNELS,
} from './conversation';

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

/**
 * A coluna `phone` carrega três formatos, e a oportunidade não guarda canal de origem.
 * Estes dois helpers são o que faz o card do closer dizer COM QUEM ele está lidando em
 * vez de "Sem nome" — o caso real era `email:abel.ramos@hipertms.com.br` numa
 * oportunidade em proposta, sem empresa, sem nome e sem telefone.
 */
describe('canal pelo identificador', () => {
  it('prefixo email: é canal de e-mail', () => {
    expect(canalPeloIdentificador('email:abel.ramos@hipertms.com.br')).toBe('email');
  });

  it('telefone BR é WhatsApp', () => {
    expect(canalPeloIdentificador('5512988073788')).toBe('whatsapp');
    expect(canalPeloIdentificador('(12) 98807-3788')).toBe('whatsapp');
  });

  it('UUID de sessão é web chat, não telefone', () => {
    expect(canalPeloIdentificador('9f88be3f-5fac-4311-9d3e-ea78a4c6c295')).toBe('web');
  });

  it('sem identificador devolve null — a tela não afirma canal que não sabe', () => {
    expect(canalPeloIdentificador(null)).toBeNull();
    expect(canalPeloIdentificador('')).toBeNull();
  });
});

describe('e-mail pelo identificador', () => {
  it('extrai o endereço para o mailto', () => {
    expect(emailDoIdentificador('email:abel.ramos@hipertms.com.br')).toBe(
      'abel.ramos@hipertms.com.br',
    );
  });

  it('telefone e UUID não produzem e-mail', () => {
    expect(emailDoIdentificador('5512988073788')).toBeNull();
    expect(emailDoIdentificador('9f88be3f-5fac-4311-9d3e-ea78a4c6c295')).toBeNull();
    expect(emailDoIdentificador(null)).toBeNull();
  });
});

describe('identidade do card sem nome nem empresa', () => {
  it('o e-mail serve de título quando não há nome nem empresa', () => {
    // É este valor que substitui o "Sem nome" no card do closer e na fila do SDR.
    expect(identidadeVisivel('email:abel.ramos@hipertms.com.br')).toBe(
      'abel.ramos@hipertms.com.br',
    );
  });

  it('devolve vazio quando não há nada verdadeiro a dizer — a tela cai no "Sem nome"', () => {
    // Por isso a cascata na tela usa `||` e não `??`: vazio não é null.
    expect(identidadeVisivel(null)).toBe('');
  });
});
