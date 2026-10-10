import {
  ExternalFailure,
  SNAPSHOT_RETENTION_MS,
  type SnapshotGeneration,
  type SnapshotLifecycle,
  type Transaction,
} from '@rei/application';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import {
  PostgresTransactionRunner,
  postgresClientFor,
} from '../shared/persistence/postgres-transaction.js';

interface Row {
  object_key: string;
  acquisition_scope: string;
  source_id: string;
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
          `INSERT INTO collection.snapshot_generation (object_key, acquisition_scope, source_id, content_hash, byte_length, media_type, key_id, collected_at, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (acquisition_scope) DO NOTHING`,
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
        const rows = await postgresClientFor(transaction, this.connection).query<Row>(
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
      .queryAbortable<{
        object_key: string;
      }>(
        `WITH selected AS MATERIALIZED (
          SELECT object_key, selection_order FROM collection.snapshot_generation
          WHERE expires_at <= $1 AND COALESCE(next_reconciliation_at, expires_at) <= $1
          ORDER BY selection_order, object_key LIMIT $2 FOR UPDATE SKIP LOCKED
        ), advanced AS (
          UPDATE collection.snapshot_generation AS generation
          SET selection_order = nextval('collection.snapshot_selection_order')
          FROM selected WHERE generation.object_key = selected.object_key
          RETURNING generation.object_key
        )
        SELECT advanced.object_key FROM advanced JOIN selected USING (object_key)
        ORDER BY selected.selection_order, advanced.object_key`,
        [now, limit],
        signal,
      )
      .catch((error) => {
        throw this.failure(error, signal);
      });
    return rows.map((row) => row.object_key);
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
