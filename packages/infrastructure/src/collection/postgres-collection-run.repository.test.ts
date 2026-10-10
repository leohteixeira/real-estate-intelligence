import type { Transaction } from '@rei/application';
import { StaleCollectionCheckpointError } from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';

import type {
  DatabaseClient,
  DatabaseConnection,
} from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresCollectionRunRepository } from './postgres-collection-run.repository.js';

const input = {
  operationKey: 'operation-1',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  snapshotId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  parsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779213',
  sourceId: 'synthetic-data',
  sourceListingId: 'SYN-SP-0001',
  sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
  observedAt: '2026-10-10T11:59:59.000Z',
  startedAt: '2026-10-10T11:59:58.000Z',
  completedAt: '2026-10-10T12:00:00.000Z',
  contentHash: `sha256:${'1'.repeat(64)}`,
  objectKey: `synthetic/sha256/${'1'.repeat(64)}.json`,
  byteLength: 128,
  mediaType: 'application/json',
  manifestHash: `sha256:${'2'.repeat(64)}`,
} as const;

const resultRow = {
  operation_key: input.operationKey,
  source_id: input.sourceId,
  run_id: input.runId,
  snapshot_id: input.snapshotId,
  parsed_event_id: input.parsedEventId,
  completed_event_id: input.completedEventId,
  content_hash: input.contentHash,
  object_key: input.objectKey,
};

const runningRow = {
  pause_reason: null,
  paused_at: null,
  operation_key: input.operationKey,
  run_id: input.runId,
  source_id: 'synthetic-portal-aurora',
  status: 'running',
  started_at: new Date(input.startedAt),
  completed_at: null,
  observed_count: 1,
  parsed_count: 1,
  changed_count: 0,
  suppressed_count: 0,
  failed_count: 0,
  manifest_hash: null,
  completed_event_id: null,
  checkpoint_ordinal: 1,
  checkpoint_cursor: 'fixture:2026-10:1',
  checkpointed_at: new Date('2026-10-10T11:59:59.500Z'),
};

const completedRow = {
  ...runningRow,
  status: 'completed',
  completed_at: new Date(input.completedAt),
  observed_count: 2,
  parsed_count: 2,
  manifest_hash: input.manifestHash,
  completed_event_id: input.completedEventId,
  checkpoint_ordinal: 2,
  checkpoint_cursor: 'fixture:2026-10:2',
  checkpointed_at: new Date(input.completedAt),
};

const oneShotCompletedRow = {
  ...completedRow,
  source_id: input.sourceId,
  observed_count: 1,
  parsed_count: 1,
  checkpoint_ordinal: 1,
};

function connectionDouble(client: DatabaseClient, identity = {}) {
  return {
    leaseClient: async () => client,
    transactionIdentity: () => identity,
  } as unknown as DatabaseConnection;
}

describe('PostgresCollectionRunRepository', () => {
  const hold = { reason: 'captcha', heldAt: '2026-10-10T12:00:00.000Z' } as const;
  const pausedRow = {
    ...runningRow,
    status: 'paused',
    pause_reason: 'captcha',
    paused_at: new Date(hold.heldAt),
  };

  it.each([pausedRow, completedRow])(
    'pauses idempotently without changing the prefix or a completed winner',
    async (fixture) => {
      const query = vi.fn(async (sql: string) => (sql.startsWith('SELECT') ? [fixture] : []));
      const database = connectionDouble({ query, release: vi.fn() } as unknown as DatabaseClient);
      const repository = new PostgresCollectionRunRepository(database);
      const result = await new PostgresTransactionRunner(database).runInTransaction((transaction) =>
        repository.pause(transaction, input.runId, hold),
      );
      expect(result.status).toBe(fixture.status);
      expect(result.checkpoint.ordinal).toBe(fixture.checkpoint_ordinal);
      expect(query.mock.calls[1]?.[0]).toContain("AND status = 'running'");
    },
  );

  it.each(['missing', 'running', 'stale', 'success'] as const)(
    'requires explicit resumable state and guards updates: %s',
    async (mode) => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes("SET status = 'running'")) return mode === 'stale' ? [] : [runningRow];
        if (sql.startsWith('SELECT'))
          return mode === 'missing' ? [] : [mode === 'running' ? runningRow : pausedRow];
        return [];
      });
      const database = connectionDouble({ query, release: vi.fn() } as unknown as DatabaseClient);
      const repository = new PostgresCollectionRunRepository(database);
      // This test isolates the run transition; the source-lock contract is independently exercised above.
      const { PostgresSourceRegisterRepository } =
        await import('./postgres-source-register.repository.js');
      const guard = vi
        .spyOn(PostgresSourceRegisterRepository.prototype, 'assertCollectible')
        .mockResolvedValue();
      try {
        const result = new PostgresTransactionRunner(database).runInTransaction((transaction) =>
          repository.resume(transaction, input.runId),
        );
        if (mode === 'success')
          await expect(result).resolves.toMatchObject({
            runId: input.runId,
            status: 'running',
            pause: null,
            checkpoint: { ordinal: 1 },
          });
        else if (mode === 'stale')
          await expect(result).rejects.toThrow(StaleCollectionCheckpointError);
        else await expect(result).rejects.toThrow('Only a paused run');
        expect(guard).toHaveBeenCalledTimes(mode === 'success' || mode === 'stale' ? 1 : 0);
      } finally {
        guard.mockRestore();
      }
    },
  );

  it('fails a pause for a missing run and rejects incoherent pause metadata', async () => {
    const query = vi.fn(async () => []);
    const database = connectionDouble({ query, release: vi.fn() } as unknown as DatabaseClient);
    await expect(
      new PostgresTransactionRunner(database).runInTransaction((transaction) =>
        new PostgresCollectionRunRepository(database).pause(transaction, input.runId, hold),
      ),
    ).rejects.toThrow('not found');
    for (const fixture of [
      { ...pausedRow, paused_at: null },
      { ...runningRow, paused_at: new Date() },
    ]) {
      const repository = new PostgresCollectionRunRepository({
        query: vi.fn(async () => [fixture]),
      } as unknown as DatabaseConnection);
      await expect(repository.loadRunByOperationKey(input.operationKey)).rejects.toThrow();
    }
  });
  it('strictly hydrates a running checkpoint by operation key', async () => {
    const queryAbortable = vi.fn(async () => [runningRow]);
    const signal = new AbortController().signal;
    const repository = new PostgresCollectionRunRepository({
      queryAbortable,
    } as unknown as DatabaseConnection);

    await expect(repository.loadRunByOperationKey(input.operationKey, signal)).resolves.toEqual({
      pause: null,
      operationKey: input.operationKey,
      runId: input.runId,
      sourceId: 'synthetic-portal-aurora',
      status: 'running',
      startedAt: input.startedAt,
      completedAt: null,
      counts: { observed: 1, parsed: 1, changed: 0, suppressed: 0, failed: 0 },
      checkpoint: {
        ordinal: 1,
        cursor: 'fixture:2026-10:1',
        checkpointedAt: '2026-10-10T11:59:59.500Z',
      },
      manifestHash: null,
      completedEventId: null,
    });
    expect(queryAbortable).toHaveBeenCalledWith(expect.any(String), [input.operationKey], signal);
  });

  it('maps operation replay queries strictly', async () => {
    const queryAbortable = vi.fn(
      async (
        ...args: [statement: string, parameters?: readonly unknown[], signal?: AbortSignal]
      ) => {
        const [statement] = args;
        if (statement.includes('FROM collection.collection_run')) return [resultRow];
        return [];
      },
    );
    const signal = new AbortController().signal;
    const repository = new PostgresCollectionRunRepository({
      queryAbortable,
    } as unknown as DatabaseConnection);

    await expect(repository.findByOperationKey('operation-1', signal)).resolves.toMatchObject({
      operationKey: 'operation-1',
      sourceId: input.sourceId,
      runId: input.runId,
      contentHash: input.contentHash,
    });
    expect(queryAbortable).toHaveBeenCalledOnce();
    expect(
      queryAbortable.mock.calls.every(([, , receivedSignal]) => receivedSignal === signal),
    ).toBe(true);
  });

  it('uses the latest earlier completed observation including a failed parse baseline', async () => {
    const query = vi.fn(async (statement: string) =>
      statement === 'BEGIN' || statement === 'COMMIT' ? [] : [{ content_hash: input.contentHash }],
    );
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const database = connectionDouble(client);
    const repository = new PostgresCollectionRunRepository(database);
    const runner = new PostgresTransactionRunner(database);

    await expect(
      runner.runInTransaction((transaction) =>
        repository.findLatestCompletedContentHash(
          transaction,
          'synthetic-portal-aurora',
          input.runId,
          input.sourceListingId,
        ),
      ),
    ).resolves.toBe(input.contentHash);
    const statement = String(query.mock.calls[1]?.[0]);
    expect(statement).toContain("prior_run.status = 'completed'");
    expect(statement).not.toContain('observation.outcome');
    expect(statement).toContain('prior_run.run_id < $2');
    expect(statement).toContain('ORDER BY prior_run.completed_at DESC');
  });

  it('persists run, reusable object metadata, and observation through one transaction client', async () => {
    const query = vi.fn(async (...args: [statement: string, parameters?: readonly unknown[]]) => {
      const [statement] = args;
      if (statement === 'BEGIN' || statement === 'COMMIT') return [];
      if (statement.includes('INSERT INTO collection.collection_run')) {
        return [{ run_id: input.runId }];
      }
      if (statement.includes('INSERT INTO collection.raw_object')) return [];
      if (statement.includes('FROM collection.raw_object')) {
        return [
          {
            object_key: input.objectKey,
            byte_length: input.byteLength,
            media_type: input.mediaType,
            synthetic: true,
          },
        ];
      }
      if (statement.includes('INSERT INTO collection.snapshot_observation')) return [];
      throw new Error(`Unexpected SQL: ${statement}`);
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const repository = new PostgresCollectionRunRepository(connection);

    await expect(
      runner.runInTransaction((transaction) => repository.persistCompleted(transaction, input)),
    ).resolves.toMatchObject({ created: true, result: { operationKey: 'operation-1' } });
    expect(query.mock.calls.map(([statement]) => String(statement))).toEqual([
      'BEGIN',
      expect.stringContaining('INSERT INTO collection.collection_run'),
      expect.stringContaining('INSERT INTO collection.raw_object'),
      expect.stringContaining('FROM collection.raw_object'),
      expect.stringContaining('INSERT INTO collection.snapshot_observation'),
      'COMMIT',
    ]);
    const runInsert = query.mock.calls.find(([statement]) =>
      statement.includes('INSERT INTO collection.collection_run'),
    );
    expect(runInsert?.[1]).toEqual([
      input.runId,
      input.operationKey,
      input.sourceId,
      input.startedAt,
      input.completedAt,
      input.manifestHash,
      input.completedEventId,
    ]);
    const observationInsert = query.mock.calls.find(([statement]) =>
      statement.includes('INSERT INTO collection.snapshot_observation'),
    );
    expect(observationInsert?.[1]).toContain(input.parsedEventId);
    expect(input.manifestHash).not.toBe(input.contentHash);
  });

  it('returns the winning transaction result when operation-key insertion loses a race', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('INSERT INTO collection.collection_run')) return [];
      if (statement.includes('checkpoint_ordinal')) {
        return [oneShotCompletedRow];
      }
      if (statement.includes('FROM collection.collection_run')) return [resultRow];
      return [];
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const repository = new PostgresCollectionRunRepository(connection);

    await expect(
      runner.runInTransaction((transaction) => repository.persistCompleted(transaction, input)),
    ).resolves.toMatchObject({ created: false, result: { runId: input.runId } });
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('INSERT INTO collection.snapshot_observation'),
      ),
    ).toBe(false);
  });

  it('rejects a concurrent one-shot persist when the operation key belongs to another source', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement === 'BEGIN' || statement === 'ROLLBACK') return [];
      if (statement.includes('INSERT INTO collection.collection_run')) return [];
      if (statement.includes('checkpoint_ordinal')) {
        return [{ ...oneShotCompletedRow, source_id: 'synthetic-portal-aurora' }];
      }
      throw new Error(`Unexpected SQL after the source conflict: ${statement}`);
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const repository = new PostgresCollectionRunRepository(connection);

    await expect(
      runner.runInTransaction((transaction) => repository.persistCompleted(transaction, input)),
    ).rejects.toThrow('different source');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(
      query.mock.calls.some(([statement]) =>
        String(statement).includes('JOIN collection.snapshot_observation'),
      ),
    ).toBe(false);
  });

  it('rejects a concurrent one-shot persist when the same-source operation is still running', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement === 'BEGIN' || statement === 'ROLLBACK') return [];
      if (statement.includes('INSERT INTO collection.collection_run')) return [];
      if (statement.includes('checkpoint_ordinal')) {
        return [{ ...runningRow, source_id: input.sourceId }];
      }
      throw new Error(`Unexpected SQL after the running conflict: ${statement}`);
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const repository = new PostgresCollectionRunRepository(connection);

    await expect(
      runner.runInTransaction((transaction) => repository.persistCompleted(transaction, input)),
    ).rejects.toThrow('not a one-shot completed result');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });

  it('rejects mismatched metadata and lets the transaction runner roll everything back', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('INSERT INTO collection.collection_run')) {
        return [{ run_id: input.runId }];
      }
      if (statement.includes('FROM collection.raw_object')) {
        return [
          {
            object_key: 'different-key',
            byte_length: input.byteLength,
            media_type: input.mediaType,
            synthetic: true,
          },
        ];
      }
      return [];
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const repository = new PostgresCollectionRunRepository(connection);

    await expect(
      runner.runInTransaction((transaction: Transaction) =>
        repository.persistCompleted(transaction, input),
      ),
    ).rejects.toThrow('different raw object metadata');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });

  it('rejects a stale expected checkpoint under the page lock', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('FOR UPDATE')) return [runningRow];
      return [];
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const repository = new PostgresCollectionRunRepository(connection);

    await expect(
      runner.runInTransaction((transaction) =>
        repository.lockRunForPage(transaction, input.runId, 0, null),
      ),
    ).rejects.toThrow(StaleCollectionCheckpointError);
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });

  it('persists a terminal page and uses explicit PostgreSQL types for nullable CASE parameters', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('FROM collection.raw_object')) {
        return [
          {
            object_key: input.objectKey,
            byte_length: input.byteLength,
            media_type: input.mediaType,
            synthetic: true,
          },
        ];
      }
      if (statement.includes('UPDATE collection.collection_run')) return [completedRow];
      return [];
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const repository = new PostgresCollectionRunRepository(connection);

    await expect(
      runner.runInTransaction((transaction) =>
        repository.commitPage(transaction, {
          runId: input.runId,
          expectedOrdinal: 1,
          expectedCursor: 'fixture:2026-10:1',
          nextCursor: 'fixture:2026-10:2',
          checkpointedAt: input.completedAt,
          observations: [
            {
              snapshotId: input.snapshotId,
              parsedEventId: input.parsedEventId,
              sourceListingId: input.sourceListingId,
              sourceUrl: input.sourceUrl,
              observedAt: input.observedAt,
              contentHash: input.contentHash,
              objectKey: input.objectKey,
              byteLength: input.byteLength,
              mediaType: input.mediaType,
              outcome: 'parsed',
              changed: false,
              failureReason: null,
            },
          ],
          exhausted: true,
          completedAt: input.completedAt,
          manifestHash: input.manifestHash,
          completedEventId: input.completedEventId,
        }),
      ),
    ).resolves.toMatchObject({
      committed: true,
      run: { status: 'completed', checkpoint: { ordinal: 2 } },
    });

    const update = query.mock.calls.find(([statement]) =>
      statement.includes('UPDATE collection.collection_run'),
    )?.[0];
    expect(update).toContain('$10::boolean');
    expect(update).toContain('$11::timestamptz');
    expect(update).toContain('$12::text');
    expect(update).toContain('$13::uuid');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
});
