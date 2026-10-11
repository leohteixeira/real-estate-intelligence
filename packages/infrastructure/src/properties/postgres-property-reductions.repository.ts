import type { PropertyReductionsRepository } from '@rei/application';
import type { ReductionCandidate } from '@rei/domain';
import { redactConnectionError, type DatabaseConnection } from '../shared/index.js';

/** One statement snapshot: all SQL reads Properties, with only safe reduction facts projected. */
export class PostgresPropertyReductionsRepository implements PropertyReductionsRepository {
  public constructor(private readonly connection: DatabaseConnection) {}
  public async readCandidates(placeIds: readonly string[]): Promise<readonly ReductionCandidate[]> {
    try {
      return await this.connection.query<ReductionCandidate>(
        `SELECT property.property_id::text AS "propertyId",listing.listing_id::text AS "listingId",
          COALESCE(latest.acquisition->'resolved'->'place',property.resolved_place->'place') AS place,
          to_char(dates.as_of AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'type','price-changed','effectiveAt',effect->>'effectiveAt',
            'previousMinorUnits',effect->'previousMinorUnits','currentMinorUnits',effect->'currentMinorUnits',
            'provenance',effect->'provenance') ORDER BY position)
            FROM jsonb_array_elements(current.state->'history') WITH ORDINALITY AS effects(effect,position)
            WHERE effect->>'type'='price-changed'),'[]'::jsonb) AS "priceChanges"
        FROM properties.property property
        JOIN properties.listing listing ON listing.property_id=property.property_id
        JOIN properties.incoming_fact initial ON initial.event_id=property.initial_event_id
        LEFT JOIN properties.listing_current current ON current.listing_id=listing.listing_id
        LEFT JOIN LATERAL (
          SELECT acquisition FROM jsonb_array_elements(current.state->'acquisitions') WITH ORDINALITY AS acquisitions(acquisition,position)
          ORDER BY position DESC LIMIT 1
        ) latest ON true
        CROSS JOIN LATERAL (
          SELECT max(observed_at) AS as_of FROM (
            SELECT (initial.event->'payload'->'source'->>'observedAt')::timestamptz AS observed_at
            UNION ALL SELECT (acquisition->'original'->'payload'->'source'->>'observedAt')::timestamptz
              FROM jsonb_array_elements(current.state->'acquisitions') acquisition
            UNION ALL SELECT (effect->>'effectiveAt')::timestamptz
              FROM jsonb_array_elements(current.state->'history') effect
          ) retained_dates
        ) dates
        WHERE COALESCE(latest.acquisition->'resolved'->'place'->>'id',property.resolved_place->'place'->>'id')=ANY($1::text[])
        ORDER BY property.property_id`,
        [placeIds],
      );
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
