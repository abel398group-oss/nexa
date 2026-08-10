import { describe, it, expect, afterEach } from 'vitest';
import { SenderService } from './sender.service';

/**
 * `{{remetente}}` no template (10/08/2026).
 *
 * Um e-mail saiu dizendo "Aqui é a Lia" e assinado "Mateus Gomes": o nome vinha de
 * dois lugares independentes — o corpo digitado pelo operador e a assinatura da
 * configuração. Para o lead, duas pessoas na mesma mensagem.
 */

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

const render = (tpl: string) =>
  SenderService.renderTemplate(tpl, 'Carlos Souza', { optOutFooter: false });

describe('{{remetente}}', () => {
  it('usa o nome da assinatura configurada', () => {
    process.env.EMAIL_SIGNATURE_NAME = 'Mateus Gomes';
    expect(render('Aqui é o {{remetente}}, do HiperTMS.')).toBe('Aqui é o Mateus, do HiperTMS.');
  });

  // "Aqui é o Mateus Gomes" soa a crachá; gente se apresenta pelo primeiro nome.
  it('só o primeiro nome', () => {
    process.env.EMAIL_SIGNATURE_NAME = 'Mateus Gomes';
    expect(render('{{remetente}}')).toBe('Mateus');
  });

  it('não confunde com {{nome}}, que é o LEAD', () => {
    process.env.EMAIL_SIGNATURE_NAME = 'Mateus Gomes';
    const out = render('{{saudacao}}, {{nome}}! Aqui é o {{remetente}}.');
    expect(out).toContain('Carlos');
    expect(out).toContain('Mateus');
  });

  it('aceita espaço dentro das chaves e maiúscula', () => {
    process.env.EMAIL_SIGNATURE_NAME = 'Mateus Gomes';
    expect(render('{{ REMETENTE }}')).toBe('Mateus');
  });

  it('template sem o placeholder passa intacto', () => {
    process.env.EMAIL_SIGNATURE_NAME = 'Mateus Gomes';
    expect(render('Bom dia!')).toBe('Bom dia!');
  });
});
