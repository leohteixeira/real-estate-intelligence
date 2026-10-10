import type {
  CollectionExecutionResult,
  CollectionRunRepository,
  PersistCompletedCollectionInput,
  PersistCompletedCollectionResult,
  Transaction,
} from '@rei/application';
import { parseSha256Hash, parseUuidV7 } from '@rei/domain';

import type {
  DatabaseClient,
  DatabaseConnection,
} from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { redactConnectionError } from '../shared/persistence/redact.js';

interface ResultRow {
  readonly operation_key: unknown;
  readonly run_id: unknown;
  readonly snapshot_id: unknown;
  readonly parsed_event_id: unknown;
  readonly completed_event_id: unknown;
  readonly content_hash: unknown;
  readonly object_key: unknown;
}

const RESULT_QUERY = `
  SELECT run.operation_key,
         run.run_id::text,
         observation.snapshot_id::text,
         run.parsed_event_id::text,
         run.completed_event_id::text,
         observation.content_hash,
         object.object_key
    FROM collection.collection_run AS run
    JOIN collection.snapshot_observation AS observation ON observation.run_id = run.run_id
    JOIN collection.raw_object AS object ON object.content_hash = observation.content_hash
   WHERE run.operation_key = $1
`;

function mapResult(row: ResultRow): CollectionExecutionResult {
  if (
    typeof row.operation_key !== 'string' ||
    typeof row.run_id !== 'string' ||
    typeof row.snapshot_id !== 'string' ||
    typeof row.parsed_event_id !== 'string' ||
    typeof row.completed_event_id !== 'string' ||
    typeof row.content_hash !== 'string' ||
    typeof row.object_key !== 'string'
  ) {
    throw new Error('PostgreSQL returned a malformed collection result.');
  }
  return Object.freeze({
    operationKey: row.operation_key,
    runId: parseUuidV7(row.run_id),
    snapshotId: parseUuidV7(row.snapshot_id),
    parsedEventId: parseUuidV7(row.parsed_event_id),
    completedEventId: parseUuidV7(row.completed_event_id),
    contentHash: parseSha256Hash(row.content_hash),
    objectKey: row.object_key,
    replayed: false,
  });
}

async function findWithClient(
  client: Pick<DatabaseClient, 'query'>,
  operationKey: string,
): Promise<CollectionExecutionResult | null> {
  const rows = await client.query<ResultRow>(RESULT_QUERY, [operationKey]);
  if (rows.length > 1) throw new Error('PostgreSQL returned duplicate collection operations.');
  return rows[0] ? mapResult(rows[0]) : null;
}

export class PostgresCollectionRunRepository implements CollectionRunRepository {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async findByOperationKey(
    operationKey: string,
    signal?: AbortSignal,
  ): Promise<CollectionExecutionResult | null> {
    try {
      if (signal) {
        const rows = await this.connection.queryAbortable<ResultRow>(
          RESULT_QUERY,
          [operationKey],
          signal,
        );
        if (rows.length > 1) {
          throw new Error('PostgreSQL returned duplicate collection operations.');
        }
        return rows[0] ? mapResult(rows[0]) : null;
      }
      return await findWithClient(this.connection, operationKey);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw redactConnectionError(error);
    }
  }

  public async persistCompleted(
    transaction: Transaction,
    input: PersistCompletedCollectionInput,
  ): Promise<PersistCompletedCollectionResult> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const inserted = await client.query<{ run_id: string }>(
        `INSERT INTO collection.collection_run
           (run_id, operation_key, source_id, status, started_at, completed_at,
            observed_count, parsed_count, suppressed_count, failed_count, manifest_hash,
            parsed_event_id, completed_event_id)
         VALUES ($1, $2, $3, 'completed', $4, $5, 1, 1, 0, 0, $6, $7, $8)
         ON CONFLICT (operation_key) DO NOTHING
         RETURNING run_id::text`,
        [
          input.runId,
          input.operationKey,
          input.sourceId,
          input.startedAt,
          input.completedAt,
          input.manifestHash,
          input.parsedEventId,
          input.completedEventId,
        ],
      );
      if (inserted.length === 0) {
        const existing = await findWithClient(client, input.operationKey);
        if (!existing) throw new Error('Concurrent collection replay could not be read.');
        return { created: false, result: existing };
      }

      await client.query(
        `INSERT INTO collection.raw_object
           (content_hash, object_key, byte_length, media_type, synthetic)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (content_hash) DO NOTHING`,
        [input.contentHash, input.objectKey, input.byteLength, input.mediaType],
      );
      const objects = await client.query<{
        object_key: unknown;
        byte_length: unknown;
        media_type: unknown;
        synthetic: unknown;
      }>(
        `SELECT object_key, byte_length, media_type, synthetic
           FROM collection.raw_object
          WHERE content_hash = $1`,
        [input.contentHash],
      );
      const object = objects[0];
      if (
        !object ||
        object.object_key !== input.objectKey ||
        object.byte_length !== input.byteLength ||
        object.media_type !== input.mediaType ||
        object.synthetic !== true
      ) {
        throw new Error('Content hash is already bound to different raw object metadata.');
      }

      await client.query(
        `INSERT INTO collection.snapshot_observation
           (snapshot_id, run_id, content_hash, source_listing_id, source_url, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.snapshotId,
          input.runId,
          input.contentHash,
          input.sourceListingId,
          input.sourceUrl,
          input.observedAt,
        ],
      );

      return {
        created: true,
        result: Object.freeze({
          operationKey: input.operationKey,
          runId: input.runId,
          snapshotId: input.snapshotId,
          parsedEventId: input.parsedEventId,
          completedEventId: input.completedEventId,
          contentHash: input.contentHash,
          objectKey: input.objectKey,
          replayed: false,
        }),
      };
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
