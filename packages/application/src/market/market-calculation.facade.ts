import type { AskInputs, PriceResult, PriceInputExtraction } from '@rei/domain';
export const MARKET_CALCULATION_FACADE = Symbol('MARKET_CALCULATION_FACADE');
export interface MarketCalculationFacade {
  pricePerSquareMeter(inputs: AskInputs, computedAt: string): PriceResult;
  extractPriceInputs(query: string, locale: 'en' | 'pt-BR'): PriceInputExtraction;
}
