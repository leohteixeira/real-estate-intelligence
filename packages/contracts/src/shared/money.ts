/** A BRL amount represented in centavos. `minorUnits` must be a safe integer. */
export interface MoneyResponse {
  readonly minorUnits: number;
  readonly currency: 'BRL';
}
