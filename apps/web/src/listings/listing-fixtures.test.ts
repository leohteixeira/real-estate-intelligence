import { parseListingResponse } from '@rei/contracts';
import { expect, it } from 'vitest';
import { propertyDetailFixture } from '../properties/property-fixtures.test';

export function listingFixture() {
  const property = propertyDetailFixture();
  const listing = property.property.listings[0]!;
  return parseListingResponse({
    metadata: property.metadata,
    listing: {
      ...listing,
      history: [
        ...listing.history,
        {
          type: 'removed',
          effectiveAt: '2026-08-01T12:00:00.000Z',
          provenance: listing.provenance,
        },
        {
          type: 'reappeared',
          effectiveAt: '2026-09-01T12:00:00.000Z',
          provenance: listing.provenance,
        },
      ],
    },
  });
}

it('parses every supported Listing event fixture', () => {
  expect(new Set(listingFixture().listing.history.map((event) => event.type)).size).toBe(5);
});
