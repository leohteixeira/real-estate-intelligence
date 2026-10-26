import { expect, it, vi } from 'vitest';
import {
  DatabaseConnection,
  type DatabaseClient,
} from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresGraphCheckpointRepository } from './graph-checkpoint.pg-repository.js';

it('includes expired and cancelled terminals in both eight-turn SQL predicates and deletes only checkpoint lineage', async () => {
  const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
  const candidate = {
    id: '0199c8f2-2394-7ba0-8f9e-286378779210',
    thread_id: '0199c8f2-2394-7ba0-8f9e-286378779211',
  };
  const query = vi
    .fn<DatabaseClient['query']>()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([candidate])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: candidate.id }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  const release = vi.fn();
  vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release });
  try {
    const repository = new PostgresGraphCheckpointRepository(
      connection,
      new PostgresTransactionRunner(connection),
    );
    expect(await repository.prune(50, AbortSignal.timeout(5000))).toBe(1);
    const checks = query.mock.calls.filter(([sql]) => sql.includes('newer.state'));
    expect(checks).toHaveLength(2);
    for (const [sql] of checks) {
      expect(sql).toContain("state IN ('completed','failed','expired','cancelled')");
      expect(sql).toContain("newer.state IN ('completed','failed','expired','cancelled')");
      expect(sql).toContain('>=8');
      expect(sql).toContain('graph_expires_at<=clock_timestamp()');
    }
    expect(
      query.mock.calls.filter(([sql]) => sql.startsWith('DELETE')).map(([sql]) => sql),
    ).toEqual(['DELETE FROM ask.graph_checkpoint WHERE run_id=$1']);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  } finally {
    await connection.close();
  }
});
