// Barrel público da entity "market" (FSD).
// Importe SEMPRE por aqui: `@/entities/market`. Nunca alcance o interior.
export type {
  Market,
  MarketReadiness,
  MarketPendencia,
  MarketSeller,
  MarketSellers,
} from './types/market.types';

export {
  listMarkets,
  createMarket,
  updateMarket,
  deleteMarket,
  getMarketReadiness,
  releaseMarket,
  pauseMarket,
  getMarketSellers,
  linkMarketSeller,
  unlinkMarketSeller,
} from './api/market.api';
