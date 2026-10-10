import type { Transaction } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient, DatabaseConnection } from './database-connection.js';
import { mapOutboxRow, PostgresOutbox } from './postgres-outbox.js';
import { PostgresTransactionRunner } from './postgres-transaction.js';
import { PostgresUuidV7Generator } from './postgres-uuid-v7-generator.js';

function connectionDouble(client: DatabaseClient, identity = {}) {
  return {
    leaseClient: async () => client,
    transactionIdentity: () => identity,
  } as unknown as DatabaseConnection;
}

describe('PostgreSQL persistence adapters', () => {
  it('begins, commits, and releases the exact leased client', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const runner = new PostgresTransactionRunner(
      connectionDouble({ query, release } as unknown as DatabaseClient),
    );

    await expect(runner.runInTransaction(async () => 'committed')).resolves.toBe('committed');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'COMMIT']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases when work fails', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const runner = new PostgresTransactionRunner(
      connectionDouble({ query, release } as unknown as DatabaseClient),
    );

    await expect(
      runner.runInTransaction(async () => Promise.reject(new Error('forced failure'))),
    ).rejects.toThrow('forced failure');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects a transaction scope owned by another connection', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const owner = connectionDouble(client);
    const other = connectionDouble(client);
    const runner = new PostgresTransactionRunner(owner);
    const identifiers = new PostgresUuidV7Generator(other);

    await expect(
      runner.runInTransaction(async (transaction: Transaction) =>
        identifiers.generate(transaction),
      ),
    ).rejects.toThrow('belongs to another pool');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('appends through the transaction client and validates generated UUIDv7 values', async () => {
    const query = vi.fn(async (statement: string) =>
      statement.startsWith('SELECT uuidv7') ? [{ id: '0199c8f2-2394-7ba0-8f9e-286378779219' }] : [],
    );
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const identifiers = new PostgresUuidV7Generator(connection);
    const outbox = new PostgresOutbox(connection);

    await runner.runInTransaction(async (transaction) => {
      const id = await identifiers.generate(transaction);
      await outbox.append(transaction, [
        {
          eventId: id,
          type: 'audit.trace.requested',
          version: 1,
          aggregateId: id,
          occurredAt: '2026-10-10T12:30:00.000Z',
          traceContext: null,
          payload: {},
        },
      ]);
    });

    expect(
      query.mock.calls.some(([statement]) => String(statement).includes('platform.outbox')),
    ).toBe(true);
  });

  it('strictly maps valid rows and rejects malformed rows', () => {
    const valid = {
      event_id: '0199c8f2-2394-7ba0-8f9e-286378779219',
      event_type: 'audit.trace.requested',
      event_version: 1,
      aggregate_id: '0199c8f2-2394-7ba0-9f9e-286378779220',
      occurred_at: new Date('2026-10-10T12:30:00.000Z'),
      trace_context: null,
      payload: {},
      published_at: null,
    };

    expect(mapOutboxRow(valid)).toMatchObject({
      eventId: valid.event_id,
      publishedAt: null,
    });
    expect(() => mapOutboxRow({ ...valid, payload: [] })).toThrow('malformed outbox row');
    expect(() => mapOutboxRow({ ...valid, event_version: '1' })).toThrow('malformed outbox row');
  });
});
