import { describe, expect, it, vi } from 'vitest';
import {
  CollectionRunCompleted,
  CollectionSnapshotParsed,
  hashCollectionManifest,
  parseSha256Hash,
} from '@rei/domain';
import type { SourceRegisterRepository } from '@rei/application';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresCollectionFacade } from './postgres-collection.facade.js';
import { SYNTHETIC_LISTING_BYTES } from './synthetic-listing-source.js';
const fixtureId = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const initialEvent = new CollectionSnapshotParsed({
  eventId: fixtureId(3),
  aggregateId: fixtureId(2),
  occurredAt: '2026-10-10T12:00:00.000Z',
  payload: {
    run: { runId: fixtureId(1) },
    snapshot: {
      snapshotId: fixtureId(2),
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

describe('Collection-owned authenticated completion boundary', () => {
  it('requires exact retained canonical evidence, counts and full manifest independently of outbox rows', async () => {
    const manifest = ['SYN-SP-0001'];
    const event = new CollectionRunCompleted({
      eventId: fixtureId(8),
      aggregateId: fixtureId(1),
      occurredAt: '2026-10-10T12:00:00.000Z',
      payload: {
        sourceId: 'synthetic-data',
        observedCount: 1,
        parsedCount: 1,
        suppressedCount: 0,
        failedCount: 0,
        manifestHash: hashCollectionManifest(manifest),
      },
    });
    const row = {
      event: { ...event },
      observed_source_listing_ids: manifest,
      started_at: new Date('2026-10-10T11:00:00.000Z'),
      completed_at: new Date(event.occurredAt),
      observed_count: 1,
      parsed_count: 1,
      suppressed_count: 0,
      failed_count: 0,
      manifest_hash: event.payload.manifestHash,
    };
    let stored: unknown = row;
    const query = vi.fn(async (sql: string) =>
      sql.includes('completed_event_evidence') ? (stored ? [stored] : []) : [],
    );
    const identity = {};
    const connection = {
      transactionIdentity: () => identity,
      leaseClient: async () => ({ query, release: vi.fn() }),
    } as unknown as DatabaseConnection;
    const facade = new PostgresCollectionFacade(connection, {} as SourceRegisterRepository);
    await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
      expect(await facade.verifyCompletedEvent(tx, event)).toBe(true);
      expect(
        await facade.verifyCompletedEvent(
          tx,
          new CollectionRunCompleted({ ...event, payload: { ...event.payload, parsedCount: 0 } }),
        ),
      ).toBe(false);
      for (const changed of [
        { ...row, completed_at: new Date('2026-10-11T12:00:00.000Z') },
        { ...row, observed_count: 2 },
        { ...row, parsed_count: 0 },
        { ...row, suppressed_count: 1 },
        { ...row, failed_count: 1 },
        { ...row, observed_source_listing_ids: [] },
        { ...row, manifest_hash: hashCollectionManifest([]) },
      ]) {
        stored = changed;
        expect(await facade.verifyCompletedEvent(tx, event)).toBe(false);
      }
      stored = null;
      expect(await facade.verifyCompletedEvent(tx, event)).toBe(false);
      expect(
        await facade.verifyCompletedEvent(
          tx,
          new CollectionRunCompleted({ ...event, payload: { ...event.payload, sourceId: 'olx' } }),
        ),
      ).toBe(false);
    });
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('source.enabled AND source.collection_allowed');
    expect(sql).toContain('source.hold_reason IS NULL');
    expect(sql).toContain('FOR SHARE');
    expect(sql).not.toMatch(/platform\.outbox|properties\.|locations\./);
  });
  it('orders canonical sources behind active earlier-run barriers and authenticates every recovered original/correction', async () => {
    const manifest = ['SYN-SP-0001'];
    const event = new CollectionRunCompleted({
      eventId: fixtureId(8),
      aggregateId: fixtureId(1),
      occurredAt: '2026-10-10T12:00:00.000Z',
      payload: {
        sourceId: 'synthetic-data',
        observedCount: 1,
        parsedCount: 1,
        suppressedCount: 0,
        failedCount: 0,
        manifestHash: hashCollectionManifest(manifest),
      },
    });
    const evidence = {
      event: { ...event },
      observed_source_listing_ids: manifest,
      started_at: new Date('2026-10-10T11:00:00.000Z'),
      completed_at: new Date(event.occurredAt),
      observed_count: 1,
      parsed_count: 1,
      suppressed_count: 0,
      failed_count: 0,
      manifest_hash: event.payload.manifestHash,
    };
    let blocked = false;
    const query = vi.fn(async (sql: string) =>
      sql.includes('SELECT evidence.event, run.started_at')
        ? blocked
          ? []
          : [evidence]
        : sql.includes('run.completed_at, run.observed_count')
          ? [evidence]
          : sql.includes('observation.source_url')
            ? [
                {
                  event: { ...initialEvent },
                  original_event_id: initialEvent.eventId,
                  run_id: initialEvent.payload.run.runId,
                  source_id: initialEvent.payload.source.sourceId,
                  source_listing_id: initialEvent.payload.source.sourceListingId,
                  source_url: initialEvent.payload.source.sourceUrl,
                  observed_at: new Date(initialEvent.payload.source.observedAt),
                  content_hash: initialEvent.payload.snapshot.contentHash,
                  image_fingerprints: initialEvent.payload.listing.imageFingerprints,
                },
              ]
            : sql.includes('SELECT evidence.event FROM') ||
                sql.includes('SELECT event FROM collection.parsed_event_evidence')
              ? [{ event: { ...initialEvent } }]
              : [],
    );
    const identity = {};
    const connection = {
      transactionIdentity: () => identity,
      leaseClient: async () => ({ query, release: vi.fn() }),
    } as unknown as DatabaseConnection;
    const facade = new PostgresCollectionFacade(connection, {} as SourceRegisterRepository);
    await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
      expect((await facade.nextCompletedRun(tx, 'synthetic-data', null))?.runId).toBe(
        event.aggregateId,
      );
      expect(await facade.getRunListingFacts(tx, event.aggregateId, 'SYN-SP-0001')).toEqual([
        initialEvent,
      ]);
      expect(await facade.getSnapshotCorrections(tx, initialEvent.aggregateId)).toEqual([
        initialEvent,
      ]);
      blocked = true;
      expect(
        await facade.nextCompletedRun(tx, 'synthetic-data', {
          startedAt: event.occurredAt,
          runId: event.aggregateId,
        }),
      ).toBeNull();
    });
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain("earlier.status IN ('running','paused')");
    expect(sql).toContain('ORDER BY run.started_at,run.run_id LIMIT 1');
    expect(sql).toContain('ORDER BY observation.observed_at,observation.snapshot_id');
    const statements = query.mock.calls.map(([statement]) => statement);
    expect(
      statements.findIndex((statement) => statement.includes('pg_advisory_xact_lock')),
    ).toBeLessThan(
      statements.findIndex((statement) =>
        statement.includes('SELECT evidence.event, run.started_at'),
      ),
    );
  });
});
