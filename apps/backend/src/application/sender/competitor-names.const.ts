/**
 * Concorrentes do HiperTMS — TMS / emissores de CT-e / ERPs de transporte.
 *
 * Usado na criação de campanha: alvo cujo NOME bate com um padrão daqui entra
 * como skipped/'suspeito_concorrente' (visível no relatório, NÃO envia).
 * É heurística de nome — número raspado de grupo sem nome passa reto; a
 * blocklist manual (status='blocked') continua sendo a trava definitiva.
 *
 * Fontes: levantamento 2026-08-01 (bsoft.com.br, brudam.com.br, softweb/SSW,
 * egssistemas, softensistemas, transp.net/SmartGT, datamex/hivecloud, praxio)
 * + concorrentes já confirmados pelo Abel nos grupos (ActiveCorp, Emiteaí).
 *
 * Regras ao editar:
 * - Só nomes DISTINTIVOS. Nunca palavras que podem aparecer em nome de
 *   transportadora ou de pessoa ("senior" sozinho pegaria "Analista Sênior";
 *   use "senior sistemas").
 * - Adicionar, nunca dar match agressivo: falso positivo aqui mata lead bom.
 */
export const COMPETITOR_NAME_PATTERNS: RegExp[] = [
  /active\s*corp/i,      // ActiveCorp — confirmado (grupos de logística)
  /emitea[ií]/i,         // Emiteaí — emissor CT-e, confirmado
  /\bbsoft\b/i,          // Bsoft TMS
  /\bdatamex\b/i,        // Datamex (fundida com a Bsoft)
  /\bbrudam\b/i,         // Brudam TMS
  /\bssw\b/i,            // SSW Sistemas
  /\bpraxio\b/i,         // Praxio / Rodopar
  /\brodopar\b/i,
  /\bsoften\b/i,         // Soften Sistemas
  /egs\s*sistemas/i,     // EGS Sistemas ("egs" solto é curto demais)
  /\bsmartgt\b/i,        // SmartGT (transp.net)
  /\bhivecloud\b/i,      // Hivecloud
  /\btotvs\b/i,          // TOTVS (módulo transporte)
  /\bbenner\b/i,         // Benner (logística)
  /senior\s*sistemas/i,  // Senior Sistemas
  /\besl\s*cloud\b/i,    // ESL ("esl" solto pegaria transportadora homônima)
  /portal\s*do\s*transportador/i,
];

/** true se o nome bate com algum concorrente conhecido. Nome vazio nunca bate. */
export function looksLikeCompetitor(name: string | undefined | null): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  return COMPETITOR_NAME_PATTERNS.some((re) => re.test(n));
}
