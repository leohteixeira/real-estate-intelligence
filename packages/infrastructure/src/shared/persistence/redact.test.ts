import { describe, expect, it } from 'vitest';

import { redactConnectionError } from './redact.js';

describe('redactConnectionError', () => {
  it('removes the credentials from a connection uri', () => {
    const redacted = redactConnectionError(
      new Error('connect ECONNREFUSED postgres://app:hunter2@db:5432/app'),
    );

    expect(redacted.message).not.toContain('hunter2');
    expect(redacted.message).toContain('postgres://redacted:redacted@db:5432/app');
  });

  it('preserves a typed error whose message contains no credentials', () => {
    class SafeTypedError extends Error {}
    const original = new SafeTypedError('connection refused');

    expect(redactConnectionError(original)).toBe(original);
  });

  it('accepts a value that is not an Error', () => {
    expect(redactConnectionError('boom').message).toBe('boom');
  });
});
