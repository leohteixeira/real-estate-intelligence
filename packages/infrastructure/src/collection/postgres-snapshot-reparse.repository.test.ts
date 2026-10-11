import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ReparseObservation } from '@rei/application';
import {
  PostgresSnapshotReparseRepository,
  verifySnapshotReparseBytes,
} from './postgres-snapshot-reparse.repository.js';
import { InMemorySnapshotReparseRepository } from './in-memory-snapshot-reparse.repository.js';
import type {
  DatabaseClient,
  DatabaseConnection,
} from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
const id = '0199c8f2-2394-7ba0-8f9e-286378779211' as ReparseObservation['snapshotId'];
function fixture(value: unknown = { imageFingerprints: [] }, synthetic = true) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash =
    `sha256:${createHash('sha256').update(bytes).digest('hex')}` as ReparseObservation['contentHash'];
  const observation: ReparseObservation = {
    snapshotId: id,
    runId: id,
    originalParsedEventId: id,
    sourceId: 'synthetic-data',
    sourceListingId: 'fixture',
    sourceUrl: 'https://synthetic.invalid/fixture',
    observedAt: '2026-10-10T00:00:00.000Z',
    objectKey: `synthetic/sha256/${hash.slice(7)}.json`,
    contentHash: hash,
    byteLength: bytes.byteLength,
    mediaType: 'application/json',
    imageFingerprints: null,
    synthetic,
  };
  return { bytes, observation };
}
describe('snapshot reparse evidence', () => {
  it.each([
    'reserve',
    'lock',
    'replay',
    'conflict',
    'missing',
    'changed',
    'overflow',
    'complete',
    'stale-complete',
  ] as const)('guards transactional SQL correction state: %s', async (mode) => {
    const { observation } = fixture();
    const identity = { snapshotId: id, parserRevision: 'rev', operationKey: 'op' };
    const row = {
      snapshot_id: id,
      run_id: id,
      parsed_event_id: id,
      content_hash: observation.contentHash,
      object_key: observation.objectKey,
      source_listing_id: observation.sourceListingId,
      source_url: observation.sourceUrl,
      observed_at: new Date(observation.observedAt),
      image_fingerprints: [],
      correction_order: mode === 'overflow' ? 2_147_483_647 : 2,
      outcome: 'parsed',
      source_id: 'synthetic-data',
      source_category: 'synthetic-listing',
      byte_length: observation.byteLength,
      media_type: 'application/json',
    };
    const operation = {
      operation_key: 'op',
      snapshot_id: id,
      parser_revision: mode === 'conflict' ? 'other' : 'rev',
      event_id: mode === 'replay' ? id : null,
      correction_order: mode === 'replay' ? 2 : null,
      completed_at: mode === 'replay' ? new Date() : null,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM collection.snapshot_observation AS observation'))
        return mode === 'missing' ? [] : [row];
      if (sql.startsWith('SELECT operation_key')) return [operation];
      if (sql.includes('RETURNING operation_key'))
        return mode === 'stale-complete' ? [] : [{ operation_key: 'op' }];
      return [];
    });
    const connection = {
      leaseClient: async () => ({ query, release: vi.fn() }) as unknown as DatabaseClient,
      transactionIdentity: () => connection,
    } as unknown as DatabaseConnection;
    const repository = new PostgresSnapshotReparseRepository(connection);
    const work = new PostgresTransactionRunner(connection).runInTransaction((transaction) => {
      if (mode === 'complete' || mode === 'stale-complete')
        return repository.complete(transaction, {
          ...identity,
          eventId: id,
          order: 3,
          replayed: false,
        });
      if (mode === 'reserve' || mode === 'changed')
        return repository.reserve(
          transaction,
          identity,
          mode === 'changed' ? { ...observation, sourceListingId: 'changed' } : observation,
          [],
        );
      return repository.lockForCommit(transaction, identity);
    });
    if (['conflict', 'missing', 'changed', 'overflow', 'stale-complete'].includes(mode)) {
      await expect(work).rejects.toBeDefined();
      expect(query).toHaveBeenCalledWith('ROLLBACK');
    } else {
      const result = await work;
      if (mode !== 'complete') expect(result).toBeDefined();
      expect(query).toHaveBeenCalledWith('COMMIT');
      if (mode === 'lock')
        expect(query).toHaveBeenCalledWith(expect.stringContaining('SET correction_order'), [
          id,
          3,
        ]);
    }
  });
  it('recovers intentional empty legacy evidence independently of parser and outbox', () => {
    const { bytes, observation } = fixture();
    expect(verifySnapshotReparseBytes(observation, bytes)).toEqual([]);
    expect(
      verifySnapshotReparseBytes({ ...observation, imageFingerprints: ['fixture:trusted'] }, bytes),
    ).toEqual(['fixture:trusted']);
  });
  it.each([
    {},
    [],
    null,
    { imageFingerprints: null },
    { imageFingerprints: ['duplicate', 'duplicate'] },
    { imageFingerprints: Array.from({ length: 101 }, (_, i) => String(i)) },
    { imageFingerprints: [1] },
  ])('rejects unknown or invalid legacy provenance %j', (value) => {
    const { bytes, observation } = fixture(value);
    expect(() => verifySnapshotReparseBytes(observation, bytes)).toThrow();
  });
  it('rejects tampered hash, length, malformed UTF-8 and noncryptographic real evidence', () => {
    const { bytes, observation } = fixture({ imageFingerprints: ['invented'] }, false);
    expect(() => verifySnapshotReparseBytes(observation, bytes)).toThrow();
    expect(() =>
      verifySnapshotReparseBytes({ ...observation, synthetic: true }, Uint8Array.of(255)),
    ).toThrow();
    const malformed = Uint8Array.of(255);
    expect(() =>
      verifySnapshotReparseBytes(
        {
          ...observation,
          synthetic: true,
          byteLength: 1,
          contentHash: `sha256:${createHash('sha256').update(malformed).digest('hex')}`,
        },
        malformed,
      ),
    ).toThrow();
    expect(() =>
      verifySnapshotReparseBytes({ ...observation, synthetic: true, byteLength: 1 }, bytes),
    ).toThrow();
    const corrupt = Uint8Array.from(bytes);
    corrupt[0] = 0;
    expect(() =>
      verifySnapshotReparseBytes({ ...observation, synthetic: true }, corrupt),
    ).toThrow();
    expect(
      verifySnapshotReparseBytes(
        fixture({ imageFingerprints: [`sha256:${'a'.repeat(64)}`] }, false).observation,
        fixture({ imageFingerprints: [`sha256:${'a'.repeat(64)}`] }, false).bytes,
      ),
    ).toHaveLength(1);
  });
  it('strictly rejects malformed database metadata and operation state', async () => {
    const queryAbortable = vi.fn(async () => [{ snapshot_id: id }]);
    const repository = new PostgresSnapshotReparseRepository({
      queryAbortable,
    } as unknown as DatabaseConnection);
    await expect(
      repository.findObservation(id, new AbortController().signal),
    ).rejects.toBeDefined();
    await expect(
      repository.findOperation('op', new AbortController().signal),
    ).rejects.toBeDefined();
    queryAbortable.mockResolvedValue([]);
    expect(await repository.findObservation(id, new AbortController().signal)).toBeNull();
    queryAbortable.mockResolvedValue([{ snapshot_id: id }, { snapshot_id: id }]);
    await expect(
      repository.findOperation('op', new AbortController().signal),
    ).rejects.toBeDefined();
  });
  it('fake preserves owned identity, unavailable evidence and increasing order', async () => {
    const { observation } = fixture();
    const fake = new InMemorySnapshotReparseRepository([observation]);
    const identity = { snapshotId: id, parserRevision: 'rev', operationKey: 'op' };
    const transaction = {} as Parameters<typeof fake.reserve>[0];
    await fake.reserve(transaction, identity, observation, []);
    expect((await fake.lockForCommit(transaction, identity)).order).toBe(1);
    await fake.complete(transaction, { ...identity, eventId: id, order: 1, replayed: false });
    expect((await fake.findOperation('op', new AbortController().signal))?.result?.order).toBe(1);
    await expect(
      fake.reserve(transaction, { ...identity, parserRevision: 'other' }, observation, []),
    ).rejects.toBeDefined();
    await fake.reserve(transaction, { ...identity, operationKey: 'second' }, observation, []);
    expect(
      (await fake.lockForCommit(transaction, { ...identity, operationKey: 'second' })).order,
    ).toBe(2);
    fake.unavailable.add(id);
    await expect(
      fake.lockForCommit(transaction, { ...identity, operationKey: 'second' }),
    ).rejects.toBeDefined();
  });
});
