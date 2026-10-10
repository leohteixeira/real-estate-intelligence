import type {
  CollectionFacade,
  CollectionRunView,
  CollectionSourcePermissions,
  SourceRegisterRepository,
} from '@rei/application';
import { parseSha256Hash, parseUuidV7, type EnabledSourceView, type Sha256Hash } from '@rei/domain';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';

export class PostgresCollectionFacade implements CollectionFacade {
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly sources: SourceRegisterRepository,
  ) {}

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
      suppressed_count: unknown;
      failed_count: unknown;
      manifest_hash: unknown;
      source_listing_ids: unknown;
    }>(
      `SELECT run.run_id::text, run.source_id, run.started_at, run.completed_at,
              run.observed_count, run.parsed_count, run.suppressed_count, run.failed_count,
              run.manifest_hash,
              COALESCE(array_agg(observation.source_listing_id ORDER BY observation.source_listing_id)
                FILTER (WHERE observation.source_listing_id IS NOT NULL), ARRAY[]::text[]) AS source_listing_ids
         FROM collection.collection_run AS run
         LEFT JOIN collection.snapshot_observation AS observation ON observation.run_id = run.run_id
        WHERE run.run_id = $1
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
