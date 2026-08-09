// Barrel público da entity "market" (FSD).
// Importe SEMPRE por aqui: `@/entities/market`. Nunca alcance o interior.
export type { Market, MarketReadiness, MarketPendencia } from './types/market.types';

export { listMarkets, getMarketReadiness, releaseMarket, pauseMarket } from './api/market.api';
