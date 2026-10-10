import { describe, expect, it } from 'vitest';

import { Provenance } from './provenance.js';
import { DomainValidationError } from './validation-error.js';

describe('Provenance', () => {
  it('keeps a complete immutable record and canonicalizes its timestamp', () => {
    const provenance = new Provenance({
      value: { bedrooms: 2, tags: ['balcony'] },
      source: 'Synthetic listings',
      collectedAt: '2026-10-10T09:30:00-03:00',
      sourceUrl: 'https://example.test/listings/42',
    });

    expect(provenance).toEqual({
      value: { bedrooms: 2, tags: ['balcony'] },
      source: 'Synthetic listings',
      collectedAt: '2026-10-10T12:30:00.000Z',
      sourceUrl: 'https://example.test/listings/42',
    });
    expect(Object.isFrozen(provenance)).toBe(true);
    expect(Object.isFrozen(provenance.value)).toBe(true);
    expect(Object.isFrozen(provenance.value.tags)).toBe(true);
  });

  it.each([
    {
      name: 'empty source',
      source: ' ',
      collectedAt: '2026-10-10T12:30:00.000Z',
      sourceUrl: 'https://example.test/42',
    },
    {
      name: 'ambiguous timestamp',
      source: 'Synthetic listings',
      collectedAt: '0',
      sourceUrl: 'https://example.test/42',
    },
    {
      name: 'normalized calendar date',
      source: 'Synthetic listings',
      collectedAt: '2026-02-30T12:30:00Z',
      sourceUrl: 'https://example.test/42',
    },
    {
      name: 'relative source URL',
      source: 'Synthetic listings',
      collectedAt: '2026-10-10T12:30:00.000Z',
      sourceUrl: '/listings/42',
    },
    {
      name: 'malformed source URL host',
      source: 'Synthetic listings',
      collectedAt: '2026-10-10T12:30:00.000Z',
      sourceUrl: 'https://exa%mple.com',
    },
    {
      name: 'malformed source URL bracket',
      source: 'Synthetic listings',
      collectedAt: '2026-10-10T12:30:00.000Z',
      sourceUrl: 'http://[',
    },
  ])('rejects $name', ({ source, collectedAt, sourceUrl }) => {
    expect(() => new Provenance({ value: 42, source, collectedAt, sourceUrl })).toThrow(
      DomainValidationError,
    );
  });
});
