import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { MARKET_LISTING_CONSUMER, type EventEnvelope } from '../packages/application/dist/index.js';
import {
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
} from '../packages/contracts/dist/index.js';
import {
  PropertiesEventV2,
  isSerializableEventPayload,
  type ListingFact,
  type MinimumAskingPriceFact,
} from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
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
    const [postgres, rabbit, management, minio, minioConsole, api] = await allocatePorts(6);
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
          expect(figure.computedAt).toBe(golden.evaluatedAt);
          expect(figure.freshness).toEqual({
            status: 'untracked',
            latestCollectionCompletedAt: null,
            ageSeconds: 0,
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
          expect(item.median.computedAt).toBe(table.evaluatedAt);
          expect(item.movement.computedAt).toBe(table.evaluatedAt);
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
          UNION ALL SELECT 'minima',md5(COALESCE(string_agg(to_jsonb(e)::text,'' ORDER BY property_id),'')) FROM market.property_price_current e`);
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
        await compose('stop', 'worker');
        const beforeReads = await snapshot();
        await get();
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
        for (const suffix of ['/neighbours']) {
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
        // Corrupt persisted evidence must produce the canonical sanitized server error.
        await db.query('ALTER TABLE market.listing_state_evidence RENAME TO owned_unavailable');
        await preserveCleanup(
          async () => {
            for (const suffix of ['', '/neighbours']) {
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
