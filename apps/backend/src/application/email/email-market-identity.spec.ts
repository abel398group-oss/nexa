import { describe, it, expect } from 'vitest';
import { identidadeDoMercado } from './email-market-identity';

/**
 * O furo que este arquivo prende (10/08/2026): a prévia da tela Mensagens
 * renderizava com a marca do mercado e o envio real saía sempre HiperTMS — o
 * lead do parceiro recebia e-mail cuja marca não batia com a copy. "Quem é
 * você?" termina no botão "Reportar spam", e reclamação é a métrica que o
 * Google mais pesa (teto de 0,10%). Marca coerente é anti-spam.
 */

const MERCADO = {
  name: 'pneus',
  displayName: 'Pneus Brasil',
  brandColor: '#0057B8',
  brandTagline: 'O pneu certo para a sua frota.',
  senderName: 'Ana Pneus Brasil',
  signupUrl: 'https://www.pneusbrasil.com.br/cadastro?utm=email',
};

describe('identidadeDoMercado', () => {
  it('mercado com identidade completa vira marca, From e assinatura', () => {
    const id = identidadeDoMercado(MERCADO);

    expect(id.brand).toEqual({
      name: 'Pneus Brasil',
      color: '#0057B8',
      tagline: 'O pneu certo para a sua frota.',
    });
    expect(id.fromName).toBe('Ana Pneus Brasil');
    expect(id.signature).toMatchObject({
      name: 'Ana Pneus Brasil',
      role: 'Assistente Pneus Brasil',
      // o site é o do MERCADO — hipertms.com.br na assinatura de um e-mail de
      // pneus é o "quem é você?" de novo, agora no rodapé
      site: 'pneusbrasil.com.br',
    });
  });

  // Identidade pela metade (wordmark de um, assinatura de outro) parece phishing.
  // A regra é a mesma do interruptor EMAIL_SIGNATURE_NAME: tudo ou nada.
  it('sem displayName, TUDO cai no padrão — mesmo com outros campos preenchidos', () => {
    expect(identidadeDoMercado({ ...MERCADO, displayName: null })).toEqual({});
    expect(identidadeDoMercado({ ...MERCADO, displayName: '  ' })).toEqual({});
  });

  it('mercado nulo (productCode sem linha em products) é o padrão HiperTMS', () => {
    expect(identidadeDoMercado(null)).toEqual({});
    expect(identidadeDoMercado(undefined)).toEqual({});
  });

  it('sem senderName, o From e a assinatura derivam do displayName (rascunho em teste)', () => {
    const id = identidadeDoMercado({ ...MERCADO, senderName: null });
    expect(id.fromName).toBe('Lia Pneus Brasil');
    expect(id.signature?.name).toBe('Lia');
  });

  it('signupUrl inválida não derruba a identidade — só fica sem site', () => {
    const id = identidadeDoMercado({ ...MERCADO, signupUrl: 'nao-e-url' });
    expect(id.brand?.name).toBe('Pneus Brasil');
    expect(id.signature?.site).toBeUndefined();
  });

  it('sem telefone na assinatura — o convite de WhatsApp tem bloco próprio e condicionado', () => {
    const id = identidadeDoMercado(MERCADO);
    expect(id.signature?.phoneDigits).toBeUndefined();
    expect(id.signature?.phoneLabel).toBeUndefined();
  });
});
