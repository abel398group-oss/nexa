/**
 * Normalização de endereço de e-mail — fonte única para os DOIS sentidos do canal.
 *
 * Por que isto existe (defeito de 09/08/2026, encontrado antes do primeiro disparo
 * de prospecção): o caminho de ENTRADA já minusculava o remetente, o de SAÍDA
 * (campanha) gravava a caixa exata da planilha. Postgres compara texto com
 * sensibilidade a maiúsculas, então `Joao@x.com` e `joao@x.com` eram duas linhas
 * diferentes em `contacts` — com três consequências, todas silenciosas:
 *
 *  1. Opt-out furado. O contato pediu descadastro respondendo (linha minúscula), e
 *     a campanha seguinte procurava por `Joao@x.com`: não achava, e mandava de
 *     novo. É violação de LGPD e a rota mais curta para uma reclamação de spam.
 *  2. Dedup entre campanhas furado. Mesma comparação, mesmo resultado: a pessoa
 *     recebia o disparo duas vezes.
 *  3. Contato e conversa duplicados. O disparo criava `email:Joao@x.com`, a
 *     resposta criava `email:joao@x.com`, e o analista via a resposta num fio novo,
 *     sem o e-mail que a originou.
 *
 * Toda escrita e toda comparação de endereço passam por aqui. A parte local do
 * endereço é, pela RFC 5321 §2.4, tecnicamente sensível à caixa — mas nenhum
 * provedor real trata assim, e o custo de um falso negativo aqui (mandar para quem
 * pediu para sair) é muito maior que o de um falso positivo.
 */

/** `  João@Empresa.COM ` → `joão@empresa.com`. Vazio/nulo → string vazia. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^<|>$/g, '').trim().toLowerCase();
}

/**
 * Endereço utilizável para envio.
 *
 * Deliberadamente frouxo: não é validador de RFC, é uma peneira contra o que
 * quebra o disparo (célula vazia, "não tem", nome sem arroba, espaço no meio).
 * Recusar endereço exótico porém válido custa um lead; aceitar lixo custa um
 * hard bounce, que custa reputação de domínio.
 */
export function isSendableEmail(raw: string | null | undefined): boolean {
  const e = normalizeEmail(raw);
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(e);
}
