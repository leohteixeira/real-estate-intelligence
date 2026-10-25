import { ExternalFailure, SNAPSHOT_RETENTION_MS } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresSnapshotLifecycle } from './postgres-snapshot-lifecycle.js';

const row = {
  object_key: 'real/key',
  acquisition_scope: 'a'.repeat(64),
  source_id: 'fixture',
  content_hash: `sha256:${'b'.repeat(64)}`,
  byte_length: 100,
  media_type: 'application/json',
  key_id: 'fixture-key',
  collected_at: new Date('2026-10-10T00:00:00Z'),
  expires_at: new Date('2026-11-09T00:00:00Z'),
  available: false,
  deleted: false,
} as const;
const input = {
  objectKey: row.object_key,
  acquisitionScope: row.acquisition_scope,
  sourceId: row.source_id,
  contentHash: row.content_hash,
  byteLength: row.byte_length,
  mediaType: row.media_type,
  keyId: row.key_id,
  collectedAt: row.collected_at.toISOString(),
} as const;

function fixture(overrides: Partial<typeof row> = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT byte_length'))
      return [{ byte_length: row.byte_length, media_type: row.media_type }];
    if (sql.startsWith('SELECT') || sql.startsWith('WITH')) return [{ ...row, ...overrides }];
    return [];
  });
  const release = vi.fn();
  const identity = {};
  const connection = {
    leaseClient: async () => ({ query, release }),
    transactionIdentity: () => identity,
    queryAbortable: query,
  } as unknown as DatabaseConnection;
  return { repository: new PostgresSnapshotLifecycle(connection), query, release };
}

describe('PostgresSnapshotLifecycle', () => {
  it('reserves immutable metadata with a fixed deadline and returns the original timestamp on retry', async () => {
    const f = fixture();
    const result = await f.repository.reserve(
      { ...input, collectedAt: '2026-10-11T00:00:00Z' },
      new AbortController().signal,
    );
    expect(result.collectedAt).toBe(input.collectedAt);
    expect(Date.parse(result.expiresAt) - Date.parse(result.collectedAt)).toBe(
      SNAPSHOT_RETENTION_MS,
    );
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('ON CONFLICT (acquisition_scope) DO NOTHING'),
      ),
    ).toBe(true);
    expect(f.query).toHaveBeenLastCalledWith('COMMIT');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('rejects changed acquisition identity and rolls back before releasing the lease', async () => {
    const f = fixture();
    await expect(
      f.repository.reserve({ ...input, keyId: 'changed-key' }, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(f.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('holds the generation lock while confirming availability or deletion in the same transaction', async () => {
    const f = fixture();
    await f.repository.withGeneration(
      row.object_key,
      new AbortController().signal,
      async (generation, transaction) => {
        expect(generation.available).toBe(false);
        await f.repository.markAvailable(transaction, generation.objectKey);
        await f.repository.markDeleted(
          transaction,
          generation.objectKey,
          '2026-11-09T00:05:00.000Z',
        );
      },
    );
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(
      expect.arrayContaining([
        'SELECT * FROM collection.snapshot_generation WHERE object_key = $1 FOR UPDATE',
        'UPDATE collection.snapshot_generation SET available = true WHERE object_key = $1 AND NOT deleted',
        'UPDATE collection.snapshot_generation SET available = false, deleted = true, next_reconciliation_at = $2 WHERE object_key = $1',
      ]),
    );
  });

  it('uses bounded expiry scans, includes unconfirmed reservations, and maps cancellation safely', async () => {
    const f = fixture();
    expect(
      await f.repository.listExpired(
        row.expires_at.toISOString(),
        10,
        new AbortController().signal,
      ),
    ).toEqual([row.object_key]);
    expect(f.query.mock.calls[0]?.[0]).toContain(
      'COALESCE(next_reconciliation_at, CASE WHEN suppressed THEN $1 ELSE expires_at END) <= $1',
    );
    expect(f.query.mock.calls[0]?.[0]).not.toContain('NOT deleted');
    expect(f.query.mock.calls[0]?.[0]).toContain('ORDER BY selection_order, object_key LIMIT $2');
    expect(f.query.mock.calls[0]?.[0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(f.query.mock.calls[0]?.[0]).toContain(
      "SET selection_order = nextval('collection.snapshot_selection_order')",
    );
    expect(f.query.mock.calls[0]?.[0]).not.toContain('SET next_reconciliation_at');
    expect(f.query.mock.calls[0]?.[0]).not.toContain('SET deleted');
    for (const limit of [0, 1001, 1.5])
      await expect(
        f.repository.listExpired(input.collectedAt, limit, new AbortController().signal),
      ).rejects.toThrow(RangeError);
    f.query.mockRejectedValueOnce(new Error('private driver error'));
    await expect(
      f.repository.listExpired(input.collectedAt, 1, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'transient', message: expect.not.stringContaining('private') });
    const controller = new AbortController();
    controller.abort();
    await expect(f.repository.reserve(input, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    await expect(
      f.repository.withGeneration(row.object_key, controller.signal, async () => undefined),
    ).rejects.toBeInstanceOf(ExternalFailure);
  });
});
