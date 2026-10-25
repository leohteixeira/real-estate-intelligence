import {
  ExternalFailure,
  SNAPSHOT_RETENTION_MS,
  type SnapshotGeneration,
  type SnapshotLifecycle,
  type Transaction,
} from '@rei/application';
import {
  PostgresListingSuppression,
  lockListing,
  lockSnapshotObject,
} from './postgres-listing-suppression.js';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import {
  PostgresTransactionRunner,
  postgresClientFor,
} from '../shared/persistence/postgres-transaction.js';

interface Row {
  object_key: string;
  acquisition_scope: string;
  source_id: string;
  source_listing_id?: string;
  suppressed?: boolean;
  content_hash: SnapshotGeneration['contentHash'];
  byte_length: number;
  media_type: 'application/json';
  key_id: string;
  collected_at: Date;
  expires_at: Date;
  available: boolean;
  deleted: boolean;
}
function map(row: Row): SnapshotGeneration {
  return {
    objectKey: row.object_key,
    acquisitionScope: row.acquisition_scope,
    sourceId: row.source_id,
    ...(row.source_listing_id ? { sourceListingId: row.source_listing_id } : {}),
    ...(row.suppressed !== undefined ? { suppressed: row.suppressed } : {}),
    contentHash: row.content_hash,
    byteLength: row.byte_length,
    mediaType: row.media_type,
    keyId: row.key_id,
    collectedAt: row.collected_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    available: row.available,
    deleted: row.deleted,
  };
}

export class PostgresSnapshotLifecycle implements SnapshotLifecycle {
  private readonly transactions: PostgresTransactionRunner;
  public constructor(private readonly connection: DatabaseConnection) {
    this.transactions = new PostgresTransactionRunner(connection);
  }

  public reserve(
    input: Omit<SnapshotGeneration, 'expiresAt' | 'deleted' | 'available'>,
    signal: AbortSignal,
  ): Promise<SnapshotGeneration> {
    return this.transactions
      .runInTransaction(async (transaction) => {
        const client = postgresClientFor(transaction, this.connection);
        if (input.sourceListingId) {
          if (
            await new PostgresListingSuppression(this.connection).lockAndCheck(transaction, {
              sourceId: input.sourceId,
              sourceListingId: input.sourceListingId,
            })
          )
            throw new ExternalFailure({
              kind: 'rejected',
              operation: 'collection.listing.suppressed',
            });
        }
        await client.query(
          `INSERT INTO collection.snapshot_content (content_hash, byte_length, media_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [input.contentHash, input.byteLength, input.mediaType],
        );
        const contents = await client.query<{ byte_length: number; media_type: string }>(
          'SELECT byte_length, media_type FROM collection.snapshot_content WHERE content_hash = $1',
          [input.contentHash],
        );
        if (
          contents[0]?.byte_length !== input.byteLength ||
          contents[0]?.media_type !== input.mediaType
        )
          throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.reserve' });
        await client.query(
          `INSERT INTO collection.snapshot_generation (object_key, acquisition_scope, source_id, content_hash, byte_length, media_type, key_id, collected_at, expires_at, source_listing_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (acquisition_scope) DO NOTHING`,
          [
            input.objectKey,
            input.acquisitionScope,
            input.sourceId,
            input.contentHash,
            input.byteLength,
            input.mediaType,
            input.keyId,
            input.collectedAt,
            new Date(Date.parse(input.collectedAt) + SNAPSHOT_RETENTION_MS).toISOString(),
            input.sourceListingId ?? null,
          ],
        );
        const rows = await client.query<Row>(
          'SELECT * FROM collection.snapshot_generation WHERE acquisition_scope = $1',
          [input.acquisitionScope],
        );
        const row = rows[0];
        if (
          !row ||
          row.object_key !== input.objectKey ||
          row.source_id !== input.sourceId ||
          (input.sourceListingId !== undefined &&
            row.source_listing_id !== input.sourceListingId) ||
          row.content_hash !== input.contentHash ||
          row.key_id !== input.keyId ||
          row.byte_length !== input.byteLength ||
          row.media_type !== input.mediaType
        )
          throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.reserve' });
        return map(row);
      }, signal)
      .catch((error) => {
        throw this.failure(error, signal);
      });
  }

  public withGeneration<T>(
    objectKey: string,
    signal: AbortSignal,
    work: (generation: SnapshotGeneration, transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.transactions
      .runInTransaction(async (transaction) => {
        const client = postgresClientFor(transaction, this.connection);
        const identity = await client.query<{
          source_id: string;
          source_listing_id: string | null;
        }>(
          'SELECT source_id,source_listing_id FROM collection.snapshot_generation WHERE object_key=$1',
          [objectKey],
        );
        if (identity[0]?.source_listing_id)
          await lockListing(client, {
            sourceId: identity[0].source_id,
            sourceListingId: identity[0].source_listing_id,
          });
        const rows = await client.query<Row>(
          'SELECT * FROM collection.snapshot_generation WHERE object_key = $1 FOR UPDATE',
          [objectKey],
        );
        if (!rows[0])
          throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.lifecycle' });
        return work(map(rows[0]), transaction);
      }, signal)
      .catch((error) => {
        throw this.failure(error, signal);
      });
  }

  public async listExpired(
    now: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('Snapshot expiry batch must contain 1-1000 generations.');
    const rows = await this.connection
      .queryAbortable<{ object_key: string }>(
        `WITH real_due AS MATERIALIZED (
        SELECT object_key,selection_order FROM collection.snapshot_generation
        WHERE (expires_at <= $1 OR suppressed) AND COALESCE(next_reconciliation_at, CASE WHEN suppressed THEN $1 ELSE expires_at END) <= $1
        ORDER BY selection_order, object_key LIMIT $2 FOR UPDATE SKIP LOCKED
      ), synthetic_due AS MATERIALIZED (
        SELECT object_key,selection_order FROM collection.synthetic_snapshot_cleanup WHERE next_reconciliation_at <= $1
        ORDER BY selection_order, object_key LIMIT $2 FOR UPDATE SKIP LOCKED
      ), candidates AS MATERIALIZED (
        SELECT *,false AS synthetic FROM real_due UNION ALL SELECT *,true AS synthetic FROM synthetic_due
      ), selected AS MATERIALIZED (SELECT * FROM candidates ORDER BY selection_order, object_key LIMIT $2),
      advanced AS (UPDATE collection.snapshot_generation generation SET selection_order = nextval('collection.snapshot_selection_order') FROM selected WHERE NOT selected.synthetic AND generation.object_key=selected.object_key RETURNING generation.object_key),
      advanced_synthetic AS (UPDATE collection.synthetic_snapshot_cleanup cleanup SET selection_order = nextval('collection.snapshot_selection_order') FROM selected WHERE selected.synthetic AND cleanup.object_key=selected.object_key RETURNING cleanup.object_key)
      SELECT object_key FROM advanced UNION ALL SELECT object_key FROM advanced_synthetic`,
        [now, limit],
        signal,
      )
      .catch((error) => {
        throw this.failure(error, signal);
      });
    return rows.map((row) => row.object_key);
  }

  public async withSyntheticUpload<T>(
    input: {
      readonly objectKey: string;
      readonly sourceId: string;
      readonly sourceListingId: string;
    },
    signal: AbortSignal,
    work: () => Promise<T>,
  ): Promise<T> {
    // Ownership commits before PUT so a cancelled transaction cannot hide a late upload.
    await this.transactions.runInTransaction(async (transaction) => {
      const client = postgresClientFor(transaction, this.connection);
      if (await new PostgresListingSuppression(this.connection).lockAndCheck(transaction, input))
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.listing.suppressed' });
      await lockSnapshotObject(client, input.objectKey);
      await client.query(
        'INSERT INTO collection.snapshot_upload_owner (object_key,source_id,source_listing_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [input.objectKey, input.sourceId, input.sourceListingId],
      );
    }, signal);
    return this.transactions.runInTransaction(async (transaction) => {
      const client = postgresClientFor(transaction, this.connection);
      if (await new PostgresListingSuppression(this.connection).lockAndCheck(transaction, input))
        throw new ExternalFailure({ kind: 'rejected', operation: 'collection.listing.suppressed' });
      await lockSnapshotObject(client, input.objectKey);
      return work();
    }, signal);
  }
  public async deleteSynthetic(
    objectKey: string,
    signal: AbortSignal,
    work: () => Promise<void>,
    nextReconciliationAt: string,
  ): Promise<void> {
    // The tombstone must precede the external delete, including an interrupted delete.
    await this.connection.queryAbortable(
      'INSERT INTO collection.synthetic_snapshot_cleanup (object_key) VALUES ($1) ON CONFLICT DO NOTHING',
      [objectKey],
      signal,
    );
    await this.transactions.runInTransaction(async (transaction) => {
      const client = postgresClientFor(transaction, this.connection);
      await lockSnapshotObject(client, objectKey);
      const owners = await client.query(
        `SELECT 1 FROM collection.snapshot_upload_owner owner WHERE owner.object_key=$1 AND NOT EXISTS (SELECT 1 FROM collection.listing_suppression suppressed WHERE suppressed.source_id=owner.source_id AND suppressed.source_listing_id=owner.source_listing_id)
        UNION ALL SELECT 1 FROM collection.snapshot_observation observation JOIN collection.collection_run run USING(run_id) WHERE observation.object_key=$1 AND NOT EXISTS (SELECT 1 FROM collection.listing_suppression suppressed WHERE suppressed.source_id=run.source_id AND suppressed.source_listing_id=observation.source_listing_id) LIMIT 1`,
        [objectKey],
      );
      if (owners.length === 0) await work();
      await client.query(
        'UPDATE collection.synthetic_snapshot_cleanup SET next_reconciliation_at=$2 WHERE object_key=$1',
        [objectKey, nextReconciliationAt],
      );
    }, signal);
  }

  public async markDeleted(
    transaction: Transaction,
    objectKey: string,
    nextReconciliationAt: string,
  ): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'UPDATE collection.snapshot_generation SET available = false, deleted = true, next_reconciliation_at = $2 WHERE object_key = $1',
      [objectKey, nextReconciliationAt],
    );
  }

  public async markAvailable(transaction: Transaction, objectKey: string): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'UPDATE collection.snapshot_generation SET available = true WHERE object_key = $1 AND NOT deleted',
      [objectKey],
    );
  }
  private failure(error: unknown, signal: AbortSignal): ExternalFailure {
    if (error instanceof ExternalFailure) return error;
    return new ExternalFailure({
      kind: signal.aborted ? 'cancelled' : 'transient',
      operation: 'raw-snapshot.lifecycle',
    });
  }
}
