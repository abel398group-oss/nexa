import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveSignature, signatureHtml, signatureText } from './email-signature';

const CHAVES = [
  'EMAIL_SIGNATURE_NAME', 'EMAIL_SIGNATURE_ROLE', 'EMAIL_SIGNATURE_COMPANY',
  'EMAIL_SIGNATURE_PHONE', 'EMAIL_SIGNATURE_EMAIL', 'EMAIL_SIGNATURE_SITE',
];

const MATEUS = {
  EMAIL_SIGNATURE_NAME: 'Mateus Gomes',
  EMAIL_SIGNATURE_ROLE: 'Diretor de Operações',
  EMAIL_SIGNATURE_COMPANY: 'HiperTMS',
  EMAIL_SIGNATURE_PHONE: '+55 11 99432-7713',
  EMAIL_SIGNATURE_EMAIL: 'mateus.gomes@hipertms.com.br',
  EMAIL_SIGNATURE_SITE: 'hipertms.com.br',
};

describe('assinatura de e-mail', () => {
  const salvo: Record<string, string | undefined> = {};
  beforeEach(() => { for (const k of CHAVES) { salvo[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of CHAVES) { if (salvo[k] === undefined) delete process.env[k]; else process.env[k] = salvo[k]; } });

  it('sem configuração mantém a assinatura antiga da Lia — nenhum ambiente muda sozinho', () => {
    const s = resolveSignature();
    expect(s.name).toBe('Lia');
    expect(signatureText(s)).toContain('Assistente HiperTMS');
  });

  // O NAME é o interruptor de propósito: bloco com cargo e telefone mas sem nome
  // é pior que a assinatura antiga.
  it('sem NAME ignora o resto, mesmo preenchido', () => {
    process.env.EMAIL_SIGNATURE_ROLE = 'Diretor';
    process.env.EMAIL_SIGNATURE_PHONE = '+55 11 99999-9999';
    expect(resolveSignature().name).toBe('Lia');
  });

  describe('configurada com os dados do Mateus', () => {
    beforeEach(() => { Object.assign(process.env, MATEUS); });

    it('texto puro sai na ordem quem → cargo → contato', () => {
      expect(signatureText()).toBe(
        'Mateus Gomes\n' +
        'Diretor de Operações · HiperTMS\n' +
        '+55 11 99432-7713 (WhatsApp)\n' +
        'mateus.gomes@hipertms.com.br\n' +
        'hipertms.com.br',
      );
    });

    it('telefone vira link de WhatsApp só com dígitos', () => {
      expect(signatureHtml()).toContain('href="https://wa.me/5511994327713"');
    });

    it('e-mail vira mailto e site vira https', () => {
      const h = signatureHtml();
      expect(h).toContain('href="mailto:mateus.gomes@hipertms.com.br"');
      expect(h).toContain('href="https://hipertms.com.br"');
    });

    it('nenhuma imagem — logo em PNG aparece como retângulo vazio no Gmail', () => {
      expect(signatureHtml()).not.toMatch(/<img\s/);
    });

    it('escapa o que vem do ambiente', () => {
      process.env.EMAIL_SIGNATURE_NAME = 'Ma<script>x</script>teus';
      expect(signatureHtml()).not.toContain('<script>');
      expect(signatureHtml()).toContain('&lt;script&gt;');
    });
  });

  it('campos ausentes simplesmente não aparecem — sem linha vazia nem separador solto', () => {
    process.env.EMAIL_SIGNATURE_NAME = 'Mateus Gomes';
    process.env.EMAIL_SIGNATURE_COMPANY = 'HiperTMS';
    expect(signatureText()).toBe('Mateus Gomes\nHiperTMS');
    expect(signatureHtml()).not.toContain(' · ');
  });
});
