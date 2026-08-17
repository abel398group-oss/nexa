// A quem vai cada lead na distribuição de um lote — puro, pra ser testável sem banco.
// Ver docs/features/telemarketing/prd.md §Módulo 1.

export interface LeadParaDistribuir {
  id: string;
  contactId: string | null;
}

export interface DestinoDoLead {
  id: string;
  contactId: string | null;
  dono: string;
  /// true = a carteira estava vaga e o rodízio escolheu; o `ownerSellerId` do contato
  /// precisa ser gravado. false = o contato já tinha dono e nada nele se altera.
  carteiraVaga: boolean;
}

export interface ContextoDaDistribuicao {
  /// Vendedores elegíveis para receber lead novo, na ordem do rodízio.
  alvos: readonly string[];
  /// Dono que o contato já tem — do próprio contato ou de uma oportunidade anterior.
  donoDoContato: ReadonlyMap<string, string | null>;
  /// Vendedores que continuam na casa. Quem saiu não segura carteira.
  aindaNaCasa: ReadonlySet<string>;
}

/**
 * Rodízio para lead novo; dono existente para quem já tem dono.
 *
 * O bug que isto corrige: reimportar a mesma lista cria oportunidade nova (de
 * propósito — é como se mede qual lista presta), e essa oportunidade nasce sem dono.
 * O rodízio então sorteava um dono olhando só a oportunidade, sem ver que o CONTATO
 * já era de alguém — e em seguida sobrescrevia o `ownerSellerId` do contato. Resultado
 * observado em 16/08/2026: Rota Certa Logística e Translog Paraná com o mesmo contato
 * na carteira de dois SDRs ao mesmo tempo. Cada um vê o lead uma vez na tela dele, os
 * dois ligam, e o lead atende a segunda ligação achando que é telemarketing.
 *
 * Ausência NÃO libera carteira. Vendedor de férias é excluído de receber lead novo
 * (`naoAusente` na consulta de alvos), mas o que já é dele continua sendo — férias
 * são temporárias, e repartir a carteira de quem voltou na semana que vem só cria o
 * contato duplo. Quem sai da empresa é outro caso: aí a carteira está vaga de fato,
 * e o lead volta pro rodízio em vez de ficar preso a um cadastro inativo.
 *
 * O rodízio só avança quando de fato distribui. Se avançasse também nos leads que
 * foram para o dono existente, a repartição entre os SDRs novos ficaria torta sem
 * motivo — pularia a vez de quem não recebeu nada.
 */
export function decidirDonos(
  fila: readonly LeadParaDistribuir[],
  ctx: ContextoDaDistribuicao,
): DestinoDoLead[] {
  const { alvos, donoDoContato, aindaNaCasa } = ctx;
  if (!alvos.length) return [];

  let rodizio = 0;
  // Dois leads do MESMO contato nesta mesma rodada vão para o mesmo dono. Sem isto,
  // uma lista com o contato repetido recriaria o conflito dentro de uma execução só.
  const decididoAgora = new Map<string, string>();
  const destinos: DestinoDoLead[] = [];

  for (const lead of fila) {
    const existente = lead.contactId
      ? decididoAgora.get(lead.contactId) ?? donoDoContato.get(lead.contactId) ?? null
      : null;
    const carteiraVaga = !existente || !aindaNaCasa.has(existente);
    const dono = carteiraVaga ? alvos[rodizio++ % alvos.length] : (existente as string);

    if (lead.contactId) decididoAgora.set(lead.contactId, dono);
    destinos.push({ id: lead.id, contactId: lead.contactId, dono, carteiraVaga });
  }

  return destinos;
}
