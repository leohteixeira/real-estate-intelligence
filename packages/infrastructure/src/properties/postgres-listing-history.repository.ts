import type { ListingHistoryRepository, SourceHistoryWork, Transaction } from '@rei/application';
import {
  Property,
  CollectionSnapshotCorrected,
  parseCollectionEvent,
  type ListingChronologyState,
  type PropertiesEvent,
  type ResolvedPropertyPlace,
} from '@rei/domain';
import { lockPropertyResolution } from './property-resolution-guard.js';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

export class PostgresListingHistoryRepository implements ListingHistoryRepository {
  public constructor(private readonly connection: DatabaseConnection) {}
  public async retainCreation(transaction: Transaction, event: PropertiesEvent): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      `INSERT INTO properties.listing_event (listing_id,revision,event_id,event)
       VALUES ($1,1,$2,$3::jsonb) ON CONFLICT (listing_id,revision) DO NOTHING`,
      [event.aggregateId, event.eventId, JSON.stringify(event)],
    );
  }
  public async enqueue(transaction: Transaction, sourceId: string): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'INSERT INTO properties.source_work (source_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [sourceId],
    );
  }
  public async nextSources(
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly SourceHistoryWork[]> {
    const rows = await this.connection.queryAbortable<{
      source_id: string;
      last_started_at: Date | null;
      last_run_id: string | null;
      listing_cursor: string | null;
    }>(
      'SELECT source_id,last_started_at,last_run_id::text,listing_cursor FROM properties.source_work ORDER BY touched_at,source_id LIMIT $1',
      [limit],
      signal,
    );
    return rows.map((row) => ({
      sourceId: row.source_id,
      after: row.last_started_at
        ? { startedAt: row.last_started_at.toISOString(), runId: row.last_run_id! }
        : null,
      listingCursor: row.listing_cursor,
    }));
  }
  public async listingIdentities(
    transaction: Transaction,
    sourceId: string,
    observed: readonly string[],
    after: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    const rows = await postgresClientFor(transaction, this.connection).query<{
      source_listing_id: string;
    }>(
      `SELECT source_listing_id FROM (SELECT source_listing_id FROM properties.listing WHERE source_id=$1
        UNION SELECT unnest($2::text[]) AS source_listing_id) identities
       WHERE ($3::text IS NULL OR source_listing_id>$3) ORDER BY source_listing_id LIMIT $4`,
      [sourceId, observed, after, limit],
    );
    return rows.map((row) => row.source_listing_id);
  }
  public async progress(
    work: SourceHistoryWork,
    cursor: string | null,
    completed: { startedAt: string; runId: string } | null,
    signal: AbortSignal,
  ): Promise<void> {
    await this.connection.queryAbortable(
      `UPDATE properties.source_work SET last_started_at=$5,last_run_id=$6,listing_cursor=$7,touched_at=clock_timestamp()
       WHERE source_id=$1 AND last_started_at IS NOT DISTINCT FROM $2::timestamptz
         AND last_run_id IS NOT DISTINCT FROM $3::uuid AND listing_cursor IS NOT DISTINCT FROM $4`,
      [
        work.sourceId,
        work.after?.startedAt ?? null,
        work.after?.runId ?? null,
        work.listingCursor,
        completed?.startedAt ?? work.after?.startedAt ?? null,
        completed?.runId ?? work.after?.runId ?? null,
        cursor,
      ],
      signal,
    );
  }
  public async load(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<{ property: Property; state: ListingChronologyState | null } | null> {
    const rows = await postgresClientFor(transaction, this.connection).query<{
      property_id: string;
      listing_id: string;
      event: unknown;
      resolved_place: ResolvedPropertyPlace;
      state: ListingChronologyState | null;
    }>(
      `SELECT property.property_id::text,listing.listing_id::text,fact.event,property.resolved_place,current.state
       FROM properties.listing listing JOIN properties.property property ON property.property_id=listing.property_id
       JOIN properties.incoming_fact fact ON fact.event_id=property.initial_event_id
       LEFT JOIN properties.listing_current current ON current.listing_id=listing.listing_id
       WHERE listing.source_id=$1 AND listing.source_listing_id=$2`,
      [sourceId, sourceListingId],
    );
    const row = rows[0];
    return row
      ? {
          property: new Property(row.property_id, row.listing_id, row.event, row.resolved_place),
          state: row.state,
        }
      : null;
  }
  public async appliedRun(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
    runId: string,
  ): Promise<boolean> {
    return (
      (
        await postgresClientFor(transaction, this.connection).query(
          'SELECT run_id FROM properties.listing_run_effect WHERE source_id=$1 AND source_listing_id=$2 AND run_id=$3',
          [sourceId, sourceListingId, runId],
        )
      ).length > 0
    );
  }
  public async markRun(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
    runId: string,
    disposition: 'applied' | 'rejected' = 'applied',
  ): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'INSERT INTO properties.listing_run_effect (source_id,source_listing_id,run_id,disposition) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [sourceId, sourceListingId, runId, disposition],
    );
  }
  public async save(
    transaction: Transaction,
    property: Property,
    state: ListingChronologyState,
    events: readonly PropertiesEvent[],
  ): Promise<void> {
    await lockPropertyResolution(transaction, this.connection);
    const client = postgresClientFor(transaction, this.connection);
    for (const acquisition of state.acquisitions)
      await client.query(
        `INSERT INTO properties.listing_acquisition (snapshot_id,listing_id,event_id,observed_at)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [
          acquisition.original.payload.snapshot.snapshotId,
          property.listingId,
          acquisition.original.eventId,
          acquisition.original.payload.source.observedAt,
        ],
      );
    for (const event of events)
      await client.query(
        'INSERT INTO properties.listing_event (listing_id,revision,event_id,event) VALUES ($1,$2,$3,$4::jsonb)',
        [property.listingId, event.payload.revision, event.eventId, JSON.stringify(event)],
      );
    await client.query(
      `INSERT INTO properties.listing_current (listing_id,state,revision) VALUES ($1,$2::jsonb,$3)
      ON CONFLICT (listing_id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,updated_at=clock_timestamp()`,
      [property.listingId, JSON.stringify(state), state.revision],
    );
  }
  public async pendingCorrections(
    sourceId: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly CollectionSnapshotCorrected[]> {
    const rows = await this.connection.queryAbortable<{ event: unknown }>(
      `SELECT fact.event FROM properties.incoming_fact fact LEFT JOIN properties.correction_effect effect ON effect.event_id=fact.event_id
       JOIN properties.listing listing ON listing.source_id=fact.source_id AND listing.source_listing_id=fact.source_listing_id
       JOIN properties.property property ON property.property_id=listing.property_id
       LEFT JOIN properties.listing_current current ON current.listing_id=listing.listing_id
       WHERE fact.source_id=$1 AND fact.event_version IN (2,4) AND effect.event_id IS NULL
         AND ((current.state IS NULL AND property.initial_event_id::text=fact.event->'payload'->'correction'->>'originalParsedEventId')
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(current.state->'acquisitions') acquisition
             WHERE acquisition->'original'->>'eventId'=fact.event->'payload'->'correction'->>'originalParsedEventId'))
       ORDER BY fact.event_id LIMIT $2`,
      [sourceId, limit],
      signal,
    );
    return rows
      .map((row) => parseCollectionEvent(row.event))
      .filter(
        (event): event is CollectionSnapshotCorrected =>
          event instanceof CollectionSnapshotCorrected,
      );
  }
  public async pendingOriginalIdentities(
    sourceId: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    const rows = await this.connection.queryAbortable<{ source_listing_id: string }>(
      `SELECT fact.source_listing_id FROM properties.incoming_fact fact
       JOIN properties.listing listing ON listing.source_id=fact.source_id AND listing.source_listing_id=fact.source_listing_id
       LEFT JOIN properties.original_effect effect ON effect.event_id=fact.event_id
       LEFT JOIN properties.listing_acquisition acquisition ON acquisition.event_id=fact.event_id
       WHERE fact.source_id=$1 AND fact.event_version IN (1,3) AND effect.event_id IS NULL AND acquisition.event_id IS NULL
       GROUP BY fact.source_listing_id ORDER BY CASE WHEN fact.source_listing_id > COALESCE(
         (SELECT original_cursor FROM properties.source_work WHERE source_id=$1),'') THEN 0 ELSE 1 END,
         fact.source_listing_id LIMIT $2`,
      [sourceId, limit],
      signal,
    );
    return rows.map((row) => row.source_listing_id);
  }
  public async originalEffects(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<readonly string[]> {
    const rows = await postgresClientFor(transaction, this.connection).query<{ event_id: string }>(
      `SELECT fact.event_id::text FROM properties.original_effect effect JOIN properties.incoming_fact fact ON fact.event_id=effect.event_id
       WHERE fact.source_id=$1 AND fact.source_listing_id=$2`,
      [sourceId, sourceListingId],
    );
    return rows.map((row) => row.event_id);
  }
  public async rotateOriginalIdentity(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'UPDATE properties.source_work SET original_cursor=$2 WHERE source_id=$1',
      [sourceId, sourceListingId],
    );
  }
  public async markOriginal(transaction: Transaction, eventId: string): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'INSERT INTO properties.original_effect (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [eventId],
    );
  }
  public async correctionDisposition(
    transaction: Transaction,
    eventId: string,
  ): Promise<'applied' | 'rejected' | null> {
    const rows = await postgresClientFor(transaction, this.connection).query<{
      disposition: 'applied' | 'rejected';
    }>('SELECT disposition FROM properties.correction_effect WHERE event_id=$1', [eventId]);
    return rows[0]?.disposition ?? null;
  }
  public async markCorrection(
    transaction: Transaction,
    eventId: string,
    disposition: 'applied' | 'rejected' = 'applied',
  ): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'INSERT INTO properties.correction_effect (event_id,disposition) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [eventId, disposition],
    );
  }
  public async getState(listingId: string): Promise<ListingChronologyState | null> {
    return (
      (
        await this.connection.query<{ state: ListingChronologyState }>(
          'SELECT state FROM properties.listing_current WHERE listing_id=$1',
          [listingId],
        )
      )[0]?.state ?? null
    );
  }
}
