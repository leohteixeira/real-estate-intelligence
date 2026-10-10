import { CollectionSnapshotParsed, Property, parseSha256Hash } from '@rei/domain';
import { SYNTHETIC_LISTING_BYTES } from '../collection/index.js';
import { SyntheticLocationsAdapter } from '../locations/index.js';

export const fixtureId = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
export const initialEvent = new CollectionSnapshotParsed({
  eventId: fixtureId(3),
  aggregateId: fixtureId(2),
  occurredAt: '2026-10-10T12:00:00.000Z',
  traceContext: null,
  payload: {
    run: { runId: fixtureId(1) as CollectionSnapshotParsed['payload']['run']['runId'] },
    snapshot: {
      snapshotId: fixtureId(2) as CollectionSnapshotParsed['payload']['snapshot']['snapshotId'],
      contentHash: parseSha256Hash(`sha256:${'a'.repeat(64)}`),
    },
    source: {
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-SP-0001',
      sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
      observedAt: '2026-10-10T11:59:59.000Z',
    },
    listing: JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
  },
});
export async function initialProperty() {
  const resolved = await new SyntheticLocationsAdapter().resolveFixtureAddress(
    initialEvent.payload.listing.location,
  );
  return new Property(fixtureId(10), fixtureId(11), initialEvent, resolved!);
}
