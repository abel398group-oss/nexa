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

/**
 * {{empresa}} (20/08/2026) — o CSV traz a coluna `empresa`, e os planos escrevem
 * "aí na [empresa]". Sem a variável, o parser deixava o colchete cru na revisão.
 *
 * O fallback é FRASE ("sua empresa"), não remoção como o {{nome}}: o placeholder
 * vem sempre colado numa preposição ("na", "da"), e removê-lo quebraria a frase
 * no meio — "aí na , quanto tempo…".
 */
describe('renderTemplate — {{empresa}}', () => {
  it('substitui pela empresa do contato', () => {
    const out = SenderService.renderTemplate('Aí na {{empresa}}, como cotam?', 'Carlos', {
      optOutFooter: false,
      empresa: 'Transportes Silva',
    });
    expect(out).toContain('Aí na Transportes Silva');
  });

  it('sem empresa vira "sua empresa" — a frase fica de pé', () => {
    const out = SenderService.renderTemplate('Aí na {{empresa}}, como cotam?', 'Carlos', {
      optOutFooter: false,
    });
    expect(out).toContain('Aí na sua empresa');
    expect(out).not.toContain('{{empresa}}');
  });

  it('template sem a variável passa intacto', () => {
    const out = SenderService.renderTemplate('Oi, {{nome}}!', 'Carlos', {
      optOutFooter: false,
      empresa: 'Transportes Silva',
    });
    expect(out).not.toContain('Transportes Silva');
  });
});
