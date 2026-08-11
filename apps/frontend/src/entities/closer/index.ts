// Barrel público da entity "closer" (FSD).
// Importe SEMPRE por aqui: `@/entities/closer`. Nunca alcance o interior.
export type { Negocio, PainelDeHoje, Bloco } from './types/closer.types';

export { ROTULO_BLOCO, SUBTITULO_BLOCO, MOTIVOS_PERDA } from './types/closer.types';

export {
  adiarNegocio,
  getPainelDeHoje,
  marcarGanho,
  marcarPerda,
  reagendarReuniao,
  registrarProposta,
} from './api/closer.api';
