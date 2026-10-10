import { describe, expect, it } from 'vitest';

import { BRL_CURRENCY, Money } from './money.js';
import { DomainValidationError } from './validation-error.js';

describe('Money', () => {
  it('represents an immutable BRL amount in minor units', () => {
    const amount = new Money(78_500_000);

    expect(amount).toEqual({ currency: BRL_CURRENCY, minorUnits: 78_500_000 });
    expect(Object.isFrozen(amount)).toBe(true);
    expect(amount.equals(new Money(78_500_000))).toBe(true);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid minor units %s',
    (minorUnits) => {
      expect(() => new Money(minorUnits)).toThrow(DomainValidationError);
    },
  );

  it('rejects a currency other than BRL', () => {
    expect(() => new Money(100, 'USD')).toThrow(DomainValidationError);
  });
});
