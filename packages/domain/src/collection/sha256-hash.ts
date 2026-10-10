import { DomainValidationError } from '../shared/index.js';

declare const sha256HashBrand: unique symbol;

/** Canonical textual representation of a SHA-256 digest. */
export type Sha256Hash = string & { readonly [sha256HashBrand]: 'Sha256Hash' };

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

export function isSha256Hash(value: string): value is Sha256Hash {
  return SHA256_HASH_PATTERN.test(value);
}

/** Rejects non-canonical digests rather than silently changing their representation. */
export function parseSha256Hash(value: string, field = 'hash'): Sha256Hash {
  if (!isSha256Hash(value)) {
    throw new DomainValidationError(
      `${field} must use the canonical sha256:<64 lowercase hexadecimal> representation.`,
      field,
    );
  }

  return value;
}
