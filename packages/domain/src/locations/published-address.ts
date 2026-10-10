import { DomainValidationError } from '../shared/index.js';

/** Public street-level input only. The optional published number is never persisted. */
export type PublishedAddress = Readonly<{
  city: string;
  stateCode: string;
  neighborhood: string;
  street: string;
  number?: number;
}>;

export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/ +/g, ' ');
}
export function normalizeStreetName(name: string): string {
  return normalizePlaceName(name)
    .replace(/^(?:r\.|rua) +/, 'rua ')
    .replace(/^(?:av\.|avenida) +/, 'avenida ');
}
function invalid(): never {
  throw new DomainValidationError('Invalid published address query.', 'address');
}
export function parsePublishedAddress(input: unknown): PublishedAddress {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) invalid();
  const record = input as Record<string, unknown>;
  const keys = ['city', 'stateCode', 'neighborhood', 'street', 'number'];
  if (Reflect.ownKeys(record).some((key) => typeof key !== 'string' || !keys.includes(key)))
    invalid();
  for (const field of ['city', 'stateCode', 'neighborhood', 'street']) {
    const value = record[field];
    if (
      !Object.hasOwn(record, field) ||
      typeof value !== 'string' ||
      value.length > 200 ||
      !value.trim() ||
      !/^[\p{L}\p{M} .'-]+$/u.test(value)
    )
      invalid();
  }
  const { city, stateCode, neighborhood, street } = record as unknown as PublishedAddress;
  if (!/^[a-z]{2}$/.test(normalizePlaceName(stateCode))) invalid();
  if (
    /\b(?:apto|apt|apartamento|unidade|unit|complemento|complement|suite|sala|bloco)\b/i.test(
      normalizeStreetName(street),
    )
  )
    invalid();
  if (
    Object.hasOwn(record, 'number') &&
    (typeof record.number !== 'number' || !Number.isSafeInteger(record.number) || record.number < 0)
  )
    invalid();
  return Object.freeze({
    city: normalizePlaceName(city),
    stateCode: normalizePlaceName(stateCode),
    neighborhood: normalizePlaceName(neighborhood),
    street: normalizeStreetName(street),
    ...(Object.hasOwn(record, 'number') ? { number: record.number as number } : {}),
  });
}
