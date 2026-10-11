import type {
  CollectionFacade,
  CollectionRunView,
  CollectionSourcePermissions,
  CollectionSnapshotProvenance,
  CollectionSnapshotMetadata,
  EventPublisher,
} from '@rei/application';
import {
  CollectionListingSuppressed,
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  type CollectionEvent,
  type EnabledSourceView,
  type Sha256Hash,
  type UuidV7,
} from '@rei/domain';

export const SYNTHETIC_SOURCE_ID = 'synthetic-data';
export const SYNTHETIC_RUN_ID = '0199c8f2-2394-7ba0-8f9e-286378779210' as UuidV7;
export const SYNTHETIC_SNAPSHOT_ID = '0199c8f2-2394-7ba0-8f9e-286378779211' as UuidV7;
export const SYNTHETIC_SOURCE_LISTING_ID = 'SYN-SP-0001';
export const SYNTHETIC_SNAPSHOT_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111' as Sha256Hash;
export const SYNTHETIC_MANIFEST_HASH =
  'sha256:2222222222222222222222222222222222222222222222222222222222222222' as Sha256Hash;

const ALLOWED_PERMISSIONS = Object.freeze({
  sourceId: SYNTHETIC_SOURCE_ID,
  collectionAllowed: true,
  imageFetchingAllowed: true,
  listingTextDisplayAllowed: true,
});

function deniedPermissions(sourceId: string): CollectionSourcePermissions {
  return Object.freeze({
    sourceId,
    collectionAllowed: false,
    imageFetchingAllowed: false,
    listingTextDisplayAllowed: false,
  });
}

const RUN_VIEW: CollectionRunView = Object.freeze({
  runId: SYNTHETIC_RUN_ID,
  sourceId: SYNTHETIC_SOURCE_ID,
  startedAt: '2026-10-10T11:59:00.000Z',
  completedAt: '2026-10-10T12:00:01.000Z',
  counts: Object.freeze({ observed: 1, parsed: 1, changed: 0, suppressed: 0, failed: 0 }),
  observedSourceListingIds: Object.freeze([SYNTHETIC_SOURCE_LISTING_ID]),
  manifestHash: SYNTHETIC_MANIFEST_HASH,
});

function cloneRunView(): CollectionRunView {
  return Object.freeze({
    ...RUN_VIEW,
    counts: Object.freeze({ ...RUN_VIEW.counts }),
    observedSourceListingIds: Object.freeze([...RUN_VIEW.observedSourceListingIds]),
  });
}

function abortIfRequested(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Fixture publication was aborted.');
}

function fixtureEvents(): readonly CollectionEvent[] {
  return Object.freeze([
    new CollectionSnapshotParsed({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
      aggregateId: SYNTHETIC_SNAPSHOT_ID,
      occurredAt: '2026-10-10T12:00:00.000Z',
      traceContext: null,
      payload: {
        run: { runId: SYNTHETIC_RUN_ID },
        snapshot: {
          snapshotId: SYNTHETIC_SNAPSHOT_ID,
          contentHash: SYNTHETIC_SNAPSHOT_HASH,
        },
        source: {
          sourceId: SYNTHETIC_SOURCE_ID,
          sourceListingId: SYNTHETIC_SOURCE_LISTING_ID,
          sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
          observedAt: '2026-10-10T11:59:59.000Z',
        },
        listing: {
          propertyType: 'apartment',
          askingPriceMinorUnits: 78_500_000,
          currency: 'BRL',
          areaSquareMeters: 82.5,
          bedrooms: 2,
          bathrooms: 2,
          parkingSpaces: 1,
          features: ['balcony', 'elevator'],
          location: {
            city: 'São Paulo',
            stateCode: 'SP',
            neighborhood: 'Bela Vista',
            street: 'Avenida Exemplo',
          },
          listedAt: '2026-10-09T15:30:00.000Z',
          advertiser: { type: 'agency', agencyName: 'Synthetic Realty Ltda.' },
          maskedDescription: 'Bright apartment near transit. Contact details: [REDACTED].',
          imageFingerprints: ['fixture-fingerprint:v1:synthetic-001'],
        },
      },
    }),
    new CollectionRunCompleted({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779213',
      aggregateId: SYNTHETIC_RUN_ID,
      occurredAt: '2026-10-10T12:00:01.000Z',
      traceContext: null,
      payload: {
        sourceId: SYNTHETIC_SOURCE_ID,
        observedCount: 1,
        parsedCount: 1,
        suppressedCount: 0,
        failedCount: 0,
        manifestHash: SYNTHETIC_MANIFEST_HASH,
      },
    }),
    new CollectionListingSuppressed({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779214',
      aggregateId: '0199c8f2-2394-7ba0-8f9e-286378779215',
      occurredAt: '2026-10-10T12:00:02.000Z',
      traceContext: null,
      payload: {
        sourceId: SYNTHETIC_SOURCE_ID,
        sourceListingId: SYNTHETIC_SOURCE_LISTING_ID,
      },
    }),
  ]);
}

/** Fixture-only adapter. It is intentionally not registered by an API or worker module. */
export class SyntheticCollectionStub implements CollectionFacade {
  public async verifyParsedEvent(): Promise<boolean> {
    return false;
  }
  public constructor(private readonly eventPublisher: EventPublisher) {}

  public async getSourcePermissions(sourceId: string): Promise<CollectionSourcePermissions> {
    if (sourceId !== SYNTHETIC_SOURCE_ID) return deniedPermissions(sourceId);
    return Object.freeze({ ...ALLOWED_PERMISSIONS });
  }

  public async getRun(runId: string): Promise<CollectionRunView | null> {
    return runId === SYNTHETIC_RUN_ID ? cloneRunView() : null;
  }

  public async getSnapshotHash(snapshotId: string): Promise<Sha256Hash | null> {
    return snapshotId === SYNTHETIC_SNAPSHOT_ID ? SYNTHETIC_SNAPSHOT_HASH : null;
  }

  public async getSnapshotMetadata(
    expected: CollectionSnapshotProvenance,
  ): Promise<CollectionSnapshotMetadata> {
    // This publication fake has no committed lifecycle evidence.
    return { availability: 'unavailable', collectedAt: expected.observedAt, expiresAt: null };
  }

  public async listEnabledSources(): Promise<readonly EnabledSourceView[]> {
    return Object.freeze([
      Object.freeze({
        sourceId: SYNTHETIC_SOURCE_ID,
        displayLabel: 'Labelled synthetic fixture',
        enabled: true as const,
        permissions: Object.freeze({
          collectionAllowed: true,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        }),
        licence: Object.freeze({
          status: 'not-applicable' as const,
          label: 'Synthetic data',
          url: null,
        }),
      }),
    ]);
  }

  /** Publishes in order and never attempts a later event after abort or rejection. */
  public async publishFixture(signal: AbortSignal): Promise<void> {
    for (const event of fixtureEvents()) {
      abortIfRequested(signal);
      await this.eventPublisher.publish(event, signal);
    }
  }
}
