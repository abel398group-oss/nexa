// Barrel público da entity "telemarketing-report" (FSD).
export type {
  RelatorioComercial,
  LoteNoRelatorio,
  VendedorNoRelatorio,
  CampanhaNoRelatorio,
  SlaCalculado,
  TaxaCalculada,
} from './types/report.types';

export { getRelatorio } from './api/report.api';
