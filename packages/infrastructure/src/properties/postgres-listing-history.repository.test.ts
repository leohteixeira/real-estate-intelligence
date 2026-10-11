import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ListingChronology, CollectionSnapshotCorrected } from '@rei/domain';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresListingHistoryRepository } from './postgres-listing-history.repository.js';
import { initialEvent, initialProperty, fixtureId } from './property.test-fixture.js';

describe('PostgresListingHistoryRepository durable scoped history', () => {
  it('atomically stores originals, immutable events, run effects, corrections and current state in its own schema', async () => {
    const property = await initialProperty();
    const chronology = new ListingChronology(
      property,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    const state = chronology.state;
    const row = {
      property_id: property.propertyId,
      listing_id: property.listingId,
      event: { ...initialEvent },
      resolved_place: property.resolved,
      state,
    };
    let absent = false;
    const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => {
      void _params;
      return sql.includes('SELECT source_listing_id')
        ? [{ source_listing_id: 'SYN-SP-0001' }]
        : sql.includes('SELECT property.property_id')
          ? absent
            ? []
            : [row]
          : sql.includes('SELECT run_id')
            ? absent
              ? []
              : [{ run_id: fixtureId(1) }]
            : [];
    });
    const identity = {};
    const connection = {
      transactionIdentity: () => identity,
      leaseClient: async () => ({ query, release: vi.fn() }),
    } as unknown as DatabaseConnection;
    const repository = new PostgresListingHistoryRepository(connection);
    await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
      await repository.enqueue(tx, 'synthetic-data');
      expect(
        await repository.listingIdentities(tx, 'synthetic-data', ['SYN-SP-0001'], null, 25),
      ).toEqual(['SYN-SP-0001']);
      expect((await repository.load(tx, 'synthetic-data', 'SYN-SP-0001'))?.state).toEqual(state);
      expect(await repository.appliedRun(tx, 'synthetic-data', 'SYN-SP-0001', fixtureId(1))).toBe(
        true,
      );
      await repository.save(tx, property, state, [property.creationEvent(fixtureId(88))]);
      await repository.retainCreation(tx, property.creationEvent(fixtureId(88)));
      await repository.markRun(tx, 'synthetic-data', 'SYN-SP-0001', fixtureId(1));
      await repository.markCorrection(tx, fixtureId(99));
      absent = true;
      expect(await repository.load(tx, 'synthetic-data', 'absent')).toBeNull();
      expect(await repository.appliedRun(tx, 'synthetic-data', 'absent', fixtureId(1))).toBe(false);
    });
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).not.toMatch(/collection\.|locations\.|platform\./);
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain('ON CONFLICT (listing_id) DO UPDATE');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('rotates bounded source work with compare-and-swap progress and retains valid pending corrections', async () => {
    const signal = new AbortController().signal;
    const corrected = new CollectionSnapshotCorrected({
      eventId: fixtureId(44),
      aggregateId: initialEvent.aggregateId,
      occurredAt: '2026-10-11T12:00:00.000Z',
      payload: {
        ...initialEvent.payload,
        correction: {
          kind: 'parser-correction',
          operationKey: 'owned-correction',
          parserRevision: 'parser-2',
          order: 1,
          originalParsedEventId: initialEvent.eventId,
        },
      },
    });
    const queryAbortable = vi.fn(
      async (sql: string, _params?: readonly unknown[], _signal?: AbortSignal) => {
        void _params;
        void _signal;
        return sql.includes('SELECT source_id')
          ? [
              {
                source_id: 'synthetic-data',
                last_started_at: null,
                last_run_id: null,
                listing_cursor: null,
              },
              {
                source_id: 'synthetic-sp-portal-a',
                last_started_at: new Date('2026-10-10T12:00:00.000Z'),
                last_run_id: fixtureId(1),
                listing_cursor: 'A',
              },
            ]
          : sql.includes('SELECT fact.event')
            ? [{ event: { ...corrected } }, { event: { ...initialEvent } }]
            : [];
      },
    );
    const query = vi.fn(async (_sql: string, params?: readonly unknown[]) =>
      params?.[0] === 'missing' ? [] : [{ state: { revision: 1 } }],
    );
    const repository = new PostgresListingHistoryRepository({
      queryAbortable,
      query,
    } as unknown as DatabaseConnection);
    const work = await repository.nextSources(2, signal);
    expect(work[0]).toEqual({ sourceId: 'synthetic-data', after: null, listingCursor: null });
    expect(work[1]?.after?.startedAt).toBe('2026-10-10T12:00:00.000Z');
    await repository.progress(work[0]!, null, null, signal);
    await repository.progress(
      work[1]!,
      null,
      { startedAt: '2026-10-11T12:00:00.000Z', runId: fixtureId(4) },
      signal,
    );
    expect(queryAbortable.mock.calls[1]?.[0]).toContain('IS NOT DISTINCT FROM');
    expect(queryAbortable.mock.calls[2]?.[1]?.slice(4)).toEqual([
      '2026-10-11T12:00:00.000Z',
      fixtureId(4),
      null,
    ]);
    expect(await repository.pendingCorrections('synthetic-data', 25, signal)).toEqual([corrected]);
    expect(await repository.getState('existing')).toEqual({ revision: 1 });
    expect(await repository.getState('missing')).toBeNull();
    expect(queryAbortable.mock.calls.every((call) => call[2] === signal)).toBe(true);
  });
});
