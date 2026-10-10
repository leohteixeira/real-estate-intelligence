import type { Transaction } from '@rei/application';
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
  run_id: input.runId,
  snapshot_id: input.snapshotId,
  parsed_event_id: input.parsedEventId,
  completed_event_id: input.completedEventId,
  content_hash: input.contentHash,
  object_key: input.objectKey,
};

function connectionDouble(client: DatabaseClient, identity = {}) {
  return {
    leaseClient: async () => client,
    transactionIdentity: () => identity,
  } as unknown as DatabaseConnection;
}

describe('PostgresCollectionRunRepository', () => {
  it('maps operation replay and source registration queries strictly', async () => {
    const queryAbortable = vi.fn(
      async (
        ...args: [statement: string, parameters?: readonly unknown[], signal?: AbortSignal]
      ) => {
        const [statement] = args;
        if (statement.includes('FROM collection.collection_run')) return [resultRow];
        return [
          {
            source_id: 'synthetic-data',
            enabled: true,
            collection_allowed: true,
            source_kind: 'synthetic',
          },
        ];
      },
    );
    const signal = new AbortController().signal;
    const repository = new PostgresCollectionRunRepository({
      queryAbortable,
    } as unknown as DatabaseConnection);

    await expect(repository.findByOperationKey('operation-1', signal)).resolves.toMatchObject({
      operationKey: 'operation-1',
      runId: input.runId,
      contentHash: input.contentHash,
    });
    await expect(repository.findSource('synthetic-data', signal)).resolves.toEqual({
      sourceId: 'synthetic-data',
      enabled: true,
      collectionAllowed: true,
      synthetic: true,
    });
    expect(queryAbortable).toHaveBeenCalledTimes(2);
    expect(
      queryAbortable.mock.calls.every(([, , receivedSignal]) => receivedSignal === signal),
    ).toBe(true);
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
      input.parsedEventId,
      input.completedEventId,
    ]);
    expect(input.manifestHash).not.toBe(input.contentHash);
  });

  it('returns the winning transaction result when operation-key insertion loses a race', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('INSERT INTO collection.collection_run')) return [];
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
});
