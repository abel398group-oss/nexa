import { describe, it, expect } from 'vitest';
import { isSupportTicket } from './conversation';

describe('isSupportTicket', () => {
  it('retorna false para lead sem marcadores de suporte', () => {
    expect(isSupportTicket({ status: 'open', customerStage: 'lead' })).toBe(false);
  });

  it('retorna true quando ticketCategory esta preenchido', () => {
    expect(isSupportTicket({ ticketCategory: 'treinamento' })).toBe(true);
  });

  it('retorna true quando customerStage e cliente_ativo', () => {
    expect(isSupportTicket({ customerStage: 'cliente_ativo' })).toBe(true);
  });

  it('retorna true quando status e escalated', () => {
    expect(isSupportTicket({ status: 'escalated' })).toBe(true);
  });

  it('retorna true quando sourceChannel e portal', () => {
    expect(isSupportTicket({ sourceChannel: 'portal' })).toBe(true);
  });

  it('retorna true quando sourceChannel e web_chat', () => {
    expect(isSupportTicket({ sourceChannel: 'web_chat' })).toBe(true);
  });

  it('retorna false para objeto vazio', () => {
    expect(isSupportTicket({})).toBe(false);
  });

  it('retorna false para customerStage diferente de cliente_ativo', () => {
    expect(isSupportTicket({ customerStage: 'prospect' })).toBe(false);
  });

  it('retorna false para sourceChannel whatsapp', () => {
    expect(isSupportTicket({ sourceChannel: 'whatsapp' })).toBe(false);
  });
});
