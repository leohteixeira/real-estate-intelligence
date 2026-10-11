import type {
  IncomingFactDisposition,
  ParsedListingFact,
  PropertyRepository,
  Transaction,
} from '@rei/application';
import { Property, parseUuidV7, type ResolvedPropertyPlace, type UuidV7 } from '@rei/domain';
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
