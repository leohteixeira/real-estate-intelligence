import { describe, expect, it } from 'vitest';
import { PricePerSquareMeterService } from './price-per-square-meter.service.js';
const service = new PricePerSquareMeterService(),
  at = '2026-10-11T00:00:00.000Z';
describe('Market canonical structured calculation', () => {
  it('uses integer cents, existing canonical rounding and defensive result inputs', () => {
    const inputs = { priceMinorUnits: 10001, currency: 'BRL' as const, areaSquareMeters: 2 };
    const result = service.pricePerSquareMeter(inputs, at);
    expect(result).toEqual({
      kind: 'price_per_square_meter',
      minorUnits: 5001,
      currency: 'BRL',
      areaUnit: 'm2',
      inputs,
      computedAt: at,
    });
    inputs.priceMinorUnits = 1;
    expect(result.inputs.priceMinorUnits).toBe(10001);
  });
  it.each([0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe price %s',
    (priceMinorUnits) =>
      expect(() =>
        service.pricePerSquareMeter({ priceMinorUnits, currency: 'BRL', areaSquareMeters: 1 }, at),
      ).toThrow(),
  );
  it.each([0, -1, NaN, Infinity, 1000001, 1e-100])('rejects unsafe area %s', (areaSquareMeters) =>
    expect(() =>
      service.pricePerSquareMeter({ priceMinorUnits: 1, currency: 'BRL', areaSquareMeters }, at),
    ).toThrow(),
  );
  it('rejects invalid computation time and rounded-zero results', () => {
    expect(() =>
      service.pricePerSquareMeter(
        { priceMinorUnits: 1, currency: 'BRL', areaSquareMeters: 1 },
        'invalid',
      ),
    ).toThrow();
    expect(() =>
      service.pricePerSquareMeter(
        { priceMinorUnits: 1, currency: 'BRL', areaSquareMeters: 100 },
        at,
      ),
    ).toThrow();
  });
});
