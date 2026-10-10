import { createHash } from 'node:crypto';

import {
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  parseSha256Hash,
  type CollectedListing,
  type Sha256Hash,
  type UuidV7,
} from '@rei/domain';

import {
  SYNTHETIC_SAO_PAULO_DATASET,
  SYNTHETIC_SAO_PAULO_DATASET_VERSION,
  type SyntheticSaoPauloRun,
  type SyntheticSaoPauloRunObservation,
} from './synthetic-sao-paulo.dataset.js';

export type SyntheticSaoPauloReplayEvent = CollectionSnapshotParsed | CollectionRunCompleted;

/** Encodes the closed listing contract in one explicit, stable JSON key order. */
function canonicalListingBytes(listing: CollectedListing): Uint8Array {
  const canonical = {
    propertyType: listing.propertyType,
    askingPriceMinorUnits: listing.askingPriceMinorUnits,
    currency: listing.currency,
    areaSquareMeters: listing.areaSquareMeters,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parkingSpaces: listing.parkingSpaces,
    features: [...listing.features],
    location: {
      city: listing.location.city,
      stateCode: listing.location.stateCode,
      neighborhood: listing.location.neighborhood,
      street: listing.location.street,
    },
    listedAt: listing.listedAt,
    advertiser: {
      type: listing.advertiser.type,
      agencyName: listing.advertiser.agencyName,
    },
    maskedDescription: listing.maskedDescription,
    imageFingerprints: [...listing.imageFingerprints],
  };
  return Uint8Array.from(Buffer.from(JSON.stringify(canonical), 'utf8'));
}

function sha256(bytes: Uint8Array, field: string): Sha256Hash {
  const digest = createHash('sha256').update(bytes).digest('hex');
  return parseSha256Hash(`sha256:${digest}`, field);
}

function manifestHash(observations: readonly SyntheticSaoPauloRunObservation[]): Sha256Hash {
  const sourceListingIds = observations.map(({ sourceListingId }) => sourceListingId).sort();
  return sha256(Buffer.from(JSON.stringify(sourceListingIds), 'utf8'), 'manifestHash');
}

function listingKey(observation: SyntheticSaoPauloRunObservation): string {
  return `${observation.sourceId}\u0000${observation.sourceListingId}`;
}

/** Fixture-local UUIDv7: fixed instant in the first 48 bits, namespaced digest in the rest. */
function deterministicUuidV7(
  instant: string,
  artifactKind: string,
  runKey: string,
  artifactKey: string,
): UuidV7 {
  const timestamp = Date.parse(instant);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffffffff) {
    throw new RangeError('Fixture UUID instant is outside the UUIDv7 timestamp range.');
  }

  const namespace = [SYNTHETIC_SAO_PAULO_DATASET_VERSION, artifactKind, runKey, artifactKey].join(
    '\u0000',
  );
  const digest = createHash('sha256').update(namespace, 'utf8').digest();
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(timestamp, 0, 6);
  digest.copy(bytes, 6, 0, 10);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}` as UuidV7;
}

function completionInstant(run: SyntheticSaoPauloRun, sourceIndex: number): string {
  return new Date(Date.parse(run.observedAt) + (sourceIndex + 1) * 1_000).toISOString();
}

function parsedEvent(
  run: SyntheticSaoPauloRun,
  runId: UuidV7,
  observation: SyntheticSaoPauloRunObservation,
): CollectionSnapshotParsed {
  const key = listingKey(observation);
  const snapshotId = deterministicUuidV7(run.observedAt, 'snapshot', run.runKey, key);
  return new CollectionSnapshotParsed({
    eventId: deterministicUuidV7(run.observedAt, 'parsed-event', run.runKey, key),
    aggregateId: snapshotId,
    occurredAt: run.observedAt,
    traceContext: null,
    payload: {
      run: { runId },
      snapshot: {
        snapshotId,
        contentHash: sha256(canonicalListingBytes(observation.listing), 'contentHash'),
      },
      source: {
        sourceId: observation.sourceId,
        sourceListingId: observation.sourceListingId,
        sourceUrl: observation.sourceUrl,
        observedAt: observation.observedAt,
      },
      listing: observation.listing,
    },
  });
}

function completedEvent(
  run: SyntheticSaoPauloRun,
  sourceId: string,
  observations: readonly SyntheticSaoPauloRunObservation[],
  runId: UuidV7,
  completedAt: string,
): CollectionRunCompleted {
  return new CollectionRunCompleted({
    eventId: deterministicUuidV7(completedAt, 'completed-event', run.runKey, sourceId),
    aggregateId: runId,
    occurredAt: completedAt,
    traceContext: null,
    payload: {
      sourceId,
      observedCount: observations.length,
      parsedCount: observations.length,
      suppressedCount: 0,
      failedCount: 0,
      manifestHash: manifestHash(observations),
    },
  });
}

/**
 * Projects each monthly cycle into source-scoped runs in catalogue order: Aurora, Brisa, Cobalto.
 * The projection uses no clocks, randomness, I/O, persistence, or publishers.
 */
export function buildSyntheticSaoPauloReplay(): readonly SyntheticSaoPauloReplayEvent[] {
  const events: SyntheticSaoPauloReplayEvent[] = [];
  for (const run of SYNTHETIC_SAO_PAULO_DATASET.runs) {
    for (const [sourceIndex, source] of SYNTHETIC_SAO_PAULO_DATASET.sources.entries()) {
      const observations = run.observations.filter(({ sourceId }) => sourceId === source.sourceId);
      const completedAt = completionInstant(run, sourceIndex);
      const runId = deterministicUuidV7(completedAt, 'run', run.runKey, source.sourceId);
      for (const observation of observations) {
        events.push(parsedEvent(run, runId, observation));
      }
      events.push(completedEvent(run, source.sourceId, observations, runId, completedAt));
    }
  }
  return Object.freeze(events);
}
