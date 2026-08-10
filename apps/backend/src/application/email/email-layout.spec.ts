import { describe, it, expect } from 'vitest';
import { renderEmailHtml, clarear } from './email-template';

/**
 * Dois layouts, e a escolha entre eles é de entregabilidade, não de gosto.
 *
 * Faixa colorida, botão e barra de rodapé são os marcadores que o classificador do
 * Gmail usa para separar e-mail em massa de e-mail pessoal. Em prospecção fria
 * isso significa a aba Promoções — que na prática é o mesmo que não ter chegado.
 * Depois que a pessoa respondeu, ela já sabe quem somos e a marca passa a ajudar.
 */

const OPTOUT = 'https://nexa.hipertms.com.br/api/email/optout?token=abc';
const CORPO = 'Bom dia, Carlos.\n\nComo vocês montam a cotação de frete hoje?';

describe('layout simples — o primeiro contato', () => {
  const html = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT });

  it('é o padrão quando ninguém pede nada', () => {
    expect(html).toContain('Hiper');
    // sem faixa cheia: a marca aparece como filete de 4px, não como bloco de cor
    expect(html).toContain('height:4px');
  });

  it('não leva botão nenhum, mesmo com link informado', () => {
    const comLink = renderEmailHtml({
      body: CORPO, optOutUrl: OPTOUT, ctaUrl: 'https://hipertms.com.br', ctaLabel: 'Ver',
    });
    expect(comLink).not.toContain('Ver</a>');
    expect(comLink).not.toContain('border-radius:6px');
  });

  it('tem descadastro clicável (LGPD)', () => {
    expect(html).toContain(OPTOUT);
    expect(html).toContain('Cancelar e-mails');
  });

  it('respira: 30px entre marca, corpo e assinatura', () => {
    expect(html).toContain('padding:30px 32px 0');
    expect(html).toContain('padding:30px 32px 30px');
  });
});

describe('layout marca — para quem já te conhece', () => {
  const html = renderEmailHtml({
    body: CORPO,
    optOutUrl: OPTOUT,
    layout: 'marca',
    ctaUrl: 'https://hipertms.com.br/planos',
    ctaLabel: 'Ver como funciona',
  });

  it('tem faixa cheia com a cor da marca', () => {
    expect(html).toContain('background:#FF5A1F;padding:22px 32px');
  });

  it('tem o botão com o rótulo pedido', () => {
    expect(html).toContain('https://hipertms.com.br/planos');
    expect(html).toContain('Ver como funciona');
  });

  it('sem link, não desenha um botão vazio', () => {
    const sem = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT, layout: 'marca' });
    expect(sem).not.toContain('border-radius:6px');
  });

  it('descadastro na barra do rodapé', () => {
    expect(html).toContain(OPTOUT);
    expect(html).toContain('Cancelar e-mails');
  });

  // Na faixa colorida o wordmark sai inteiro em branco: o destaque em duas cores
  // depende de contraste com fundo claro e sumiria sobre a cor da marca.
  it('o wordmark na faixa é branco e inteiro', () => {
    expect(html).toContain('color:#FFFFFF;">HiperTMS</div>');
  });
});

describe('tema escuro', () => {
  it('os dois layouts declaram suporte aos dois temas', () => {
    for (const layout of ['simples', 'marca'] as const) {
      const html = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT, layout });
      expect(html).toContain('name="color-scheme" content="light dark"');
      expect(html).toContain('@media (prefers-color-scheme: dark)');
    }
  });

  // O tema claro tem de continuar inteiro no inline: Gmail descarta <style> em
  // boa parte dos casos, e um e-mail que dependesse do bloco viraria texto preto
  // sobre fundo branco sem estilo nenhum.
  it('o claro continua no inline — o <style> só acrescenta o escuro', () => {
    const html = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT });
    const semStyle = html.replace(/<style>[\s\S]*?<\/style>/, '');
    expect(semStyle).toContain('background:#FFF3ED');
    expect(semStyle).toContain('color:#2B2F36');
  });

  it('a cor de destaque do escuro é derivada da marca, não fixa', () => {
    const pneus = renderEmailHtml({
      body: CORPO, optOutUrl: OPTOUT,
      brand: { name: 'Pneus Brasil', color: '#0057B8', tagline: null },
    });
    expect(pneus).toContain(clarear('#0057B8'));
  });
});

describe('clarear', () => {
  it('mistura com branco sem estourar o canal', () => {
    expect(clarear('#FF5A1F')).toBe('#ff7847');
    expect(clarear('#000000', 0.5)).toBe('#808080');
    expect(clarear('#FFFFFF')).toBe('#ffffff');
  });

  it('valor inválido volta intacto (não vaza string no style)', () => {
    expect(clarear('vermelho')).toBe('vermelho');
    expect(clarear('#FFF')).toBe('#FFF');
  });
});

describe('a marca do mercado vale nos dois layouts', () => {
  const brand = { name: 'Pneus Brasil', color: '#0057B8', tagline: 'O pneu certo para a sua frota.' };

  it('simples usa a cor do mercado no filete', () => {
    const html = renderEmailHtml({ body: CORPO, optOutUrl: OPTOUT, brand });
    expect(html).toContain('background:#0057B8');
    expect(html).toContain('Pneus Brasil');
  });

  it('marca usa a cor do mercado na faixa e no botão', () => {
    const html = renderEmailHtml({
      body: CORPO, optOutUrl: OPTOUT, brand, layout: 'marca', ctaUrl: 'https://pneusbrasil.com.br',
    });
    expect(html).toContain('background:#0057B8;padding:22px 32px');
    expect(html).toContain('background:#0057B8;color:#ffffff');
  });

  // Cor arbitrária entraria direto num atributo style.
  it('cor inválida cai no laranja padrão', () => {
    const html = renderEmailHtml({
      body: CORPO, optOutUrl: OPTOUT, layout: 'marca',
      brand: { name: 'X', color: 'red;} body{display:none', tagline: null },
    });
    expect(html).toContain('background:#FF5A1F;padding:22px 32px');
  });
});
