import { DomainValidationError } from './validation-error.js';

declare const uuidV7Brand: unique symbol;

/** A canonical UUID version 7 string. UUID generation remains a persistence concern. */
export type UuidV7 = string & { readonly [uuidV7Brand]: 'UuidV7' };

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value: string): value is UuidV7 {
  return UUID_V7_PATTERN.test(value);
}

/** Validates and canonicalizes a UUIDv7 supplied by a persistence boundary. */
export function parseUuidV7(value: string): UuidV7 {
  const canonicalValue = value.toLowerCase();
  if (!isUuidV7(canonicalValue)) {
    throw new DomainValidationError('Identifier must be a valid UUID version 7.', 'identifier');
  }

  return canonicalValue;
}
