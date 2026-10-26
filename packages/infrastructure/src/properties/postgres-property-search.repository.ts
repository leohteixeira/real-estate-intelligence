import type { PropertySearchRepository } from '@rei/application';
import {
  Property,
  type ListingChronologyState,
  type ResolvedPropertyPlace,
  type PriceChange,
} from '@rei/domain';
import { redactConnectionError, type DatabaseConnection } from '../shared/index.js';
import {
  projectInitialProperty,
  projectCurrentPropertySummary,
} from './persisted-property.projection.js';

/** Immutable lineage, current membership, chronology and minimum effects share one statement snapshot. */
export class PostgresPropertySearchRepository implements PropertySearchRepository {
  public constructor(private readonly connection: Pick<DatabaseConnection, 'query'>) {}
  public async readCurrent(): ReturnType<PropertySearchRepository['readCurrent']> {
    type Row = {
      property_id: string;
      original_property_id: string;
      listing_id: string;
      assigned: boolean;
      event: unknown;
      resolved_place: ResolvedPropertyPlace;
      state: ListingChronologyState | null;
      price_changes: PriceChange[];
    };
    try {
      const rows = await this.connection.query<Row>(
        `SELECT COALESCE(assignment.property_id,listing.property_id)::text AS property_id,
          listing.property_id::text AS original_property_id,listing.listing_id::text,
          assignment.listing_id IS NOT NULL AS assigned,initial.event,original.resolved_place,current.state,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'effectiveAt',minimum_effect->>'effectiveAt',
            'previousMinorUnits',minimum_effect->'previous'->'minimumMinorUnits',
            'currentMinorUnits',minimum_effect->'current'->'minimumMinorUnits',
            'changePercent',((minimum_effect->'current'->>'minimumMinorUnits')::numeric-(minimum_effect->'previous'->>'minimumMinorUnits')::numeric)/(minimum_effect->'previous'->>'minimumMinorUnits')::numeric*100,
            'provenance',minimum_effect->'current'->'provenance') ORDER BY (minimum_effect->>'effectiveAt')::timestamptz,effect_position)
            FROM properties.property_minimum_effect effect WHERE effect.property_id=assignment.property_id
              AND minimum_effect->'previous'->'minimumMinorUnits'<>'null'::jsonb
              AND minimum_effect->'current'->'minimumMinorUnits'<>'null'::jsonb
              AND minimum_effect->'current'->'provenance'<>'null'::jsonb),'[]'::jsonb) AS price_changes
        FROM properties.listing listing
        JOIN properties.property original ON original.property_id=listing.property_id
        JOIN properties.incoming_fact initial ON initial.event_id=original.initial_event_id
        LEFT JOIN properties.listing_assignment assignment ON assignment.listing_id=listing.listing_id
        LEFT JOIN properties.listing_current current ON current.listing_id=listing.listing_id
        ORDER BY property_id,listing.source_id,listing.source_listing_id,listing.listing_id`,
      );
      const groups = new Map<string, Row[]>();
      for (const row of rows) {
        const members = groups.get(row.property_id) ?? [];
        members.push(row);
        groups.set(row.property_id, members);
      }
      return [...groups.values()].map((rows) => {
        const first = rows[0]!;
        const members = rows.map((row) =>
          projectInitialProperty(
            new Property(row.original_property_id, row.listing_id, row.event, row.resolved_place),
            false,
            row.state,
          ),
        );
        if (first.assigned)
          return projectCurrentPropertySummary(first.property_id, members, first.price_changes);
        return { summary: members[0]!.property.summary, asOf: members[0]!.metadata.asOf };
      });
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
