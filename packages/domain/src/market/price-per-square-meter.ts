/**
 * Price per square meter.
 *
 * The product specification names this calculation as the canonical example of
 * a rule that must stay deterministic: a language model may explain the result,
 * never produce it.
 *
 * Money is handled in cents to keep the arithmetic exact until the final
 * division, which avoids the rounding drift of floating point currency.
 */

export interface PricePerSquareMeterInput {
  /** Asking or transaction price, in cents. Must be a positive integer. */
  readonly priceInCents: number;
  /** Usable area in square meters. Must be greater than zero. */
  readonly areaInSquareMeters: number;
}

export class PricePerSquareMeterError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PricePerSquareMeterError';
  }
}

/**
 * Returns the price per square meter in cents, rounded half away from zero.
 *
 * @throws {PricePerSquareMeterError} when an input is missing, not finite, or
 * outside its valid range.
 */
export function pricePerSquareMeter(input: PricePerSquareMeterInput): number {
  const { priceInCents, areaInSquareMeters } = input;

  if (!Number.isInteger(priceInCents)) {
    throw new PricePerSquareMeterError('priceInCents must be an integer number of cents.');
  }
  if (priceInCents <= 0) {
    throw new PricePerSquareMeterError('priceInCents must be greater than zero.');
  }
  if (!Number.isFinite(areaInSquareMeters)) {
    throw new PricePerSquareMeterError('areaInSquareMeters must be a finite number.');
  }
  if (areaInSquareMeters <= 0) {
    throw new PricePerSquareMeterError('areaInSquareMeters must be greater than zero.');
  }

  return Math.round(priceInCents / areaInSquareMeters);
}
