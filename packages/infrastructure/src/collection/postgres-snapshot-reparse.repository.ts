import { createHash } from 'node:crypto';
import {
  ExternalFailure,
  type ReparseObservation,
  type SnapshotReparseIdentity,
  type SnapshotReparseOperation,
  type SnapshotReparseRepository,
  type SnapshotReparseResult,
  type Transaction,
} from '@rei/application';
import {
  parseImageFingerprints,
  parseReparseLabel,
  parseRfc3339Timestamp,
  parseUuidV7,
  parseSha256Hash,
} from '@rei/domain';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

function rejected(): never {
  throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return rejected();
  return value;
}
function integer(value: unknown, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    return rejected();
  return value;
}
function timestamp(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) return rejected();
  return parseRfc3339Timestamp(value.toISOString(), 'timestamp');
}
function originalFingerprints(value: unknown, synthetic: boolean): readonly string[] {
  const fingerprints = parseImageFingerprints(value);
  if (!synthetic && fingerprints.some((item) => !/^sha256:[0-9a-f]{64}$/.test(item)))
    return rejected();
  return Object.freeze([...fingerprints]);
}

/** Hash verification and legacy evidence decoding never invoke the revised parser. */
export function verifySnapshotReparseBytes(
  observation: ReparseObservation,
  bytes: Uint8Array,
): readonly string[] {
  if (
    bytes.byteLength !== observation.byteLength ||
    bytes.byteLength > 1_048_576 ||
    `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== observation.contentHash
  )
    return rejected();
  if (observation.imageFingerprints !== null)
    return originalFingerprints(observation.imageFingerprints, observation.synthetic);
  try {
    const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      Array.isArray(decoded) ||
      !Object.hasOwn(decoded, 'imageFingerprints')
    )
      return rejected();
    return originalFingerprints(
      (decoded as Record<string, unknown>).imageFingerprints,
      observation.synthetic,
    );
  } catch {
    return rejected();
  }
}

const OBSERVATION = `SELECT observation.snapshot_id::text, observation.run_id::text,
  observation.parsed_event_id::text, observation.content_hash, observation.object_key,
  observation.source_listing_id, observation.source_url, observation.observed_at,
  observation.image_fingerprints, observation.correction_order, observation.outcome,
  run.source_id, source.source_category, content.byte_length, content.media_type
  FROM collection.snapshot_observation AS observation
  JOIN collection.collection_run AS run USING (run_id)
  JOIN collection.source_register AS source ON source.source_id = run.source_id
  JOIN collection.snapshot_content AS content USING (content_hash)
  WHERE observation.snapshot_id = $1`;

function mapObservation(row: Record<string, unknown>): ReparseObservation {
  if (
    row.outcome !== 'parsed' ||
    !['synthetic-listing', 'listing'].includes(text(row.source_category))
  )
    return rejected();
  const synthetic = row.source_category === 'synthetic-listing';
  const contentHash = parseSha256Hash(text(row.content_hash));
  const objectKey = text(row.object_key);
  if (
    synthetic
      ? objectKey !== `synthetic/sha256/${contentHash.slice(7)}.json`
      : !new RegExp(`^real/[a-f0-9]{64}/sha256/${contentHash.slice(7)}\\.aead$`).test(objectKey)
  )
    return rejected();
  if (row.media_type !== 'application/json') return rejected();
  const sourceId = text(row.source_id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId)) return rejected();
  return Object.freeze({
    snapshotId: parseUuidV7(text(row.snapshot_id)),
    runId: parseUuidV7(text(row.run_id)),
    originalParsedEventId: parseUuidV7(text(row.parsed_event_id)),
    contentHash,
    objectKey,
    sourceId,
    sourceListingId: text(row.source_listing_id),
    sourceUrl: text(row.source_url),
    observedAt: timestamp(row.observed_at),
    byteLength: integer(row.byte_length),
    mediaType: 'application/json',
    synthetic,
    imageFingerprints:
      row.image_fingerprints === null
        ? null
        : originalFingerprints(row.image_fingerprints, synthetic),
  });
}

function mapOperation(row: Record<string, unknown>): SnapshotReparseOperation {
  const snapshotId = parseUuidV7(text(row.snapshot_id));
  const parserRevision = parseReparseLabel(row.parser_revision, 'parserRevision');
  const operationKey = parseReparseLabel(row.operation_key, 'operationKey');
  if (row.event_id === null) {
    if (row.correction_order !== null || row.completed_at !== null) return rejected();
    return { snapshotId, parserRevision, result: null };
  }
  timestamp(row.completed_at);
  return {
    snapshotId,
    parserRevision,
    result: {
      snapshotId,
      parserRevision,
      operationKey,
      eventId: parseUuidV7(text(row.event_id)),
      order: integer(row.correction_order),
      replayed: false,
    },
  };
}
const OPERATION = `SELECT operation_key, snapshot_id::text, parser_revision,
  event_id::text, correction_order, completed_at FROM collection.snapshot_reparse WHERE operation_key = $1`;

export class PostgresSnapshotReparseRepository implements SnapshotReparseRepository {
  public constructor(private readonly connection: DatabaseConnection) {}
  public verifyOriginalBytes = verifySnapshotReparseBytes;
  public async findOperation(operationKey: string, signal: AbortSignal) {
    const rows = await this.connection.queryAbortable<Record<string, unknown>>(
      OPERATION,
      [operationKey],
      signal,
    );
    if (rows.length > 1) return rejected();
    return rows[0] ? mapOperation(rows[0]) : null;
  }
  public async findObservation(snapshotId: ReparseObservation['snapshotId'], signal: AbortSignal) {
    const rows = await this.connection.queryAbortable<Record<string, unknown>>(
      OBSERVATION,
      [snapshotId],
      signal,
    );
    if (rows.length > 1) return rejected();
    return rows[0] ? mapObservation(rows[0]) : null;
  }
  public async reserve(
    transaction: Transaction,
    identity: SnapshotReparseIdentity,
    observation: ReparseObservation,
    fingerprints: readonly string[],
  ) {
    const client = postgresClientFor(transaction, this.connection);
    // The observation lock serializes corrections; generation access and ownership stay locked through commit.
    const rows = await client.query<Record<string, unknown>>(
      OBSERVATION + ' FOR UPDATE OF observation',
      [identity.snapshotId],
    );
    if (!rows[0]) return rejected();
    const current = mapObservation(rows[0]);
    if (
      JSON.stringify(current, Object.keys(current).sort()) !==
      JSON.stringify(observation, Object.keys(observation).sort())
    ) {
      // The only allowed concurrent mutation is independent recovery of the same fingerprints.
      if (
        JSON.stringify({ ...current, imageFingerprints: null }, Object.keys(current).sort()) !==
          JSON.stringify(
            { ...observation, imageFingerprints: null },
            Object.keys(observation).sort(),
          ) ||
        (current.imageFingerprints !== null &&
          JSON.stringify(current.imageFingerprints) !== JSON.stringify(fingerprints))
      )
        return rejected();
    }
    await this.assertAvailable(transaction, current);
    await client.query(
      'UPDATE collection.snapshot_observation SET image_fingerprints = $2::jsonb WHERE snapshot_id = $1 AND image_fingerprints IS NULL',
      [identity.snapshotId, JSON.stringify(originalFingerprints(fingerprints, current.synthetic))],
    );
    await client.query(
      `INSERT INTO collection.snapshot_reparse (operation_key, snapshot_id, parser_revision)
      VALUES ($1,$2,$3) ON CONFLICT (operation_key) DO NOTHING`,
      [identity.operationKey, identity.snapshotId, identity.parserRevision],
    );
    const operations = await client.query<Record<string, unknown>>(OPERATION + ' FOR UPDATE', [
      identity.operationKey,
    ]);
    const operation = operations[0] ? mapOperation(operations[0]) : rejected();
    this.assertIdentity(operation, identity);
    return { result: operation.result };
  }
  public async lockForCommit(transaction: Transaction, identity: SnapshotReparseIdentity) {
    const client = postgresClientFor(transaction, this.connection);
    const rows = await client.query<Record<string, unknown>>(
      OBSERVATION + ' FOR UPDATE OF observation',
      [identity.snapshotId],
    );
    if (!rows[0]) return rejected();
    const observation = mapObservation(rows[0]);
    const operations = await client.query<Record<string, unknown>>(OPERATION + ' FOR UPDATE', [
      identity.operationKey,
    ]);
    const operation = operations[0] ? mapOperation(operations[0]) : rejected();
    this.assertIdentity(operation, identity);
    if (operation.result)
      return { observation, order: operation.result.order, result: operation.result };
    await this.assertAvailable(transaction, observation);
    if (observation.imageFingerprints === null) return rejected();
    const order = integer(rows[0].correction_order, 0) + 1;
    if (!Number.isSafeInteger(order) || order > 2_147_483_647) return rejected();
    await client.query(
      'UPDATE collection.snapshot_observation SET correction_order = $2 WHERE snapshot_id = $1',
      [identity.snapshotId, order],
    );
    return { observation, order, result: null };
  }
  public async complete(transaction: Transaction, result: SnapshotReparseResult) {
    const rows = await postgresClientFor(transaction, this.connection).query(
      `UPDATE collection.snapshot_reparse SET event_id = $4, correction_order = $5, completed_at = clock_timestamp()
      WHERE operation_key = $1 AND snapshot_id = $2 AND parser_revision = $3 AND event_id IS NULL RETURNING operation_key`,
      [result.operationKey, result.snapshotId, result.parserRevision, result.eventId, result.order],
    );
    if (rows.length !== 1) return rejected();
  }
  private assertIdentity(operation: SnapshotReparseOperation, identity: SnapshotReparseIdentity) {
    if (
      operation.snapshotId !== identity.snapshotId ||
      operation.parserRevision !== identity.parserRevision
    )
      return rejected();
  }
  private async assertAvailable(transaction: Transaction, observation: ReparseObservation) {
    if (observation.synthetic) return;
    const rows = await postgresClientFor(transaction, this.connection).query<
      Record<string, unknown>
    >(
      `SELECT content_hash, source_id, byte_length, media_type, available, deleted,
      expires_at > clock_timestamp() AS unexpired FROM collection.snapshot_generation WHERE object_key = $1 FOR SHARE`,
      [observation.objectKey],
    );
    const row = rows[0];
    if (
      !row ||
      row.content_hash !== observation.contentHash ||
      row.source_id !== observation.sourceId ||
      row.byte_length !== observation.byteLength ||
      row.media_type !== observation.mediaType ||
      row.available !== true ||
      row.deleted !== false ||
      row.unexpired !== true
    )
      return rejected();
  }
}
