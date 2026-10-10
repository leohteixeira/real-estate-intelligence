import type {
  CollectionExecutionResult,
  CollectionRunRepository,
  CommitCollectionPageInput,
  CommitCollectionPageResult,
  PersistCompletedCollectionInput,
  PersistCompletedCollectionResult,
  PersistedCollectionObservation,
  StartCollectionRunInput,
  Transaction,
} from '@rei/application';
import { ExternalFailure } from '@rei/application';
import {
  StaleCollectionCheckpointError,
  hydrateCollectionRun,
  parseSha256Hash,
  parseUuidV7,
  type CollectionRunState,
  type SourceAccessRefusal,
  type SourceHold,
} from '@rei/domain';

import type {
  DatabaseClient,
  DatabaseConnection,
} from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { redactConnectionError } from '../shared/persistence/redact.js';
import { PostgresSourceRegisterRepository } from './postgres-source-register.repository.js';

interface LegacyResultRow {
  readonly operation_key: unknown;
  readonly source_id: unknown;
  readonly run_id: unknown;
  readonly snapshot_id: unknown;
  readonly parsed_event_id: unknown;
  readonly completed_event_id: unknown;
  readonly content_hash: unknown;
  readonly object_key: unknown;
}

interface RunRow {
  readonly pause_reason: unknown;
  readonly paused_at: unknown;
  readonly operation_key: unknown;
  readonly run_id: unknown;
  readonly source_id: unknown;
  readonly status: unknown;
  readonly started_at: unknown;
  readonly completed_at: unknown;
  readonly observed_count: unknown;
  readonly parsed_count: unknown;
  readonly changed_count: unknown;
  readonly suppressed_count: unknown;
  readonly failed_count: unknown;
  readonly manifest_hash: unknown;
  readonly completed_event_id: unknown;
  readonly checkpoint_ordinal: unknown;
  readonly checkpoint_cursor: unknown;
  readonly checkpointed_at: unknown;
}

const LEGACY_RESULT_QUERY = `
  SELECT run.operation_key,
         run.source_id,
         run.run_id::text,
         observation.snapshot_id::text,
         observation.parsed_event_id::text,
         run.completed_event_id::text,
         observation.content_hash,
         observation.object_key
    FROM collection.collection_run AS run
    JOIN collection.snapshot_observation AS observation ON observation.run_id = run.run_id
   WHERE run.operation_key = $1 AND run.status = 'completed'
`;

const RUN_FIELDS = `run.operation_key, run.run_id::text, run.source_id, run.status,
  run.started_at, run.completed_at, run.observed_count, run.parsed_count,
  run.changed_count, run.suppressed_count, run.failed_count, run.manifest_hash,
  run.completed_event_id::text, run.checkpoint_ordinal, run.checkpoint_cursor,
  run.checkpointed_at, run.pause_reason, run.paused_at`;

const LOAD_RUN_QUERY = `SELECT ${RUN_FIELDS}
  FROM collection.collection_run AS run WHERE run.operation_key = $1`;

function date(value: unknown, field: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new Error(`PostgreSQL returned malformed ${field}.`);
  }
  return value.toISOString();
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`PostgreSQL returned malformed ${field}.`);
  return value;
}

function mapRun(row: RunRow): CollectionRunState {
  if ((row.pause_reason === null) !== (row.paused_at === null)) {
    throw new Error('PostgreSQL returned incoherent run pause metadata.');
  }
  if (
    typeof row.operation_key !== 'string' ||
    typeof row.run_id !== 'string' ||
    typeof row.source_id !== 'string' ||
    (row.status !== 'running' && row.status !== 'paused' && row.status !== 'completed') ||
    typeof row.observed_count !== 'number' ||
    typeof row.parsed_count !== 'number' ||
    (row.changed_count !== undefined && typeof row.changed_count !== 'number') ||
    typeof row.suppressed_count !== 'number' ||
    typeof row.failed_count !== 'number' ||
    typeof row.checkpoint_ordinal !== 'number'
  ) {
    throw new Error('PostgreSQL returned a malformed collection run.');
  }
  const manifest = nullableString(row.manifest_hash, 'manifest hash');
  const completedEvent = nullableString(row.completed_event_id, 'completed event ID');
  return hydrateCollectionRun({
    operationKey: row.operation_key,
    runId: parseUuidV7(row.run_id),
    sourceId: row.source_id,
    status: row.status,
    pause:
      row.pause_reason === null
        ? null
        : {
            reason: nullableString(row.pause_reason, 'pause reason') as SourceAccessRefusal,
            heldAt: date(row.paused_at, 'paused at')!,
          },
    startedAt: date(row.started_at, 'started at')!,
    completedAt: date(row.completed_at, 'completed at', true),
    counts: {
      observed: row.observed_count,
      parsed: row.parsed_count,
      changed: row.changed_count ?? 0,
      suppressed: row.suppressed_count,
      failed: row.failed_count,
    },
    checkpoint: {
      ordinal: row.checkpoint_ordinal,
      cursor: nullableString(row.checkpoint_cursor, 'checkpoint cursor'),
      checkpointedAt: date(row.checkpointed_at, 'checkpointed at', true),
    },
    manifestHash: manifest === null ? null : parseSha256Hash(manifest),
    completedEventId: completedEvent === null ? null : parseUuidV7(completedEvent),
  });
}

function mapLegacyResult(row: LegacyResultRow): CollectionExecutionResult {
  if (
    typeof row.operation_key !== 'string' ||
    typeof row.source_id !== 'string' ||
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
    sourceId: row.source_id,
    runId: parseUuidV7(row.run_id),
    snapshotId: parseUuidV7(row.snapshot_id),
    parsedEventId: parseUuidV7(row.parsed_event_id),
    completedEventId: parseUuidV7(row.completed_event_id),
    contentHash: parseSha256Hash(row.content_hash),
    objectKey: row.object_key,
    replayed: false,
  });
}

async function oneRun(
  client: Pick<DatabaseClient, 'query'>,
  statement: string,
  parameters: readonly unknown[],
): Promise<CollectionRunState | null> {
  const rows = await client.query<RunRow>(statement, parameters);
  if (rows.length > 1) throw new Error('PostgreSQL returned duplicate collection operations.');
  return rows[0] ? mapRun(rows[0]) : null;
}

export class PostgresCollectionRunRepository implements CollectionRunRepository {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async pause(
    transaction: Transaction,
    runId: CollectionRunState['runId'],
    hold: SourceHold,
  ) {
    const client = postgresClientFor(transaction, this.connection);
    await client.query(
      `UPDATE collection.collection_run SET status = 'paused', pause_reason = $2, paused_at = $3
      WHERE run_id = $1 AND status = 'running'`,
      [runId, hold.reason, hold.heldAt],
    );
    const run = await oneRun(
      client,
      `SELECT ${RUN_FIELDS} FROM collection.collection_run AS run WHERE run.run_id = $1`,
      [runId],
    );
    if (!run) throw new Error('Collection run was not found.');
    return run;
  }

  public async resume(transaction: Transaction, runId: CollectionRunState['runId']) {
    const client = postgresClientFor(transaction, this.connection);
    const current = await oneRun(
      client,
      `SELECT ${RUN_FIELDS} FROM collection.collection_run AS run WHERE run.run_id = $1`,
      [runId],
    );
    if (!current || current.status !== 'paused')
      throw new TypeError('Only a paused run can be explicitly resumed.');
    await new PostgresSourceRegisterRepository(this.connection).assertCollectible(
      transaction,
      current.sourceId,
    );
    const run = await oneRun(
      client,
      `UPDATE collection.collection_run AS run SET status = 'running', pause_reason = NULL, paused_at = NULL
      WHERE run.run_id = $1 AND run.status = 'paused' RETURNING ${RUN_FIELDS}`,
      [runId],
    );
    if (!run) throw new StaleCollectionCheckpointError();
    return run;
  }

  public async findByOperationKey(
    operationKey: string,
    signal?: AbortSignal,
  ): Promise<CollectionExecutionResult | null> {
    try {
      const rows = signal
        ? await this.connection.queryAbortable<LegacyResultRow>(
            LEGACY_RESULT_QUERY,
            [operationKey],
            signal,
          )
        : await this.connection.query<LegacyResultRow>(LEGACY_RESULT_QUERY, [operationKey]);
      if (rows.length > 1)
        throw new Error('Legacy collection operation has multiple observations.');
      return rows[0] ? mapLegacyResult(rows[0]) : null;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw redactConnectionError(error);
    }
  }

  public async loadRunByOperationKey(
    operationKey: string,
    signal?: AbortSignal,
  ): Promise<CollectionRunState | null> {
    try {
      if (signal) {
        const rows = await this.connection.queryAbortable<RunRow>(
          LOAD_RUN_QUERY,
          [operationKey],
          signal,
        );
        if (rows.length > 1)
          throw new Error('PostgreSQL returned duplicate collection operations.');
        return rows[0] ? mapRun(rows[0]) : null;
      }
      return oneRun(this.connection, LOAD_RUN_QUERY, [operationKey]);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw redactConnectionError(error);
    }
  }

  public async startOrLoad(
    transaction: Transaction,
    input: StartCollectionRunInput,
  ): Promise<CollectionRunState> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      await client.query(
        `INSERT INTO collection.collection_run
           (run_id, operation_key, source_id, status, started_at, observed_count, parsed_count,
            changed_count, suppressed_count, failed_count, checkpoint_ordinal)
         VALUES ($1, $2, $3, 'running', $4, 0, 0, 0, 0, 0, 0)
         ON CONFLICT (operation_key) DO NOTHING`,
        [input.runId, input.operationKey, input.sourceId, input.startedAt],
      );
      const run = await oneRun(client, LOAD_RUN_QUERY, [input.operationKey]);
      if (!run) throw new Error('Collection run could not be started or loaded.');
      return run;
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async lockRunForPage(
    transaction: Transaction,
    runId: CollectionRunState['runId'],
    expectedOrdinal: number,
    expectedCursor: string | null,
  ): Promise<CollectionRunState> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const run = await oneRun(
        client,
        `SELECT ${RUN_FIELDS} FROM collection.collection_run AS run
          WHERE run.run_id = $1 FOR UPDATE`,
        [runId],
      );
      if (!run) throw new Error('Collection run was not found.');
      if (
        run.status !== 'running' ||
        run.checkpoint.ordinal !== expectedOrdinal ||
        run.checkpoint.cursor !== expectedCursor
      ) {
        throw new StaleCollectionCheckpointError();
      }
      return run;
    } catch (error) {
      if (error instanceof StaleCollectionCheckpointError) throw error;
      throw redactConnectionError(error);
    }
  }

  public async listObservations(
    transaction: Transaction,
    runId: CollectionRunState['runId'],
  ): Promise<readonly PersistedCollectionObservation[]> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const rows = await client.query<{
        snapshot_id: unknown;
        parsed_event_id: unknown;
        source_listing_id: unknown;
        source_url: unknown;
        observed_at: unknown;
        content_hash: unknown;
        object_key: unknown;
        outcome: unknown;
        changed: unknown;
        failure_reason: unknown;
      }>(
        `SELECT observation.snapshot_id::text, observation.parsed_event_id::text,
                observation.source_listing_id, observation.source_url, observation.observed_at,
                observation.content_hash, observation.object_key, observation.outcome,
                observation.changed, observation.failure_reason
           FROM collection.snapshot_observation AS observation
          WHERE observation.run_id = $1
          ORDER BY observation.source_listing_id`,
        [runId],
      );
      return Object.freeze(
        rows.map((row) => {
          if (
            typeof row.snapshot_id !== 'string' ||
            (row.parsed_event_id !== null && typeof row.parsed_event_id !== 'string') ||
            typeof row.source_listing_id !== 'string' ||
            typeof row.source_url !== 'string' ||
            !(row.observed_at instanceof Date) ||
            typeof row.content_hash !== 'string' ||
            typeof row.object_key !== 'string' ||
            (row.outcome !== 'parsed' && row.outcome !== 'failed') ||
            typeof row.changed !== 'boolean' ||
            (row.failure_reason !== null && typeof row.failure_reason !== 'string')
          ) {
            throw new Error('PostgreSQL returned a malformed collection observation.');
          }
          return Object.freeze({
            snapshotId: parseUuidV7(row.snapshot_id),
            parsedEventId: row.parsed_event_id === null ? null : parseUuidV7(row.parsed_event_id),
            sourceListingId: row.source_listing_id,
            sourceUrl: row.source_url,
            observedAt: row.observed_at.toISOString(),
            contentHash: parseSha256Hash(row.content_hash),
            objectKey: row.object_key,
            outcome: row.outcome,
            changed: row.changed,
            failureReason: row.failure_reason,
          });
        }),
      );
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async findLatestCompletedContentHash(
    transaction: Transaction,
    sourceId: string,
    beforeRunId: CollectionRunState['runId'],
    sourceListingId: string,
  ): Promise<ReturnType<typeof parseSha256Hash> | null> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const rows = await client.query<{ content_hash: unknown }>(
        `SELECT observation.content_hash
           FROM collection.snapshot_observation AS observation
           JOIN collection.collection_run AS prior_run ON prior_run.run_id = observation.run_id
          WHERE prior_run.source_id = $1
            AND prior_run.status = 'completed'
            AND prior_run.run_id < $2
            AND observation.source_listing_id = $3
          ORDER BY prior_run.completed_at DESC, prior_run.run_id DESC
          LIMIT 1`,
        [sourceId, beforeRunId, sourceListingId],
      );
      const value = rows[0]?.content_hash;
      if (value === undefined) return null;
      if (typeof value !== 'string') {
        throw new Error('PostgreSQL returned a malformed prior collection hash.');
      }
      return parseSha256Hash(value);
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async commitPage(
    transaction: Transaction,
    input: CommitCollectionPageInput,
  ): Promise<CommitCollectionPageResult> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      for (const observation of input.observations) {
        if (observation.objectKey.startsWith('real/')) {
          await this.assertRealGeneration(client, observation);
        } else {
          await client.query(
            `INSERT INTO collection.raw_object
             (content_hash, object_key, byte_length, media_type, synthetic)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (content_hash) DO NOTHING`,
            [
              observation.contentHash,
              observation.objectKey,
              observation.byteLength,
              observation.mediaType,
            ],
          );
          const objects = await client.query<{
            object_key: unknown;
            byte_length: unknown;
            media_type: unknown;
            synthetic: unknown;
          }>(
            `SELECT object_key, byte_length, media_type, synthetic
             FROM collection.raw_object WHERE content_hash = $1`,
            [observation.contentHash],
          );
          const object = objects[0];
          if (
            !object ||
            object.object_key !== observation.objectKey ||
            object.byte_length !== observation.byteLength ||
            object.media_type !== observation.mediaType ||
            object.synthetic !== true
          ) {
            throw new Error('Content hash is already bound to different raw object metadata.');
          }
        }
        await client.query(
          `INSERT INTO collection.snapshot_observation
             (snapshot_id, run_id, content_hash, source_listing_id, source_url, observed_at,
              parsed_event_id, outcome, changed, failure_reason, object_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            observation.snapshotId,
            input.runId,
            observation.contentHash,
            observation.sourceListingId,
            observation.sourceUrl,
            observation.observedAt,
            observation.parsedEventId,
            observation.outcome,
            observation.changed,
            observation.failureReason,
            observation.objectKey,
          ],
        );
      }

      const rows = await client.query<RunRow>(
        `UPDATE collection.collection_run AS run
            SET checkpoint_ordinal = checkpoint_ordinal + 1,
                checkpoint_cursor = $4,
                checkpointed_at = $5,
                observed_count = observed_count + $6,
                parsed_count = parsed_count + $7,
                changed_count = changed_count + $8,
                failed_count = failed_count + $9,
                status = CASE WHEN $10::boolean THEN 'completed' ELSE 'running' END,
                completed_at = CASE WHEN $10::boolean THEN $11::timestamptz ELSE NULL END,
                manifest_hash = CASE WHEN $10::boolean THEN $12::text ELSE NULL END,
                completed_event_id = CASE WHEN $10::boolean THEN $13::uuid ELSE NULL END
          WHERE run.run_id = $1
            AND run.status = 'running'
            AND run.checkpoint_ordinal = $2
            AND run.checkpoint_cursor IS NOT DISTINCT FROM $3
        RETURNING ${RUN_FIELDS}`,
        [
          input.runId,
          input.expectedOrdinal,
          input.expectedCursor,
          input.nextCursor,
          input.checkpointedAt,
          input.observations.length,
          input.observations.filter(({ outcome }) => outcome === 'parsed').length,
          input.observations.filter(({ changed }) => changed).length,
          input.observations.filter(({ outcome }) => outcome === 'failed').length,
          input.exhausted,
          input.completedAt,
          input.manifestHash,
          input.completedEventId,
        ],
      );
      if (rows[0]) return { committed: true, run: mapRun(rows[0]) };
      throw new StaleCollectionCheckpointError();
    } catch (error) {
      if (error instanceof StaleCollectionCheckpointError) throw error;
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
            observed_count, parsed_count, changed_count, suppressed_count, failed_count, manifest_hash,
            completed_event_id, checkpoint_ordinal, checkpointed_at)
         VALUES ($1, $2, $3, 'completed', $4, $5, 1, 1, 0, 0, 0, $6, $7, 1, $5)
         ON CONFLICT (operation_key) DO NOTHING
         RETURNING run_id::text`,
        [
          input.runId,
          input.operationKey,
          input.sourceId,
          input.startedAt,
          input.completedAt,
          input.manifestHash,
          input.completedEventId,
        ],
      );
      if (inserted.length === 0) {
        const run = await oneRun(client, LOAD_RUN_QUERY, [input.operationKey]);
        if (!run) throw new Error('Concurrent collection operation could not be read.');
        if (run.sourceId !== input.sourceId) {
          throw new Error('Collection operation key is already bound to a different source.');
        }
        if (run.status !== 'completed' || run.counts.observed !== 1 || run.counts.parsed !== 1) {
          throw new Error('Concurrent collection operation is not a one-shot completed result.');
        }
        const rows = await client.query<LegacyResultRow>(LEGACY_RESULT_QUERY, [input.operationKey]);
        if (rows.length !== 1) throw new Error('Concurrent collection replay could not be read.');
        const result = mapLegacyResult(rows[0]!);
        if (result.sourceId !== input.sourceId) {
          throw new Error('Collection operation result is bound to a different source.');
        }
        return { created: false, result };
      }

      if (input.objectKey.startsWith('real/')) {
        await this.assertRealGeneration(client, input);
      } else {
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
           FROM collection.raw_object WHERE content_hash = $1`,
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
      }
      await client.query(
        `INSERT INTO collection.snapshot_observation
           (snapshot_id, run_id, content_hash, source_listing_id, source_url, observed_at,
            parsed_event_id, outcome, changed, object_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'parsed', false, $8)`,
        [
          input.snapshotId,
          input.runId,
          input.contentHash,
          input.sourceListingId,
          input.sourceUrl,
          input.observedAt,
          input.parsedEventId,
          input.objectKey,
        ],
      );
      return {
        created: true,
        result: Object.freeze({
          operationKey: input.operationKey,
          sourceId: input.sourceId,
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

  private async assertRealGeneration(
    client: Pick<DatabaseClient, 'query'>,
    input: {
      readonly objectKey: string;
      readonly contentHash: string;
      readonly byteLength: number;
      readonly mediaType: string;
    },
  ): Promise<void> {
    const rows = await client.query<{
      content_hash: string;
      byte_length: number;
      media_type: string;
      available: boolean;
      deleted: boolean;
      expires_at: Date;
    }>(
      'SELECT content_hash, byte_length, media_type, available, deleted, expires_at FROM collection.snapshot_generation WHERE object_key = $1 FOR SHARE',
      [input.objectKey],
    );
    const generation = rows[0];
    if (
      !generation ||
      !generation.available ||
      generation.deleted ||
      generation.expires_at.valueOf() <= Date.now() ||
      generation.content_hash !== input.contentHash ||
      generation.byte_length !== input.byteLength ||
      generation.media_type !== input.mediaType
    )
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.commit' });
  }
}
