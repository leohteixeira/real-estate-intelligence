import { expect } from 'vitest';
import {
  ConsumeMarketListing,
  ConsumeMarketSuppression,
  MARKET_LISTING_CONSUMER,
  MARKET_SUPPRESSION_CONSUMER,
} from '../../packages/application/dist/index.js';
import {
  CollectionListingSuppressed,
  PropertiesListingSuppressed,
  PropertiesEvent,
  PropertiesEventV2,
  type ListingFact,
  type CausalListingState,
  type MinimumAskingPriceFact,
} from '../../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresMarketPriceFacts,
  PostgresListingSuppression,
  PostgresTransactionRunner,
  PostgresInbox,
  RabbitMqEventBroker,
} from '../../packages/infrastructure/dist/index.js';
import { MarketSuppressionConsumer } from '../../apps/worker/dist/market/index.js';
import {
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
} from '../../packages/contracts/dist/index.js';
import { requestHttp } from './http.ts';
import { preserveCleanup } from './cleanup.ts';
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(700000 + n).padStart(12, '0')}`;
/** Extends the existing owner-safe erasure fixture; all mutations target its disposable database. */
export async function exerciseMarketSuppression(input: {
  db: DatabaseConnection;
  broker: RabbitMqEventBroker;
  base: string;
  remove: (identity: string) => Promise<unknown>;
}) {
  const { db } = input,
    transactions = new PostgresTransactionRunner(db),
    facts = new PostgresMarketPriceFacts(db),
    inbox = new PostgresInbox(db);
  const project = new ConsumeMarketListing(facts, transactions, inbox);
  const suppress = () =>
    new ConsumeMarketSuppression(
      new PostgresListingSuppression(db),
      new PostgresMarketPriceFacts(db),
      new PostgresTransactionRunner(db),
      new PostgresInbox(db),
    );
  const signal = () => AbortSignal.timeout(30000);
  const now = Date.now() - 60000,
    old = new Date(now - 400 * 86400000).toISOString(),
    recent = new Date(now - 86400000).toISOString();
  const listing = (
    n: number,
    property: number,
    price: number,
    place = 'sao-paulo-bela-vista-fictional-block',
  ): ListingFact => ({
    listingId: id(n),
    propertyId: id(property),
    sourceId: 'synthetic-data',
    sourceListingId: `market-erasure-${n}`,
    placeId: place,
    propertyType: 'apartment',
    areaSquareMeters: 10,
    status: 'active',
    askingPriceMinorUnits: price,
    currency: 'BRL',
    effectiveAt: old,
    provenance: {
      sourceId: 'synthetic-data',
      sourceListingId: `market-erasure-${n}`,
      sourceUrl: `https://market-erasure.invalid/${n}`,
      runId: id(900),
      snapshotId: id(901),
      contentHash: `sha256:${'a'.repeat(64)}`,
      observedAt: old,
    },
  });
  const listingEvent = (
    n: number,
    fact: ListingFact,
    revision = 1,
    assignmentRevision = 0,
    type:
      | 'properties.listing.created'
      | 'properties.listing.price-changed'
      | 'properties.listing.removed'
      | 'properties.listing.reappeared' = 'properties.listing.created',
  ) =>
    new PropertiesEventV2(type, {
      eventId: id(n),
      aggregateId: fact.listingId,
      occurredAt: fact.effectiveAt,
      payload: {
        revision,
        assignmentRevision,
        effectiveAt: fact.effectiveAt,
        listing: fact,
        ...(type === 'properties.listing.price-changed' ? { previousMinorUnits: 10000 } : {}),
      },
    });
  const cause = async (fact: ListingFact) => {
    await input.remove(fact.sourceListingId);
    const row = (
      await db.query<{ event_id: string; suppression_id: string; suppressed_at: Date }>(
        `SELECT event_id::text,suppression_id::text,suppressed_at FROM collection.listing_suppression WHERE source_id=$1 AND source_listing_id=$2`,
        [fact.sourceId, fact.sourceListingId],
      )
    )[0]!;
    return new CollectionListingSuppressed({
      traceContext: null,
      eventId: row.event_id,
      aggregateId: row.suppression_id,
      occurredAt: row.suppressed_at.toISOString(),
      payload: { sourceId: fact.sourceId, sourceListingId: fact.sourceListingId },
    });
  };
  const notification = (
    n: number,
    event: CollectionListingSuppressed,
    fact: ListingFact,
    original: string,
    destination: string | null,
  ) =>
    new PropertiesListingSuppressed({
      eventId: id(n),
      aggregateId: fact.listingId,
      occurredAt: event.occurredAt,
      payload: {
        ...event.payload,
        causeEventId: event.eventId,
        suppressionId: event.aggregateId,
        listingId: fact.listingId,
        originalPropertyId: original,
        listingRevision: 1,
        assignmentRevision: 0,
        changes: [
          {
            previousPropertyId: original,
            propertyId: destination,
            previousRevision: 1,
            revision: 2,
          },
        ],
      },
    });
  const apply = async (event: PropertiesEvent | PropertiesEventV2) =>
    project.execute({ ...event }, signal());
  const erase = async (event: CollectionListingSuppressed | PropertiesListingSuppressed) =>
    suppress().execute({ ...event }, signal());
  const current = () => facts.readFigures();
  const noContent = async (fact: ListingFact) => {
    const rows = await db.query<{ retained: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM market.price_event_evidence WHERE business_event::text LIKE $1 OR business_event::text LIKE $2 UNION ALL SELECT 1 FROM market.listing_price_evidence WHERE business_event::text LIKE $1 OR business_event::text LIKE $2 UNION ALL SELECT 1 FROM market.listing_state_evidence WHERE listing_id=$3 OR listing::text LIKE $2 UNION ALL SELECT 1 FROM market.property_price_current WHERE selected_listing::text LIKE $1 OR selected_listing::text LIKE $2) AS retained`,
      [`%${fact.listingId}%`, `%${fact.provenance.sourceUrl}%`, fact.listingId],
    );
    expect(rows[0]!.retained).toBe(false);
    expect((await current()).current.some((row) => row.listingId === fact.listingId)).toBe(false);
  };
  const a = listing(1, 101, 10000),
    b = listing(2, 101, 15000),
    c = listing(3, 103, 20000),
    neighbour = listing(4, 104, 30000, 'sao-paulo-vila-mariana-fictional-block');
  const legacy = new PropertiesEvent('properties.listing.created', {
    eventId: id(201),
    aggregateId: a.listingId,
    occurredAt: old,
    payload: { revision: 1, effectiveAt: old, listing: a },
  });
  const changed = {
    ...a,
    askingPriceMinorUnits: 5000,
    effectiveAt: recent,
    provenance: { ...a.provenance, observedAt: recent },
  };
  const changedEvent = listingEvent(202, changed, 2, 0, 'properties.listing.price-changed');
  const original = [
    legacy,
    listingEvent(203, b),
    new PropertiesEvent('properties.listing.created', {
      eventId: id(204),
      aggregateId: c.listingId,
      occurredAt: old,
      payload: { revision: 1, effectiveAt: old, listing: c },
    }),
    listingEvent(205, neighbour),
    changedEvent,
  ];
  // Public constructors run every new fixture shape before the first database mutation.
  // Lifecycle facts preserve their required observation/effective-time relationship.
  const ordinary = listing(40, 140, 1000, 'sao-paulo-pinheiros-fictional-block');
  const ordinaryEvents = [
    listingEvent(340, ordinary),
    listingEvent(
      341,
      { ...ordinary, status: 'removed', effectiveAt: recent },
      2,
      0,
      'properties.listing.removed',
    ),
    listingEvent(
      342,
      {
        ...ordinary,
        effectiveAt: recent,
        provenance: { ...ordinary.provenance, observedAt: recent },
      },
      3,
      0,
      'properties.listing.reappeared',
    ),
  ];
  for (const event of original) await apply(event);
  const get = async () => {
    const response = await requestHttp(`${input.base}/api/v1/places/sao-paulo-bela-vista/market`);
    expect(response.status).toBe(200);
    return parsePlaceMarketResponse(await response.json());
  };
  expect((await get()).figures.medianAskingPricePerSquareMeter.value?.minorUnits).toBe(1250);
  const removal = await cause(a),
    transition = notification(301, removal, a, a.propertyId, id(102));
  // Actual SQL failure happens after receipts, fences and deletes, before minima commit.
  await db.query(
    `CREATE FUNCTION market.owned_erasure_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned erasure failure'; END $$`,
  );
  await db.query(
    `CREATE TRIGGER owned_erasure_failure BEFORE UPDATE ON market.property_price_current FOR EACH ROW EXECUTE FUNCTION market.owned_erasure_failure()`,
  );
  const before = await current();
  await preserveCleanup(
    async () => {
      await expect(erase(removal)).rejects.toThrow();
      expect(await current()).toEqual(before);
      expect(
        await db.query(`SELECT 1 FROM market.listing_suppression_receipt WHERE cause_event_id=$1`, [
          removal.eventId,
        ]),
      ).toEqual([]);
      expect(
        await db.query(`SELECT 1 FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2`, [
          MARKET_SUPPRESSION_CONSUMER,
          removal.eventId,
        ]),
      ).toEqual([]);
    },
    async () => {
      await db.query(`DROP TRIGGER owned_erasure_failure ON market.property_price_current`);
      await db.query(`DROP FUNCTION market.owned_erasure_failure()`);
    },
  );
  // Collection-first cannot swallow the later anchor transition; concurrency shares one writer lock.
  await Promise.all([erase(removal), apply(changedEvent)]);
  await erase(transition);
  await noContent(a);
  const after = await get();
  expect(after.counts).toEqual({ properties: 2, activeListings: 2, sources: 1 });
  expect(after.figures.medianAskingPricePerSquareMeter.value?.minorUnits).toBe(1750);
  expect(after.parentMedian?.place.id).toBe('sao-paulo-centro');
  expect(after.parentMedian?.median.value?.minorUnits).toBe(1750);
  expect(after.figures.askingPriceMovement.value).toBe(0);
  expect(after.figures.listingsPerProperty.value).toBe(1);
  expect(after.figures.priceReductions.value).toEqual({ count: 0, percentage: 0 });
  expect(after.figures.medianTimeOnMarketDays.value).toBeCloseTo(
    (Date.parse(after.evaluatedAt) - Date.parse(old)) / 86400000,
    6,
  );
  for (const figure of Object.values(after.figures))
    for (const source of figure.sources) expect(source.url).not.toBe(a.provenance.sourceUrl);
  const seriesRead = await requestHttp(
      `${input.base}/api/v1/places/sao-paulo-bela-vista/market/monthly-series`,
    ),
    series = parsePlaceMarketSeriesResponse(await seriesRead.json());
  expect(series.points).toHaveLength(12);
  for (const point of series.points) {
    expect(point.median.value?.minorUnits).toBe(1750);
    expect(point.parentMedian?.value?.minorUnits).toBe(1750);
    expect(point.median.recordCount).toBe(2);
  }
  const neighboursRead = await requestHttp(
      `${input.base}/api/v1/places/sao-paulo-bela-vista/market/neighbours`,
    ),
    neighbours = parsePlaceMarketNeighboursResponse(await neighboursRead.json());
  expect(
    neighbours.items.map((row) => [row.place.id, row.median.value?.minorUnits, row.movement.value]),
  ).toEqual([['sao-paulo-vila-mariana', 3000, 0]]);
  // A mixed snapshot is strictly validated in its original wire form, then only survivors advance.
  const minimum = (propertyId: string, members: readonly ListingFact[]): MinimumAskingPriceFact => {
    const selected = [...members]
      .filter((row) => row.status === 'active')
      .sort((l, r) => l.askingPriceMinorUnits - r.askingPriceMinorUnits)[0];
    return {
      propertyId,
      placeId: selected?.placeId ?? a.placeId,
      areaSquareMeters: selected?.areaSquareMeters ?? null,
      minimumMinorUnits: selected?.askingPriceMinorUnits ?? null,
      currency: 'BRL',
      selectedListingId: selected?.listingId ?? null,
      provenance: selected?.provenance ?? null,
      activeListingIds: members
        .filter((row) => row.status === 'active')
        .map((row) => row.listingId),
    };
  };
  const mixed = new PropertiesEventV2('properties.property.asking-price-changed', {
    eventId: id(302),
    aggregateId: a.propertyId,
    occurredAt: recent,
    payload: {
      revision: 1,
      effectiveAt: recent,
      previous: minimum(a.propertyId, [a, b]),
      current: minimum(a.propertyId, [changed, b]),
      listingStates: [
        { listing: changed, revision: 2, assignmentRevision: 0 },
        { listing: b, revision: 1, assignmentRevision: 0 },
      ],
    },
  });
  await apply(mixed);
  await noContent(a);
  expect(
    await db.query(`SELECT 1 FROM market.price_event_evidence WHERE event_id=$1`, [mixed.eventId]),
  ).toEqual([]);
  expect(
    await db.query(`SELECT 1 FROM market.erased_price_event WHERE event_id=$1`, [mixed.eventId]),
  ).toHaveLength(1);
  // A suppressed identity cannot claim a retained survivor UUID, even with a new envelope/revision.
  const identityConflict = listingEvent(304, { ...a, listingId: b.listingId }, 2);
  const beforeIdentityConflict = await current();
  await expect(apply(identityConflict)).rejects.toThrow('rejected');
  expect(await current()).toEqual(beforeIdentityConflict);
  expect(
    await db.query(
      `SELECT 1 FROM market.erased_price_event WHERE event_id=$1 UNION ALL SELECT 1 FROM market.price_event_evidence WHERE event_id=$1 UNION ALL SELECT 1 FROM market.listing_erasure_identity WHERE listing_id=$2 UNION ALL SELECT 1 FROM platform.inbox WHERE consumer_name=$3 AND event_id=$1`,
      [identityConflict.eventId, b.listingId, MARKET_LISTING_CONSUMER],
    ),
  ).toEqual([]);
  // B still accepts its next causal state, and replaying A cannot erase B's retained facts.
  await apply(listingEvent(305, b, 2));
  const stable = await current();
  await erase(removal);
  expect(await current()).toEqual(stable);
  await db.query(`DELETE FROM platform.inbox WHERE consumer_name=ANY($1::text[])`, [
    [MARKET_LISTING_CONSUMER, MARKET_SUPPRESSION_CONSUMER],
  ]);
  // Fresh service instances and expiry of transport/publication copies preserve exact replay.
  await db.query(
    `DELETE FROM platform.outbox WHERE event_type=ANY($1::text[]) AND (payload->>'sourceListingId'=$2)`,
    [['collection.listing.suppressed', 'properties.listing.suppressed'], a.sourceListingId],
  );
  for (const event of [...original, mixed].reverse()) await apply(event);
  await erase(transition);
  await erase(removal);
  expect(await current()).toEqual(stable);
  await expect(
    project.execute(
      { ...mixed, payload: { ...mixed.payload, revision: 2 }, eventId: mixed.eventId },
      signal(),
    ),
  ).rejects.toThrow('rejected');
  await expect(
    apply(listingEvent(303, { ...changed, askingPriceMinorUnits: 6000 }, 2)),
  ).rejects.toThrow('rejected');
  for (const table of [
    'listing_price_identity',
    'listing_price_evidence',
    'listing_state_evidence',
    'listing_assignment_evidence',
    'price_event_evidence',
  ]) {
    await expect(db.query(`DELETE FROM market.${table}`)).rejects.toThrow();
    await expect(
      db.query(
        `UPDATE market.${table} SET ${table === 'price_event_evidence' ? 'revision=revision' : table === 'listing_price_identity' ? 'source_id=source_id' : 'revision=revision'}`,
      ),
    ).rejects.toThrow();
  }
  // A suppressed ordinary member preserves group P (no P-to-P redirect).
  const member = listing(10, 103, 10000);
  await apply(listingEvent(210, member));
  const memberCause = await cause(member);
  const memberNotice = new PropertiesListingSuppressed({
    ...notification(310, memberCause, member, id(110), id(103)),
    payload: {
      ...notification(310, memberCause, member, id(110), id(103)).payload,
      changes: [
        { previousPropertyId: id(103), propertyId: id(103), previousRevision: 1, revision: 2 },
      ],
    },
  });
  await db.query(
    `DELETE FROM platform.outbox WHERE event_type=ANY($1::text[]) AND (payload->>'sourceListingId'=$2)`,
    [['collection.listing.suppressed', 'properties.listing.suppressed'], member.sourceListingId],
  );
  // A valid first delayed notification does not depend on retained publication copies.
  await erase(memberNotice);
  await erase(memberCause);
  expect((await facts.readCurrent()).find((row) => row.listingId === c.listingId)?.propertyId).toBe(
    c.propertyId,
  );
  expect(
    await db.query(`SELECT 1 FROM market.erased_anchor_redirect WHERE previous_property_id=$1`, [
      c.propertyId,
    ]),
  ).toEqual([]);
  // Consecutive anchors converge even when B-to-C arrives before A-to-B, before mixed facts.
  const x = listing(20, 120, 1000, 'sao-paulo-pinheiros-fictional-block'),
    y = listing(21, 120, 2000, x.placeId),
    z = listing(22, 120, 3000, x.placeId);
  const xCause = await cause(x),
    yCause = await cause(y);
  await erase(notification(321, yCause, y, id(121), id(122)));
  await erase(notification(320, xCause, x, id(120), id(121)));
  const states: readonly CausalListingState[] = [x, y, z].map((listing) => ({
    listing,
    revision: 1,
    assignmentRevision: 0,
  }));
  const chainMixed = new PropertiesEventV2('properties.property.asking-price-changed', {
    eventId: id(322),
    aggregateId: x.propertyId,
    occurredAt: old,
    payload: {
      revision: 1,
      effectiveAt: old,
      previous: { ...minimum(x.propertyId, [x, y, z]), minimumMinorUnits: 500 },
      current: minimum(x.propertyId, [x, y, z]),
      listingStates: states,
    },
  });
  await apply(chainMixed);
  await noContent(x);
  await noContent(y);
  expect((await current()).current.find((row) => row.listingId === z.listingId)?.propertyId).toBe(
    id(122),
  );
  expect(
    (
      await db.query<{ property_id: string; revision: string }>(
        `SELECT property_id::text,revision::text FROM market.listing_assignment_current WHERE listing_id=$1`,
        [z.listingId],
      )
    )[0],
  ).toEqual({ property_id: id(120), revision: '0' });
  // The forward notification order reaches the same effective destination.
  const firstAnchor = listing(60, 160, 1000, x.placeId),
    secondAnchor = listing(61, 160, 2000, x.placeId),
    finalMember = listing(62, 160, 3000, x.placeId);
  await erase(notification(360, await cause(firstAnchor), firstAnchor, id(160), id(161)));
  await erase(notification(361, await cause(secondAnchor), secondAnchor, id(161), id(162)));
  await apply(listingEvent(362, finalMember));
  expect(
    (await current()).current.find((row) => row.listingId === finalMember.listingId)?.propertyId,
  ).toBe(id(162));
  // Null ends only this association; a subsequent valid assignment still succeeds.
  const empty = listing(30, 130, 1000, x.placeId),
    survivor = listing(31, 130, 2000, x.placeId);
  const emptyCause = await cause(empty);
  await erase(notification(330, emptyCause, empty, id(130), null));
  await apply(listingEvent(331, survivor));
  expect((await current()).current.some((row) => row.listingId === survivor.listingId)).toBe(false);
  await apply(listingEvent(332, { ...survivor, propertyId: id(131) }, 2, 1));
  expect(
    (await current()).current.find((row) => row.listingId === survivor.listingId)?.propertyId,
  ).toBe(id(131));
  // Ordinary removal keeps the original history and time-on-market through reobservation.
  await apply(ordinaryEvents[0]!);
  await apply(ordinaryEvents[1]!);
  expect(
    (await current()).history.filter((row) => row.listing.listingId === ordinary.listingId),
  ).toHaveLength(2);
  await apply(ordinaryEvents[2]!);
  expect(
    (await current()).history.filter((row) => row.listing.listingId === ordinary.listingId),
  ).toHaveLength(3);
  // Real durable broker delivery resolves only after erasure and inbox commit.
  const delivered = listing(50, 150, 1000, x.placeId);
  await apply(listingEvent(350, delivered));
  const deliveredCause = await cause(delivered);
  await new MarketSuppressionConsumer(input.broker, suppress()).start();
  await input.broker.publish({ ...deliveredCause }, signal());
  await expect
    .poll(
      async () =>
        db.query(`SELECT 1 FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2`, [
          MARKET_SUPPRESSION_CONSUMER,
          deliveredCause.eventId,
        ]),
      { timeout: 15000, interval: 100 },
    )
    .toHaveLength(1);
  await noContent(delivered);
}
