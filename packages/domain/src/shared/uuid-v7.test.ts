import { describe, expect, it } from 'vitest';

import { DomainValidationError } from './validation-error.js';
import { isUuidV7, parseUuidV7 } from './uuid-v7.js';

describe('UUIDv7 identifiers', () => {
  it('validates and canonicalizes a UUIDv7', () => {
    const identifier = '01890F47-E6B5-7CC3-98C4-1C9D6A1F7E11';
    const canonicalIdentifier = '01890f47-e6b5-7cc3-98c4-1c9d6a1f7e11';

    expect(isUuidV7(identifier)).toBe(false);
    expect(isUuidV7(canonicalIdentifier)).toBe(true);
    expect(parseUuidV7(identifier)).toBe(canonicalIdentifier);
  });

  it.each([
    'not-a-uuid',
    '01890f47-e6b5-4cc3-98c4-1c9d6a1f7e11',
    '01890f47-e6b5-7cc3-78c4-1c9d6a1f7e11',
    '00000000-0000-0000-0000-000000000000',
  ])('rejects invalid or non-v7 identifier %s', (identifier) => {
    expect(() => parseUuidV7(identifier)).toThrow(DomainValidationError);
  });
});
