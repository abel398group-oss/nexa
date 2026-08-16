/**
 * seller-scope.ts — "cada vendedor no seu galho" (11/08/2026).
 *
 * Com três vendedores fazendo disparo, os dados de um não podem se misturar com
 * os do outro: cada um vê os contatos, as campanhas e as conversas dele, e o
 * admin vê tudo.
 *
 * ## A regra, inteira
 *
 * O escopo só existe para o papel `vendedor`. Admin, gestor, operacional e
 * financeiro passam com `undefined` e enxergam o tenant inteiro — exatamente como
 * antes deste arquivo existir. É o mesmo formato que Inbox e Oportunidades já
 * usavam; aqui ele virou uma função só para Contatos e Disparo não escreverem uma
 * versão ligeiramente diferente da mesma coisa.
 *
 * ## Por que SEM DONO é de todo mundo
 *
 * `ownerSellerId = null` aparece para todos. Duas razões, e a segunda é a que
 * decide:
 *
 *  • É o estado de toda a base anterior ao campo. Filtrar por dono já na estreia
 *    faria cada vendedor abrir Contatos e ver zero — quebrar o que funciona para
 *    entregar o que foi pedido.
 *  • "Sem dono" é uma situação real e permanente, não só um resquício de
 *    migração: lead que entrou pelo site, contato importado antes de decidir de
 *    quem é. Esconder de todos deixaria esse lead sem ninguém para atender.
 *
 * Quem distribui é o admin, pelo botão Transferir.
 *
 * ## Vendedor sem vínculo
 *
 * Usuário com papel `vendedor` mas sem `sellerId` recebe `'__none__'`, que não
 * casa com nenhum id. Ele vê os sem dono e mais nada — nunca a carteira alheia.
 * É o mesmo fail-closed que o Inbox já aplicava.
 */

export interface UsuarioComEscopo {
  role?: string | null;
  sellerId?: string | null;
  /**
   * Vem do JWT junto com role e sellerId. Não é usado por `escopoDeVendedor` — está aqui
   * para o escopo de MERCADO (`market-scope.service.ts`), que decide quem é operador de
   * lead por permissão (`sdr`/`closer`) e não só por papel, e assim os dois escopos
   * recebem o mesmo objeto sem cast.
   */
  permissions?: string[] | null;
}

/**
 * Escopo do usuário. `undefined` = vê tudo.
 *
 * Devolver `undefined` para quem não é vendedor não é descuido: é o que mantém
 * admin e gestor com a visão que sempre tiveram.
 */
export function escopoDeVendedor(user: UsuarioComEscopo | undefined): string | undefined {
  return user?.role === 'vendedor' ? user.sellerId ?? '__none__' : undefined;
}

/**
 * Pedaço de `where` do Prisma que aplica o escopo a uma tabela com
 * `ownerSellerId`. Sem escopo devolve `{}` — o chamador espalha e nada muda.
 */
export function filtroDeDono(escopo: string | undefined): Record<string, unknown> {
  if (!escopo) return {};
  return { OR: [{ ownerSellerId: escopo }, { ownerSellerId: null }] };
}

/**
 * Junta escopo e filtros do próprio usuário sem um sobrescrever o outro.
 *
 * O `OR` do escopo e um `OR` de busca ("nome ou e-mail contém…") ocupam a mesma
 * chave: espalhar os dois no mesmo objeto faz o segundo apagar o primeiro, e o
 * vendedor passa a ver a base inteira ao digitar na busca. Furo silencioso — a
 * tela continua funcionando, só mostrando demais. Por isso os dois entram como
 * itens de um `AND`.
 */
export function comEscopo(where: Record<string, any>, escopo: string | undefined): Record<string, any> {
  if (!escopo) return where;
  const dono = filtroDeDono(escopo);
  const { AND, ...resto } = where;
  return { AND: [...(Array.isArray(AND) ? AND : AND ? [AND] : []), resto, dono] };
}
