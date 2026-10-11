import {
  DomainValidationError,
  pricePerSquareMeter,
  type AskInputs,
  type PriceResult,
} from '@rei/domain';
import type { MarketCalculationFacade } from './market-calculation.facade.js';
export class PricePerSquareMeterService implements MarketCalculationFacade {
  public pricePerSquareMeter(inputs: AskInputs, computedAt: string): PriceResult {
    if (
      !Number.isSafeInteger(inputs.priceMinorUnits) ||
      inputs.priceMinorUnits < 1 ||
      inputs.currency !== 'BRL' ||
      !Number.isFinite(inputs.areaSquareMeters) ||
      inputs.areaSquareMeters <= 0 ||
      inputs.areaSquareMeters > 1_000_000 ||
      !Number.isFinite(Date.parse(computedAt))
    )
      throw new DomainValidationError('Invalid calculation input.', 'inputs');
    const minorUnits = pricePerSquareMeter({
      priceInCents: inputs.priceMinorUnits,
      areaInSquareMeters: inputs.areaSquareMeters,
    });
    if (!Number.isSafeInteger(minorUnits) || minorUnits < 1)
      throw new DomainValidationError('Unsafe calculation result.', 'inputs');
    return {
      kind: 'price_per_square_meter',
      minorUnits,
      currency: 'BRL',
      areaUnit: 'm2',
      inputs: { ...inputs },
      computedAt,
    };
  }
}
