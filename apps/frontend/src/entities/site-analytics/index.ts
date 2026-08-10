// Barrel público da entity "site-analytics" (FSD).
// Importe SEMPRE por aqui: `@/entities/site-analytics`.
export type { VisaoGeralSite, PontoDiario, ItemContado } from './types/site-analytics.types';
export { getSiteOverview } from './api/site-analytics.api';

export type { CliqueDeLead } from './api/cliques.api';
export { listCliques } from './api/cliques.api';
