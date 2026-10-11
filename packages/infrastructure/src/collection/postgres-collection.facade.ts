import type {
  CollectionFacade,
  CollectionHistoryFacade,
  CanonicalCompletedRun,
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
  CollectionRunCompleted,
  hashCollectionManifest,
  type EnabledSourceView,
  type Sha256Hash,
} from '@rei/domain';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { lockSourceAdmission } from './postgres-source-admission.js';

export class PostgresCollectionFacade implements CollectionFacade, CollectionHistoryFacade {
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly sources: SourceRegisterRepository,
  ) {}

  public async verifyCompletedEvent(
    transaction: Transaction,
    event: CollectionRunCompleted,
  ): Promise<boolean> {
    if (!isOwnedSyntheticSourceId(event.payload.sourceId)) return false;
    const rows = await postgresClientFor(transaction, this.connection).query<{
      event: unknown;
      observed_source_listing_ids: string[];
      started_at: Date;
      completed_at: Date;
      observed_count: number;
      parsed_count: number;
      suppressed_count: number;
      failed_count: number;
      manifest_hash: string;
    }>(
      `SELECT evidence.event, evidence.observed_source_listing_ids, run.started_at,
        run.completed_at, run.observed_count, run.parsed_count, run.suppressed_count,
        run.failed_count, run.manifest_hash
       FROM collection.completed_event_evidence evidence
       JOIN collection.collection_run run ON run.run_id=evidence.run_id
       JOIN collection.source_register source ON source.source_id=run.source_id
       WHERE evidence.event_id=$1 AND run.run_id=$2 AND run.source_id=$3
         AND run.status='completed' AND run.completed_event_id=evidence.event_id
         AND source.source_category='synthetic-listing' AND source.access_method='repository-fixture'
         AND source.review_outcome='not-required' AND source.enabled AND source.collection_allowed
         AND source.hold_reason IS NULL
       FOR SHARE OF evidence, run, source`,
      [event.eventId, event.aggregateId, event.payload.sourceId],
    );
    const row = rows[0];
    if (!row || JSON.stringify(parseCollectionEvent(row.event)) !== JSON.stringify(event))
      return false;
    return (
      row.completed_at.toISOString() === event.occurredAt &&
      row.observed_count === event.payload.observedCount &&
      row.parsed_count === event.payload.parsedCount &&
      row.suppressed_count === event.payload.suppressedCount &&
      row.failed_count === event.payload.failedCount &&
      row.observed_source_listing_ids.length === row.observed_count &&
      hashCollectionManifest(row.observed_source_listing_ids) === row.manifest_hash &&
      row.manifest_hash === event.payload.manifestHash
    );
  }

  public async nextCompletedRun(
    transaction: Transaction,
    sourceId: string,
    after: { readonly startedAt: string; readonly runId: string } | null,
  ): Promise<CanonicalCompletedRun | null> {
    const client = postgresClientFor(transaction, this.connection);
    await lockSourceAdmission(client, sourceId);
    const rows = await client.query<{
      event: unknown;
      started_at: Date;
      observed_source_listing_ids: string[];
    }>(
      `SELECT evidence.event, run.started_at, evidence.observed_source_listing_ids
       FROM collection.collection_run run
       JOIN collection.completed_event_evidence evidence ON evidence.run_id=run.run_id
       WHERE run.source_id=$1 AND run.status='completed'
         AND ($2::timestamptz IS NULL OR (run.started_at,run.run_id)>($2::timestamptz,$3::uuid))
         AND NOT EXISTS (SELECT 1 FROM collection.collection_run earlier
           WHERE earlier.source_id=run.source_id AND earlier.status IN ('running','paused')
             AND (earlier.started_at,earlier.run_id)<(run.started_at,run.run_id))
       ORDER BY run.started_at,run.run_id LIMIT 1 FOR SHARE OF run,evidence`,
      [sourceId, after?.startedAt ?? null, after?.runId ?? null],
    );
    const row = rows[0];
    if (!row) return null;
    const event = parseCollectionEvent(row.event);
    if (
      !(event instanceof CollectionRunCompleted) ||
      !(await this.verifyCompletedEvent(transaction, event))
    )
      return null;
    return {
      event,
      runId: event.aggregateId,
      sourceId,
      startedAt: row.started_at.toISOString(),
      completedAt: event.occurredAt,
      manifestHash: event.payload.manifestHash,
      observedSourceListingIds: row.observed_source_listing_ids,
      counts: {
        observed: event.payload.observedCount,
        parsed: event.payload.parsedCount,
        changed: 0,
        suppressed: event.payload.suppressedCount,
        failed: event.payload.failedCount,
      },
    };
  }

  public async getRunListingFacts(
    transaction: Transaction,
    runId: string,
    sourceListingId: string,
  ): Promise<readonly ParsedCollectionEvent[]> {
    const rows = await postgresClientFor(transaction, this.connection).query<{ event: unknown }>(
      `SELECT evidence.event FROM collection.parsed_event_evidence evidence
       JOIN collection.snapshot_observation observation ON observation.snapshot_id=evidence.snapshot_id
       WHERE observation.run_id=$1 AND observation.source_listing_id=$2 AND evidence.event_version=1
       ORDER BY observation.observed_at,observation.snapshot_id`,
      [runId, sourceListingId],
    );
    const facts: ParsedCollectionEvent[] = [];
    for (const row of rows) {
      const event = parseCollectionEvent(row.event) as ParsedCollectionEvent;
      if (await this.verifyParsedEvent(transaction, event)) facts.push(event);
    }
    return facts;
  }

  public async getLegacyListingFacts(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
    excludedEventIds: readonly string[],
    limit: number,
  ): Promise<readonly ParsedCollectionEvent[]> {
    const rows = await postgresClientFor(transaction, this.connection).query<{ event: unknown }>(
      `SELECT evidence.event FROM collection.parsed_event_evidence evidence
       JOIN collection.snapshot_observation observation ON observation.snapshot_id=evidence.snapshot_id
       JOIN collection.collection_run run ON run.run_id=observation.run_id
       WHERE run.source_id=$1 AND observation.source_listing_id=$2 AND evidence.event_version=1
         AND run.status='completed' AND NOT (evidence.event_id=ANY($3::uuid[]))
         AND NOT EXISTS (SELECT 1 FROM collection.completed_event_evidence completed WHERE completed.run_id=run.run_id)
         AND NOT EXISTS (SELECT 1 FROM collection.collection_run earlier WHERE earlier.source_id=run.source_id
           AND earlier.status IN ('running','paused') AND (earlier.started_at,earlier.run_id)<(run.started_at,run.run_id))
       ORDER BY run.started_at,run.run_id,observation.observed_at,observation.snapshot_id LIMIT $4`,
      [sourceId, sourceListingId, excludedEventIds, limit],
    );
    const facts: ParsedCollectionEvent[] = [];
    for (const row of rows) {
      const event = parseCollectionEvent(row.event) as ParsedCollectionEvent;
      if (await this.verifyParsedEvent(transaction, event)) facts.push(event);
    }
    return facts;
  }

  public async getSnapshotCorrections(
    transaction: Transaction,
    snapshotId: string,
  ): Promise<readonly ParsedCollectionEvent[]> {
    const rows = await postgresClientFor(transaction, this.connection).query<{ event: unknown }>(
      `SELECT event FROM collection.parsed_event_evidence WHERE snapshot_id=$1 AND event_version=2
       ORDER BY (event->'payload'->'correction'->>'order')::integer DESC`,
      [snapshotId],
    );
    const events: ParsedCollectionEvent[] = [];
    for (const row of rows) {
      const event = parseCollectionEvent(row.event) as ParsedCollectionEvent;
      if (await this.verifyParsedEvent(transaction, event)) events.push(event);
    }
    return events;
  }

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
