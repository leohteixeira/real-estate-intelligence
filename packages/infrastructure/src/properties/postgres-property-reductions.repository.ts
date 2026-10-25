import type { PropertyReductionsRepository } from '@rei/application';
import type { ReductionCandidate } from '@rei/domain';
import { redactConnectionError, type DatabaseConnection } from '../shared/index.js';

/** One statement snapshot: all SQL reads Properties, with only safe reduction facts projected. */
export class PostgresPropertyReductionsRepository implements PropertyReductionsRepository {
  public constructor(private readonly connection: DatabaseConnection) {}
  public async readCandidates(placeIds: readonly string[]): Promise<readonly ReductionCandidate[]> {
    try {
      return await this.connection.query<ReductionCandidate>(
        `WITH resolved AS (
          SELECT DISTINCT assignment.property_id, COALESCE(latest_drop.minimum_effect->'current'->>'selectedListingId',chosen.listing_id::text)::uuid AS listing_id,
            COALESCE(latest.acquisition->'resolved'->'place',property.resolved_place->'place') AS place,
            (SELECT max(observed_at) FROM (
              SELECT (acquisition->'original'->'payload'->'source'->>'observedAt')::timestamptz AS observed_at
                FROM properties.listing_assignment member JOIN properties.listing_current member_current USING(listing_id),jsonb_array_elements(member_current.state->'acquisitions') acquisition WHERE member.property_id=assignment.property_id
              UNION ALL SELECT (initial.event->'payload'->'source'->>'observedAt')::timestamptz
                FROM properties.listing_assignment member JOIN properties.listing identity USING(listing_id)
                JOIN properties.property original ON original.property_id=identity.property_id
                JOIN properties.incoming_fact initial ON initial.event_id=original.initial_event_id WHERE member.property_id=assignment.property_id
              UNION ALL SELECT (effect->>'effectiveAt')::timestamptz
                FROM properties.listing_assignment member JOIN properties.listing_current member_current USING(listing_id),jsonb_array_elements(member_current.state->'history') effect WHERE member.property_id=assignment.property_id
              UNION ALL SELECT (effect.minimum_effect->>'effectiveAt')::timestamptz FROM properties.property_minimum_effect effect WHERE effect.property_id=assignment.property_id
            ) retained_dates) AS as_of
          FROM properties.listing_assignment assignment
          JOIN LATERAL (SELECT member.listing_id FROM properties.listing_assignment member WHERE member.property_id=assignment.property_id ORDER BY (member.market_fact->>'status'='active') DESC,(member.market_fact->>'askingPriceMinorUnits')::bigint,member.listing_id LIMIT 1) chosen ON true
          JOIN LATERAL (SELECT member.listing_id FROM properties.listing_assignment member JOIN properties.listing identity USING(listing_id) WHERE member.property_id=assignment.property_id ORDER BY identity.source_id,identity.source_listing_id,identity.listing_id LIMIT 1) representative ON true
          LEFT JOIN LATERAL (SELECT minimum_effect FROM properties.property_minimum_effect effect WHERE effect.property_id=assignment.property_id AND minimum_effect->'previous'->'minimumMinorUnits'<>'null'::jsonb AND minimum_effect->'current'->'minimumMinorUnits'<>'null'::jsonb AND (minimum_effect->'current'->>'minimumMinorUnits')::bigint<(minimum_effect->'previous'->>'minimumMinorUnits')::bigint ORDER BY (minimum_effect->>'effectiveAt')::timestamptz DESC,effect_position DESC LIMIT 1) latest_drop ON true
          JOIN properties.listing listing ON listing.listing_id=representative.listing_id
          JOIN properties.property property ON property.property_id=listing.property_id
          LEFT JOIN properties.listing_current current ON current.listing_id=listing.listing_id
          LEFT JOIN LATERAL (SELECT acquisition FROM jsonb_array_elements(current.state->'acquisitions') WITH ORDINALITY AS acquisitions(acquisition,position) ORDER BY position DESC LIMIT 1) latest ON true
        )
        SELECT resolved.property_id::text AS "propertyId",resolved.listing_id::text AS "listingId",resolved.place,
          to_char(resolved.as_of AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('type','price-changed','effectiveAt',minimum_effect->>'effectiveAt',
            'previousMinorUnits',minimum_effect->'previous'->'minimumMinorUnits','currentMinorUnits',minimum_effect->'current'->'minimumMinorUnits',
            'provenance',minimum_effect->'current'->'provenance') ORDER BY (minimum_effect->>'effectiveAt')::timestamptz,effect_position)
            FROM properties.property_minimum_effect effect WHERE effect.property_id=resolved.property_id
              AND minimum_effect->'previous'->'minimumMinorUnits'<>'null'::jsonb AND minimum_effect->'current'->'minimumMinorUnits'<>'null'::jsonb),'[]'::jsonb) AS "priceChanges"
        FROM resolved WHERE resolved.place->>'id'=ANY($1::text[]) AND resolved.as_of IS NOT NULL
          AND (EXISTS (SELECT 1 FROM properties.property_minimum_effect effect WHERE effect.property_id=resolved.property_id) OR EXISTS (SELECT 1 FROM properties.listing_assignment member WHERE member.property_id=resolved.property_id AND member.assignment_revision>0))
        UNION ALL
        SELECT property.property_id::text AS "propertyId",listing.listing_id::text AS "listingId",
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
        WHERE (NOT EXISTS (SELECT 1 FROM properties.listing_assignment assignment WHERE assignment.listing_id=listing.listing_id)
          OR EXISTS (SELECT 1 FROM properties.listing_assignment assignment WHERE assignment.listing_id=listing.listing_id AND assignment.assignment_revision=0 AND NOT EXISTS (SELECT 1 FROM properties.property_minimum_effect effect WHERE effect.property_id=assignment.property_id))) AND COALESCE(latest.acquisition->'resolved'->'place'->>'id',property.resolved_place->'place'->>'id')=ANY($1::text[])
        ORDER BY "propertyId"`,
        [placeIds],
      );
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
