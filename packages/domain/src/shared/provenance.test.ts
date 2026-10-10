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

  it('snapshots accessor-backed provenance fields before validation', () => {
    const reads = { value: 0, source: 0, collectedAt: 0, sourceUrl: 0 };
    const input = {} as {
      readonly value: { readonly bedrooms: number };
      readonly source: string;
      readonly collectedAt: string;
      readonly sourceUrl: string;
    };
    Object.defineProperties(input, {
      value: {
        enumerable: true,
        get: () => {
          reads.value += 1;
          return reads.value === 1 ? { bedrooms: 2 } : { unsupported: undefined };
        },
      },
      source: {
        enumerable: true,
        get: () => {
          reads.source += 1;
          return reads.source === 1 ? 'Synthetic listings' : ' ';
        },
      },
      collectedAt: {
        enumerable: true,
        get: () => {
          reads.collectedAt += 1;
          return reads.collectedAt === 1 ? '2026-10-10T12:30:00Z' : '0';
        },
      },
      sourceUrl: {
        enumerable: true,
        get: () => {
          reads.sourceUrl += 1;
          return reads.sourceUrl === 1 ? 'https://example.test/listings/42' : '/relative';
        },
      },
    });

    const provenance = new Provenance(input);

    expect(provenance).toEqual({
      value: { bedrooms: 2 },
      source: 'Synthetic listings',
      collectedAt: '2026-10-10T12:30:00.000Z',
      sourceUrl: 'https://example.test/listings/42',
    });
    expect(reads).toEqual({ value: 1, source: 1, collectedAt: 1, sourceUrl: 1 });
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
