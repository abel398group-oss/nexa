/**
 * Serve pra discar?
 *
 * Existe porque `Opportunity.phone` e `Contact.phone` são texto livre e, na base real,
 * guardam coisas que não são telefone: achei `email:abel.ramos@hipertms.com.br` num
 * registro antigo, e o link virava `tel:email:abel.ramos@...`. Clicar nisso abre o
 * discador com lixo — no meio de uma ligação, é o operador perdendo tempo com um botão
 * que nunca podia funcionar.
 *
 * Regra deliberadamente frouxa: 10 dígitos ou mais é telefone brasileiro plausível
 * (DDD + 8). Não valida DDD nem nono dígito, porque a decisão aqui é só "mostro o botão
 * de ligar ou não" — reprovar número estranho que funciona é pior que aceitar um que
 * não funciona.
 */
export function podeDiscar(valor: string | null | undefined): boolean {
  if (!valor) return false;
  // Letra ou arroba no meio = não é telefone. Pega o caso do e-mail com prefixo.
  if (/[a-zA-Z@]/.test(valor)) return false;
  return valor.replace(/\D/g, '').length >= 10;
}
