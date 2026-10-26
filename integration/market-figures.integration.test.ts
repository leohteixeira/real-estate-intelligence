import { createServer } from 'node:http';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  MARKET_LISTING_CONSUMER,
  MARKET_COMPLETION_CONSUMER,
  ConsumeMarketCompletion,
  MarketQueryService,
  type EventEnvelope,
  type MarketPriceFactsReadPort,
} from '../packages/application/dist/index.js';
import {
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
} from '../packages/contracts/dist/index.js';
import {
  PropertiesEventV2,
  CollectionRunCompleted,
  parseSha256Hash,
  isSerializableEventPayload,
  type ListingFact,
  type MinimumAskingPriceFact,
} from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresInbox,
  PostgresLocationsFacade,
  SyntheticMarketAdapter,
  PostgresMarketPriceFacts,
  PostgresOutbox,
  PostgresTransactionRunner,
  RabbitMqEventBroker,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const block = 'sao-paulo-pinheiros-fictional-block';
const day = 86_400_000;
function wire(event: PropertiesEventV2): EventEnvelope {
  if (!isSerializableEventPayload(event.payload)) throw new Error('Invalid synthetic payload');
  return { ...event, payload: event.payload };
}
function minimum(propertyId: string, listings: readonly ListingFact[]): MinimumAskingPriceFact {
  const active = listings
    .filter((f) => f.propertyId === propertyId && f.status === 'active')
    .sort(
      (a, b) =>
        a.askingPriceMinorUnits - b.askingPriceMinorUnits || (a.listingId < b.listingId ? -1 : 1),
    );
  const selected = active[0];
  return {
    propertyId,
    placeId: selected?.placeId ?? block,
    areaSquareMeters: selected?.areaSquareMeters ?? null,
    minimumMinorUnits: selected?.askingPriceMinorUnits ?? null,
    currency: 'BRL',
    selectedListingId: selected?.listingId ?? null,
    provenance: selected?.provenance ?? null,
    activeListingIds: active.map((f) => f.listingId),
  };
}
test('persisted figures match hand-calculated HTTP values with causal membership, lifecycle history and replay', async () => {
  await withCampaign(async ({ command }) => {
    const project = `rei-market-figures-${randomUUID()}`;
    const [postgres, rabbit, management, minio, minioConsole, api, boundaryHttp] =
      await allocatePorts(7);
    const user = 'rei_market_figures';
    const bucket = 'rei-market-figures';
    const password = 'controlled_market_figures_fixture';
    const env = {
      ...process.env,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      NODE_ENV: 'test',
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: user,
      POSTGRES_PORT: String(postgres),
      RABBITMQ_USER: user,
      RABBITMQ_PASSWORD: password,
      RABBITMQ_VHOST: user,
      RABBITMQ_PORT: String(rabbit),
      RABBITMQ_MANAGEMENT_PORT: String(management),
      MINIO_ROOT_USER: user,
      MINIO_ROOT_PASSWORD: password,
      MINIO_API_PORT: String(minio),
      MINIO_CONSOLE_PORT: String(minioConsole),
      OBJECT_STORE_BUCKET: bucket,
      OBJECT_STORE_REGION: 'us-east-1',
      API_PORT: String(api),
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      OUTBOX_RELAY_INTERVAL_MS: '100',
      EVENT_DELIVERY_LIMIT: '3',
      EVENT_REDELIVERY_DELAY_MS: '100',
      COLLECTION_SCHEDULE_INTERVAL_MS: '30000',
      SNAPSHOT_ENCRYPTION_KEY_ID: '',
      SNAPSHOT_ENCRYPTION_KEY_BASE64: '',
    };
    const compose = (...args: string[]) =>
      command('docker', ['compose', '--file', 'compose.yaml', '--project-name', project, ...args], {
        env,
        timeout: 240000,
        maxBuffer: 10 * 1024 * 1024,
      });
    const database = new URL(`postgres://127.0.0.1:${postgres}/${user}`);
    database.username = user;
    database.password = password;
    const brokerUrl = new URL(`amqp://127.0.0.1:${rabbit}/${user}`);
    brokerUrl.username = user;
    brokerUrl.password = password;
    let connection: DatabaseConnection | undefined;
    let publisher: RabbitMqEventBroker | undefined;
    const signal = () => AbortSignal.timeout(30000);
    await preserveCleanup(
      async () => {
        await compose(
          'up',
          '--detach',
          '--build',
          '--wait',
          'postgres',
          'rabbitmq',
          'minio',
          'migrations',
          'worker',
          'api',
        );
        const db = new DatabaseConnection(database.toString());
        connection = db;
        const broker = new RabbitMqEventBroker({
          url: brokerUrl.toString(),
          operationTimeoutMs: 5000,
        });
        publisher = broker;
        const transactions = new PostgresTransactionRunner(db);
        const outbox = new PostgresOutbox(db);
        const facts = new PostgresMarketPriceFacts(db);
        const anchor = Date.now() - 60_000;
        const time = (days: number) => new Date(anchor - days * day).toISOString();
        const listing = (
          n: number,
          property: number,
          price: number,
          days: number,
          changes: Partial<ListingFact> = {},
        ): ListingFact => ({
          listingId: id(n),
          propertyId: id(property),
          sourceId: n === 2 ? 'synthetic-member' : 'synthetic-figures',
          sourceListingId: `listing-${n}`,
          placeId: block,
          propertyType: 'apartment',
          areaSquareMeters: 10,
          status: 'active',
          askingPriceMinorUnits: price,
          currency: 'BRL',
          effectiveAt: time(days),
          provenance: {
            sourceId: n === 2 ? 'synthetic-member' : 'synthetic-figures',
            sourceListingId: `listing-${n}`,
            sourceUrl: `https://figures.invalid/${n}`,
            runId: id(800),
            snapshotId: id(801),
            contentHash: `sha256:${'a'.repeat(64)}`,
            observedAt: time(days),
          },
          ...changes,
        });
        const events: EventEnvelope[] = [];
        const add = (
          n: number,
          revision: number,
          fact: ListingFact,
          type:
            | 'properties.listing.created'
            | 'properties.listing.price-changed'
            | 'properties.listing.removed'
            | 'properties.listing.reappeared' = 'properties.listing.created',
          previousMinorUnits?: number,
        ) => {
          events.push(
            wire(
              new PropertiesEventV2(type, {
                eventId: id(n),
                aggregateId: fact.listingId,
                occurredAt: fact.effectiveAt,
                payload: {
                  revision,
                  assignmentRevision: 0,
                  effectiveAt: fact.effectiveAt,
                  listing: fact,
                  ...(previousMinorUnits === undefined ? {} : { previousMinorUnits }),
                },
              }),
            ),
          );
        };
        const a = listing(1, 101, 10000, 5);
        const other = listing(2, 102, 15000, 5);
        const b = listing(3, 103, 30000, 5);
        const c = listing(4, 104, 90000, 10);
        const d = listing(5, 105, 5000, 5, { areaSquareMeters: null });
        const removed = listing(8, 102, 20000, 2, { status: 'removed' });
        add(201, 1, listing(1, 101, 40000, 200));
        add(202, 2, listing(1, 101, 20000, 10), 'properties.listing.price-changed', 40000);
        add(203, 3, a, 'properties.listing.price-changed', 20000);
        add(204, 1, listing(2, 102, 10000, 190));
        add(205, 2, other, 'properties.listing.price-changed', 10000);
        add(206, 1, listing(3, 103, 20000, 200));
        add(207, 2, b, 'properties.listing.price-changed', 40000);
        add(208, 1, c);
        add(209, 1, listing(5, 105, 10000, 100, { areaSquareMeters: null }));
        add(210, 2, d, 'properties.listing.price-changed', 10000);
        add(211, 1, listing(8, 102, 20000, 365));
        add(212, 2, removed, 'properties.listing.removed');
        // Outside global minimum forbids substituting the more expensive in-scope listing.
        add(
          213,
          1,
          listing(6, 106, 1000, 200, {
            placeId: 'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
          }),
        );
        add(214, 1, listing(7, 106, 10000, 200));
        add(
          215,
          1,
          listing(9, 107, 35000, 200, { placeId: 'sao-paulo-vila-mariana-fictional-block' }),
        );
        add(
          216,
          2,
          listing(9, 107, 70000, 5, { placeId: 'sao-paulo-vila-mariana-fictional-block' }),
          'properties.listing.price-changed',
          35000,
        );
        const states = [
          { listing: a, revision: 3, assignmentRevision: 0 },
          { listing: other, revision: 2, assignmentRevision: 0 },
          { listing: removed, revision: 2, assignmentRevision: 0 },
        ];
        const merged = wire(
          new PropertiesEventV2('properties.property.merged', {
            eventId: id(220),
            aggregateId: id(101),
            occurredAt: time(1),
            payload: {
              revision: 1,
              effectiveAt: time(1),
              previous: [minimum(id(101), [a]), minimum(id(102), [other, removed])],
              resulting: [
                minimum(id(101), [
                  a,
                  { ...other, propertyId: id(101) },
                  { ...removed, propertyId: id(101) },
                ]),
              ],
              listingStates: states,
              assignments: states.map((s) => ({
                listingId: s.listing.listingId,
                fromPropertyId: s.listing.propertyId,
                toPropertyId: id(101),
                fromAssignmentRevision: 0,
                assignmentRevision: 1,
              })),
            },
          }),
        );
        const get = async (place = 'sao-paulo-pinheiros') => {
          const response = await requestHttp(
            `http://127.0.0.1:${api}/api/v1/places/${place}/market`,
          );
          expect(response.status).toBe(200);
          return parsePlaceMarketResponse(await response.json());
        };
        const neighbors = async (place = 'sao-paulo-bela-vista') => {
          const response = await requestHttp(
            `http://127.0.0.1:${api}/api/v1/places/${place}/market/neighbours`,
          );
          expect(response.status).toBe(200);
          return parsePlaceMarketNeighboursResponse(await response.json());
        };
        const series = async (place = 'sao-paulo-pinheiros') => {
          const response = await requestHttp(
            `http://127.0.0.1:${api}/api/v1/places/${place}/market/monthly-series`,
          );
          expect(response.status).toBe(200);
          return parsePlaceMarketSeriesResponse(await response.json());
        };
        const emptySeries = await series();
        expect(emptySeries.basis).toBe('event-fed-place-figures');
        expect(emptySeries.comparisonPlace?.id).toBe('sao-paulo-oeste');
        expect(
          emptySeries.points.every(
            (point) => point.median.value === null && point.parentMedian?.value === null,
          ),
        ).toBe(true);
        const empty = await get();
        expect(empty.basis).toBe('event-fed-place-figures');
        expect(empty).not.toHaveProperty('preparedSections');
        expect(empty).not.toHaveProperty('preparedEvaluatedAt');
        for (const figure of Object.values(empty.figures)) expect(figure.value).toBeNull();
        expect(empty.counts).toEqual({ properties: 0, activeListings: 0, sources: 0 });
        const emptyNeighbors = await neighbors();
        expect(emptyNeighbors.basis).toBe('event-fed-place-figures');
        expect(emptyNeighbors.items.map((item) => item.place.id)).toEqual([
          'sao-paulo-vila-mariana',
        ]);
        expect(emptyNeighbors.items[0]!.median).toMatchObject({ recordCount: 0, value: null });
        expect(emptyNeighbors.items[0]!.movement).toMatchObject({ recordCount: 0, value: null });
        // Snapshot first, then late listing states in reverse revision order through outbox/worker.
        const delivery = [merged, ...events.toReversed()];
        await transactions.runInTransaction((tx) => outbox.append(tx, delivery));
        await expect
          .poll(
            async () =>
              (
                await db.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM market.price_event_evidence',
                )
              )[0]!.count,
            { timeout: 30000, interval: 100 },
          )
          .toBe(delivery.length);
        const persisted = await facts.readFigures();
        expect(
          persisted.current
            .filter((fact) => [id(1), id(2), id(8)].includes(fact.listingId))
            .every((fact) => fact.propertyId === id(101)),
        ).toBe(true);
        expect(persisted.priceChanges).toHaveLength(6);
        const golden = await get();
        expect(golden.figures.medianAskingPricePerSquareMeter).toMatchObject({
          value: { minorUnits: 3000, currency: 'BRL' },
          recordCount: 3,
        });
        // Paired A/B: current median 2000, prior median 1500, each property once.
        expect(golden.figures.askingPriceMovement).toMatchObject({
          value: (2000 / 1500 - 1) * 100,
          recordCount: 2,
          windowMonths: 6,
        });
        expect(golden.figures.medianTimeOnMarketDays.value).toBeCloseTo(
          (Date.parse(golden.evaluatedAt) - anchor) / day + 150,
          10,
        );
        expect(golden.figures.medianTimeOnMarketDays.recordCount).toBe(4);
        expect(golden.figures.priceReductions).toMatchObject({
          value: { count: 3, percentage: 60 },
          recordCount: 5,
          windowDays: 30,
        });
        expect(golden.figures.listingsPerProperty).toMatchObject({ value: 1.25, recordCount: 4 });
        expect(golden.figures.recordedSalePricePerSquareMeter).toMatchObject({
          state: 'not-recorded',
          value: null,
          recordCount: 0,
          sources: [],
        });
        for (const figure of Object.values(golden.figures)) {
          expect(Date.parse(figure.computedAt)).toBeLessThanOrEqual(Date.parse(golden.evaluatedAt));
          expect(figure.freshness).toEqual({
            status: 'untracked',
            latestCollectionCompletedAt: null,
            ageSeconds: (Date.parse(golden.evaluatedAt) - Date.parse(figure.computedAt)) / 1000,
          });
        }
        expect(golden.figures.askingPriceMovement.sources[0]).toMatchObject({
          id: 'synthetic-figures',
          label: 'synthetic-figures',
          url: 'https://figures.invalid/1',
          collectedAt: time(5),
        });
        expect(golden.figures.medianTimeOnMarketDays.sources[0]).toMatchObject({
          url: 'https://figures.invalid/4',
          collectedAt: time(10),
        });
        expect(golden.counts).toEqual({ properties: 4, activeListings: 5, sources: 2 });
        expect(golden.figures.listingsPerProperty.sources.map((source) => source.id)).toEqual([
          'synthetic-figures',
          'synthetic-member',
        ]);
        expect(golden.parentMedian).toMatchObject({
          place: { id: 'sao-paulo-oeste' },
          median: { recordCount: 3, value: { minorUnits: 3000 } },
        });
        const central = await get('sao-paulo-bela-vista');
        expect(central.counts).toEqual({ properties: 1, activeListings: 2, sources: 1 });
        expect(central.parentMedian).toMatchObject({
          place: { id: 'sao-paulo-centro' },
          median: { recordCount: 1, value: { minorUnits: 100 } },
        });
        const table = await neighbors();
        expect(table.items.map((item) => item.place.id)).toEqual(['sao-paulo-vila-mariana']);
        expect(table.items[0]!.median).toMatchObject({
          recordCount: 1,
          value: { minorUnits: 7000 },
        });
        expect(table.items[0]!.movement).toMatchObject({ recordCount: 1, value: 100 });
        for (const item of table.items) {
          expect(Date.parse(item.median.computedAt)).toBeLessThanOrEqual(
            Date.parse(table.evaluatedAt),
          );
          expect(item.movement.computedAt).toBe(item.median.computedAt);
          expect(item.median.sources[0]).toMatchObject({
            url: 'https://figures.invalid/9',
            collectedAt: time(5),
          });
        }
        expect((await neighbors('sao-paulo-pinheiros')).items).toEqual([]);
        expect((await neighbors('sao-paulo-centro')).items).toEqual([]);
        expect((await get('brazil')).parentMedian).toBeNull();
        const snapshot = async () =>
          db.query<{
            table_name: string;
            digest: string;
          }>(`SELECT 'evidence' AS table_name,md5(COALESCE(string_agg(to_jsonb(e)::text,'' ORDER BY event_id),'')) AS digest FROM market.price_event_evidence e
          UNION ALL SELECT 'states',md5(COALESCE(string_agg(to_jsonb(e)::text,'' ORDER BY listing_id,revision),'')) FROM market.listing_state_evidence e
          UNION ALL SELECT 'assignments',md5(COALESCE(string_agg(to_jsonb(e)::text,'' ORDER BY listing_id),'')) FROM market.listing_assignment_current e
          UNION ALL SELECT 'minima',md5(COALESCE(string_agg(to_jsonb(e)::text,'' ORDER BY property_id),'')) FROM market.property_price_current e
          UNION ALL SELECT 'completions',md5(COALESCE(string_agg(to_jsonb(e)::text,'' ORDER BY source_id),'')) FROM market.source_completion e`);
        const retained = await snapshot();
        await compose('restart', 'worker');
        await compose('up', '--detach', '--wait', 'worker');
        await db.query('DELETE FROM platform.inbox WHERE consumer_name=$1', [
          MARKET_LISTING_CONSUMER,
        ]);
        for (const event of delivery) await broker.publish(event, signal());
        await expect
          .poll(
            async () =>
              (
                await db.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name=$1',
                  [MARKET_LISTING_CONSUMER],
                )
              )[0]!.count,
            { timeout: 30000, interval: 100 },
          )
          .toBe(delivery.length);
        expect(await snapshot()).toEqual(retained);
        expect((await get()).figures.askingPriceMovement.value).toBe(
          golden.figures.askingPriceMovement.value,
        );
        expect((await get()).counts).toEqual(golden.counts);
        expect((await neighbors()).items[0]!.movement.value).toBe(100);
        // Reappearance never resets the earliest observation.
        const reappeared = listing(8, 101, 20000, 0);
        const reappearance = wire(
          new PropertiesEventV2('properties.listing.reappeared', {
            eventId: id(230),
            aggregateId: id(8),
            occurredAt: time(0),
            payload: {
              revision: 3,
              assignmentRevision: 1,
              effectiveAt: time(0),
              listing: reappeared,
            },
          }),
        );
        await transactions.runInTransaction((tx) => outbox.append(tx, [reappearance]));
        await expect
          .poll(async () => (await get()).figures.listingsPerProperty.value, {
            timeout: 30000,
            interval: 100,
          })
          .toBe(1.5);
        const after = await get();
        expect(after.figures.medianTimeOnMarketDays.value).toBeCloseTo(
          (Date.parse(after.evaluatedAt) - anchor) / day + 150,
          10,
        );
        expect(after.counts).toEqual({ properties: 4, activeListings: 6, sources: 2 });
        expect(after.figures.priceReductions.value).toEqual({ count: 3, percentage: 50 });
        // Twelve manually derived monthly samples in an otherwise empty registered neighbourhood.
        // The block owns one property; its actual parent also contains an independent property.
        // Revision four removes the block listing; revision five reappears. Delivery is reversed.
        const monthly = Array.from({ length: 12 }, (_, index) => {
          const date = new Date(anchor);
          date.setUTCDate(1);
          date.setUTCHours(0, 0, 0, 0);
          date.setUTCMonth(date.getUTCMonth() - 11 + index);
          const at = date.toISOString();
          const base = listing(50, 150, 10000 + index * 1000, 0, {
            placeId: 'sao-paulo-santana-fictional-block',
            effectiveAt: at,
            status: index === 3 ? 'removed' : 'active',
          });
          const fact = { ...base, provenance: { ...base.provenance, observedAt: at } };
          const type =
            index === 0
              ? 'properties.listing.created'
              : index === 3
                ? 'properties.listing.removed'
                : index === 4
                  ? 'properties.listing.reappeared'
                  : 'properties.listing.price-changed';
          return wire(
            new PropertiesEventV2(type, {
              eventId: id(500 + index),
              aggregateId: fact.listingId,
              occurredAt: at,
              payload: {
                revision: index + 1,
                assignmentRevision: 0,
                effectiveAt: at,
                listing: fact,
                ...(type === 'properties.listing.price-changed'
                  ? { previousMinorUnits: 10000 + (index - 1) * 1000 }
                  : {}),
              },
            }),
          );
        });
        const first = monthly[0]!.occurredAt;
        const sibling = listing(51, 151, 100000, 0, {
          placeId: 'sao-paulo-santana',
          effectiveAt: first,
        });
        monthly.push(
          wire(
            new PropertiesEventV2('properties.listing.created', {
              eventId: id(520),
              aggregateId: sibling.listingId,
              occurredAt: first,
              payload: {
                revision: 1,
                assignmentRevision: 0,
                effectiveAt: first,
                listing: { ...sibling, provenance: { ...sibling.provenance, observedAt: first } },
              },
            }),
          ),
        );
        await transactions.runInTransaction((tx) => outbox.append(tx, monthly.toReversed()));
        await expect
          .poll(
            async () =>
              (
                await db.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM market.price_event_evidence',
                )
              )[0]!.count,
            { timeout: 30000, interval: 100 },
          )
          .toBe(delivery.length + monthly.length + 1);
        await expect
          .poll(
            async () =>
              (await series('sao-paulo-santana-fictional-block')).points[11]!.median.value
                ?.minorUnits,
            { timeout: 30000, interval: 100 },
          )
          .toBe(2100);
        const monthlyGolden = await series('sao-paulo-santana-fictional-block');
        expect(monthlyGolden.comparisonPlace?.id).toBe('sao-paulo-santana');
        if (monthlyGolden.basis !== 'event-fed-place-figures')
          throw new Error('Expected persisted series.');
        for (const [index, point] of monthlyGolden.points.entries()) {
          const expected = index === 3 ? null : 1000 + index * 100;
          expect(point.month).toBe(monthly[index]!.occurredAt.slice(0, 7));
          const next = new Date(`${point.month}-01T00:00:00.000Z`);
          next.setUTCMonth(next.getUTCMonth() + 1);
          expect(point.asOf).toBe(
            index === 11 ? monthlyGolden.evaluatedAt : new Date(next.getTime() - 1).toISOString(),
          );
          expect(point.median).toMatchObject({
            value: expected === null ? null : { minorUnits: expected, currency: 'BRL' },
            recordCount: expected === null ? 0 : 1,
            computedAt: monthlyGolden.points[0]!.median.computedAt,
            state: expected === null ? 'insufficient-data' : 'available',
            freshness: {
              status: 'untracked',
              latestCollectionCompletedAt: null,
              ageSeconds:
                (Date.parse(monthlyGolden.evaluatedAt) - Date.parse(point.median.computedAt)) /
                1000,
            },
          });
          expect(point.median.sources).toEqual(
            expected === null
              ? []
              : [
                  {
                    id: 'synthetic-figures',
                    label: 'synthetic-figures',
                    url: 'https://figures.invalid/50',
                    collectedAt: monthly[index]!.occurredAt,
                  },
                ],
          );
          expect(point.parentMedian).toMatchObject({
            value: {
              minorUnits: expected === null ? 10000 : (expected + 10000) / 2,
              currency: 'BRL',
            },
            recordCount: expected === null ? 1 : 2,
            computedAt: monthlyGolden.points[0]!.median.computedAt,
          });
          expect(point.parentMedian!.sources).toEqual([
            {
              id: 'synthetic-figures',
              label: 'synthetic-figures',
              url: expected === null ? 'https://figures.invalid/51' : 'https://figures.invalid/50',
              collectedAt: expected === null ? first : monthly[index]!.occurredAt,
            },
          ]);
        }
        const stableSeries = (response: Awaited<ReturnType<typeof series>>) => ({
          ...response,
          evaluatedAt: 'live',
          points: response.points.map((point, index) => ({
            ...point,
            ...(index === 11 ? { asOf: 'live' } : {}),
            median: {
              ...point.median,
              computedAt: 'live',
              freshness: { ...point.median.freshness, ageSeconds: 0 },
            },
            parentMedian: point.parentMedian
              ? {
                  ...point.parentMedian,
                  computedAt: 'live',
                  freshness: { ...point.parentMedian.freshness, ageSeconds: 0 },
                }
              : null,
          })),
        });
        const beforeMonthlyReplay = await snapshot();
        await db.query(
          'DELETE FROM platform.inbox WHERE consumer_name=$1 AND event_id=ANY($2::uuid[])',
          [MARKET_LISTING_CONSUMER, monthly.map((event) => event.eventId)],
        );
        for (const event of monthly) await broker.publish(event, signal());
        await expect
          .poll(
            async () =>
              (
                await db.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name=$1',
                  [MARKET_LISTING_CONSUMER],
                )
              )[0]!.count,
            { timeout: 30000, interval: 100 },
          )
          .toBe(delivery.length + monthly.length + 1);
        expect(await snapshot()).toEqual(beforeMonthlyReplay);
        expect(stableSeries(await series('sao-paulo-santana-fictional-block'))).toEqual(
          stableSeries(monthlyGolden),
        );
        expect((await series('brazil')).points.every((point) => point.parentMedian === null)).toBe(
          true,
        );
        // Source completions travel through the real outbox, broker and production worker.
        const completion = (n: number, sourceId: string, occurredAt: string): EventEnvelope => {
          const event = new CollectionRunCompleted({
            traceContext: null,
            eventId: id(n),
            aggregateId: id(n + 1000),
            occurredAt,
            payload: {
              sourceId,
              observedCount: 0,
              parsedCount: 0,
              suppressedCount: 0,
              failedCount: 0,
              manifestHash: parseSha256Hash(`sha256:${'a'.repeat(64)}`),
            },
          });
          if (!isSerializableEventPayload(event.payload))
            throw new Error('Invalid completion payload');
          return { ...event, payload: event.payload };
        };
        const deliverCompletion = async (event: EventEnvelope) => {
          await transactions.runInTransaction((tx) => outbox.append(tx, [event]));
          await expect
            .poll(
              async () =>
                (
                  await db.query<{ count: number }>(
                    'SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2',
                    [MARKET_COMPLETION_CONSUMER, event.eventId],
                  )
                )[0]!.count,
              { timeout: 30000, interval: 100 },
            )
            .toBe(1);
        };
        const figuresCompleted = completion(900, 'synthetic-figures', time(20));
        await deliverCompletion(figuresCompleted);
        // A last completion may predate observations from a still-running collection.
        const partial = await get();
        expect(partial.figures.medianAskingPricePerSquareMeter.freshness.status).toBe('fresh');
        expect(
          partial.figures.medianAskingPricePerSquareMeter.sources[0]!.collectedAt >
            figuresCompleted.occurredAt,
        ).toBe(true);
        expect(partial.figures.listingsPerProperty.freshness.status).toBe('untracked');
        expect(
          partial.figures.listingsPerProperty.freshness.latestCollectionCompletedAt,
        ).toBeNull();
        const memberCompleted = completion(901, 'synthetic-member', time(10));
        await deliverCompletion(memberCompleted);
        await deliverCompletion(completion(902, 'unrelated-source', time(0)));
        const complete = await get();
        expect(
          complete.figures.medianAskingPricePerSquareMeter.freshness.latestCollectionCompletedAt,
        ).toBe(time(20));
        expect(complete.figures.listingsPerProperty.freshness.latestCollectionCompletedAt).toBe(
          time(10),
        );
        expect(complete.figures.recordedSalePricePerSquareMeter.freshness.status).toBe('untracked');
        expect((await neighbors()).items[0]!.median.freshness.status).toBe('fresh');
        const completedSeries = await series('sao-paulo-santana-fictional-block');
        expect(completedSeries.points[0]!.median.freshness.status).toBe('fresh');
        expect(completedSeries.points[3]!.median.freshness.status).toBe('untracked');
        expect(completedSeries.points[3]!.parentMedian!.freshness.status).toBe('fresh');
        const watermarks = () =>
          db.query<{ source_id: string; completed_at: Date }>(
            'SELECT source_id,completed_at FROM market.source_completion ORDER BY source_id',
          );
        const retainedCompletions = await watermarks();
        await compose('restart', 'worker');
        await compose('up', '--detach', '--wait', 'worker');
        expect(await watermarks()).toEqual(retainedCompletions);
        await deliverCompletion(completion(903, 'synthetic-figures', time(30)));
        await db.query('DELETE FROM platform.inbox WHERE consumer_name=$1', [
          MARKET_COMPLETION_CONSUMER,
        ]);
        for (const event of [memberCompleted, figuresCompleted, figuresCompleted])
          await broker.publish(event, signal());
        await expect
          .poll(
            async () =>
              (
                await db.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name=$1',
                  [MARKET_COMPLETION_CONSUMER],
                )
              )[0]!.count,
            { timeout: 30000, interval: 100 },
          )
          .toBe(2);
        expect(await watermarks()).toEqual(retainedCompletions);
        // Real SQL rollback and cancellation leave neither watermark nor inbox effect.
        const inbox = new PostgresInbox(db);
        for (const cancel of [false, true]) {
          const controller = new AbortController();
          const service = new ConsumeMarketCompletion(facts, transactions, {
            record: async (tx, consumer, eventId) => {
              await inbox.record(tx, consumer, eventId);
              if (cancel) controller.abort(new Error('Owned cancellation'));
              else throw new Error('Owned inbox failure');
              return true;
            },
          });
          await expect(
            service.execute(
              completion(cancel ? 905 : 904, 'rollback-source', time(0)),
              controller.signal,
            ),
          ).rejects.toThrow();
          expect(await facts.readCompletions(['rollback-source'])).toEqual([]);
          expect(
            await db.query(
              'SELECT event_id FROM platform.inbox WHERE consumer_name=$1 AND event_id=ANY($2::uuid[])',
              [MARKET_COMPLETION_CONSUMER, [id(904), id(905)]],
            ),
          ).toEqual([]);
        }
        // Native HTTP fixture uses production service/ports and a real completion barrier.
        // It does not freeze time, cache figures or add a production test switch.
        let calculationStart = 0;
        let boundaryEvent = 910;
        const boundaryFacts: MarketPriceFactsReadPort = {
          readCurrent: () => facts.readCurrent(),
          readFigures: () => facts.readFigures(),
          readCompletions: async (sourceIds) => {
            await expect
              .poll(() => Date.now(), { timeout: 5000, interval: 1 })
              .toBeGreaterThan(calculationStart);
            const event = completion(
              boundaryEvent++,
              'synthetic-figures',
              new Date().toISOString(),
            );
            await deliverCompletion(event);
            return facts.readCompletions(sourceIds);
          },
        };
        const boundary = new MarketQueryService(
          new SyntheticMarketAdapter(),
          new PostgresLocationsFacade(db),
          {
            facts: boundaryFacts,
            clock: {
              now: () => {
                const instant = new Date().toISOString();
                calculationStart = Date.parse(instant);
                return instant;
              },
            },
          },
        );
        const server = createServer((incoming, response) => {
          const operation =
            incoming.url === '/neighbours'
              ? boundary.neighbours('sao-paulo-bela-vista')
              : incoming.url === '/series'
                ? boundary.monthlySeries('sao-paulo-pinheiros')
                : boundary.getPlaceMarket('sao-paulo-pinheiros');
          void operation
            .then((result) => {
              response.setHeader('content-type', 'application/json');
              response.end(JSON.stringify(result));
            })
            .catch(() => {
              response.statusCode = 500;
              response.end();
            });
        });
        await new Promise<void>((resolve) => server.listen(boundaryHttp, '127.0.0.1', resolve));
        await preserveCleanup(
          async () => {
            for (const [path, parser] of [
              ['/', parsePlaceMarketResponse],
              ['/neighbours', parsePlaceMarketNeighboursResponse],
              ['/series', parsePlaceMarketSeriesResponse],
            ] as const) {
              const response = await request(`http://127.0.0.1:${boundaryHttp}`)
                .get(path)
                .expect(200);
              const result = parser(response.body);
              const figures =
                'figures' in result
                  ? [...Object.values(result.figures), result.parentMedian!.median]
                  : 'items' in result
                    ? result.items.flatMap((item) => [item.median, item.movement])
                    : result.points.flatMap((point) => [point.median, point.parentMedian!]);
              expect(figures.some((figure) => figure.freshness.status === 'stale')).toBe(true);
              for (const figure of figures) {
                expect(figure.freshness.ageSeconds).toBe(
                  (Date.parse(result.evaluatedAt) - Date.parse(figure.computedAt)) / 1000,
                );
                if (figure.freshness.status !== 'stale') continue;
                expect(Date.parse(figure.computedAt)).toBeLessThan(
                  Date.parse(figure.freshness.latestCollectionCompletedAt!),
                );
                expect(
                  Date.parse(figure.freshness.latestCollectionCompletedAt!),
                ).toBeLessThanOrEqual(Date.parse(result.evaluatedAt));
              }
              if ('figures' in result) {
                expect(result.figures.medianAskingPricePerSquareMeter.value).toEqual(
                  golden.figures.medianAskingPricePerSquareMeter.value,
                );
                expect(result.figures.medianAskingPricePerSquareMeter.sources).toEqual(
                  golden.figures.medianAskingPricePerSquareMeter.sources,
                );
              }
            }
          },
          () =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        );
        expect((await get()).figures.medianAskingPricePerSquareMeter.freshness.status).toBe(
          'fresh',
        );
        await compose('stop', 'worker');
        const beforeReads = await snapshot();
        await get();
        const detachedSeries = await series('sao-paulo-santana-fictional-block');
        Reflect.set(detachedSeries.points[0]!.median.sources[0]!, 'url', 'mutated');
        const detachedReread = await series('sao-paulo-santana-fictional-block');
        expect(detachedReread.points[0]!.median.sources[0]!.url).toBe('https://figures.invalid/50');
        expect(detachedReread.points[0]!.median.value).toEqual(
          monthlyGolden.points[0]!.median.value,
        );
        const emptyHistorical = await series(
          'sao-paulo-vila-mariana-rua-cenario-um-fictional-block',
        );
        expect(emptyHistorical.comparisonPlace?.id).toBe('sao-paulo-vila-mariana');
        expect(emptyHistorical.points.every((point) => point.median.value === null)).toBe(true);
        expect(emptyHistorical.points.at(-1)!.parentMedian?.value?.minorUnits).toBe(7000);
        const detached = await neighbors();
        Reflect.set(detached.items[0]!.median.sources[0]!, 'url', 'caller-mutated');
        expect((await neighbors()).items[0]!.median.sources[0]!.url).toBe(
          'https://figures.invalid/9',
        );
        const knownEmpty = await get('sao-paulo-vila-mariana-rua-cenario-um-fictional-block');
        for (const figure of Object.values(knownEmpty.figures)) expect(figure.value).toBeNull();
        expect(knownEmpty.counts).toEqual({ properties: 0, activeListings: 0, sources: 0 });
        expect(await snapshot()).toEqual(beforeReads);
        expect(
          (await requestHttp(`http://127.0.0.1:${api}/api/v1/places/unknown-place/market`)).status,
        ).toBe(404);
        expect((await requestHttp(`http://127.0.0.1:${api}/api/v1/places/BAD/market`)).status).toBe(
          400,
        );
        for (const suffix of ['/neighbours', '/monthly-series']) {
          expect(
            (
              await requestHttp(
                `http://127.0.0.1:${api}/api/v1/places/unknown-place/market${suffix}`,
              )
            ).status,
          ).toBe(404);
          expect(
            (await requestHttp(`http://127.0.0.1:${api}/api/v1/places/BAD/market${suffix}`)).status,
          ).toBe(400);
        }
        // A future persisted completion fails closed on all three HTTP surfaces.
        const completionBeforeFault = await facts.readCompletions(['synthetic-figures']);
        await db.query(
          "UPDATE market.source_completion SET completed_at=now()+interval '1 day' WHERE source_id=$1",
          ['synthetic-figures'],
        );
        await preserveCleanup(
          async () => {
            for (const suffix of ['', '/neighbours', '/monthly-series']) {
              const response = await requestHttp(
                `http://127.0.0.1:${api}/api/v1/places/sao-paulo-bela-vista/market${suffix}`,
              );
              expect(response.status).toBe(500);
              expect(await response.json()).toEqual({
                error: {
                  code: 'internal_error',
                  message: 'An unexpected error occurred.',
                  requestId: expect.any(String),
                },
              });
            }
          },
          () =>
            db.query(
              'UPDATE market.source_completion SET completed_at=$2::timestamptz WHERE source_id=$1',
              ['synthetic-figures', completionBeforeFault[0]!.completedAt],
            ),
        );
        // Corrupt persisted evidence must produce the canonical sanitized server error.
        await db.query('ALTER TABLE market.listing_state_evidence RENAME TO owned_unavailable');
        await preserveCleanup(
          async () => {
            for (const suffix of ['', '/neighbours', '/monthly-series']) {
              const response = await requestHttp(
                `http://127.0.0.1:${api}/api/v1/places/sao-paulo-bela-vista/market${suffix}`,
              );
              expect(response.status).toBe(500);
              expect(await response.json()).toEqual({
                error: {
                  code: 'internal_error',
                  message: 'An unexpected error occurred.',
                  requestId: expect.any(String),
                },
              });
            }
          },
          () => db.query('ALTER TABLE market.owned_unavailable RENAME TO listing_state_evidence'),
        );
      },
      async () =>
        cleanupAll(
          async () => {
            await publisher?.close();
          },
          async () => {
            await connection?.close();
          },
          async () => {
            await compose('down', '--volumes', '--remove-orphans');
          },
        ),
    );
  });
});
