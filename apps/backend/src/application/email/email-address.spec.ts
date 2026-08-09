import { describe, it, expect } from 'vitest';
import { normalizeEmail, isSendableEmail } from './email-address';

/**
 * O defeito que estes testes prendem (09/08/2026, encontrado antes do primeiro
 * disparo de prospecção): a ENTRADA minusculava o endereço, a SAÍDA não. Como
 * Postgres compara texto com sensibilidade a maiúsculas, `Joao@x.com` e
 * `joao@x.com` eram dois contatos — e o opt-out registrado num não era encontrado
 * pelo outro. Quem pediu para sair recebia de novo.
 */
describe('normalizeEmail', () => {
  it('minúsculas e sem espaço nas pontas', () => {
    expect(normalizeEmail('  Joao@Empresa.COM ')).toBe('joao@empresa.com');
  });

  it('tira os sinais <> do formato de cabeçalho', () => {
    expect(normalizeEmail('<Joao@Empresa.com>')).toBe('joao@empresa.com');
  });

  it('nulo e indefinido viram string vazia (nunca lança)', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail('')).toBe('');
  });

  it('é idempotente — normalizar duas vezes dá o mesmo', () => {
    const uma = normalizeEmail(' ABEL@Hipervias.com.BR ');
    expect(normalizeEmail(uma)).toBe(uma);
  });

  // O ponto de tudo: as duas grafias têm que colidir na mesma chave.
  it('grafias diferentes do mesmo endereço colidem', () => {
    expect(normalizeEmail('Joao@X.com')).toBe(normalizeEmail('joao@x.com'));
  });
});

describe('isSendableEmail', () => {
  it('aceita endereço comum', () => {
    for (const e of ['a@b.com', 'joao.silva@empresa.com.br', 'contato+tag@dominio.io']) {
      expect(isSendableEmail(e)).toBe(true);
    }
  });

  // Cada um destes vira hard bounce, e hard bounce derruba a entrega do domínio
  // inteiro — a peneira tem que ser antes da fila, não depois da devolução.
  it('recusa o que a planilha traz de lixo', () => {
    for (const e of ['', '   ', 'sem-arroba', 'joao@', '@empresa.com', 'nao tem', 'a@b', 'a b@c.com']) {
      expect(isSendableEmail(e)).toBe(false);
    }
  });

  it('recusa lista colada numa célula só', () => {
    expect(isSendableEmail('a@b.com,c@d.com')).toBe(false);
    expect(isSendableEmail('a@b.com; c@d.com')).toBe(false);
  });

  it('normaliza antes de julgar — caixa e espaço não reprovam', () => {
    expect(isSendableEmail('  Joao@Empresa.COM ')).toBe(true);
  });
});
