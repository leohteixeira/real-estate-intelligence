import {
  ExternalFailure,
  MARKET_LISTING_CONSUMER,
  type MarketPriceFactsEvent,
  type MarketPriceFactsProjectionPort,
  type MarketPriceFactsReadPort,
  type Transaction,
} from '@rei/application';
import {
  parseListingFact,
  parsePropertiesEvent,
  parsePropertiesEventV2,
  type CausalListingState,
  type ListingFact,
  type MarketFiguresSnapshot,
} from '@rei/domain';
import type { DatabaseConnection } from '../shared/index.js';
import type { DatabaseClient } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

function rejected(): never {
  throw new ExternalFailure({ kind: 'rejected', operation: MARKET_LISTING_CONSUMER });
}
export class PostgresMarketPriceFacts
  implements MarketPriceFactsProjectionPort, MarketPriceFactsReadPort
{
  public constructor(private readonly connection: DatabaseConnection) {}
  public async project(transaction: Transaction, event: MarketPriceFactsEvent): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    // One context-local lock covers every evidence/frontier/minimum change and its inbox commit.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      'market:price-facts',
    ]);
    const family = event.type.startsWith('properties.listing.') ? 'listing' : 'property';
    const business = JSON.stringify({
      eventId: event.eventId,
      type: event.type,
      version: event.version,
      aggregateId: event.aggregateId,
      occurredAt: event.occurredAt,
      payload: event.payload,
    });
    const existing = await client.query<{ identical: boolean }>(
      `SELECT business_event = $4::jsonb AS identical FROM market.price_event_evidence
       WHERE event_id = $1 OR (family = $2 AND aggregate_id = $3 AND revision = $5)`,
      [event.eventId, family, event.aggregateId, business, event.payload.revision],
    );
    if (existing.length) {
      if (existing.length !== 1 || !existing[0]!.identical) rejected();
      return;
    }
    await client.query(
      `INSERT INTO market.price_event_evidence (event_id,aggregate_id,revision,family,business_event) VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [event.eventId, event.aggregateId, event.payload.revision, family, business],
    );
    const affected = new Set<string>();
    const states: readonly CausalListingState[] =
      'listing' in event.payload
        ? [
            {
              listing: event.payload.listing,
              revision: event.payload.revision,
              assignmentRevision:
                'assignmentRevision' in event.payload ? event.payload.assignmentRevision : 0,
            },
          ]
        : event.payload.listingStates;
    for (const state of states) {
      const listing = parseListingFact(state.listing);
      const identity = await client.query<{ identical: boolean }>(
        `SELECT source_id = $2 AND source_listing_id = $3 AS identical FROM market.listing_price_identity WHERE listing_id = $1`,
        [listing.listingId, listing.sourceId, listing.sourceListingId],
      );
      if (identity.some((row) => !row.identical)) rejected();
      await client.query(
        `INSERT INTO market.listing_price_identity (listing_id,source_id,source_listing_id) VALUES ($1,$2,$3) ON CONFLICT (listing_id) DO NOTHING`,
        [listing.listingId, listing.sourceId, listing.sourceListingId],
      );
      const fact = Object.fromEntries(
        Object.entries(listing).filter(([key]) => key !== 'propertyId'),
      );
      const evidence = await client.query<{ identical: boolean }>(
        `SELECT listing = $3::jsonb AS identical FROM market.listing_state_evidence WHERE listing_id = $1 AND revision = $2`,
        [listing.listingId, state.revision, JSON.stringify(fact)],
      );
      if (evidence.some((row) => !row.identical)) rejected();
      await client.query(
        `INSERT INTO market.listing_state_evidence (listing_id,revision,listing) VALUES ($1,$2,$3::jsonb) ON CONFLICT (listing_id,revision) DO NOTHING`,
        [listing.listingId, state.revision, JSON.stringify(fact)],
      );
      await client.query(
        `INSERT INTO market.listing_state_current (listing_id,revision) VALUES ($1,$2) ON CONFLICT (listing_id) DO UPDATE SET revision = EXCLUDED.revision WHERE market.listing_state_current.revision < EXCLUDED.revision`,
        [listing.listingId, state.revision],
      );
      await this.assign(
        client,
        listing.listingId,
        state.assignmentRevision,
        listing.propertyId,
        affected,
      );
    }
    if ('assignments' in event.payload)
      for (const assignment of event.payload.assignments)
        await this.assign(
          client,
          assignment.listingId,
          assignment.assignmentRevision,
          assignment.toPropertyId,
          affected,
        );
    if ('previous' in event.payload) {
      const before = Array.isArray(event.payload.previous)
        ? event.payload.previous
        : [event.payload.previous];
      for (const fact of before) affected.add(fact.propertyId);
      if ('resulting' in event.payload)
        for (const fact of event.payload.resulting) affected.add(fact.propertyId);
      else if ('current' in event.payload) affected.add(event.payload.current.propertyId);
    }
    // Retain the deployed v1 evidence/reference surfaces for compatibility and upgrade audit.
    if (event.version === 1 && 'listing' in event.payload) {
      await client.query(
        `INSERT INTO market.listing_price_evidence (event_id,listing_id,revision,business_event) VALUES ($1,$2,$3,$4::jsonb)`,
        [event.eventId, event.aggregateId, event.payload.revision, business],
      );
      await client.query(
        `INSERT INTO market.listing_price_current (listing_id,revision,event_id) VALUES ($1,$2,$3) ON CONFLICT (listing_id) DO UPDATE SET revision = EXCLUDED.revision,event_id = EXCLUDED.event_id WHERE market.listing_price_current.revision < EXCLUDED.revision`,
        [event.aggregateId, event.payload.revision, event.eventId],
      );
    }
    for (const propertyId of [...affected].sort())
      await client.query(
        `INSERT INTO market.property_price_current (property_id,selected_listing)
       SELECT $1::uuid, (SELECT e.listing || jsonb_build_object('propertyId', a.property_id)
          FROM market.listing_assignment_current a
          JOIN market.listing_state_current c ON c.listing_id = a.listing_id
          JOIN market.listing_state_evidence e ON e.listing_id = c.listing_id AND e.revision = c.revision
          WHERE a.property_id = $1 AND e.listing->>'status' = 'active'
          ORDER BY (e.listing->>'askingPriceMinorUnits')::bigint, a.listing_id LIMIT 1)
       ON CONFLICT (property_id) DO UPDATE SET selected_listing = EXCLUDED.selected_listing`,
        [propertyId],
      );
  }
  private async assign(
    client: DatabaseClient,
    listingId: string,
    revision: number,
    propertyId: string,
    affected: Set<string>,
  ): Promise<void> {
    affected.add(propertyId);
    const current = await client.query<{ property_id: string }>(
      `SELECT property_id FROM market.listing_assignment_current WHERE listing_id = $1`,
      [listingId],
    );
    for (const row of current) affected.add(row.property_id);
    const evidence = await client.query<{ identical: boolean }>(
      `SELECT property_id = $3::uuid AS identical FROM market.listing_assignment_evidence WHERE listing_id = $1 AND revision = $2`,
      [listingId, revision, propertyId],
    );
    if (evidence.some((row) => !row.identical)) rejected();
    await client.query(
      `INSERT INTO market.listing_assignment_evidence (listing_id,revision,property_id) VALUES ($1,$2,$3) ON CONFLICT (listing_id,revision) DO NOTHING`,
      [listingId, revision, propertyId],
    );
    await client.query(
      `INSERT INTO market.listing_assignment_current (listing_id,revision,property_id) VALUES ($1,$2,$3) ON CONFLICT (listing_id) DO UPDATE SET revision = EXCLUDED.revision,property_id = EXCLUDED.property_id WHERE market.listing_assignment_current.revision < EXCLUDED.revision`,
      [listingId, revision, propertyId],
    );
  }
  public async readFigures(): Promise<MarketFiguresSnapshot> {
    // A single statement uses one MVCC snapshot even while a projection transaction commits.
    const rows = await this.connection.query<{
      representatives: { property_id: string; selected_listing: unknown }[];
      current: unknown[];
      history: { revision: string; listing: unknown }[];
      events: unknown[];
    }>(`SELECT
      COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY property_id) FROM market.property_price_current p WHERE selected_listing IS NOT NULL), '[]'::jsonb) AS representatives,
      COALESCE((SELECT jsonb_agg(e.listing || jsonb_build_object('propertyId', a.property_id) ORDER BY a.listing_id)
        FROM market.listing_assignment_current a
        JOIN market.listing_state_current c USING (listing_id)
        JOIN market.listing_state_evidence e ON e.listing_id=c.listing_id AND e.revision=c.revision), '[]'::jsonb) AS current,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('revision', e.revision::text, 'listing', e.listing || jsonb_build_object('propertyId', a.property_id)) ORDER BY a.listing_id,e.revision)
        FROM market.listing_assignment_current a JOIN market.listing_state_evidence e USING (listing_id)), '[]'::jsonb) AS history,
      COALESCE((SELECT jsonb_agg(business_event ORDER BY event_id) FROM market.price_event_evidence
        WHERE business_event->>'type'='properties.listing.price-changed'), '[]'::jsonb) AS events`);
    const row = rows[0];
    if (!row) rejected();
    const representatives = row.representatives.map((item) => {
      const fact = parseListingFact(item.selected_listing);
      if (fact.propertyId !== item.property_id || fact.status !== 'active') rejected();
      return fact;
    });
    const priceChanges = row.events.map((wire) => {
      if (typeof wire !== 'object' || wire === null) rejected();
      const input = { ...wire, traceContext: null };
      const event =
        'version' in wire && wire.version === 2
          ? parsePropertiesEventV2(input)
          : parsePropertiesEvent(input);
      if (
        event.type !== 'properties.listing.price-changed' ||
        !('previousMinorUnits' in event.payload)
      )
        rejected();
      return {
        listing: event.payload.listing,
        previousMinorUnits: event.payload.previousMinorUnits,
      };
    });
    return structuredClone({
      representatives,
      current: row.current.map(parseListingFact),
      history: row.history.map((state) => {
        const revision = Number(state.revision);
        if (!Number.isSafeInteger(revision) || revision < 1) rejected();
        return { revision, listing: parseListingFact(state.listing) };
      }),
      priceChanges,
    });
  }
  public async readCurrent(): Promise<readonly ListingFact[]> {
    const rows = await this.connection.query<{ property_id: string; selected_listing: unknown }>(
      `SELECT property_id,selected_listing FROM market.property_price_current WHERE selected_listing IS NOT NULL ORDER BY property_id`,
    );
    return rows.map((row) => {
      const fact = parseListingFact(row.selected_listing);
      if (fact.propertyId !== row.property_id || fact.status !== 'active') rejected();
      return structuredClone(fact);
    });
  }
}
