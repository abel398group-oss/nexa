/**
 * A que trilha cada categoria de conhecimento pertence.
 *
 * LISTA BRANCA, de propósito. Antes cada agente carregava uma lista NEGRA de UMA
 * categoria — vendas excluía `suporte`, suporte excluía `comercial` — contra uma
 * taxonomia que cresceu para 16 nomes. Toda categoria nova nascia visível para as
 * DUAS trilhas, porque ninguém a havia colocado em lista de exclusão nenhuma.
 *
 * Consequência medida em 08/08/2026 na base do tenant hipertms:
 *   • suporte alcançava `precificacao` (3 artigos) e `vendas` (1)
 *   • vendas alcançava 30 artigos operacionais (`cadastros`, `administracao`,
 *     `operacional`, `compras`, `frota`, `financeiro`, …)
 *
 * E o efeito de segunda ordem era pior que o vazamento: o conteúdo recuperado vira
 * o `allowedFacts` que a Supervisora usa para auditar. Com um artigo de preço na
 * busca de um chamado, a Supervisora APROVA a Lia citando preço no suporte — a
 * trava que deveria pegar isso fica cega pelo mesmo furo.
 *
 * Com lista branca, categoria nova nasce FORA das duas trilhas até alguém decidir
 * onde ela entra. Erra para o lado de esconder, não para o de vazar. E
 * `unmappedCategories()` existe para esse "até alguém decidir" não virar silêncio.
 */
export type KnowledgeTrack = 'sales' | 'support';

/** Vendas: o que o vendedor precisa para posicionar e precificar o produto. */
export const SALES_CATEGORIES: readonly string[] = [
  'comercial',
  'precificacao',
  'vendas',
  'produto',
  'modulo',
  'conceitos',
];

/** Suporte: como o sistema funciona e como operar cada área. */
export const SUPPORT_CATEGORIES: readonly string[] = [
  'suporte',
  'cadastros',
  'administracao',
  'operacional',
  'operacao',
  'compras',
  'frota',
  'financeiro',
  'primeiros-passos',
  'equipes',
  // Compartilhadas com vendas: descrevem o produto, e as duas trilhas têm motivo
  // legítimo para lê-las — o suporte explica o módulo, o vendedor vende o módulo.
  'produto',
  'modulo',
  'conceitos',
];

export function categoriesFor(track: KnowledgeTrack): readonly string[] {
  return track === 'sales' ? SALES_CATEGORIES : SUPPORT_CATEGORIES;
}

/**
 * Categorias presentes na base que não pertencem a trilha nenhuma.
 *
 * Com lista branca, uma categoria não mapeada fica INVISÍVEL para a Lia — o que é
 * o comportamento seguro, e também um jeito ótimo de esconder conhecimento novo
 * sem ninguém notar. Quem chama isto transforma o silêncio em log.
 */
export function unmappedCategories(existentes: readonly (string | null)[]): string[] {
  const mapeadas = new Set([...SALES_CATEGORIES, ...SUPPORT_CATEGORIES]);
  return [...new Set(existentes.filter((c): c is string => !!c))].filter((c) => !mapeadas.has(c));
}
