import { describe, expect, it } from 'vitest';

import { DomainValidationError } from '../shared/index.js';
import { isSha256Hash, parseSha256Hash } from './sha256-hash.js';

describe('SHA-256 hash', () => {
  const hash = `sha256:${'a'.repeat(64)}`;

  it('accepts only the canonical representation', () => {
    expect(parseSha256Hash(hash)).toBe(hash);
    expect(isSha256Hash(hash)).toBe(true);
  });

  it.each([
    `${'a'.repeat(64)}`,
    `sha256:${'A'.repeat(64)}`,
    `sha256:${'a'.repeat(63)}`,
    `sha512:${'a'.repeat(64)}`,
  ])('rejects non-canonical value %s', (value) => {
    expect(() => parseSha256Hash(value, 'contentHash')).toThrow(DomainValidationError);
    expect(isSha256Hash(value)).toBe(false);
  });
});
