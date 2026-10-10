import type {
  CollectionFacade,
  CollectionRunView,
  CollectionSourcePermissions,
  SourceRegisterRepository,
  ParsedCollectionEvent,
  Transaction,
} from '@rei/application';
import {
  parseSha256Hash,
  parseUuidV7,
  parseCollectionEvent,
  isOwnedSyntheticSourceId,
  CollectionSnapshotCorrected,
  type EnabledSourceView,
  type Sha256Hash,
} from '@rei/domain';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

export class PostgresCollectionFacade implements CollectionFacade {
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly sources: SourceRegisterRepository,
  ) {}

  public async verifyParsedEvent(
    transaction: Transaction,
    event: ParsedCollectionEvent,
  ): Promise<boolean> {
    if (!isOwnedSyntheticSourceId(event.payload.source.sourceId)) return false;
    const client = postgresClientFor(transaction, this.connection);
    const rows = await client.query<{
      event: unknown;
      original_event_id: string;
      run_id: string;
      source_id: string;
      source_listing_id: string;
      source_url: string;
      observed_at: Date;
      content_hash: string;
      image_fingerprints: unknown;
    }>(
      `SELECT evidence.event, observation.parsed_event_id::text AS original_event_id,
        observation.run_id::text, run.source_id, observation.source_listing_id, observation.source_url,
        observation.observed_at, observation.content_hash, observation.image_fingerprints
       FROM collection.parsed_event_evidence AS evidence
       JOIN collection.snapshot_observation AS observation ON observation.snapshot_id = evidence.snapshot_id
       JOIN collection.collection_run AS run ON run.run_id = observation.run_id
       JOIN collection.source_register AS source ON source.source_id = run.source_id
       WHERE evidence.event_id = $1 AND evidence.snapshot_id = $2 AND observation.outcome = 'parsed'
         AND source.source_category = 'synthetic-listing' AND source.access_method = 'repository-fixture'
         AND source.review_outcome = 'not-required' AND source.enabled AND source.collection_allowed
         AND source.hold_reason IS NULL
       FOR SHARE OF evidence, observation, run, source`,
      [event.eventId, event.payload.snapshot.snapshotId],
    );
    const row = rows[0];
    if (!row) return false;
    const stored = parseCollectionEvent(row.event);
    const { source, run, snapshot, listing } = event.payload;
    if (
      JSON.stringify(stored) !== JSON.stringify(event) ||
      row.run_id !== run.runId ||
      row.source_id !== source.sourceId ||
      row.source_listing_id !== source.sourceListingId ||
      row.source_url !== source.sourceUrl ||
      row.content_hash !== snapshot.contentHash ||
      !(row.observed_at instanceof Date) ||
      row.observed_at.toISOString() !== source.observedAt ||
      JSON.stringify(row.image_fingerprints) !== JSON.stringify(listing.imageFingerprints)
    )
      return false;
    if (event instanceof CollectionSnapshotCorrected) {
      const correction = event.payload.correction;
      if (row.original_event_id !== correction.originalParsedEventId) return false;
      const corrections = await client.query(
        `SELECT operation_key FROM collection.snapshot_reparse
        WHERE operation_key = $1 AND snapshot_id = $2 AND parser_revision = $3 AND event_id = $4
          AND correction_order = $5 AND completed_at IS NOT NULL FOR SHARE`,
        [
          correction.operationKey,
          snapshot.snapshotId,
          correction.parserRevision,
          event.eventId,
          correction.order,
        ],
      );
      return corrections.length === 1;
    }
    return row.original_event_id === event.eventId;
  }

  public async getSourcePermissions(sourceId: string): Promise<CollectionSourcePermissions> {
    const source = await this.sources.findById(sourceId);
    return Object.freeze({
      sourceId,
      collectionAllowed: source?.permissions.collectionAllowed ?? false,
      imageFetchingAllowed: source?.permissions.imageFetchingAllowed ?? false,
      listingTextDisplayAllowed: source?.permissions.listingTextDisplayAllowed ?? false,
    });
  }

  public async getRun(runId: string): Promise<CollectionRunView | null> {
    const rows = await this.connection.query<{
      run_id: unknown;
      source_id: unknown;
      started_at: unknown;
      completed_at: unknown;
      observed_count: unknown;
      parsed_count: unknown;
      changed_count?: unknown;
      suppressed_count: unknown;
      failed_count: unknown;
      manifest_hash: unknown;
      source_listing_ids: unknown;
    }>(
      `SELECT run.run_id::text, run.source_id, run.started_at, run.completed_at,
              run.observed_count, run.parsed_count, run.changed_count,
              run.suppressed_count, run.failed_count,
              run.manifest_hash,
              COALESCE(array_agg(observation.source_listing_id ORDER BY observation.source_listing_id)
                FILTER (WHERE observation.source_listing_id IS NOT NULL), ARRAY[]::text[]) AS source_listing_ids
         FROM collection.collection_run AS run
         LEFT JOIN collection.snapshot_observation AS observation ON observation.run_id = run.run_id
        WHERE run.run_id = $1 AND run.status = 'completed'
        GROUP BY run.run_id`,
      [runId],
    );
    const row = rows[0];
    if (!row) return null;
    if (
      typeof row.run_id !== 'string' ||
      typeof row.source_id !== 'string' ||
      !(row.started_at instanceof Date) ||
      !(row.completed_at instanceof Date) ||
      typeof row.observed_count !== 'number' ||
      typeof row.parsed_count !== 'number' ||
      (row.changed_count !== undefined && typeof row.changed_count !== 'number') ||
      typeof row.suppressed_count !== 'number' ||
      typeof row.failed_count !== 'number' ||
      typeof row.manifest_hash !== 'string' ||
      !Array.isArray(row.source_listing_ids) ||
      !row.source_listing_ids.every((value) => typeof value === 'string')
    ) {
      throw new Error('Collection persistence returned a malformed run.');
    }
    return Object.freeze({
      runId: parseUuidV7(row.run_id),
      sourceId: row.source_id,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at.toISOString(),
      counts: Object.freeze({
        observed: row.observed_count,
        parsed: row.parsed_count,
        changed: row.changed_count ?? 0,
        suppressed: row.suppressed_count,
        failed: row.failed_count,
      }),
      observedSourceListingIds: Object.freeze([...row.source_listing_ids]),
      manifestHash: parseSha256Hash(row.manifest_hash),
    });
  }

  public async getSnapshotHash(snapshotId: string): Promise<Sha256Hash | null> {
    const rows = await this.connection.query<{ content_hash: unknown }>(
      'SELECT content_hash FROM collection.snapshot_observation WHERE snapshot_id = $1',
      [snapshotId],
    );
    const value = rows[0]?.content_hash;
    if (value === undefined) return null;
    if (typeof value !== 'string')
      throw new Error('Collection persistence returned a malformed hash.');
    return parseSha256Hash(value);
  }

  public listEnabledSources(signal?: AbortSignal): Promise<readonly EnabledSourceView[]> {
    return this.sources.listEnabled(signal);
  }
}
