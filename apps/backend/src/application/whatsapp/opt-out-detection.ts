/**
 * Detecção de pedido de parada ("opt-out") em mensagem recebida.
 *
 * Nasceu de um caso real (2026-08-03). A lista antiga era um `includes` de
 * palavras soltas:
 *
 *   ['parar', 'sair', 'remover', 'nao quero', 'descadastrar', 'pare', 'stop', ...]
 *
 * Ela errava dos DOIS lados:
 *
 * • **Falso negativo** — "Para de ficar mandando msg que saco!" não casava com
 *   nada ('pare' não é substring de "para de"). A pessoa pediu duas vezes para
 *   parar, continuou recebendo, e ainda escreveu "vou processar esta empresa por
 *   perturbação". Só parou quando escreveu "não quero", por acaso.
 *
 * • **Falso positivo** — 'pare' casava dentro de "parece". Um lead escrevendo
 *   "parece interessante" era descadastrado em silêncio. O oposto do desejado:
 *   perder um lead quente achando que ele pediu para sair.
 *
 * Agora são expressões regulares com fronteira de palavra. Duas famílias:
 *
 * 1. PEDIDO EXPLÍCITO — "sair", "para de mandar", "me tira da lista"…
 * 2. HOSTILIDADE / AMEAÇA — "vou processar", "procon", "perturbação"…
 *    Também para o contato. Quem ameaça processar por perturbação não é lead:
 *    insistir é risco jurídico e não vende nada.
 */

/** Normaliza para comparação: minúsculas, sem acento, espaços colapsados. */
export function normalizeForOptOut(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pedido explícito de parar de receber. */
const PEDIDO_EXPLICITO: RegExp[] = [
  /\bsair\b/,
  /\bstop\b/,
  /\bunsubscribe\b/,
  /\bdescadastr\w*/,                                   // descadastrar/descadastre/descadastro
  /\bcancelar? (o )?(cadastro|recebimento|envio)\b/,
  // "para de mandar", "pare de enviar", "parem de me encher", e também o caso
  // real "Para de ficar mandando msg" — por isso a janela de até 25 caracteres
  // entre o verbo de parada e o verbo de envio, em vez de exigir grudado.
  // A fronteira \b depois de par(a|e|ar|em) é o que impede casar "parece".
  /\bpar(a|e|ar|em)\b[^.!?]{0,25}\b(mandar|mandando|manda|mande|enviar|enviando|envia|envie|encher|enchendo|perturbar|incomodar|msg|mensagens?|mensagem)\b/,
  /\bnao (me )?(mande|manda|manden?|envie|envia)\b/,
  /\bnao quero\b/,
  /\bnao tenho interesse\b/,
  /\bsem interesse\b/,
  /\bme (tira|tire|remove|remova|exclui|exclua|retira|retire)\b/,
  /\b(remover|remova|excluir?) (meu|do) (numero|cadastro|contato|lista)\b/,
  /\bchega de (msg|mensagen?s?|mensagem)\b/,
  /\bnao me perturbe?\b/,
];

/**
 * Hostilidade / ameaça. Não é "pedido educado", mas o efeito prático é o mesmo:
 * parar de contatar. Manter o disparo aqui é risco jurídico e desgaste de marca.
 */
const HOSTILIDADE: RegExp[] = [
  /\bprocessar?\b.*\b(empresa|voces|vcs)\b|\bvou processar\b/,
  /\bprocon\b/,
  /\bperturbacao\b/,
  /\badvogado\b/,
  /\bprocesso judicial\b/,
  /\bdenunciar\b/,
  /\bspam\b/,
];

export type OptOutMatch = { optOut: boolean; reason?: 'pedido' | 'hostilidade'; pattern?: string };

/**
 * Diz se a mensagem pede (ou exige) parar o contato.
 * Recebe o texto CRU — a normalização é feita aqui.
 */
export function detectOptOut(text: string): OptOutMatch {
  const t = normalizeForOptOut(text);
  if (!t) return { optOut: false };

  for (const re of PEDIDO_EXPLICITO) {
    if (re.test(t)) return { optOut: true, reason: 'pedido', pattern: re.source };
  }
  for (const re of HOSTILIDADE) {
    if (re.test(t)) return { optOut: true, reason: 'hostilidade', pattern: re.source };
  }
  return { optOut: false };
}

/** Açúcar para quem só quer o booleano. */
export function isOptOutMessage(text: string): boolean {
  return detectOptOut(text).optOut;
}
