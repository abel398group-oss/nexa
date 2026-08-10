import { describe, it, expect, afterEach } from 'vitest';
import { identidadeDoMercado } from './email-market-identity';

const ENVS = [
  'EMAIL_SIGNATURE_NAME', 'EMAIL_SIGNATURE_ROLE', 'EMAIL_SIGNATURE_COMPANY',
  'EMAIL_SIGNATURE_PHONE', 'EMAIL_SIGNATURE_EMAIL', 'EMAIL_SIGNATURE_SITE',
];
afterEach(() => ENVS.forEach((k) => delete process.env[k]));

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

/**
 * Pessoa configurada > mercado. A marca continua sendo do mercado (é o produto de
 * que o e-mail fala), mas quem assina é gente — prospecção fria assinada por pessoa
 * é aberta e respondida mais, e recebe menos reclamação de spam.
 */
describe('identidadeDoMercado — remetente humano configurado', () => {
  function configurarMateus() {
    process.env.EMAIL_SIGNATURE_NAME = 'Mateus Gomes';
    process.env.EMAIL_SIGNATURE_ROLE = 'Comercial';
    process.env.EMAIL_SIGNATURE_COMPANY = 'HiperTMS';
    process.env.EMAIL_SIGNATURE_PHONE = '+55 11 99432-7713';
    process.env.EMAIL_SIGNATURE_EMAIL = 'mateus.gomes@hipertms.com.br';
  }

  it('a pessoa assina e aparece no "De:", no lugar da Lia do mercado', () => {
    configurarMateus();

    const id = identidadeDoMercado(MERCADO);

    expect(id.fromName).toBe('Mateus Gomes');
    expect(id.signature).toMatchObject({
      name: 'Mateus Gomes',
      role: 'Comercial',
      company: 'HiperTMS',
      email: 'mateus.gomes@hipertms.com.br',
    });
  });

  // Os dois papéis não competem: a marca é do produto, a assinatura é de quem fala.
  it('mas a MARCA continua sendo a do mercado', () => {
    configurarMateus();

    expect(identidadeDoMercado(MERCADO).brand).toEqual({
      name: 'Pneus Brasil',
      color: '#0057B8',
      tagline: 'O pneu certo para a sua frota.',
    });
  });

  it('sem mercado, a pessoa assina do mesmo jeito (marca padrão)', () => {
    configurarMateus();

    const id = identidadeDoMercado(null);

    expect(id.brand).toBeUndefined();
    expect(id.fromName).toBe('Mateus Gomes');
    expect(id.signature?.name).toBe('Mateus Gomes');
  });

  // Mesmo interruptor da assinatura: sem nome, nada é lido — meia assinatura é
  // pior que nenhuma.
  it('sem EMAIL_SIGNATURE_NAME, volta a valer o mercado', () => {
    process.env.EMAIL_SIGNATURE_ROLE = 'Comercial'; // sozinho não liga nada

    expect(identidadeDoMercado(MERCADO).fromName).toBe('Ana Pneus Brasil');
  });
});
