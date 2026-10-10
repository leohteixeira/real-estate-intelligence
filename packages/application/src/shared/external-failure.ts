/** The complete vendor-neutral failure vocabulary for outbound dependencies. */
export const EXTERNAL_FAILURE_KINDS = [
  'transient',
  'rejected',
  'unauthorized',
  'exhausted',
  'forbidden',
  'cancelled',
] as const;

export type ExternalFailureKind = (typeof EXTERNAL_FAILURE_KINDS)[number];

export interface ExternalFailureOptions {
  readonly kind: ExternalFailureKind;
  readonly operation: string;
  readonly retryAfterMs?: number;
}

const FAILURE_MESSAGES: Readonly<Record<ExternalFailureKind, string>> = Object.freeze({
  transient: 'The external dependency is temporarily unavailable.',
  rejected: 'The external dependency rejected the operation.',
  unauthorized: 'The external dependency did not authorize the operation.',
  exhausted: 'The external dependency did not recover within the retry policy.',
  forbidden: 'The operation is forbidden by policy.',
  cancelled: 'The external operation was cancelled.',
});

/**
 * Sanitized failure crossing an application port. It deliberately has no raw cause, vendor code,
 * endpoint, destination, payload, or credential-bearing message.
 */
export class ExternalFailure extends Error {
  public readonly kind: ExternalFailureKind;
  public readonly operation: string;
  public readonly retryAfterMs?: number;

  public constructor(options: ExternalFailureOptions) {
    super(FAILURE_MESSAGES[options.kind]);
    this.name = 'ExternalFailure';
    this.kind = options.kind;
    this.operation = options.operation;
    if (options.retryAfterMs !== undefined) {
      if (!Number.isFinite(options.retryAfterMs) || options.retryAfterMs < 0) {
        throw new TypeError('retryAfterMs must be a non-negative finite number.');
      }
      this.retryAfterMs = options.retryAfterMs;
    }
  }
}

export function isExternalFailure(value: unknown): value is ExternalFailure {
  return value instanceof ExternalFailure;
}

export function isRetryableExternalFailure(value: unknown): value is ExternalFailure {
  return value instanceof ExternalFailure && value.kind === 'transient';
}
