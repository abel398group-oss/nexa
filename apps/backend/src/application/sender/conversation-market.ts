/**
 * conversation-market.ts — de qual mercado é a conversa (ADR 037).
 *
 * ## O problema
 *
 * O WhatsApp dá UMA thread por par de números. Com um número só para todos os
 * mercados, o mesmo lead recebe a campanha do HiperTMS em agosto e a de pneus em
 * setembro na mesma conversa — e do lado dele foi sempre a mesma Lia.
 *
 * O produto era gravado na conversa apenas na CRIAÇÃO. Resultado observado no
 * desenho da funcionalidade: a conversa ficava presa no mercado do primeiro disparo,
 * o lead perguntava "quanto custa?" depois da campanha de pneus e a Lia respondia o
 * preço do TMS, com a marca do TMS, para o lead do parceiro.
 *
 * ## A regra
 *
 * A conversa pertence ao mercado da ÚLTIMA campanha enviada àquele contato. É o que
 * o próprio lead entende: ele está respondendo a última mensagem que recebeu.
 *
 * Função pura e compartilhada pelos dois canais de disparo de propósito: se WhatsApp
 * e e-mail decidissem por conta própria, o mesmo lead teria contexto diferente em
 * cada canal.
 */

/**
 * A conversa deve trocar de mercado?
 *
 * @param atual      mercado gravado hoje na conversa
 * @param daCampanha mercado da campanha que está saindo agora
 */
export function precisaTrocarMercado(
  atual: string | null | undefined,
  daCampanha: string | null | undefined,
): boolean {
  // Campanha sem mercado declarado NÃO apaga o contexto que a conversa já tem.
  // Campanha antiga (criada antes dos mercados) chega sem produto, e limpar aqui
  // faria a Lia perder o mercado que ela já sabia — regressão silenciosa.
  if (!daCampanha) return false;

  // Já é esse mercado: nada a fazer. Evita um UPDATE por envio numa base grande.
  if (atual === daCampanha) return false;

  return true;
}
