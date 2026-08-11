// Barrel público da entity "sales-script" (FSD).
// Importe SEMPRE por aqui: `@/entities/sales-script`.
export type { Objecao, SalesScript, RoteiroInput } from './types/sales-script.types';
export { ITENS_DO_ROTEIRO } from './types/sales-script.types';
export { getRoteiro, getHistoricoRoteiro, salvarRoteiro } from './api/sales-script.api';
