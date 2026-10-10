import { describe, expect, it } from 'vitest';

import { SYNTHETIC_ENABLED_SOURCE, type EnabledSourceDto } from './enabled-source.dto.js';

describe('EnabledSourceDto', () => {
  it('keeps the synthetic source honest across the JSON boundary', () => {
    const hydrated = JSON.parse(JSON.stringify(SYNTHETIC_ENABLED_SOURCE)) as EnabledSourceDto;

    expect(hydrated).toEqual({
      sourceId: 'synthetic-data',
      displayLabel: 'Synthetic dataset',
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
  });
});
