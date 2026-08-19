/**
 * market-gate.ts — a trava de mercado no DISPARO (ADR 037).
 *
 * A `market-readiness` decide quando o mercado PODE ser liberado; esta função
 * decide se um disparo PODE sair para ele. São momentos diferentes: o seletor da
 * tela já esconde mercado em rascunho, mas quem chama o endpoint direto (ou tinha
 * a campanha criada antes de o mercado ser suspenso) passava por cima da trava
 * inteira — conhecimento não aprovado, identidade vazia, e o disparo saindo
 * mesmo assim. Código desconhecido também barra: um typo desligaria
 * silenciosamente o conhecimento e a marca do mercado, sem erro nenhum.
 *
 * Compartilhada pelos dois canais de propósito (WhatsApp `SenderService` e
 * e-mail `EmailCampaignSenderService`): a checagem nasceu só no e-mail, e o
 * WhatsApp ficou 11 dias disparando sem ela.
 *
 * Função PURA: quem chama busca o `Product` no banco e passa o resultado.
 */

/** O que precisa ser lido do `Product` para decidir. */
export interface MercadoParaDisparo {
  name: string;
  /** draft | active | paused — ver `Product.status` no schema. */
  status: string;
}

/**
 * Por que este disparo não pode sair — ou `null` quando pode.
 *
 * @param productCode código informado na campanha; vazio = produto principal, sem trava
 * @param market      o `Product` encontrado para esse código, ou `null` se não existe
 */
export function motivoDeBloqueioDoDisparo(
  productCode: string | null | undefined,
  market: MercadoParaDisparo | null,
): string | null {
  // Sem código = produto principal (HiperTMS). Campanha antiga também chega assim;
  // travar aqui quebraria todo disparo criado antes dos mercados existirem.
  if (!productCode) return null;

  if (!market) {
    return `Mercado "${productCode}" não existe. Confira o código na tela de Mercados.`;
  }

  if (market.status !== 'active') {
    const detalhe = market.status === 'draft'
      ? 'ainda está em rascunho — complete a validação (conhecimento, modelo de mensagem, vendedor) e libere-o'
      : 'está suspenso — reative-o';
    return `Mercado "${market.name}" não está liberado para disparo: ${detalhe} na tela de Mercados.`;
  }

  return null;
}
