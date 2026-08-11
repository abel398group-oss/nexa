// Barrel público da entity "lead-batch" (FSD).
// Importe SEMPRE por aqui: `@/entities/lead-batch`. Nunca alcance o interior.
export type {
  ContadoresLote,
  DescarteDeLinha,
  ImportarLotePayload,
  LeadBatch,
  MotivoDescarte,
  RelatorioImportacao,
} from './types/lead-batch.types';

export { ROTULO_MOTIVO, PORQUE_TRAVADO } from './types/lead-batch.types';

export {
  distribuirLote,
  importarLote,
  listLeadBatches,
  simularImportacao,
} from './api/lead-batches.api';
