/** A deterministic rejection of an invalid domain value. */
export class DomainValidationError extends Error {
  public constructor(
    message: string,
    public readonly field: string,
  ) {
    super(message);
    this.name = 'DomainValidationError';
  }
}
