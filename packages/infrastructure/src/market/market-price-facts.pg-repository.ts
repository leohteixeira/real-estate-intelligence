import {
  ExternalFailure,
  MARKET_LISTING_CONSUMER,
  type MarketCompletionProjectionPort,
  type MarketSuppressionPort,
  type MarketSuppressionEvent,
  type MarketPriceFactsEvent,
  type MarketPriceFactsProjectionPort,
  type MarketPriceFactsReadPort,
  type Transaction,
} from '@rei/application';
import {
  CollectionListingSuppressed,
  parseListingFact,
  parsePropertiesEvent,
  parsePropertiesEventV2,
  type CausalListingState,
  type ListingFact,
  type MarketFiguresSnapshot,
  type MarketSourceCompletion,
  parseRfc3339Timestamp,
} from '@rei/domain';
import type { DatabaseConnection } from '../shared/index.js';
import type { DatabaseClient } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

function rejected(): never {
  throw new ExternalFailure({ kind: 'rejected', operation: MARKET_LISTING_CONSUMER });
}
export class PostgresMarketPriceFacts
  implements
    MarketPriceFactsProjectionPort,
    MarketPriceFactsReadPort,
    MarketCompletionProjectionPort,
    MarketSuppressionPort
{
  public constructor(private readonly connection: DatabaseConnection) {}
  public async erase(transaction: Transaction, event: MarketSuppressionEvent): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      'market:price-facts',
    ]);
    const collection = event instanceof CollectionListingSuppressed;
    const causeEventId = collection ? event.eventId : event.payload.causeEventId;
    const suppressionId = collection ? event.aggregateId : event.payload.suppressionId;
    const { sourceId, sourceListingId } = event.payload;
    const receipt = await client.query<{ identical: boolean }>(
      `SELECT cause_event_id=$3::uuid AND suppression_id=$4::uuid AS identical FROM market.listing_suppression_receipt WHERE source_id=$1 AND source_listing_id=$2`,
      [sourceId, sourceListingId, causeEventId, suppressionId],
    );
    if (receipt.some((row) => !row.identical)) rejected();
    await client.query(
      `INSERT INTO market.listing_suppression_receipt (source_id,source_listing_id,cause_event_id,suppression_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [sourceId, sourceListingId, causeEventId, suppressionId],
    );
    if (!collection) {
      const business = JSON.stringify({ ...event, traceContext: null });
      const previous = await client.query<{ identical: boolean }>(
        `SELECT event_id=$1::uuid AND fingerprint=market.event_fingerprint($3::jsonb) AS identical FROM market.properties_suppression_receipt WHERE event_id=$1 OR cause_event_id=$2`,
        [event.eventId, causeEventId, business],
      );
      if (previous.length) {
        if (previous.length !== 1 || !previous[0]!.identical) rejected();
        return;
      }
      await client.query(
        `INSERT INTO market.properties_suppression_receipt (event_id,cause_event_id,fingerprint) VALUES ($1,$2,market.event_fingerprint($3::jsonb))`,
        [event.eventId, causeEventId, business],
      );
      if (event.payload.listingId) {
        const identities = await client.query<{ identical: boolean }>(
          `SELECT source_id=$2 AND source_listing_id=$3 AS identical FROM market.listing_price_identity WHERE listing_id=$1 UNION ALL SELECT source_id=$2 AND source_listing_id=$3 AS identical FROM market.listing_erasure_identity WHERE listing_id=$1`,
          [event.payload.listingId, sourceId, sourceListingId],
        );
        if (identities.some((row) => !row.identical)) rejected();
        await client.query(
          `INSERT INTO market.listing_erasure_identity (listing_id,source_id,source_listing_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [event.payload.listingId, sourceId, sourceListingId],
        );
      }
      for (const change of event.payload.changes) {
        if (
          change.previousPropertyId !== event.payload.originalPropertyId ||
          change.propertyId === change.previousPropertyId
        )
          continue;
        const existing = await client.query<{ identical: boolean }>(
          `SELECT property_id IS NOT DISTINCT FROM $2::uuid AND cause_event_id=$3::uuid AS identical FROM market.erased_anchor_redirect WHERE previous_property_id=$1`,
          [change.previousPropertyId, change.propertyId, causeEventId],
        );
        if (existing.some((row) => !row.identical)) rejected();
        await client.query(
          `INSERT INTO market.erased_anchor_redirect (previous_property_id,property_id,cause_event_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [change.previousPropertyId, change.propertyId, causeEventId],
        );
        // Resolving now rejects cycles inside this transaction, in either delivery order.
        await client.query(`SELECT market.effective_property_id($1::uuid)`, [
          change.previousPropertyId,
        ]);
      }
    }
    await client.query(
      `INSERT INTO market.listing_erasure_identity (listing_id,source_id,source_listing_id) SELECT listing_id,source_id,source_listing_id FROM market.listing_price_identity WHERE source_id=$1 AND source_listing_id=$2 ON CONFLICT DO NOTHING`,
      [sourceId, sourceListingId],
    );
    const identity = JSON.stringify({ sourceId, sourceListingId, causeEventId });
    await client.query(`SELECT set_config('market.listing_erasure_identity',$1,true)`, [identity]);
    // Fence every full envelope containing the erased member, including copied group snapshots.
    const matching = `jsonb_path_exists(e.business_event,'$.** ? (@.sourceId == $sourceId && @.sourceListingId == $sourceListingId)',$1::jsonb)
      OR EXISTS (SELECT 1 FROM market.listing_erasure_identity i WHERE i.source_id=$2 AND i.source_listing_id=$3 AND jsonb_path_exists(e.business_event,'$.** ? (@ == $listingId)',jsonb_build_object('listingId',i.listing_id::text)))`;
    const args = [identity, sourceId, sourceListingId];
    await client.query(
      `INSERT INTO market.erased_price_event (event_id,family,aggregate_id,revision,fingerprint) SELECT e.event_id,e.family,e.aggregate_id,e.revision,market.event_fingerprint(e.business_event) FROM market.price_event_evidence e WHERE ${matching} ON CONFLICT DO NOTHING`,
      args,
    );
    await client.query(
      `INSERT INTO market.erased_listing_fact (listing_id,family,revision,fingerprint) SELECT e.listing_id,'state',e.revision,market.event_fingerprint(e.listing) FROM market.listing_state_evidence e JOIN market.listing_erasure_identity i USING(listing_id) WHERE i.source_id=$1 AND i.source_listing_id=$2 UNION ALL SELECT e.listing_id,'assignment',e.revision,market.event_fingerprint(to_jsonb(e.property_id::text)) FROM market.listing_assignment_evidence e JOIN market.listing_erasure_identity i USING(listing_id) WHERE i.source_id=$1 AND i.source_listing_id=$2 ON CONFLICT DO NOTHING`,
      [sourceId, sourceListingId],
    );
    // Remove current references before their immutable evidence and stable identity.
    for (const table of [
      'listing_price_current',
      'listing_state_current',
      'listing_assignment_current',
    ])
      await client.query(
        `DELETE FROM market.${table} WHERE listing_id IN (SELECT listing_id FROM market.listing_erasure_identity WHERE source_id=$1 AND source_listing_id=$2)`,
        [sourceId, sourceListingId],
      );
    await client.query(`DELETE FROM market.listing_price_evidence e WHERE ${matching}`, args);
    await client.query(`DELETE FROM market.price_event_evidence e WHERE ${matching}`, args);
    for (const table of [
      'listing_state_evidence',
      'listing_assignment_evidence',
      'listing_price_identity',
    ])
      await client.query(
        `DELETE FROM market.${table} WHERE listing_id IN (SELECT listing_id FROM market.listing_erasure_identity WHERE source_id=$1 AND source_listing_id=$2)`,
        [sourceId, sourceListingId],
      );
    const properties = await client.query<{ property_id: string }>(
      `SELECT property_id FROM market.property_price_current UNION SELECT market.effective_property_id(property_id) FROM market.listing_assignment_current WHERE market.effective_property_id(property_id) IS NOT NULL`,
    );
    for (const row of properties) await this.recompute(client, row.property_id);
  }
  public async complete(
    transaction: Transaction,
    sourceId: string,
    completedAt: string,
  ): Promise<void> {
    parseRfc3339Timestamp(completedAt, 'completedAt');
    const client = postgresClientFor(transaction, this.connection);
    await client.query(
      `INSERT INTO market.source_completion (source_id, completed_at) VALUES ($1, $2::timestamptz)
       ON CONFLICT (source_id) DO UPDATE SET completed_at = GREATEST(market.source_completion.completed_at, EXCLUDED.completed_at)`,
      [sourceId, completedAt],
    );
  }
  public async readCompletions(
    sourceIds: readonly string[],
  ): Promise<readonly MarketSourceCompletion[]> {
    const rows = await this.connection.query<{ source_id: string; completed_at: Date }>(
      `SELECT source_id, completed_at FROM market.source_completion WHERE source_id = ANY($1::text[]) ORDER BY source_id`,
      [[...new Set(sourceIds)].sort()],
    );
    return rows.map((row) => ({
      sourceId: row.source_id,
      completedAt: parseRfc3339Timestamp(row.completed_at.toISOString(), 'completedAt'),
    }));
  }
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
       WHERE event_id = $1 OR (family = $2 AND aggregate_id = $3 AND revision = $5)
       UNION ALL SELECT fingerprint = market.event_fingerprint($4::jsonb) AS identical FROM market.erased_price_event
       WHERE event_id = $1 OR (family = $2 AND aggregate_id = $3 AND revision = $5)`,
      [event.eventId, family, event.aggregateId, business, event.payload.revision],
    );
    if (existing.length) {
      if (existing.length !== 1 || !existing[0]!.identical) rejected();
      return;
    }
    const erasedEnvelope =
      (
        await client.query<{ erased: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM market.listing_suppression_receipt r WHERE
        jsonb_path_exists($1::jsonb,'$.** ? (@.sourceId == $sourceId && @.sourceListingId == $sourceListingId)',jsonb_build_object('sourceId',r.source_id,'sourceListingId',r.source_listing_id)))
        OR EXISTS (SELECT 1 FROM market.listing_erasure_identity i WHERE
        jsonb_path_exists($1::jsonb,'$.** ? (@ == $listingId)',jsonb_build_object('listingId',i.listing_id::text))) AS erased`,
          [business],
        )
      )[0]?.erased ?? false;
    if (erasedEnvelope) {
      await client.query(
        `INSERT INTO market.erased_price_event (event_id,aggregate_id,revision,family,fingerprint) VALUES ($1,$2,$3,$4,market.event_fingerprint($5::jsonb))`,
        [event.eventId, event.aggregateId, event.payload.revision, family, business],
      );
    } else {
      await client.query(
        `INSERT INTO market.price_event_evidence (event_id,aggregate_id,revision,family,business_event) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [event.eventId, event.aggregateId, event.payload.revision, family, business],
      );
    }
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
      const erasedIdentity = await client.query<{ source_id: string; source_listing_id: string }>(
        `SELECT source_id,source_listing_id FROM market.listing_erasure_identity WHERE listing_id=$1`,
        [listing.listingId],
      );
      if (
        erasedIdentity.some(
          (row) =>
            row.source_id !== listing.sourceId || row.source_listing_id !== listing.sourceListingId,
        )
      )
        rejected();
      const suppressed =
        erasedIdentity.length > 0 ||
        (
          await client.query(
            `SELECT 1 FROM market.listing_suppression_receipt WHERE source_id=$1 AND source_listing_id=$2`,
            [listing.sourceId, listing.sourceListingId],
          )
        ).length > 0;
      if (suppressed) {
        await client.query(
          `INSERT INTO market.listing_erasure_identity (listing_id,source_id,source_listing_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [listing.listingId, listing.sourceId, listing.sourceListingId],
        );
        const fact = Object.fromEntries(
          Object.entries(listing).filter(([key]) => key !== 'propertyId'),
        );
        await this.fenceFact(
          client,
          listing.listingId,
          'state',
          state.revision,
          JSON.stringify(fact),
        );
        await this.fenceFact(
          client,
          listing.listingId,
          'assignment',
          state.assignmentRevision,
          JSON.stringify(listing.propertyId),
        );
        continue;
      }
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
    if (!erasedEnvelope && event.version === 1 && 'listing' in event.payload) {
      await client.query(
        `INSERT INTO market.listing_price_evidence (event_id,listing_id,revision,business_event) VALUES ($1,$2,$3,$4::jsonb)`,
        [event.eventId, event.aggregateId, event.payload.revision, business],
      );
      await client.query(
        `INSERT INTO market.listing_price_current (listing_id,revision,event_id) VALUES ($1,$2,$3) ON CONFLICT (listing_id) DO UPDATE SET revision = EXCLUDED.revision,event_id = EXCLUDED.event_id WHERE market.listing_price_current.revision < EXCLUDED.revision`,
        [event.aggregateId, event.payload.revision, event.eventId],
      );
    }
    const effective = await client.query<{ property_id: string | null }>(
      `SELECT DISTINCT market.effective_property_id(id) AS property_id FROM unnest($1::uuid[]) id`,
      [[...affected]],
    );
    for (const row of effective) if (row.property_id) affected.add(row.property_id);
    for (const propertyId of [...affected].sort()) await this.recompute(client, propertyId);
  }
  private async recompute(client: DatabaseClient, propertyId: string): Promise<void> {
    await client.query(
      `INSERT INTO market.property_price_current (property_id,selected_listing)
       SELECT $1::uuid, (SELECT e.listing || jsonb_build_object('propertyId', $1::uuid)
          FROM market.listing_assignment_current a
          JOIN market.listing_state_current c ON c.listing_id = a.listing_id
          JOIN market.listing_state_evidence e ON e.listing_id = c.listing_id AND e.revision = c.revision
          WHERE market.effective_property_id(a.property_id) = $1 AND e.listing->>'status' = 'active'
          ORDER BY (e.listing->>'askingPriceMinorUnits')::bigint, a.listing_id LIMIT 1)
       ON CONFLICT (property_id) DO UPDATE SET selected_listing = EXCLUDED.selected_listing`,
      [propertyId],
    );
  }
  private async fenceFact(
    client: DatabaseClient,
    listingId: string,
    family: 'state' | 'assignment',
    revision: number,
    value: string,
  ): Promise<void> {
    const rows = await client.query<{ identical: boolean }>(
      `SELECT fingerprint=market.event_fingerprint($4::jsonb) AS identical FROM market.erased_listing_fact WHERE listing_id=$1 AND family=$2 AND revision=$3`,
      [listingId, family, revision, value],
    );
    if (rows.some((row) => !row.identical)) rejected();
    await client.query(
      `INSERT INTO market.erased_listing_fact (listing_id,family,revision,fingerprint) VALUES ($1,$2,$3,market.event_fingerprint($4::jsonb)) ON CONFLICT DO NOTHING`,
      [listingId, family, revision, value],
    );
  }
  private async assign(
    client: DatabaseClient,
    listingId: string,
    revision: number,
    propertyId: string,
    affected: Set<string>,
  ): Promise<void> {
    if (
      (
        await client.query(`SELECT 1 FROM market.listing_erasure_identity WHERE listing_id=$1`, [
          listingId,
        ])
      ).length
    ) {
      await this.fenceFact(client, listingId, 'assignment', revision, JSON.stringify(propertyId));
      return;
    }
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
      COALESCE((SELECT jsonb_agg(e.listing || jsonb_build_object('propertyId', market.effective_property_id(a.property_id)) ORDER BY a.listing_id)
        FROM market.listing_assignment_current a
        JOIN market.listing_state_current c USING (listing_id)
        JOIN market.listing_state_evidence e ON e.listing_id=c.listing_id AND e.revision=c.revision WHERE market.effective_property_id(a.property_id) IS NOT NULL), '[]'::jsonb) AS current,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('revision', e.revision::text, 'listing', e.listing || jsonb_build_object('propertyId', market.effective_property_id(a.property_id))) ORDER BY a.listing_id,e.revision)
        FROM market.listing_assignment_current a JOIN market.listing_state_evidence e USING (listing_id) WHERE market.effective_property_id(a.property_id) IS NOT NULL), '[]'::jsonb) AS history,
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
