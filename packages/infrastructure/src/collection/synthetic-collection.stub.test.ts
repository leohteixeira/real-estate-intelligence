import type { EventEnvelope, EventPublisher } from '@rei/application';
import {
  COLLECTION_LISTING_SUPPRESSED_TYPE,
  COLLECTION_RUN_COMPLETED_TYPE,
  COLLECTION_SNAPSHOT_PARSED_TYPE,
  parseCollectionEvent,
  hashCollectionManifest,
} from '@rei/domain';
import { describe, expect, it } from 'vitest';

import { InMemoryEventPublisher } from '../shared/messaging/in-memory-event-publisher.js';
import {
  SYNTHETIC_MANIFEST_HASH,
  SYNTHETIC_RUN_ID,
  SYNTHETIC_SNAPSHOT_HASH,
  SYNTHETIC_SNAPSHOT_ID,
  SYNTHETIC_SOURCE_ID,
  SYNTHETIC_SOURCE_LISTING_ID,
  SyntheticCollectionStub,
} from './synthetic-collection.stub.js';

function wire(value: EventEnvelope): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function objectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key.toLowerCase(), ...objectKeys(child)]);
}

describe('SyntheticCollectionStub', () => {
  it('never claims durable availability for publication-only fixture evidence', async () => {
    const stub = new SyntheticCollectionStub(new InMemoryEventPublisher());
    await expect(
      stub.getSnapshotMetadata({
        sourceId: SYNTHETIC_SOURCE_ID,
        sourceListingId: SYNTHETIC_SOURCE_LISTING_ID,
        sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
        runId: SYNTHETIC_RUN_ID,
        snapshotId: SYNTHETIC_SNAPSHOT_ID,
        contentHash: SYNTHETIC_SNAPSHOT_HASH,
        observedAt: '2026-10-10T11:59:59.000Z',
      }),
    ).resolves.toEqual({
      availability: 'unavailable',
      collectedAt: '2026-10-10T11:59:59.000Z',
      expiresAt: null,
    });
  });
  it('publishes one parsed, completed, and suppressed fact through a JSON test consumer', async () => {
    const publisher = new InMemoryEventPublisher();
    const stub = new SyntheticCollectionStub(publisher);

    await stub.publishFixture(new AbortController().signal);
    const consumed = publisher.events.map((event) => parseCollectionEvent(wire(event)));

    expect(consumed.map(({ type }) => type)).toEqual([
      COLLECTION_SNAPSHOT_PARSED_TYPE,
      COLLECTION_RUN_COMPLETED_TYPE,
      COLLECTION_LISTING_SUPPRESSED_TYPE,
    ]);
    expect(consumed.every(({ version }) => version === 1)).toBe(true);

    const parsed = consumed[0];
    const completed = consumed[1];
    const suppressed = consumed[2];
    expect(parsed?.type).toBe(COLLECTION_SNAPSHOT_PARSED_TYPE);
    expect(completed?.type).toBe(COLLECTION_RUN_COMPLETED_TYPE);
    expect(suppressed?.type).toBe(COLLECTION_LISTING_SUPPRESSED_TYPE);
    if (
      parsed?.type !== COLLECTION_SNAPSHOT_PARSED_TYPE ||
      completed?.type !== COLLECTION_RUN_COMPLETED_TYPE ||
      suppressed?.type !== COLLECTION_LISTING_SUPPRESSED_TYPE
    ) {
      throw new Error('The consumer received an unexpected fixture sequence.');
    }

    expect(parsed.payload.run.runId).toBe(SYNTHETIC_RUN_ID);
    expect(parsed.payload.snapshot).toEqual({
      snapshotId: SYNTHETIC_SNAPSHOT_ID,
      contentHash: SYNTHETIC_SNAPSHOT_HASH,
    });
    expect(parsed.payload.source.sourceId).toBe(SYNTHETIC_SOURCE_ID);
    expect(parsed.payload.source.sourceListingId).toBe(SYNTHETIC_SOURCE_LISTING_ID);
    expect(parsed.payload.listing).toMatchObject({
      currency: 'BRL',
      maskedDescription: expect.stringContaining('[REDACTED]'),
    });
    expect(parsed.payload.listing.imageFingerprints).toHaveLength(1);
    expect(completed.aggregateId).toBe(SYNTHETIC_RUN_ID);
    expect(completed.payload.manifestHash).toBe(SYNTHETIC_MANIFEST_HASH);
    const run = await stub.getRun(completed.aggregateId);
    expect(run).not.toBeNull();
    if (run === null) throw new Error('The completed fixture must resolve to its run manifest.');
    expect(completed.payload.manifestHash).toBe(
      hashCollectionManifest(run.observedSourceListingIds),
    );
    expect(suppressed.payload).toEqual({
      sourceId: SYNTHETIC_SOURCE_ID,
      sourceListingId: SYNTHETIC_SOURCE_LISTING_ID,
    });

    const listingKeys = objectKeys(parsed.payload.listing);
    for (const forbidden of [
      'naturalpersonname',
      'phone',
      'email',
      'cpf',
      'individualcreci',
      'unit',
      'complement',
      'imageurl',
      'imagebinary',
      'credentials',
      'headers',
      'vendor',
    ]) {
      expect(listingKeys).not.toContain(forbidden);
    }
    const serializedListing = JSON.stringify(parsed.payload.listing).toLowerCase();
    expect(serializedListing).not.toContain('person@example.test');
    expect(serializedListing).not.toContain('+55 11 99999-9999');
  });

  it('returns immutable non-aliasing facade views and denies unknown sources', async () => {
    const stub = new SyntheticCollectionStub(new InMemoryEventPublisher());

    const firstRun = await stub.getRun(SYNTHETIC_RUN_ID);
    const secondRun = await stub.getRun(SYNTHETIC_RUN_ID);
    expect(firstRun).toEqual({
      runId: SYNTHETIC_RUN_ID,
      sourceId: SYNTHETIC_SOURCE_ID,
      startedAt: '2026-10-10T11:59:00.000Z',
      completedAt: '2026-10-10T12:00:01.000Z',
      counts: { observed: 1, parsed: 1, changed: 0, suppressed: 0, failed: 0 },
      observedSourceListingIds: [SYNTHETIC_SOURCE_LISTING_ID],
      manifestHash: SYNTHETIC_MANIFEST_HASH,
    });
    expect(firstRun).not.toBe(secondRun);
    expect(firstRun?.counts).not.toBe(secondRun?.counts);
    expect(firstRun?.observedSourceListingIds).not.toBe(secondRun?.observedSourceListingIds);
    expect(Object.isFrozen(firstRun)).toBe(true);
    expect(Object.isFrozen(firstRun?.counts)).toBe(true);
    expect(Object.isFrozen(firstRun?.observedSourceListingIds)).toBe(true);
    expect(await stub.getRun('unknown')).toBeNull();
    expect(await stub.getSnapshotHash(SYNTHETIC_SNAPSHOT_ID)).toBe(SYNTHETIC_SNAPSHOT_HASH);
    expect(await stub.getSnapshotHash('unknown')).toBeNull();

    expect(await stub.getSourcePermissions(SYNTHETIC_SOURCE_ID)).toEqual({
      sourceId: SYNTHETIC_SOURCE_ID,
      collectionAllowed: true,
      imageFetchingAllowed: true,
      listingTextDisplayAllowed: true,
    });
    expect(await stub.getSourcePermissions('unknown-source')).toEqual({
      sourceId: 'unknown-source',
      collectionAllowed: false,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: false,
    });
  });

  it('publishes nothing when already aborted', async () => {
    const publisher = new InMemoryEventPublisher();
    const stub = new SyntheticCollectionStub(publisher);
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(stub.publishFixture(controller.signal)).rejects.toThrow('cancelled');
    expect(publisher.events).toEqual([]);
  });

  it('stops after a publisher rejection without exposing its implementation', async () => {
    const attempts: EventEnvelope[] = [];
    const rejection = new Error('publish rejected');
    const publisher: EventPublisher = {
      async publish(event): Promise<void> {
        attempts.push(event);
        if (attempts.length === 2) throw rejection;
      },
    };
    const stub = new SyntheticCollectionStub(publisher);

    await expect(stub.publishFixture(new AbortController().signal)).rejects.toBe(rejection);
    expect(attempts.map(({ type }) => type)).toEqual([
      COLLECTION_SNAPSHOT_PARSED_TYPE,
      COLLECTION_RUN_COMPLETED_TYPE,
    ]);
  });

  it('honors an abort raised between ordered publications', async () => {
    const controller = new AbortController();
    const attempts: EventEnvelope[] = [];
    const publisher: EventPublisher = {
      async publish(event): Promise<void> {
        attempts.push(event);
        controller.abort(new Error('stop after first'));
      },
    };
    const stub = new SyntheticCollectionStub(publisher);

    await expect(stub.publishFixture(controller.signal)).rejects.toThrow('stop after first');
    expect(attempts).toHaveLength(1);
  });
});
