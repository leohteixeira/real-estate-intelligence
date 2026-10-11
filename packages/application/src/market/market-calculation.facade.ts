import type { AskInputs, PriceResult } from '@rei/domain';
export const MARKET_CALCULATION_FACADE = Symbol('MARKET_CALCULATION_FACADE');
export interface MarketCalculationFacade {
  pricePerSquareMeter(inputs: AskInputs, computedAt: string): PriceResult;
}
