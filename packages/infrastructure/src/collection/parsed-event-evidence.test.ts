import type { SourceRegisterRepository, Transaction } from '@rei/application';
import {
  CollectionSnapshotCorrected,
  CollectionSnapshotParsed,
  parseCollectionEvent,
  parseSha256Hash,
  parseUuidV7,
} from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresCollectionFacade } from './postgres-collection.facade.js';
import { PostgresParsedEventEvidence } from './postgres-parsed-event-evidence.js';
import { SYNTHETIC_LISTING_BYTES } from './synthetic-listing-source.js';

const id = (n: number) => parseUuidV7(`0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`);
const original = new CollectionSnapshotParsed({
  eventId: id(3),
  aggregateId: id(2),
  occurredAt: '2026-10-10T12:00:00.000Z',
  payload: {
    run: { runId: id(1) },
    snapshot: { snapshotId: id(2), contentHash: parseSha256Hash(`sha256:${'a'.repeat(64)}`) },
    source: {
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-SP-0001',
      sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
      observedAt: '2026-10-10T11:59:59.000Z',
    },
    listing: JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
  },
});
const correction = new CollectionSnapshotCorrected({
  ...original,
  eventId: id(4),
  occurredAt: '2026-10-10T13:00:00.000Z',
  payload: {
    ...original.payload,
    correction: {
      kind: 'parser-correction',
      operationKey: 'correction-1',
      parserRevision: 'v2',
      originalParsedEventId: original.eventId,
      order: 1,
    },
  },
});

function fixture(event = original as CollectionSnapshotParsed | CollectionSnapshotCorrected) {
  const row = {
    event: { ...event },
    original_event_id: original.eventId,
    run_id: original.payload.run.runId,
    source_id: original.payload.source.sourceId,
    source_listing_id: original.payload.source.sourceListingId,
    source_url: original.payload.source.sourceUrl,
    observed_at: new Date(original.payload.source.observedAt),
    content_hash: original.payload.snapshot.contentHash,
    image_fingerprints: [...original.payload.listing.imageFingerprints],
  };
  const query = vi.fn(async (sql: string) =>
    sql.includes('FROM collection.parsed_event_evidence')
      ? [row]
      : sql.includes('FROM collection.snapshot_reparse')
        ? [{ operation_key: 'correction-1' }]
        : [],
  );
  const identity = {};
  const connection = {
    transactionIdentity: () => identity,
    leaseClient: async () => ({ query, release: vi.fn() }),
  } as unknown as DatabaseConnection;
  const facade = new PostgresCollectionFacade(connection, {} as SourceRegisterRepository);
  const verify = (received = event) =>
    new PostgresTransactionRunner(connection).runInTransaction((tx) =>
      facade.verifyParsedEvent(tx, received),
    );
  return { row, query, connection, facade, verify };
}
describe('collection-owned strict publication evidence', () => {
  it('verifies full publication and original authority inside the caller transaction without requiring completed runs', async () => {
    const f = fixture();
    expect(await f.verify()).toBe(true);
    const sql = f.query.mock.calls.find(([statement]) =>
      statement.includes('FROM collection.parsed_event_evidence'),
    )![0];
    expect(sql).toContain('FOR SHARE OF evidence, observation, run, source');
    expect(sql).toContain("source.source_category = 'synthetic-listing'");
    expect(sql).toContain("source.access_method = 'repository-fixture'");
    expect(sql).toContain('source.hold_reason IS NULL');
    expect(sql).toContain('source.enabled AND source.collection_allowed');
    expect(sql).not.toContain("run.status = 'completed'");
    await expect(f.facade.verifyParsedEvent({} as Transaction, original)).rejects.toThrow(
      'own PostgreSQL',
    );
  });
  it('refuses missing authority and unowned sources rather than recovering from outbox or fixtures', async () => {
    const f = fixture();
    f.query.mockResolvedValue([]);
    expect(await f.verify()).toBe(false);
    expect(
      await f.verify(
        new CollectionSnapshotParsed({
          ...original,
          payload: {
            ...original.payload,
            source: { ...original.payload.source, sourceId: 'real-source' },
          },
        }),
      ),
    ).toBe(false);
  });
  it.each([
    'run_id',
    'source_id',
    'source_listing_id',
    'source_url',
    'observed_at',
    'content_hash',
    'image_fingerprints',
    'original_event_id',
  ] as const)('refuses a changed original %s', async (field) => {
    const f = fixture();
    Object.assign(f.row, {
      [field]:
        field === 'image_fingerprints'
          ? []
          : field === 'observed_at'
            ? new Date('2026-10-09T00:00:00Z')
            : 'changed',
    });
    expect(await f.verify()).toBe(false);
  });
  it('refuses forged canonical publication fields including emitted time, trace, price, attributes and description', async () => {
    const f = fixture();
    for (const wire of [
      { ...original, occurredAt: '2026-10-10T12:01:00.000Z' },
      {
        ...original,
        traceContext: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      },
      ...[
        { askingPriceMinorUnits: 1 },
        { bedrooms: 3 },
        { maskedDescription: 'Forged.' },
        { features: [] },
      ].map((values) => ({
        ...original,
        payload: { ...original.payload, listing: { ...original.payload.listing, ...values } },
      })),
    ]) {
      expect(await f.verify(parseCollectionEvent(wire) as CollectionSnapshotParsed)).toBe(false);
    }
  });
  it('requires completed exact correction identity, order/revision/operation and original parsed event', async () => {
    const f = fixture(correction);
    expect(await f.verify()).toBe(true);
    expect(
      f.query.mock.calls.some(([sql]) => sql.includes('completed_at IS NOT NULL FOR SHARE')),
    ).toBe(true);
    for (const change of [
      { order: 2 },
      { parserRevision: 'other' },
      { operationKey: 'other' },
      { originalParsedEventId: id(8) },
    ]) {
      expect(
        await f.verify(
          new CollectionSnapshotCorrected({
            ...correction,
            payload: {
              ...correction.payload,
              correction: { ...correction.payload.correction, ...change },
            },
          }),
        ),
      ).toBe(false);
    }
    f.query.mockImplementation(async (sql) =>
      sql.includes('FROM collection.parsed_event_evidence') ? [f.row] : [],
    );
    expect(await f.verify()).toBe(false);
    f.row.original_event_id = id(8);
    expect(await f.verify()).toBe(false);
  });
  it('appends canonical v1/v2 evidence in the legal transaction and rolls it back on publication failure', async () => {
    const committed: unknown[] = [];
    let working: unknown[] = [];
    const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
      if (sql === 'BEGIN') working = [...committed];
      if (sql.startsWith('INSERT')) working.push(JSON.parse(params![3] as string));
      if (sql === 'COMMIT') committed.splice(0, committed.length, ...working);
      return [];
    });
    const identity = {};
    const connection = {
      transactionIdentity: () => identity,
      leaseClient: async () => ({ query, release: vi.fn() }),
    } as unknown as DatabaseConnection;
    const runner = new PostgresTransactionRunner(connection);
    const evidence = new PostgresParsedEventEvidence(connection);
    await expect(
      runner.runInTransaction(async (tx) => {
        await evidence.appendParsedEvidence(tx, [original, correction]);
        throw new Error('Outbox failed.');
      }),
    ).rejects.toThrow('Outbox failed.');
    expect(committed).toEqual([]);
    expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
    await runner.runInTransaction((tx) =>
      evidence.appendParsedEvidence(tx, [original, correction]),
    );
    expect(committed.map((wire) => parseCollectionEvent(wire).version)).toEqual([1, 2]);
    await expect(
      runner.runInTransaction((tx) =>
        evidence.appendParsedEvidence(tx, [
          { ...original, extra: true } as CollectionSnapshotParsed,
        ]),
      ),
    ).rejects.toThrow();
    expect(committed).toHaveLength(2);
  });
});
