import { describe, expect, it } from 'vitest';

import { parseRfc3339Timestamp } from './timestamp.js';
import { DomainValidationError } from './validation-error.js';

describe('parseRfc3339Timestamp', () => {
  it.each([
    ['2026-10-10T12:30:00Z', '2026-10-10T12:30:00.000Z'],
    ['2026-10-10T09:30:00-03:00', '2026-10-10T12:30:00.000Z'],
    ['2026-10-10T12:30:00.123456Z', '2026-10-10T12:30:00.123Z'],
  ])('canonicalizes %s to UTC', (input, expected) => {
    expect(parseRfc3339Timestamp(input, 'occurredAt')).toBe(expected);
  });

  it.each([
    '0',
    '2026-10-10',
    '2026-10-10T12:30:00',
    '2026-02-30T12:30:00Z',
    '2026-10-10T24:00:00Z',
    '2026-10-10T12:30:00+24:00',
  ])('rejects non-RFC-3339 or normalized timestamp %s', (input) => {
    expect(() => parseRfc3339Timestamp(input, 'occurredAt')).toThrow(DomainValidationError);
  });
});
