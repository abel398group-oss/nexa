// Barrel público da entity "seller" (FSD).
// Importe SEMPRE por aqui: `@/entities/seller`. Nunca alcance o interior.
export type { Seller, SellerKpi, SellerMini, SellerInput } from './types/seller.types';

export {
  listSellers,
  listSellersMini,
  listSellerKpis,
  createSeller,
  updateSeller,
  toggleSellerActive,
  toggleSellerOutOfOffice,
  setSellerAway,
  deleteSeller,
  bulkDeleteSellers,
} from './api/seller.api';
