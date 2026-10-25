import type {
  IncomingFactDisposition,
  ParsedListingFact,
  PropertyRepository,
  Transaction,
} from '@rei/application';
import {
  Property,
  parseUuidV7,
  type ResolvedPropertyPlace,
  type UuidV7,
  type ResolutionComparison,
  type ResolutionConfiguration,
  type ListingChronologyState,
} from '@rei/domain';
import { lockPropertyResolution } from './property-resolution-guard.js';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

export class PostgresPropertyRepository implements PropertyRepository {
  public constructor(private readonly connection: DatabaseConnection) {}
  public async lockSourceIdentity(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<void> {
    await postgresClientFor(transaction, this.connection).query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [JSON.stringify(['properties', sourceId, sourceListingId])],
    );
    await lockPropertyResolution(transaction, this.connection);
  }
  public async hasFact(transaction: Transaction, eventId: UuidV7): Promise<boolean> {
    const rows = await postgresClientFor(transaction, this.connection).query(
      'SELECT event_id FROM properties.incoming_fact WHERE event_id = $1',
      [eventId],
    );
    return rows.length > 0;
  }
  public async findSourceIdentity(
    transaction: Transaction,
    sourceId: string,
    sourceListingId: string,
  ): Promise<UuidV7 | null> {
    const rows = await postgresClientFor(transaction, this.connection).query<{
      property_id: string;
    }>(
      'SELECT property_id::text FROM properties.listing WHERE source_id = $1 AND source_listing_id = $2',
      [sourceId, sourceListingId],
    );
    return rows[0] ? parseUuidV7(rows[0].property_id) : null;
  }
  public async appendFact(
    transaction: Transaction,
    event: ParsedListingFact,
    disposition: IncomingFactDisposition,
  ): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    await client.query(
      `INSERT INTO properties.incoming_fact (event_id, source_id, source_listing_id, snapshot_id, event_version, event)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        event.eventId,
        event.payload.source.sourceId,
        event.payload.source.sourceListingId,
        event.payload.snapshot.snapshotId,
        event.version,
        JSON.stringify(event),
      ],
    );
    await client.query(
      'INSERT INTO properties.fact_disposition (event_id, disposition) VALUES ($1, $2)',
      [event.eventId, disposition],
    );
  }
  public async create(transaction: Transaction, property: Property): Promise<void> {
    await lockPropertyResolution(transaction, this.connection);
    const client = postgresClientFor(transaction, this.connection);
    await client.query(
      'INSERT INTO properties.property (property_id, initial_event_id, resolved_place) VALUES ($1, $2, $3::jsonb)',
      [property.propertyId, property.initial.eventId, JSON.stringify(property.resolved)],
    );
    const { sourceId, sourceListingId } = property.provenance;
    const listing = property.normalized;
    await client.query(
      `INSERT INTO properties.listing (listing_id, property_id, source_id, source_listing_id, asking_price_minor_units, currency, area_square_meters)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        property.listingId,
        property.propertyId,
        sourceId,
        sourceListingId,
        listing.askingPriceMinorUnits.value,
        listing.currency.value,
        listing.areaSquareMeters.value,
      ],
    );
  }
  public async getProperty(id: string): Promise<Property | null> {
    return this.read('property.property_id', id);
  }
  public async getListing(id: string): Promise<Property | null> {
    return this.read('listing.listing_id', id);
  }
  public async getCurrentGroup(listingId: string): Promise<{
    propertyId: string;
    members: readonly Property[];
    states: readonly { listingId: string; state: ListingChronologyState | null }[];
    comparisons: readonly ResolutionComparison[];
    configuration: ResolutionConfiguration;
    priceChanges: readonly import('@rei/domain').PriceChange[];
  } | null> {
    type MemberRow = {
      property_id: string;
      listing_id: string;
      original_property_id: string;
      event: unknown;
      resolved_place: ResolvedPropertyPlace;
      state: ListingChronologyState | null;
    };
    type PairRow = { evidence: ResolutionComparison; configuration: ResolutionConfiguration };
    type MinimumEffect = Pick<
      import('@rei/domain').PropertiesEventV2<'properties.property.asking-price-changed'>['payload'],
      'effectiveAt' | 'previous' | 'current'
    >;
    // Membership, chronology and explanatory evidence share one PostgreSQL statement snapshot.
    const snapshot = (
      await this.connection.query<{
        members: MemberRow[];
        pairs: PairRow[];
        configuration: ResolutionConfiguration | null;
        effects: MinimumEffect[];
      }>(
        `WITH members AS (
        SELECT member.property_id::text,listing.listing_id::text,listing.property_id::text AS original_property_id,fact.event,property.resolved_place,current.state,listing.source_id,listing.source_listing_id
        FROM properties.listing_assignment requested JOIN properties.listing_assignment member ON member.property_id=requested.property_id
        JOIN properties.listing listing ON listing.listing_id=member.listing_id
        JOIN properties.property property ON property.property_id=listing.property_id
        JOIN properties.incoming_fact fact ON fact.event_id=property.initial_event_id
        LEFT JOIN properties.listing_current current ON current.listing_id=member.listing_id
        WHERE requested.listing_id=$1
      ), pairs AS (
        SELECT comparison.evidence,configuration.configuration,configuration.version,comparison.left_listing_id,comparison.right_listing_id FROM properties.match_comparison comparison
        JOIN properties.listing_assignment left_member ON left_member.listing_id=comparison.left_listing_id AND left_member.input_hash=comparison.left_input_hash AND left_member.configuration_id=comparison.configuration_id AND left_member.configuration_version=comparison.configuration_version
        JOIN properties.listing_assignment right_member ON right_member.listing_id=comparison.right_listing_id AND right_member.input_hash=comparison.right_input_hash AND right_member.configuration_id=comparison.configuration_id AND right_member.configuration_version=comparison.configuration_version
        JOIN properties.resolution_configuration configuration ON configuration.configuration_id=comparison.configuration_id AND configuration.version=comparison.configuration_version
        WHERE left_member.property_id::text=(SELECT property_id FROM members LIMIT 1) AND right_member.property_id=left_member.property_id
      )
      SELECT (SELECT jsonb_agg(to_jsonb(member) ORDER BY source_id,source_listing_id,listing_id) FROM members member) AS members,
        COALESCE((SELECT jsonb_agg(to_jsonb(pair) ORDER BY version DESC,left_listing_id,right_listing_id) FROM pairs pair),'[]'::jsonb) AS pairs,
        (SELECT configuration.configuration FROM properties.listing_assignment requested JOIN properties.resolution_configuration configuration ON configuration.configuration_id=requested.configuration_id AND configuration.version=requested.configuration_version WHERE requested.listing_id=$1) AS configuration,
        COALESCE((SELECT jsonb_agg(minimum_effect ORDER BY (minimum_effect->>'effectiveAt')::timestamptz,effect_position) FROM properties.property_minimum_effect WHERE property_id::text=(SELECT property_id FROM members LIMIT 1)),'[]'::jsonb) AS effects
      WHERE EXISTS(SELECT 1 FROM members)`,
        [listingId],
      )
    )[0];
    if (!snapshot) return null;
    const rows = snapshot.members,
      pairs = snapshot.pairs;
    const configuration = pairs[0]?.configuration ?? snapshot.configuration;
    if (!configuration)
      throw new Error('Current property resolution configuration is unavailable.');
    const effects = snapshot.effects;
    return {
      propertyId: rows[0]!.property_id,
      members: rows.map(
        (row) =>
          new Property(row.original_property_id, row.listing_id, row.event, row.resolved_place),
      ),
      states: rows.map((row) => ({ listingId: row.listing_id, state: row.state })),
      comparisons: pairs
        .filter(
          (pair) =>
            pair.configuration.id === configuration.id &&
            pair.configuration.version === configuration.version,
        )
        .map((pair) => pair.evidence),
      configuration,
      priceChanges: effects.flatMap((p) => {
        return p.previous.minimumMinorUnits !== null &&
          p.current.minimumMinorUnits !== null &&
          p.current.provenance
          ? [
              {
                effectiveAt: p.effectiveAt,
                previousMinorUnits: p.previous.minimumMinorUnits,
                currentMinorUnits: p.current.minimumMinorUnits,
                changePercent:
                  ((p.current.minimumMinorUnits - p.previous.minimumMinorUnits) /
                    p.previous.minimumMinorUnits) *
                  100,
                provenance: p.current.provenance,
              },
            ]
          : [];
      }),
    };
  }
  private async read(
    column: 'property.property_id' | 'listing.listing_id',
    id: string,
  ): Promise<Property | null> {
    parseUuidV7(id);
    const rows = await this.connection.query<{
      property_id: string;
      listing_id: string;
      event: unknown;
      resolved_place: ResolvedPropertyPlace;
    }>(
      `SELECT property.property_id::text, listing.listing_id::text, fact.event, property.resolved_place
       FROM properties.property AS property
       JOIN properties.listing AS listing ON listing.property_id = property.property_id
       JOIN properties.incoming_fact AS fact ON fact.event_id = property.initial_event_id
       WHERE ${column} = $1`,
      [id],
    );
    const row = rows[0];
    return row
      ? new Property(row.property_id, row.listing_id, row.event, row.resolved_place)
      : null;
  }
}
