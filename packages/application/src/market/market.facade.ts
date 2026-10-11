import type {
  PlaceMarketNeighboursResponse,
  PlaceMarketResponse,
  PlaceMarketSeriesResponse,
} from '@rei/domain';

export const MARKET_FACADE = Symbol.for('rei.MarketFacade');
export interface MarketFacade {
  getPlaceMarket(id: string): Promise<PlaceMarketResponse | null>;
  neighbours(id: string): Promise<PlaceMarketNeighboursResponse | null>;
  monthlySeries(id: string): Promise<PlaceMarketSeriesResponse | null>;
}
