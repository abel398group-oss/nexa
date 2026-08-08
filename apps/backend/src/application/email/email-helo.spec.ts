import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { heloName } from './email-reply.service';

/**
 * Incidente de 08/08/2026: o nodemailer anunciava `os.hostname()` no HELO —
 * `DESKTOP-8NO954L` na máquina de dev, hash do container em produção. Nenhum dos
 * dois é FQDN nem literal de endereço, o que viola a RFC 5321 §4.1.1.1.
 *
 * O Exim do HostGator aceitava e devolvia `250 OK`, mas o gateway de saída
 * descartava sem bounce. Do nosso lado parecia envio bem-sucedido e NADA chegava
 * ao Gmail — nem no spam.
 */
describe('heloName — HELO da sessão SMTP', () => {
  const original = process.env.EMAIL_HELO_NAME;
  beforeEach(() => { delete process.env.EMAIL_HELO_NAME; });
  afterEach(() => {
    if (original === undefined) delete process.env.EMAIL_HELO_NAME;
    else process.env.EMAIL_HELO_NAME = original;
  });

  it('usa o domínio do remetente por padrão', () => {
    expect(heloName('lia@hipertms.com.br')).toBe('hipertms.com.br');
  });

  it('nunca devolve o hostname da máquina', () => {
    expect(heloName('lia@hipertms.com.br')).not.toMatch(/DESKTOP|^[0-9a-f]{12}$/);
  });

  it('domínio sem ponto cai para localhost — nome inválido nunca vaza para o HELO', () => {
    for (const entrada of ['lia@localhost', 'lia@DESKTOP-8NO954L', 'sem-arroba', '']) {
      const r = heloName(entrada);
      expect(r === 'localhost' || r.includes('.')).toBe(true);
    }
  });

  it('EMAIL_HELO_NAME sobrescreve o default', () => {
    process.env.EMAIL_HELO_NAME = 'mail.nexa.com.br';
    expect(heloName('lia@hipertms.com.br')).toBe('mail.nexa.com.br');
  });

  it('ignora EMAIL_HELO_NAME vazio ou só com espaços', () => {
    process.env.EMAIL_HELO_NAME = '   ';
    expect(heloName('lia@hipertms.com.br')).toBe('hipertms.com.br');
  });
});
