import type { CollectionRunState } from '@rei/domain';
import { parseUuidV7 } from '@rei/domain';
import type { DatabaseClient } from '../shared/persistence/database-connection.js';

/** Shared by Collection registration and canonical selection; retained until the caller commits. */
export async function lockSourceAdmission(
  client: Pick<DatabaseClient, 'query'>,
  sourceId: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('collection.source-admission:' || $1::text, 0))",
    [sourceId],
  );
}

export async function admittedFrontier(
  client: Pick<DatabaseClient, 'query'>,
  sourceId: string,
): Promise<Pick<CollectionRunState, 'startedAt' | 'runId'> | null> {
  const rows = await client.query<{ started_at: Date; run_id: string }>(
    `SELECT started_at, run_id::text FROM collection.collection_run
     WHERE source_id=$1 ORDER BY started_at DESC, run_id DESC LIMIT 1`,
    [sourceId],
  );
  const row = rows[0];
  return row ? { startedAt: row.started_at.toISOString(), runId: parseUuidV7(row.run_id) } : null;
}
