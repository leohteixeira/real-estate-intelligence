import {
  ExternalFailure,
  MARKET_LISTING_CONSUMER,
  type MarketListingEvent,
  type MarketPriceFactsProjectionPort,
  type MarketPriceFactsReadPort,
  type Transaction,
} from '@rei/application';
import { parsePropertiesEvent, type ListingFact } from '@rei/domain';
import type { DatabaseConnection } from '../shared/index.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

function rejected(): never {
  throw new ExternalFailure({ kind: 'rejected', operation: MARKET_LISTING_CONSUMER });
}
export class PostgresMarketPriceFacts
  implements MarketPriceFactsProjectionPort, MarketPriceFactsReadPort
{
  public constructor(private readonly connection: DatabaseConnection) {}
  public async project(transaction: Transaction, event: MarketListingEvent): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    const { listing, revision } = event.payload;
    // Fixed lock order serializes event identity, then revision/immutable listing identity.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `market:event:${event.eventId}`,
    ]);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `market:listing:${listing.listingId}`,
    ]);
    const business = JSON.stringify({
      eventId: event.eventId,
      type: event.type,
      version: event.version,
      aggregateId: event.aggregateId,
      occurredAt: event.occurredAt,
      payload: event.payload,
    });
    const existing = await client.query<{ identical: boolean }>(
      `SELECT business_event = $3::jsonb AS identical FROM market.listing_price_evidence
       WHERE event_id = $1 OR (listing_id = $2 AND revision = $4)`,
      [event.eventId, listing.listingId, business, revision],
    );
    if (existing.length) {
      if (existing.length !== 1 || !existing[0]!.identical) rejected();
      return;
    }
    const identity = await client.query<{
      property_id: string;
      source_id: string;
      source_listing_id: string;
    }>(
      `SELECT e.business_event->'payload'->'listing'->>'propertyId' AS property_id,
       e.business_event->'payload'->'listing'->>'sourceId' AS source_id,
       e.business_event->'payload'->'listing'->>'sourceListingId' AS source_listing_id
       FROM market.listing_price_current c JOIN market.listing_price_evidence e
       ON e.event_id = c.event_id WHERE c.listing_id = $1`,
      [listing.listingId],
    );
    if (
      identity.some(
        (row) =>
          row.property_id !== listing.propertyId ||
          row.source_id !== listing.sourceId ||
          row.source_listing_id !== listing.sourceListingId,
      )
    )
      rejected();
    await client.query(
      `INSERT INTO market.listing_price_evidence (event_id, listing_id, revision, business_event)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [event.eventId, listing.listingId, revision, business],
    );
    await client.query(
      `INSERT INTO market.listing_price_current (listing_id, revision, event_id) VALUES ($1, $2, $3)
       ON CONFLICT (listing_id) DO UPDATE SET revision = EXCLUDED.revision, event_id = EXCLUDED.event_id
       WHERE market.listing_price_current.revision < EXCLUDED.revision`,
      [listing.listingId, revision, event.eventId],
    );
  }
  public async readCurrent(): Promise<readonly ListingFact[]> {
    const rows = await this.connection.query<{ business_event: unknown }>(
      `SELECT e.business_event FROM market.listing_price_current c
       JOIN market.listing_price_evidence e ON e.event_id = c.event_id ORDER BY c.listing_id`,
    );
    return rows.map((row) => {
      if (typeof row.business_event !== 'object' || row.business_event === null) rejected();
      const event = parsePropertiesEvent({ ...row.business_event, traceContext: null });
      if (!('listing' in event.payload)) rejected();
      return structuredClone(event.payload.listing);
    });
  }
}
