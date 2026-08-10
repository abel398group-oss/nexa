/**
 * campaign-dedup.ts — janela do dedup ENTRE campanhas.
 *
 * ## O que o dedup faz
 *
 * Quem já recebeu um envio `sent` em qualquer campanha anterior do tenant entra na
 * campanha nova como `skipped/ja_enviado`. Isso existe porque o mesmo telefone ou
 * e-mail volta em CSVs diferentes o tempo todo — com lista comprada/exportada é
 * questão de tempo, não hipótese — e receber a mesma prospecção duas vezes é o
 * caminho mais curto para o bloqueio no WhatsApp e para a caixa de spam no e-mail.
 *
 * ## O efeito colateral
 *
 * Sem janela de tempo, "já recebeu" vale para SEMPRE: um endereço contactado uma vez
 * em julho nunca mais pode ser contactado. Isso inviabiliza cadência de follow-up —
 * o segundo toque, que em prospecção é onde a maior parte das respostas aparece.
 * Descoberto em 08/08/2026, quando uma campanha de teste pulou todos os alvos.
 *
 * ## Por que o padrão continua sendo "para sempre"
 *
 * Ligar uma janela liberta de uma vez toda a base histórica: a primeira campanha
 * depois da mudança dispararia para todo mundo contactado antes do corte. Isso é um
 * envio em massa que ninguém pediu, e envio em massa não tem desfazer. Então a janela
 * é uma escolha explícita por ambiente (`CAMPAIGN_DEDUP_DAYS`), e não um default novo
 * que muda o comportamento de produção no deploy.
 *
 * Uso: `CAMPAIGN_DEDUP_DAYS=45` = quem recebeu nos últimos 45 dias é pulado; antes
 * disso, pode receber de novo. Ausente ou `0` = comportamento atual (nunca reenviar).
 */

/** Dias da janela de dedup. `null` = sem janela (bloqueia para sempre). */
export function dedupWindowDays(env: NodeJS.ProcessEnv = process.env): number | null {
  const bruto = (env.CAMPAIGN_DEDUP_DAYS ?? '').trim();
  if (!bruto) return null;
  const n = Number(bruto);
  // Valor inválido cai no lado seguro (bloquear para sempre), nunca em "liberar tudo":
  // um typo em `CAMPAIGN_DEDUP_DAYS=3o` não pode virar disparo em massa.
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Filtro de data para a busca de envios anteriores.
 *
 * Devolve `undefined` quando não há janela — o chamador espalha isso no `where` do
 * Prisma e o filtro simplesmente não existe, mantendo a consulta atual.
 */
export function dedupSentAtFilter(
  agora: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): { gte: Date } | undefined {
  const dias = dedupWindowDays(env);
  if (dias === null) return undefined;
  return { gte: new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000) };
}

/** Texto para o log — o operador precisa saber qual regra pulou os alvos dele. */
export function dedupWindowLabel(env: NodeJS.ProcessEnv = process.env): string {
  const dias = dedupWindowDays(env);
  return dias === null ? 'sem janela (nunca reenviar)' : `últimos ${dias} dia(s)`;
}

/**
 * Esta campanha pode IGNORAR o "já enviado"?
 *
 * Ferramenta de TESTE: sem isto, validar o fluxo ponta a ponta com um endereço real é
 * impossível depois do primeiro envio — o dedup bloqueia para sempre e o operador fica
 * criando campanha que não sai (aconteceu duas vezes em 08–10/08/2026).
 *
 * Atrás do MESMO interruptor do reenvio total (`CAMPAIGN_RESEND_ALL_ENABLED`), e não de
 * um novo: são a mesma intenção — "estou testando, deixa eu repetir" — e uma variável
 * só significa um lugar só para desligar quando o teste acabar.
 *
 * Não apaga nada. O histórico continua intacto: o alvo antigo segue `sent`, o
 * engajamento das campanhas anteriores continua valendo. Só ESTA campanha deixa de
 * consultar o passado.
 */
export function podeIgnorarDedup(
  pedido: boolean | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!pedido) return false;
  return (env.CAMPAIGN_RESEND_ALL_ENABLED ?? 'false').toLowerCase() === 'true';
}
