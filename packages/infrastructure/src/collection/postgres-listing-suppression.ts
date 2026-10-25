import type {
  ListingIdentity,
  ListingSuppression,
  ListingSuppressionRepository,
  Transaction,
} from '@rei/application';
import { parseUuidV7 } from '@rei/domain';
import type {
  DatabaseConnection,
  DatabaseClient,
} from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

export async function lockListing(
  client: Pick<DatabaseClient, 'query'>,
  identity: ListingIdentity,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    JSON.stringify(['collection.listing', identity.sourceId, identity.sourceListingId]),
  ]);
}
export async function lockSnapshotObject(
  client: Pick<DatabaseClient, 'query'>,
  objectKey: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    JSON.stringify(['collection.object', objectKey]),
  ]);
}
export class PostgresListingSuppression implements ListingSuppressionRepository {
  public constructor(private readonly connection: DatabaseConnection) {}
  public async isSuppressed(identity: ListingIdentity, signal: AbortSignal): Promise<boolean> {
    return (
      (
        await this.connection.queryAbortable(
          'SELECT 1 FROM collection.listing_suppression WHERE source_id=$1 AND source_listing_id=$2',
          [identity.sourceId, identity.sourceListingId],
          signal,
        )
      ).length !== 0
    );
  }
  public async lockAndCheck(transaction: Transaction, identity: ListingIdentity): Promise<boolean> {
    const client = postgresClientFor(transaction, this.connection);
    await lockListing(client, identity);
    return (
      (
        await client.query(
          'SELECT 1 FROM collection.listing_suppression WHERE source_id=$1 AND source_listing_id=$2',
          [identity.sourceId, identity.sourceListingId],
        )
      ).length !== 0
    );
  }
  public async record(transaction: Transaction, input: ListingSuppression) {
    const client = postgresClientFor(transaction, this.connection);
    await lockListing(client, input);
    const inserted = await client.query(
      `INSERT INTO collection.listing_suppression (source_id,source_listing_id,suppression_id,event_id,suppressed_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING suppression_id`,
      [
        input.sourceId,
        input.sourceListingId,
        input.suppressionId,
        input.eventId,
        input.suppressedAt,
      ],
    );
    // Availability changes immediately; expiry and immutable generation metadata remain fixed.
    await client.query(
      `UPDATE collection.snapshot_generation SET suppressed=true, available=false, next_reconciliation_at=NULL WHERE source_id=$1 AND source_listing_id=$2`,
      [input.sourceId, input.sourceListingId],
    );
    const rows = await client.query<{
      suppression_id: string;
      event_id: string;
      suppressed_at: Date;
      completed_at: Date | null;
    }>('SELECT * FROM collection.listing_suppression WHERE source_id=$1 AND source_listing_id=$2', [
      input.sourceId,
      input.sourceListingId,
    ]);
    const row = rows[0]!;
    return {
      created: inserted.length === 1,
      suppression: {
        sourceId: input.sourceId,
        sourceListingId: input.sourceListingId,
        suppressionId: parseUuidV7(row.suppression_id),
        eventId: parseUuidV7(row.event_id),
        suppressedAt: row.suppressed_at.toISOString(),
        completed: row.completed_at !== null,
      },
    };
  }
  public async listObjectKeys(
    identity: ListingIdentity,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    const rows = await this.connection.queryAbortable<{ object_key: string }>(
      `SELECT object_key FROM collection.snapshot_generation WHERE source_id=$1 AND source_listing_id=$2
      UNION SELECT object_key FROM collection.snapshot_upload_owner WHERE source_id=$1 AND source_listing_id=$2
      UNION SELECT observation.object_key FROM collection.snapshot_observation observation JOIN collection.collection_run run USING(run_id) WHERE run.source_id=$1 AND observation.source_listing_id=$2`,
      [identity.sourceId, identity.sourceListingId],
      signal,
    );
    return rows.map((row) => row.object_key);
  }
  public async eraseCollectedData(
    transaction: Transaction,
    identity: ListingIdentity,
  ): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    const args = [identity.sourceId, identity.sourceListingId];
    const owned = await client.query<{ object_key: string; content_hash: string }>(
      `SELECT observation.object_key,observation.content_hash FROM collection.snapshot_observation observation JOIN collection.collection_run run USING(run_id) WHERE run.source_id=$1 AND observation.source_listing_id=$2
       UNION SELECT object_key,content_hash FROM collection.snapshot_generation WHERE source_id=$1 AND source_listing_id=$2
       UNION SELECT raw.object_key,raw.content_hash FROM collection.raw_object raw JOIN collection.snapshot_upload_owner owner USING(object_key) WHERE owner.source_id=$1 AND owner.source_listing_id=$2`,
      args,
    );
    const objectKeys = [...new Set(owned.map((row) => row.object_key))].sort();
    const contentHashes = owned.map((row) => row.content_hash);
    // Serialize metadata erasure with ownership registration and physical object cleanup.
    for (const objectKey of objectKeys) await lockSnapshotObject(client, objectKey);
    await client.query(
      `INSERT INTO collection.run_listing_identity (run_id,source_listing_id) SELECT observation.run_id,observation.source_listing_id FROM collection.snapshot_observation observation JOIN collection.collection_run run USING(run_id) WHERE run.source_id=$1 AND observation.source_listing_id=$2 ON CONFLICT DO NOTHING`,
      args,
    );
    for (const table of ['parsed_event_evidence', 'snapshot_reparse'])
      await client.query(
        `DELETE FROM collection.${table} WHERE snapshot_id IN (SELECT observation.snapshot_id FROM collection.snapshot_observation observation JOIN collection.collection_run run USING(run_id) WHERE run.source_id=$1 AND observation.source_listing_id=$2)`,
        args,
      );
    await client.query(
      `DELETE FROM collection.snapshot_observation observation USING collection.collection_run run WHERE run.run_id=observation.run_id AND run.source_id=$1 AND observation.source_listing_id=$2`,
      args,
    );
    await client.query(
      'DELETE FROM collection.snapshot_upload_owner WHERE source_id=$1 AND source_listing_id=$2',
      args,
    );
    await client.query(
      `DELETE FROM collection.raw_object raw WHERE raw.object_key=ANY($1::text[])
       AND NOT EXISTS (SELECT 1 FROM collection.snapshot_observation observation WHERE observation.content_hash=raw.content_hash)
       AND NOT EXISTS (SELECT 1 FROM collection.snapshot_upload_owner owner WHERE owner.object_key=raw.object_key AND NOT EXISTS (SELECT 1 FROM collection.listing_suppression suppressed WHERE suppressed.source_id=owner.source_id AND suppressed.source_listing_id=owner.source_listing_id))
       AND EXISTS (SELECT 1 FROM collection.synthetic_snapshot_cleanup cleanup WHERE cleanup.object_key=raw.object_key)`,
      [objectKeys],
    );
    await client.query(
      `DELETE FROM collection.snapshot_content content WHERE content.content_hash=ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM collection.snapshot_observation observation WHERE observation.content_hash=content.content_hash) AND NOT EXISTS (SELECT 1 FROM collection.snapshot_generation generation WHERE generation.content_hash=content.content_hash) AND NOT EXISTS (SELECT 1 FROM collection.raw_object raw WHERE raw.content_hash=content.content_hash)`,
      [contentHashes],
    );
  }
  public async complete(transaction: Transaction, identity: ListingIdentity): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'UPDATE collection.listing_suppression SET completed_at=COALESCE(completed_at,clock_timestamp()) WHERE source_id=$1 AND source_listing_id=$2',
      [identity.sourceId, identity.sourceListingId],
    );
  }
}
