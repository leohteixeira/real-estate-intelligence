import { DomainValidationError } from './validation-error.js';

export const BRL_CURRENCY = 'BRL' as const;

/** An immutable BRL amount represented in centavos. */
export class Money {
  public readonly currency = BRL_CURRENCY;

  public constructor(
    public readonly minorUnits: number,
    currency: string = BRL_CURRENCY,
  ) {
    if (currency !== BRL_CURRENCY) {
      throw new DomainValidationError('Money currency must be BRL.', 'currency');
    }

    if (!Number.isSafeInteger(minorUnits)) {
      throw new DomainValidationError('Money minorUnits must be a safe integer.', 'minorUnits');
    }

    Object.freeze(this);
  }

  public equals(other: Money): boolean {
    return this.minorUnits === other.minorUnits;
  }
}
