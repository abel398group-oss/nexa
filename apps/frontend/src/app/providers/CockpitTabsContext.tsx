import { createContext, useContext } from 'react';

/**
 * Trocar de aba do cockpit a partir de DENTRO de uma aba (22/08/2026).
 *
 * Existe por causa de uma duplicação real: o material da campanha (roteiro e
 * portfólio) subia e era aprovado em dois lugares — no painel do mercado e na aba
 * "Validação de campanha" —, os dois batendo nos mesmos endpoints. Duas telas para o
 * mesmo ato é onde as duas divergem no primeiro ajuste, e foi o que fez a operação
 * perguntar por que existiam duas telas iguais.
 *
 * O painel do mercado passou a mostrar só a CONTAGEM e mandar para a aba que aprova.
 * Para mandar, ele precisa trocar a aba de quem está por cima dele — daí o contexto.
 *
 * `null` quando a tela está montada FORA do cockpit: `MarketsPage` e
 * `CampaignValidationPage` também têm rota própria (`/markets`, `/validacao`). Quem
 * consome decide o fallback (navegar pela rota) em vez de quebrar.
 */
export const CockpitTabsContext = createContext<
  ((abaId: string, subAbaId?: string) => void) | null
>(null);

export function useIrParaAba() {
  return useContext(CockpitTabsContext);
}
