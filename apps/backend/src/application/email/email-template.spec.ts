import { describe, it, expect } from 'vitest';
import { renderEmailHtml } from './email-template';

const OPTOUT = 'https://nexa.hipertms.com.br/api/email/optout?token=DpwAmft80Jf7sbeaiuvHvj';

describe('renderEmailHtml', () => {
  it('mantém o descadastro clicável, mas discreto e sem a URL crua visível', () => {
    const html = renderEmailHtml({ body: 'Olá! Posso enviar uma demonstração?', optOutUrl: OPTOUT });

    // Clicável (exigência legal — LGPD)
    expect(html).toContain(`href="${OPTOUT}"`);
    // Rótulo curto no lugar da URL de ~90 caracteres que aparecia antes
    expect(html).toContain('>Cancelar e-mails</a>');
    // Corpo tamanho 11px e cinza claro — presente sem competir com a mensagem
    expect(html).toMatch(/font-size:11px;color:#B4B0AC/);
  });

  it('não vaza a URL de descadastro como texto visível', () => {
    const html = renderEmailHtml({ body: 'Oi', optOutUrl: OPTOUT });

    // A URL aparece só dentro do href; nunca como conteúdo de texto do link.
    expect(html).not.toContain(`>${OPTOUT}<`);
  });

  it('escapa HTML vindo do corpo (o texto pode vir do modelo ou do lead)', () => {
    const html = renderEmailHtml({ body: '<script>alert(1)</script> & "aspas"', optOutUrl: OPTOUT });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('transforma link do corpo em âncora com rótulo encurtado', () => {
    const longa = 'https://hipertms.com.br/demonstracao/agendar?utm_source=email&utm_campaign=prospeccao-agosto-2026';
    const html = renderEmailHtml({ body: `Agende aqui: ${longa}`, optOutUrl: OPTOUT });

    expect(html).toContain(`href="${longa.replace(/&/g, '&amp;')}"`);
    expect(html).toContain('…</a>'); // rótulo truncado, não a URL inteira
  });

  it('quebra parágrafos e preserva quebras simples de linha', () => {
    const html = renderEmailHtml({ body: 'Primeiro\nsegunda linha\n\nOutro parágrafo', optOutUrl: OPTOUT });

    expect((html.match(/<p style="margin:0 0 16px/g) ?? []).length).toBe(2);
    expect(html).toContain('Primeiro<br />segunda linha');
  });

  it('mostra o botão de WhatsApp só quando há link', () => {
    const sem = renderEmailHtml({ body: 'Oi', optOutUrl: OPTOUT });
    expect(sem).not.toContain('Falar no WhatsApp');

    const com = renderEmailHtml({ body: 'Oi', optOutUrl: OPTOUT, whatsappUrl: 'https://wa.me/5511999999999' });
    expect(com).toContain('Falar no WhatsApp');
    expect(com).toContain('https://wa.me/5511999999999');
  });

  it('usa a identidade da marca e nenhuma imagem externa', () => {
    const html = renderEmailHtml({ body: 'Oi', optOutUrl: OPTOUT });

    expect(html).toContain('#FF5A1F');           // laranja primária
    expect(html).toContain('Hiper<span');        // wordmark em texto
    expect(html).not.toMatch(/<img\s/);          // cliente de e-mail bloqueia imagem
    expect(html).not.toMatch(/@import|fonts\.googleapis/); // webfont não carrega em e-mail
  });
});
