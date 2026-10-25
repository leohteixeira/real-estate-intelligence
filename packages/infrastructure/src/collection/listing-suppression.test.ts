import { describe, expect, it, vi } from 'vitest';
import { parseUuidV7 } from '@rei/domain';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresListingSuppression } from './postgres-listing-suppression.js';
import { InMemoryListingSuppression } from './in-memory-listing-suppression.js';

const identity = { sourceId: 'synthetic-data', sourceListingId: 'one' };
const record = {
  ...identity,
  suppressionId: parseUuidV7('0199c8f2-2394-7000-8000-000000000001'),
  eventId: parseUuidV7('0199c8f2-2394-7000-8000-000000000002'),
  suppressedAt: '2026-10-25T00:00:00.000Z',
  completed: false,
};

it('keeps one suppression identity and object references until explicit cleanup completion', async () => {
  const repository = new InMemoryListingSuppression();
  const key = JSON.stringify([identity.sourceId, identity.sourceListingId]);
  repository.objects.set(key, ['synthetic/one']);
  const query = vi.fn(async () => []);
  const connection = {
    transactionIdentity: () => connection,
    leaseClient: async () => ({ query, release: vi.fn() }),
  } as unknown as DatabaseConnection;
  await new PostgresTransactionRunner(connection).runInTransaction(async (transaction) => {
    expect(await repository.record(transaction, record)).toEqual({
      suppression: record,
      created: true,
    });
    expect(
      (await repository.record(transaction, { ...record, suppressedAt: '2026-10-26T00:00:00Z' }))
        .suppression,
    ).toEqual(record);
    expect(await repository.lockAndCheck(transaction, identity)).toBe(true);
    expect(await repository.isSuppressed(identity, AbortSignal.timeout(1000))).toBe(true);
    expect(await repository.listObjectKeys(identity, AbortSignal.timeout(1000))).toEqual([
      'synthetic/one',
    ]);
    await repository.eraseCollectedData(transaction, identity);
    await repository.complete(transaction, identity);
    expect(await repository.listObjectKeys(identity, AbortSignal.timeout(1000))).toEqual([]);
    expect(repository.erased).toEqual([identity]);
    expect(repository.records.get(key)).toEqual({ ...record, completed: true });
  });
  const controller = new AbortController();
  controller.abort();
  await expect(repository.isSuppressed(identity, controller.signal)).rejects.toBeDefined();
});

describe('PostgresListingSuppression', () => {
  it.each([true, false])(
    'locks permanent identity, reuses canonical timestamps and scopes erasure to owned objects: created=%s',
    async (created) => {
      let suppressed = false;
      const query = vi.fn(async (sql: string) => {
        if (sql.startsWith('SELECT 1 FROM collection.listing_suppression'))
          return suppressed ? [{}] : [];
        if (sql.startsWith('INSERT INTO collection.listing_suppression')) {
          suppressed = true;
          return created ? [{ suppression_id: record.suppressionId }] : [];
        }
        if (sql.startsWith('SELECT * FROM collection.listing_suppression'))
          return [
            {
              suppression_id: record.suppressionId,
              event_id: record.eventId,
              suppressed_at: new Date(record.suppressedAt),
              completed_at: created ? null : new Date(),
            },
          ];
        if (sql.startsWith('SELECT object_key FROM collection.snapshot_generation'))
          return [{ object_key: 'synthetic/one' }];
        if (sql.startsWith('SELECT observation.object_key,observation.content_hash'))
          return [{ object_key: 'synthetic/one', content_hash: 'sha256:owned' }];
        return [];
      });
      const connection = {
        transactionIdentity: () => connection,
        leaseClient: async () => ({ query, release: vi.fn() }),
        queryAbortable: query,
      } as unknown as DatabaseConnection;
      const repository = new PostgresListingSuppression(connection);
      const transactions = new PostgresTransactionRunner(connection);
      expect(await repository.isSuppressed(identity, AbortSignal.timeout(1000))).toBe(false);
      await transactions.runInTransaction(async (tx) => {
        expect(await repository.lockAndCheck(tx, identity)).toBe(false);
        expect(await repository.record(tx, record)).toEqual({
          created,
          suppression: { ...record, completed: !created },
        });
        expect(await repository.lockAndCheck(tx, identity)).toBe(true);
        expect(await repository.listObjectKeys(identity, AbortSignal.timeout(1000))).toEqual([
          'synthetic/one',
        ]);
        await repository.eraseCollectedData(tx, identity);
        await repository.complete(tx, identity);
      });
      const statements = query.mock.calls.map(([sql]) => sql);
      expect(statements.findIndex((sql) => sql.startsWith('SELECT pg_advisory'))).toBeLessThan(
        statements.findIndex((sql) => sql.startsWith('INSERT INTO collection.listing_suppression')),
      );
      expect(
        statements.findIndex((sql) =>
          sql.startsWith('INSERT INTO collection.run_listing_identity'),
        ),
      ).toBeLessThan(
        statements.findIndex((sql) =>
          sql.startsWith('DELETE FROM collection.snapshot_observation'),
        ),
      );
      const deletes = statements.filter((sql) => sql.startsWith('DELETE FROM collection.'));
      expect(deletes).toHaveLength(6);
      expect(deletes.every((sql) => sql.includes('$1'))).toBe(true);
      expect(statements.join('\n')).not.toMatch(
        /DELETE FROM (?:audit|platform|properties|market)\./,
      );
    },
  );
});
