// Barrel público da entity "sdr" (FSD).
// Importe SEMPRE por aqui: `@/entities/sdr`. Nunca alcance o interior.
export type {
  Closer,
  ItemDaFila,
  PrioridadeFila,
  AtividadeRecente,
} from './types/sdr.types';

export { ROTULO_PRIORIDADE, ROTULO_RESULTADO, CRITERIOS_QUALIFICACAO } from './types/sdr.types';
export type { Qualificacao } from './types/sdr.types';

export {
  ajustarScore,
  qualificarLead,
  descartarLead,
  listClosers,
  listMaterial,
  listMaterialAprovado,
  listQueue,
  pausarLead,
  registrarAtividade,
  transferirParaCloser,
} from './api/sdr.api';
