/**
 * campaign-link.ts — marca o link da campanha para saber de onde veio o clique.
 *
 * ## O buraco que isto fecha
 *
 * O rastreio do site já GUARDA origem (`utm_source`, `utm_campaign`, `click_id`,
 * `referrer_domain`) e tem índice por campanha. Mas o disparo mandava o link cru, e
 * clique vindo de e-mail quase nunca traz referrer — o Gmail abre por um proxy e o
 * cliente de desktop não manda nada. Resultado: a visita entrava como "direta" e a
 * pergunta "a campanha trouxe gente?" não tinha resposta.
 *
 * ## Duas regras que parecem detalhe e não são
 *
 * 1. **Nunca sobrescrever UTM que já está no link.** Se o operador colou um link com
 *    `utm_campaign` próprio, foi decisão dele — provavelmente combinada com alguém
 *    que olha outro relatório.
 * 2. **`utm_campaign` leva nome E id.** Só o id deixa o painel ilegível ("visitas de
 *    a3f9c1e8"); só o nome colide entre "teste" e "teste" de meses diferentes. O
 *    par resolve os dois, e o id no fim é o que permite casar com a campanha.
 */

/** Só o que o rastreio aceita na allowlist (ver pageview-sanitizer.ts). */
const UTM_SOURCE = 'nexa';

/** Vira `pneus-toque-1-a3f9c1e8`: legível no painel e único. */
export function slugDeCampanha(nome: string, id: string): string {
  const base = (nome ?? '')
    .normalize('NFD')
    // Tira acento: utm com acento vira %C3%A7 na URL e fica ilegível no painel.
    // `\p{Diacritic}` em vez do range U+0300–U+036F escrito à mão — aquele range é
    // feito de caracteres invisíveis no fonte, que um editor desatento apaga sem
    // ninguém perceber.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const curto = (id ?? '').replace(/-/g, '').slice(0, 8);
  return [base, curto].filter(Boolean).join('-') || 'campanha';
}

/**
 * Devolve o link com a origem marcada.
 *
 * Link vazio/inválido volta como veio: é melhor mandar o link do operador intacto do
 * que mandar um link remendado que não abre.
 */
export function marcarLinkDaCampanha(
  link: string | null | undefined,
  ctx: { canal: 'email' | 'whatsapp'; campanhaId: string; campanhaNome: string },
): string {
  const cru = (link ?? '').trim();
  if (!cru) return cru;

  let u: URL;
  try {
    u = new URL(cru);
  } catch {
    return cru; // não é URL absoluta — não mexe
  }

  // set condicional: o que o operador escreveu manda.
  const porFora = (chave: string, valor: string) => {
    if (!u.searchParams.has(chave)) u.searchParams.set(chave, valor);
  };

  porFora('utm_source', UTM_SOURCE);
  porFora('utm_medium', ctx.canal);
  porFora('utm_campaign', slugDeCampanha(ctx.campanhaNome, ctx.campanhaId));

  return u.toString();
}
