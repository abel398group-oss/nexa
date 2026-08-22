// Funde disparo (campanha) e contato humano (atividade) numa única timeline. Puro,
// sem React — o componente só desenha o que isto decide.
import type { CampanhaRecebida } from '../api/sdr.api';
import type { AtividadeRecente } from '../types/sdr.types';

export type EventoDaLinha =
  | { kind: 'atividade'; quando: string; atividade: AtividadeRecente }
  | { kind: 'campanha'; quando: string; campanha: CampanhaRecebida };

/**
 * Antes, "Já recebeu" (disparo) e "Histórico" (ligação) eram dois cards sem relação
 * de tempo entre si — o SDR via "3 e-mails" num lugar e "1 ligação" em outro, e
 * cruzava as datas de cabeça para saber se a ligação foi antes ou depois do último
 * disparo. Numa fila de 40 leads por dia isso é tempo que ele não tem.
 *
 * `quando` da campanha é `sentAt ?? createdAt`: um alvo que ainda não saiu (na fila,
 * pulado) não tem `sentAt`, e cair fora da timeline por isso esconderia que existe um
 * disparo agendado — o SDR ligaria sem saber que um e-mail está prestes a sair.
 *
 * Mais recente primeiro, mesma ordem que as duas listas separadas já usavam.
 */
export function montarLinhaDoTempo(
  atividades: readonly AtividadeRecente[],
  campanhas: readonly CampanhaRecebida[],
): EventoDaLinha[] {
  const eventos: EventoDaLinha[] = [
    ...atividades.map(
      (atividade): EventoDaLinha => ({ kind: 'atividade', quando: atividade.createdAt, atividade }),
    ),
    ...campanhas.map(
      (campanha): EventoDaLinha => ({
        kind: 'campanha',
        quando: campanha.sentAt ?? campanha.createdAt,
        campanha,
      }),
    ),
  ];

  return eventos.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
}
