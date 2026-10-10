import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_FAILURE_KINDS,
  ExternalFailure,
  isExternalFailure,
  isRetryableExternalFailure,
} from './external-failure.js';

describe('ExternalFailure', () => {
  it.each(EXTERNAL_FAILURE_KINDS)(
    'constructs the closed %s failure without a raw cause',
    (kind) => {
      const failure = new ExternalFailure({
        kind,
        operation: 'event-publisher.publish',
        retryAfterMs: kind === 'transient' ? 250 : undefined,
      });

      expect(failure).toMatchObject({
        name: 'ExternalFailure',
        kind,
        operation: 'event-publisher.publish',
      });
      expect(failure).not.toHaveProperty('cause');
      expect(failure.message).not.toContain('amqp');
    },
  );

  it('classifies only transient failures as retryable', () => {
    const transient = new ExternalFailure({ kind: 'transient', operation: 'publish' });
    const rejected = new ExternalFailure({ kind: 'rejected', operation: 'publish' });

    expect(isExternalFailure(transient)).toBe(true);
    expect(isRetryableExternalFailure(transient)).toBe(true);
    expect(isRetryableExternalFailure(rejected)).toBe(false);
    expect(isExternalFailure(new Error('vendor detail'))).toBe(false);
  });

  it('rejects invalid retry hints at the construction boundary', () => {
    expect(
      () =>
        new ExternalFailure({
          kind: 'transient',
          operation: 'publish',
          retryAfterMs: Number.NaN,
        }),
    ).toThrow('retryAfterMs');
  });
});
