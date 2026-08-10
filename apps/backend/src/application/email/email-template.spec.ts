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

    // Casa pela abertura do <p>, não pelo atributo exato: o parágrafo ganhou a
    // classe do tema escuro e um teste preso à ordem dos atributos quebraria a
    // cada ajuste de estilo, sem que nada de verdade tivesse mudado.
    expect((html.match(/<p [^>]*margin:0 0 16px/g) ?? []).length).toBe(2);
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

// ─── Preheader (08/08/2026) ───────────────────────────────────────────────────
// O preheader trazia a punchline da marca, que TAMBÉM aparece visível embaixo do
// wordmark. Como o Gmail concatena preheader + texto visível, o resumo na lista
// saía com a mesma frase duas vezes — na única linha que decide se a pessoa abre.
// Visto no e-mail citado numa resposta real.
describe('renderEmailHtml — preheader', () => {
  const CORPO = 'Boa tarde!\n\nAqui é a Lia do HiperTMS.\n\nPosso enviar uma demonstração?';

  it('usa a primeira linha ÚTIL, pulando a saudação', () => {
    const html = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT });
    const escondido = html.slice(0, html.indexOf('<table'));
    expect(escondido).toContain('Aqui é a Lia do HiperTMS.');
    expect(escondido).not.toContain('Boa tarde!');
  });

  it('não repete a punchline da marca', () => {
    const html = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT });
    const ocorrencias = html.split('O TMS feito para vender frete.').length - 1;
    expect(ocorrencias).toBe(1); // só a visível, embaixo do wordmark
  });

  it('preenche com espaços invisíveis para o texto visível não vazar no resumo', () => {
    const html = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT });
    expect(html).toContain('&nbsp;&zwnj;&nbsp;&zwnj;');
  });

  it('corta preheader longo', () => {
    const longa = 'a'.repeat(400);
    const html = renderEmailHtml({ body: `Oi!\n\n${longa}`, optOutUrl: OPTOUT });
    const escondido = html.slice(0, html.indexOf('<table'));
    expect(escondido).toContain('…');
    expect(escondido).not.toContain('a'.repeat(200));
  });

  it('corpo só com saudação não quebra', () => {
    expect(() => renderEmailHtml({ body: 'Boa tarde!', optOutUrl: OPTOUT })).not.toThrow();
  });

  it('escapa o preheader', () => {
    const html = renderEmailHtml({ body: 'Oi\n\n<script>x</script>', optOutUrl: OPTOUT });
    expect(html.slice(0, html.indexOf('<table'))).not.toContain('<script>');
  });
});
