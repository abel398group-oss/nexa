import { Logger } from '@nestjs/common';

const logger = new Logger('TmsTenantId');

/**
 * Mapeia o slug do tenant Nexa para o UUID interno do TMS via env
 * `TMS_TENANT_ID_<SLUG>` — fonte única do mapeamento (mesma env que
 * `MonitorService.resolveTmsTenantId` já usa).
 *
 * Extraído em T8 (2026-07-16) pra ser reaproveitado por `ClosingReportService`
 * e `ConsolidationService` (T8.6 — cash view) sem duplicar a mesma lógica de
 * env em cada arquivo novo. `MonitorService` mantém sua própria cópia privada
 * intacta (fora de escopo mexer nela agora — REGRAS-SQUAD Regra 8) — se algum
 * dia o comportamento divergir aqui, é sinal de que vale unificar de vez.
 */
export function resolveTmsTenantId(slug: string): string {
  const key = `TMS_TENANT_ID_${slug.toUpperCase().replace(/-/g, '_')}`;
  const override = process.env[key];
  if (override) return override;
  logger.warn(`sem override para slug "${slug}" (${key} não definida) — passando slug direto`);
  return slug;
}
