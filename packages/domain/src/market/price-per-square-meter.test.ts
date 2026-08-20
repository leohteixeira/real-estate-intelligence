import { describe, expect, it } from 'vitest';

import { PricePerSquareMeterError, pricePerSquareMeter } from './price-per-square-meter.js';

describe('pricePerSquareMeter', () => {
  it.each([
    { priceInCents: 90_000_000, areaInSquareMeters: 100, expected: 900_000 },
    { priceInCents: 45_000_000, areaInSquareMeters: 62.5, expected: 720_000 },
    // 1000 / 3 rounds to 333, never 333.333…
    { priceInCents: 1_000, areaInSquareMeters: 3, expected: 333 },
  ])(
    'divides $priceInCents cents by $areaInSquareMeters m²',
    ({ priceInCents, areaInSquareMeters, expected }) => {
      expect(pricePerSquareMeter({ priceInCents, areaInSquareMeters })).toBe(expected);
    },
  );

  it.each([
    { name: 'fractional price', priceInCents: 1_000.5, areaInSquareMeters: 10 },
    { name: 'zero price', priceInCents: 0, areaInSquareMeters: 10 },
    { name: 'negative price', priceInCents: -1, areaInSquareMeters: 10 },
    { name: 'zero area', priceInCents: 1_000, areaInSquareMeters: 0 },
    { name: 'negative area', priceInCents: 1_000, areaInSquareMeters: -5 },
    { name: 'infinite area', priceInCents: 1_000, areaInSquareMeters: Number.POSITIVE_INFINITY },
    { name: 'not a number', priceInCents: 1_000, areaInSquareMeters: Number.NaN },
  ])('rejects $name', ({ priceInCents, areaInSquareMeters }) => {
    expect(() => pricePerSquareMeter({ priceInCents, areaInSquareMeters })).toThrow(
      PricePerSquareMeterError,
    );
  });

  it('is deterministic for the same input', () => {
    const input = { priceInCents: 12_345_678, areaInSquareMeters: 87.4 };

    expect(pricePerSquareMeter(input)).toBe(pricePerSquareMeter(input));
  });
});
