import { describe, expect, it } from 'vitest';

import {
  SYNTHETIC_ENABLED_SOURCE,
  parseEnabledSourcesResponse,
  type EnabledSourceDto,
} from './enabled-source.dto.js';

describe('EnabledSourceDto', () => {
  it('keeps the synthetic source honest across the JSON boundary', () => {
    const hydrated = JSON.parse(JSON.stringify(SYNTHETIC_ENABLED_SOURCE)) as EnabledSourceDto;

    expect(hydrated).toEqual({
      sourceId: 'synthetic-data',
      displayLabel: 'Labelled synthetic fixture',
      enabled: true,
      permissions: {
        collectionAllowed: true,
        imageFetchingAllowed: true,
        listingTextDisplayAllowed: true,
      },
      licence: {
        status: 'not-applicable',
        label: 'Synthetic data',
        url: null,
      },
    });
    expect(hydrated.licence.status).not.toBe('licensed');
    expect(Object.keys(hydrated).sort()).toEqual([
      'displayLabel',
      'enabled',
      'licence',
      'permissions',
      'sourceId',
    ]);
    expect(JSON.stringify(hydrated)).not.toMatch(/review|rate|access|evidence|enabledAt/i);
  });
});

describe('parseEnabledSourcesResponse', () => {
  it('admits all three licence branches and exact public permissions without changing labels', () => {
    const response = {
      sources: [
        SYNTHETIC_ENABLED_SOURCE,
        {
          ...SYNTHETIC_ENABLED_SOURCE,
          sourceId: 'licensed-feed',
          displayLabel: 'Publisher attribution',
          licence: {
            status: 'licensed',
            label: 'Permitted fixture licence',
            url: 'https://publisher.example.test/licence',
          },
          permissions: {
            collectionAllowed: true,
            imageFetchingAllowed: false,
            listingTextDisplayAllowed: false,
          },
        },
        {
          ...SYNTHETIC_ENABLED_SOURCE,
          sourceId: 'unverified-feed',
          licence: { status: 'not-verified', label: null, url: null },
        },
      ],
    };
    expect(parseEnabledSourcesResponse(response)).toEqual(response);
    expect(parseEnabledSourcesResponse({ sources: [] })).toEqual({ sources: [] });
  });
  it.each([
    null,
    [],
    {},
    { sources: null },
    { sources: [null] },
    { sources: [], candidate: true },
    { sources: [SYNTHETIC_ENABLED_SOURCE, SYNTHETIC_ENABLED_SOURCE] },
    ...[
      { sourceId: 'invalid id' },
      { sourceId: 'x'.repeat(201) },
      { displayLabel: '' },
      { displayLabel: ' padded ' },
      { displayLabel: 'label\ncontrol' },
      { displayLabel: 'x'.repeat(501) },
      { enabled: false },
      { enabled: 'true' },
      { privateEvidence: 'not public' },
      {
        permissions: {
          collectionAllowed: 'true',
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: false,
        },
      },
      { permissions: { collectionAllowed: true } },
      { licence: { status: 'unknown', label: null, url: null } },
      { licence: { status: 'not-applicable', label: null, url: null } },
      { licence: { status: 'not-verified', label: 'Invented', url: null } },
      { licence: { status: 'not-applicable', label: 'Synthetic', url: 'https://example.test' } },
      ...[
        'javascript:alert(1)',
        'data:text/html,unsafe',
        'https://user:pass@example.test',
        'not-a-url',
        'https://example.test/\nunsafe',
        'https://example.test/unsafe path',
        'https://example.test\\unsafe',
      ].map((url) => ({ licence: { status: 'licensed', label: 'Licence', url } })),
      { licence: { status: 'licensed', label: '', url: 'https://example.test' } },
    ].map((change) => ({ sources: [{ ...SYNTHETIC_ENABLED_SOURCE, ...change }] })),
  ])('rejects malformed, duplicate or unsafe public evidence %#', (value) => {
    expect(() => parseEnabledSourcesResponse(value)).toThrow('Invalid contract value.');
  });
});
