import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient, DatabaseConnection } from '../shared/index.js';
import { PostgresTransactionRunner } from '../shared/index.js';
import { PostgresCollectionScheduleRepository } from './postgres-collection-schedule.repository.js';

function connection(query: DatabaseClient['query']): DatabaseConnection {
  const identity = {};
  return {
    leaseClient: async () => ({ query, release: vi.fn() }),
    transactionIdentity: () => identity,
  } as unknown as DatabaseConnection;
}

describe('PostgresCollectionScheduleRepository', () => {
  it('claims due rows with skip-locked semantics and advances beyond missed slots', async () => {
    const query = vi.fn(async (statement: string) =>
      statement === 'BEGIN' || statement === 'COMMIT'
        ? []
        : [
            {
              schedule_id: '0199c8f2-2394-7ba0-8f9e-286378779210',
              source_id: 'synthetic-portal-aurora',
              scheduled_for: new Date('2026-10-10T12:00:00.000Z'),
              operation_key: 'collection:synthetic-portal-aurora:2026-10-10T12:00:00.000Z',
              next_run_at: new Date('2026-10-10T15:00:00.000Z'),
            },
          ],
    );
    const database = connection(query);
    const repository = new PostgresCollectionScheduleRepository(database);
    const runner = new PostgresTransactionRunner(database);

    await expect(
      runner.runInTransaction((transaction) =>
        repository.claimDue(transaction, '2026-10-10T14:30:00.000Z', 10),
      ),
    ).resolves.toEqual([
      {
        scheduleId: '0199c8f2-2394-7ba0-8f9e-286378779210',
        sourceId: 'synthetic-portal-aurora',
        scheduledFor: '2026-10-10T12:00:00.000Z',
        operationKey: 'collection:synthetic-portal-aurora:2026-10-10T12:00:00.000Z',
        nextRunAt: '2026-10-10T15:00:00.000Z',
      },
    ]);
    const statement = String(query.mock.calls[1]?.[0]);
    expect(statement).toContain('FOR UPDATE OF schedule SKIP LOCKED');
    expect(statement).toContain('in_flight_operation_key IS NULL');
    expect(statement).toContain('floor(');
    expect(query.mock.calls[1]).toEqual([expect.any(String), ['2026-10-10T14:30:00.000Z', 10]]);
  });

  it('clears only the source slot owned by the matching operation key', async () => {
    const query = vi.fn(async (statement: string) =>
      statement === 'BEGIN' || statement === 'COMMIT'
        ? []
        : [{ schedule_id: '0199c8f2-2394-7ba0-8f9e-286378779210' }],
    );
    const database = connection(query);
    const repository = new PostgresCollectionScheduleRepository(database);
    const runner = new PostgresTransactionRunner(database);

    await expect(
      runner.runInTransaction((transaction) =>
        repository.completeMatching(
          transaction,
          'synthetic-portal-aurora',
          'collection:synthetic-portal-aurora:2026-10-10T12:00:00.000Z',
        ),
      ),
    ).resolves.toBe(true);
    expect(String(query.mock.calls[1]?.[0])).toContain('in_flight_operation_key = $2');
  });
});
