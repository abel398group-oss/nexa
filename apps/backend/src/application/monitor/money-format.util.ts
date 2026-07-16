/**
 * formatBRL — formata um número como reais no padrão "R$ 1.234,56", usado nas
 * mensagens de fechamento (T8.4) e visão do caixa (T8.6).
 *
 * Não usa `Intl.NumberFormat(..., { style: 'currency' })` de propósito: builds
 * de ICU diferentes inserem um espaço non-breaking (U+00A0) entre "R$" e o
 * número, o que quebra comparação exata de string nos testes. `toLocaleString`
 * só pro número + prefixo manual evita essa variação entre ambientes.
 */
export function formatBRL(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return `R$ ${safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Formata uma taxa (0..1) como percentual pt-BR, ex.: 0.35 → "35%", 0.086 → "8,6%". */
export function formatPct(rate: number, decimals = 0): string {
  const safe = Number.isFinite(rate) ? rate : 0;
  return `${(safe * 100).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

/**
 * Variação relativa entre `current` e `previous`, formato " ▲ 12%" / " ▼ 5%"
 * (com espaço à esquerda, pronto pra concatenar). Sem `previous` (ausente ou
 * zero) → string vazia — nunca "Infinity%" (regra do T8.4).
 */
export function variationPct(current: number, previous: number | undefined | null): string {
  if (!previous) return '';
  const delta = (current - previous) / previous;
  if (!Number.isFinite(delta)) return '';
  const arrow = delta >= 0 ? '▲' : '▼';
  return ` ${arrow} ${Math.abs(delta * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
}

/**
 * Variação em pontos percentuais entre duas TAXAS já expressas em 0..1 (ex.:
 * margem%, delinquência) — usado em vez de `variationPct` porque a diferença
 * entre duas porcentagens é relatada em "pontos", não em variação relativa.
 * Sem `previousRate` (ausente) → string vazia.
 */
export function variationPts(currentRate: number, previousRate: number | undefined | null): string {
  if (previousRate === undefined || previousRate === null) return '';
  const deltaPts = (currentRate - previousRate) * 100;
  if (!Number.isFinite(deltaPts)) return '';
  const arrow = deltaPts >= 0 ? '▲' : '▼';
  return ` ${arrow} ${Math.abs(deltaPts).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pts`;
}
