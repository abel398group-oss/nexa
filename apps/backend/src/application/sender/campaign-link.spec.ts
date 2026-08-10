import { describe, it, expect } from 'vitest';
import { marcarLinkDaCampanha, slugDeCampanha } from './campaign-link';

/**
 * O rastreio do site já guardava origem; o disparo mandava o link cru. Clique de
 * e-mail quase nunca traz referrer (o Gmail abre por proxy), então a visita entrava
 * como "direta" e a campanha nunca recebia o crédito.
 */

const CTX = { canal: 'email' as const, campanhaId: 'a3f9c1e8-1234-4abc-9def-000000000000', campanhaNome: 'Pneus toque 1' };

describe('slugDeCampanha', () => {
  it('junta nome legível e id curto', () => {
    expect(slugDeCampanha('Pneus toque 1', 'a3f9c1e8-1234')).toBe('pneus-toque-1-a3f9c1e8');
  });

  // utm com acento vira %C3%A7 na URL e fica ilegível no painel.
  it('tira acento e cedilha', () => {
    expect(slugDeCampanha('Cotação de frete', 'aaaaaaaa')).toBe('cotacao-de-frete-aaaaaaaa');
  });

  it('nome só com símbolos não gera slug torto', () => {
    expect(slugDeCampanha('!!! ###', 'bbbbbbbb')).toBe('bbbbbbbb');
  });

  it('nome vazio ainda produz algo utilizável', () => {
    expect(slugDeCampanha('', '')).toBe('campanha');
  });

  // Dois "teste" de meses diferentes precisam se distinguir no relatório.
  it('nomes iguais com ids diferentes não colidem', () => {
    expect(slugDeCampanha('teste', '11111111')).not.toBe(slugDeCampanha('teste', '22222222'));
  });

  it('nome enorme é cortado, mas o id sobrevive', () => {
    const s = slugDeCampanha('a'.repeat(120), 'cccccccc');
    expect(s.endsWith('-cccccccc')).toBe(true);
    expect(s.length).toBeLessThan(60);
  });
});

describe('marcarLinkDaCampanha', () => {
  it('acrescenta origem, canal e campanha', () => {
    const u = new URL(marcarLinkDaCampanha('https://hipertms.com.br/signup', CTX));
    expect(u.searchParams.get('utm_source')).toBe('nexa');
    expect(u.searchParams.get('utm_medium')).toBe('email');
    expect(u.searchParams.get('utm_campaign')).toBe('pneus-toque-1-a3f9c1e8');
  });

  it('o canal entra como medium', () => {
    const u = new URL(marcarLinkDaCampanha('https://x.com/a', { ...CTX, canal: 'whatsapp' }));
    expect(u.searchParams.get('utm_medium')).toBe('whatsapp');
  });

  it('preserva a query que já existia no link', () => {
    const u = new URL(marcarLinkDaCampanha('https://x.com/a?plano=basico', CTX));
    expect(u.searchParams.get('plano')).toBe('basico');
    expect(u.searchParams.get('utm_source')).toBe('nexa');
  });

  // Se o operador colou um link com utm próprio, foi decisão dele — provavelmente
  // combinada com quem olha outro relatório.
  it('NÃO sobrescreve utm que o operador já pôs', () => {
    const u = new URL(marcarLinkDaCampanha('https://x.com/a?utm_campaign=feira2026&utm_source=parceiro', CTX));
    expect(u.searchParams.get('utm_campaign')).toBe('feira2026');
    expect(u.searchParams.get('utm_source')).toBe('parceiro');
    // o que faltava, ele completa
    expect(u.searchParams.get('utm_medium')).toBe('email');
  });

  it('não duplica parâmetro', () => {
    const marcado = marcarLinkDaCampanha('https://x.com/a', CTX);
    expect(marcado.match(/utm_source=/g)).toHaveLength(1);
  });

  it('preserva o fragmento', () => {
    expect(marcarLinkDaCampanha('https://x.com/a#planos', CTX)).toContain('#planos');
  });

  // Melhor mandar o link do operador intacto que um link remendado que não abre.
  it('o que não é URL absoluta volta como veio', () => {
    expect(marcarLinkDaCampanha('hipertms.com.br/signup', CTX)).toBe('hipertms.com.br/signup');
    expect(marcarLinkDaCampanha('/signup', CTX)).toBe('/signup');
  });

  it('link vazio/ausente não vira string estranha', () => {
    expect(marcarLinkDaCampanha('', CTX)).toBe('');
    expect(marcarLinkDaCampanha(null, CTX)).toBe('');
    expect(marcarLinkDaCampanha(undefined, CTX)).toBe('');
  });

  // Os parâmetros têm que ser exatamente os que o rastreio aceita na allowlist —
  // qualquer outro nome é descartado na entrada e o clique volta a ser "direto".
  it('usa só chaves da allowlist do rastreio', () => {
    const u = new URL(marcarLinkDaCampanha('https://x.com/a', CTX));
    const PERMITIDAS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'gclid', 'fbclid'];
    for (const k of u.searchParams.keys()) expect(PERMITIDAS).toContain(k);
  });
});
