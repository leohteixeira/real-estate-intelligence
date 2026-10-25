import {
  ExternalFailure,
  type ListingAdmission,
  type ListingSource,
  type RawListingDocument,
} from '@rei/application';
import {
  CollectionSnapshotParsed,
  type CollectedListing,
  type Sha256Hash,
  type UuidV7,
} from '@rei/domain';

export const SYNTHETIC_LISTING_SOURCE_ID = 'synthetic-data';
export const SYNTHETIC_LISTING_ID = 'SYN-SP-0001';

const FIXTURE_LISTING = Object.freeze({
  propertyType: 'apartment',
  askingPriceMinorUnits: 78_500_000,
  currency: 'BRL',
  areaSquareMeters: 82.5,
  bedrooms: 2,
  bathrooms: 2,
  parkingSpaces: 1,
  features: Object.freeze(['balcony', 'elevator']),
  location: Object.freeze({
    city: 'São Paulo',
    stateCode: 'SP',
    neighborhood: 'Bela Vista',
    street: 'Avenida Exemplo',
  }),
  listedAt: '2026-10-09T15:30:00.000Z',
  advertiser: Object.freeze({ type: 'agency', agencyName: 'Synthetic Realty Ltda.' }),
  maskedDescription: 'Bright synthetic apartment near transit. Contact details: [REDACTED].',
  imageFingerprints: Object.freeze(['fixture-fingerprint:v1:synthetic-001']),
});

export const SYNTHETIC_LISTING_BYTES = Uint8Array.from(
  Buffer.from(JSON.stringify(FIXTURE_LISTING), 'utf8'),
);

const VALIDATION_RUN_ID = '0199c8f2-2394-7ba0-8f9e-286378779210' as UuidV7;
const VALIDATION_SNAPSHOT_ID = '0199c8f2-2394-7ba0-8f9e-286378779211' as UuidV7;
const VALIDATION_EVENT_ID = '0199c8f2-2394-7ba0-8f9e-286378779212' as UuidV7;
const VALIDATION_HASH = `sha256:${'0'.repeat(64)}` as Sha256Hash;

function cancellation(): ExternalFailure {
  return new ExternalFailure({ kind: 'cancelled', operation: 'collection.source' });
}

/** Deterministic, labelled fixture source. It never performs network I/O. */
export class SyntheticListingSource implements ListingSource {
  public async fetchPage(
    sourceId: string,
    cursor: string | null,
    signal: AbortSignal,
    _deadlineAt?: number,
    admit?: ListingAdmission,
  ) {
    if (signal.aborted) throw cancellation();
    if (sourceId !== SYNTHETIC_LISTING_SOURCE_ID) {
      throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.source.fetch' });
    }
    if (cursor !== null) {
      return Object.freeze({ documents: Object.freeze([]), nextCursor: null, exhausted: true });
    }
    if (admit && !(await admit({ sourceId, sourceListingId: SYNTHETIC_LISTING_ID }, signal)))
      return {
        documents: [],
        suppressedListingIds: [SYNTHETIC_LISTING_ID],
        nextCursor: null,
        exhausted: true,
      };
    return Object.freeze({
      documents: Object.freeze([
        Object.freeze({
          sourceId,
          sourceListingId: SYNTHETIC_LISTING_ID,
          sourceUrl: `https://synthetic.invalid/listings/${SYNTHETIC_LISTING_ID}`,
          observedAt: '2026-10-10T11:59:59.000Z',
          mediaType: 'application/json' as const,
          bytes: Uint8Array.from(SYNTHETIC_LISTING_BYTES),
        }),
      ]),
      nextCursor: null,
      exhausted: true,
    });
  }

  public async parse(document: RawListingDocument, signal: AbortSignal): Promise<CollectedListing> {
    if (signal.aborted) throw cancellation();
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(document.bytes);
      const listing = JSON.parse(decoded) as CollectedListing;
      const validated = new CollectionSnapshotParsed({
        eventId: VALIDATION_EVENT_ID,
        aggregateId: VALIDATION_SNAPSHOT_ID,
        occurredAt: document.observedAt,
        traceContext: null,
        payload: {
          run: { runId: VALIDATION_RUN_ID },
          snapshot: { snapshotId: VALIDATION_SNAPSHOT_ID, contentHash: VALIDATION_HASH },
          source: {
            sourceId: document.sourceId,
            sourceListingId: document.sourceListingId,
            sourceUrl: document.sourceUrl,
            observedAt: document.observedAt,
          },
          listing,
        },
      });
      return validated.payload.listing;
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.parse' });
    }
  }
}
