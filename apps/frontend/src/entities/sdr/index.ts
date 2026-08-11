// Barrel público da entity "sdr" (FSD).
// Importe SEMPRE por aqui: `@/entities/sdr`. Nunca alcance o interior.
export type {
  Closer,
  ItemDaFila,
  PrioridadeFila,
  AtividadeRecente,
} from './types/sdr.types';

export { ROTULO_PRIORIDADE, ROTULO_RESULTADO } from './types/sdr.types';

export {
  descartarLead,
  listClosers,
  listQueue,
  pausarLead,
  registrarAtividade,
  transferirParaCloser,
} from './api/sdr.api';
