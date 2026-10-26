import type {
  PropertySuppressionRepository,
  PropertiesPublicationErasure,
  Transaction,
} from '@rei/application';
import type {
  CollectionListingSuppressed,
  PropertiesListingSuppressedPayload,
  SuppressedPropertyChange,
  ListingChronologyState,
} from '@rei/domain';
import { NormalizedListing } from '@rei/domain';
import { matchingHash } from './postgres-property-resolution.repository.js';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { PostgresPropertyRepository } from './postgres-property.repository.js';

type Member = {
  listing_id: string;
  original_property_id: string;
  state: ListingChronologyState | null;
  initial_event: unknown;
};
/** Caller holds Collection authority; this adapter takes Properties identity then resolution guard. */
export class PostgresPropertySuppressionRepository implements PropertySuppressionRepository {
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly publications: PropertiesPublicationErasure,
  ) {}
  public async erase(
    transaction: Transaction,
    event: CollectionListingSuppressed,
    signal: AbortSignal,
  ): Promise<PropertiesListingSuppressedPayload | null> {
    const { sourceId, sourceListingId } = event.payload;
    await new PostgresPropertyRepository(this.connection).lockSourceIdentity(
      transaction,
      sourceId,
      sourceListingId,
    );
    const client = postgresClientFor(transaction, this.connection),
      identity = [sourceId, sourceListingId];
    if (
      (
        await client.query(
          'SELECT 1 FROM properties.listing_suppression_receipt WHERE source_id=$1 AND source_listing_id=$2',
          identity,
        )
      ).length
    )
      return null;
    const target = (
      await client.query<{
        listing_id: string;
        property_id: string;
        revision: number | null;
        assigned_property_id: string | null;
        assignment_revision: number | null;
      }>(
        `SELECT listing.listing_id::text,listing.property_id::text,current.revision,assignment.property_id::text AS assigned_property_id,assignment.assignment_revision FROM properties.listing listing LEFT JOIN properties.listing_current current USING(listing_id) LEFT JOIN properties.listing_assignment assignment USING(listing_id) WHERE listing.source_id=$1 AND listing.source_listing_id=$2`,
        identity,
      )
    )[0];
    const listingId = target?.listing_id ?? null;
    await this.publications.erasePropertiesListingCopies(transaction, {
      sourceId,
      sourceListingId,
      listingId,
    });
    const changes: SuppressedPropertyChange[] = [];
    if (target) {
      // Include an old anchor still used by another current group after a prior split/merge.
      const affected = [
        ...new Set(
          [target.property_id, target.assigned_property_id].filter(
            (id): id is string => id !== null,
          ),
        ),
      ].sort();
      const minimumReferences = JSON.stringify({
        listingId: target.listing_id,
        sourceId,
        sourceListingId,
      });
      await client.query(
        `DELETE FROM properties.property_minimum_effect WHERE cause_event_id IN (SELECT event_id FROM properties.listing_event WHERE listing_id=$1) OR jsonb_path_exists(minimum_effect, '$.** ? (@ == $listingId)', $2::jsonb) OR jsonb_path_exists(minimum_effect, '$.** ? (@.sourceId == $sourceId && @.sourceListingId == $sourceListingId)', $2::jsonb)`,
        [listingId, minimumReferences],
      );
      for (const previousPropertyId of affected) {
        const members = await client.query<Member>(
          `SELECT assigned.listing_id::text,identity.property_id::text AS original_property_id,current.state,fact.event AS initial_event FROM properties.listing_assignment assigned JOIN properties.listing identity USING(listing_id) JOIN properties.property original ON original.property_id=identity.property_id JOIN properties.incoming_fact fact ON fact.event_id=original.initial_event_id LEFT JOIN properties.listing_current current USING(listing_id) WHERE assigned.property_id=$1 AND assigned.listing_id<>$2 ORDER BY identity.property_id,assigned.listing_id`,
          [previousPropertyId, listingId],
        );
        // An unused original identity is lineage, not an additional current group change.
        if (
          target.assigned_property_id !== null &&
          previousPropertyId !== target.assigned_property_id &&
          !members.length
        )
          continue;
        const propertyId = members.length
          ? previousPropertyId === target.property_id
            ? members.map((m) => m.original_property_id).sort()[0]!
            : previousPropertyId
          : null;
        const previousRevision =
          (
            await client.query<{ revision: number }>(
              'SELECT revision FROM properties.resolution_property_state WHERE property_id=$1',
              [previousPropertyId],
            )
          )[0]?.revision ?? 0;
        const destinationRevision = propertyId
          ? ((
              await client.query<{ revision: number }>(
                'SELECT revision FROM properties.resolution_property_state WHERE property_id=$1',
                [propertyId],
              )
            )[0]?.revision ?? 0)
          : 0;
        const revision = Math.max(previousRevision, destinationRevision) + 1;
        if (propertyId) {
          for (const member of members) {
            const latest = member.state?.acquisitions.at(-1);
            const evidence = latest ? (latest.corrected ?? latest.original) : member.initial_event;
            await client.query(
              'UPDATE properties.listing_assignment SET suppression_continuity_hash=$2 WHERE listing_id=$1',
              [member.listing_id, matchingHash(new NormalizedListing(evidence))],
            );
          }
          if (propertyId !== previousPropertyId) {
            await client.query(
              `UPDATE properties.listing_assignment SET property_id=$2,assignment_revision=assignment_revision+1 WHERE property_id=$1 AND listing_id<>$3`,
              [previousPropertyId, propertyId, listingId],
            );
            // Surviving historical minimum evidence is rekeyed, never reinterpreted as repricing.
            await client.query(
              `UPDATE properties.property_minimum_effect SET property_id=$2::uuid,minimum_effect=jsonb_set(jsonb_set(minimum_effect,'{previous,propertyId}',to_jsonb(($2::uuid)::text)),'{current,propertyId}',to_jsonb(($2::uuid)::text)) WHERE property_id=$1`,
              [previousPropertyId, propertyId],
            );
            await client.query(
              'DELETE FROM properties.resolution_property_state WHERE property_id=$1',
              [previousPropertyId],
            );
          }
          await client.query(
            `INSERT INTO properties.resolution_property_state(property_id,revision) VALUES ($1,$2) ON CONFLICT(property_id) DO UPDATE SET revision=EXCLUDED.revision`,
            [propertyId, revision],
          );
        } else {
          await client.query(
            'DELETE FROM properties.property_minimum_effect WHERE property_id=$1',
            [previousPropertyId],
          );
          await client.query(
            'DELETE FROM properties.resolution_property_state WHERE property_id=$1',
            [previousPropertyId],
          );
        }
        changes.push({
          previousPropertyId,
          propertyId,
          previousRevision,
          revision,
        });
      }
      await client.query(
        'DELETE FROM properties.match_comparison WHERE left_listing_id=$1 OR right_listing_id=$1',
        [listingId],
      );
      await client.query('DELETE FROM properties.listing_assignment WHERE listing_id=$1', [
        listingId,
      ]);
      for (const table of ['listing_current', 'listing_acquisition', 'listing_event'])
        await client.query(`DELETE FROM properties.${table} WHERE listing_id=$1`, [listingId]);
      await client.query('DELETE FROM properties.listing WHERE listing_id=$1', [listingId]);
      await client.query('DELETE FROM properties.resolution_property_state WHERE property_id=$1', [
        target.property_id,
      ]);
      await client.query('DELETE FROM properties.property WHERE property_id=$1', [
        target.property_id,
      ]);
    }
    await client.query(
      'DELETE FROM properties.listing_run_effect WHERE source_id=$1 AND source_listing_id=$2',
      identity,
    );
    for (const table of ['correction_effect', 'original_effect', 'fact_disposition'])
      await client.query(
        `DELETE FROM properties.${table} WHERE event_id IN (SELECT event_id FROM properties.incoming_fact WHERE source_id=$1 AND source_listing_id=$2)`,
        identity,
      );
    await client.query(
      'DELETE FROM properties.incoming_fact WHERE source_id=$1 AND source_listing_id=$2',
      identity,
    );
    await client.query(
      'INSERT INTO properties.listing_suppression_receipt(source_id,source_listing_id,cause_event_id,suppression_id,listing_id,original_property_id) VALUES($1,$2,$3,$4,$5,$6)',
      [...identity, event.eventId, event.aggregateId, listingId, target?.property_id ?? null],
    );
    signal.throwIfAborted();
    return {
      causeEventId: event.eventId,
      suppressionId: event.aggregateId,
      sourceId,
      sourceListingId,
      listingId,
      originalPropertyId: target?.property_id ?? null,
      listingRevision: target?.revision ?? null,
      assignmentRevision: target?.assignment_revision ?? null,
      changes,
    };
  }
}
