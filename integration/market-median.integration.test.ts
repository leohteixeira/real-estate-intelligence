import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import {
  CollectSourceOnce,
  ConsumeMarketListing,
  MARKET_LISTING_CONSUMER,
  type EventEnvelope,
  type ListingSource,
} from '../packages/application/dist/index.js';
import { parsePlaceMarketResponse } from '../packages/contracts/dist/index.js';
import {
  PropertiesEvent,
  isSerializableEventPayload,
  parsePropertiesEvent,
  type ListingFact,
  type PropertiesEventType,
} from '../packages/domain/dist/index.js';
import {
  CanonicalSnapshotSanitizer,
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresInbox,
  PostgresMarketPriceFacts,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
  SyntheticListingSource,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-10-10T12:00:00.000Z';
const block = 'sao-paulo-pinheiros-fictional-block';
function listing(
  n: number,
  property: number,
  price: number,
  changes: Partial<ListingFact> = {},
): ListingFact {
  return {
    listingId: id(n),
    propertyId: id(property),
    sourceId: 'synthetic-market',
    sourceListingId: `listing-${n}`,
    placeId: block,
    propertyType: 'apartment',
    areaSquareMeters: 10,
    status: 'active',
    askingPriceMinorUnits: price,
    currency: 'BRL',
    effectiveAt: at,
    provenance: {
      sourceId: 'synthetic-market',
      sourceListingId: `listing-${n}`,
      sourceUrl: `https://market.invalid/listing-${n}`,
      runId: id(800),
      snapshotId: id(801),
      contentHash: `sha256:${'a'.repeat(64)}`,
      observedAt: at,
    },
    ...changes,
  };
}
function event(
  n: number,
  revision: number,
  fact: ListingFact,
  type: PropertiesEventType = 'properties.listing.created',
): EventEnvelope {
  const extra =
    type === 'properties.listing.price-changed'
      ? { previousMinorUnits: fact.askingPriceMinorUnits + 1 }
      : type === 'properties.listing.description-changed'
        ? { beforeHash: `sha256:${'b'.repeat(64)}`, afterHash: `sha256:${'c'.repeat(64)}` }
        : {};
  const candidate = new PropertiesEvent(type, {
    eventId: id(n),
    aggregateId: fact.listingId,
    occurredAt: at,
    payload: { revision, effectiveAt: fact.effectiveAt, listing: fact, ...extra },
  });
  const payload = candidate.payload;
  if (!isSerializableEventPayload(payload)) throw new Error('Invalid fixture payload');
  return { ...candidate, payload };
}

test('event-fed median persists real broker evidence, fences replay and follows acquisition through HTTP', async () => {
  await withCampaign(async ({ command }) => {
    const project = `rei-market-median-${randomUUID()}`;
    const [postgres, rabbit, management, minio, minioConsole, api] = await allocatePorts(6);
    const user = 'rei_market_median';
    const bucket = 'rei-market-median';
    const password = 'controlled_market_median_fixture';
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
        const consume = new ConsumeMarketListing(facts, transactions, new PostgresInbox(db));
        const get = async (place = 'sao-paulo-pinheiros') => {
          const response = await requestHttp(
            `http://127.0.0.1:${api}/api/v1/places/${place}/market`,
          );
          expect(response.status).toBe(200);
          return parsePlaceMarketResponse(await response.json());
        };
        const publish = async (wire: EventEnvelope) => {
          await transactions.runInTransaction((tx) => outbox.append(tx, [wire]));
          await expect
            .poll(
              async () =>
                (
                  await db.query<{ published: boolean }>(
                    'SELECT published_at IS NOT NULL AS published FROM platform.outbox WHERE event_id=$1',
                    [wire.eventId],
                  )
                )[0]?.published,
              { timeout: 30000, interval: 100 },
            )
            .toBe(true);
        };
        const median = async (amount: number | null, count: number) => {
          await vi.waitFor(
            async () => {
              const response = await get();
              expect(
                response.figures.medianAskingPricePerSquareMeter.value?.minorUnits ?? null,
              ).toBe(amount);
              expect(response.figures.medianAskingPricePerSquareMeter.recordCount).toBe(count);
            },
            { timeout: 30000, interval: 100 },
          );
        };
        const count = async () =>
          (
            await db.query<{ evidence: number; current: number; inbox: number }>(
              `SELECT (SELECT count(*)::integer FROM market.listing_price_evidence) AS evidence,
         (SELECT count(*)::integer FROM market.listing_price_current) AS current,
         (SELECT count(*)::integer FROM platform.inbox WHERE consumer_name=$1) AS inbox`,
              [MARKET_LISTING_CONSUMER],
            )
          )[0]!;
        const delivered = async (minimum: number) => {
          await vi.waitFor(
            async () => {
              const response = await requestHttp(
                `http://127.0.0.1:${management}/api/queues/${user}/${MARKET_LISTING_CONSUMER}`,
                {
                  headers: {
                    Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
                  },
                },
              );
              expect(response.status).toBe(200);
              const queue = await response.json();
              if (
                typeof queue !== 'object' ||
                queue === null ||
                !('message_stats' in queue) ||
                typeof queue.message_stats !== 'object' ||
                queue.message_stats === null ||
                !('deliver_get' in queue.message_stats) ||
                typeof queue.message_stats.deliver_get !== 'number' ||
                !('messages_ready' in queue) ||
                !('messages_unacknowledged' in queue)
              )
                throw new Error('Queue delivery statistics are not available yet');
              expect(queue.message_stats.deliver_get).toBeGreaterThanOrEqual(minimum);
              expect(queue.messages_ready).toBe(0);
              expect(queue.messages_unacknowledged).toBe(0);
            },
            { timeout: 30000, interval: 250 },
          );
        };
        const initial = await get();
        expect(initial.basis).toBe('event-fed-place-figures');
        expect(initial.figures.medianAskingPricePerSquareMeter.value).toBeNull();
        expect(initial.parentMedian?.place.id).toBe('sao-paulo-oeste');
        const a = listing(1, 101, 10000);
        const aOther = listing(2, 101, 15000);
        const b = listing(3, 102, 20000);
        const first = event(201, 1, a);
        await Promise.all([
          publish(first),
          publish(event(202, 1, aOther)),
          publish(event(203, 1, b)),
        ]);
        await median(1500, 2);
        await delivered(3);
        const golden = await get();
        expect(golden.figures.medianAskingPricePerSquareMeter.sources).toEqual([
          {
            id: 'synthetic-market',
            label: 'synthetic-market',
            url: 'https://market.invalid/listing-1',
            collectedAt: at,
          },
        ]);
        expect(golden.parentMedian?.median.value?.minorUnits).toBe(1500);
        expect(golden.figures.medianAskingPricePerSquareMeter.freshness).toEqual({
          status: 'untracked',
          latestCollectionCompletedAt: null,
          ageSeconds: 0,
        });
        expect(Date.now() - Date.parse(golden.evaluatedAt)).toBeLessThan(5000);
        const beforeReplay = await count();
        await Promise.all(Array.from({ length: 5 }, () => broker.publish(first, signal())));
        await delivered(8);
        await median(1500, 2);
        expect(await count()).toEqual(beforeReplay);
        await db.query('DELETE FROM platform.inbox WHERE consumer_name=$1', [
          MARKET_LISTING_CONSUMER,
        ]);
        await broker.publish(first, signal());
        await delivered(9);
        await expect.poll(async () => (await count()).inbox, { timeout: 30000 }).toBe(1);
        expect((await count()).evidence).toBe(3);
        await compose('restart', 'worker');
        await compose('up', '--detach', '--wait', 'worker');
        await broker.publish(first, signal());
        await delivered(10);
        await median(1500, 2);
        // Higher revision wins even when effective/observation time moves backwards.
        const regressed = '2026-10-09T12:00:00.000Z';
        const higher = {
          ...a,
          askingPriceMinorUnits: 12000,
          effectiveAt: regressed,
          provenance: { ...a.provenance, observedAt: regressed },
        };
        await Promise.all([
          publish(event(205, 3, higher, 'properties.listing.price-changed')),
          publish(
            event(
              204,
              2,
              { ...a, askingPriceMinorUnits: 18000 },
              'properties.listing.price-changed',
            ),
          ),
        ]);
        await median(1600, 2);
        await expect.poll(async () => (await count()).evidence, { timeout: 30000 }).toBe(5);
        expect((await count()).evidence).toBe(5);
        await publish(
          event(
            206,
            4,
            { ...higher, areaSquareMeters: null },
            'properties.listing.description-changed',
          ),
        );
        await median(2000, 1);
        await publish(event(207, 5, { ...a, status: 'removed' }, 'properties.listing.removed'));
        await median(1750, 2);
        await publish(event(208, 6, a, 'properties.listing.reappeared'));
        await median(1500, 2);
        await publish(
          event(
            209,
            7,
            { ...a, placeId: 'sao-paulo-bela-vista-avenida-exemplo-fictional-block' },
            'properties.listing.description-changed',
          ),
        );
        await median(2000, 1); // No in-scope substitute for the global cheapest listing.
        expect((await get('sao-paulo')).figures.medianAskingPricePerSquareMeter.recordCount).toBe(
          2,
        );
        expect(
          (await get('sao-paulo-bela-vista')).figures.medianAskingPricePerSquareMeter.value
            ?.minorUnits,
        ).toBe(1000);
        const stable = await count();
        // Conflicts pass through the real transport and its bounded dead-letter route.
        const transport = await amqp.connect(brokerUrl.toString());
        await preserveCleanup(
          async () => {
            const channel = await transport.createConfirmChannel();
            await preserveCleanup(
              async () => {
                const queue = `${MARKET_LISTING_CONSUMER}.dead-letter`;
                const before = (await channel.checkQueue(queue)).messageCount;
                for (const wire of [
                  event(201, 8, a),
                  event(250, 7, a),
                  event(251, 8, { ...a, propertyId: id(999) }),
                ])
                  await broker.publish(wire, signal());
                await expect
                  .poll(async () => (await channel.checkQueue(queue)).messageCount, {
                    timeout: 30000,
                    interval: 100,
                  })
                  .toBe(before + 3);
                await new Promise<void>((resolve, reject) =>
                  channel.publish(
                    'rei.events',
                    'properties.listing.created',
                    Buffer.from(JSON.stringify({ ...first, private: true })),
                    { persistent: true, contentType: 'application/json' },
                    (error) => (error ? reject(error) : resolve()),
                  ),
                );
                await expect
                  .poll(async () => (await channel.checkQueue(queue)).messageCount, {
                    timeout: 30000,
                    interval: 100,
                  })
                  .toBe(before + 4);
              },
              () => channel.close(),
            );
          },
          () => transport.close(),
        );
        expect(await count()).toEqual(stable);
        // Real cancellation destroys the transaction after its effect, leaving no evidence or inbox.
        const controller = new AbortController();
        const cancelled = new ConsumeMarketListing(
          {
            project: async (tx, received) => {
              await facts.project(tx, received);
              controller.abort(new Error('Owned cancellation'));
            },
          },
          transactions,
          new PostgresInbox(db),
        );
        await expect(cancelled.execute(event(260, 8, a), controller.signal)).rejects.toThrow(
          'Owned cancellation',
        );
        expect(await count()).toEqual(stable);
        await db.query(`CREATE FUNCTION market.owned_fail_frontier() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'Owned frontier failure'; END $$`);
        await db.query(
          'CREATE TRIGGER owned_fail_frontier BEFORE UPDATE ON market.listing_price_current FOR EACH ROW EXECUTE FUNCTION market.owned_fail_frontier()',
        );
        await preserveCleanup(
          async () => {
            await expect(consume.execute(event(261, 8, a), signal())).rejects.toThrow();
            expect(await count()).toEqual(stable);
          },
          async () => {
            await db.query('DROP TRIGGER owned_fail_frontier ON market.listing_price_current');
            await db.query('DROP FUNCTION market.owned_fail_frontier()');
          },
        );
        // Acquisition: real object storage and Collection → Properties outbox → Market → HTTP.
        const clock = { now: () => new Date().toISOString() };
        const rawStore = new S3RawSnapshotStore({
          endpoint: `http://127.0.0.1:${minio}`,
          region: 'us-east-1',
          bucket,
          accessKeyId: user,
          secretAccessKey: password,
          lifecycle: new PostgresSnapshotLifecycle(db),
          clock,
        });
        const collector = (source: ListingSource) =>
          new CollectSourceOnce(
            source,
            rawStore,
            new PostgresSourceRegisterRepository(db),
            new PostgresCollectionRunRepository(db),
            transactions,
            new PostgresUuidV7Generator(db),
            clock,
            outbox,
            new CanonicalSnapshotSanitizer(),
          );
        await collector(new SyntheticListingSource()).execute(
          'synthetic-data',
          'market-initial',
          null,
          signal(),
        );
        await expect
          .poll(
            async () =>
              (await get('sao-paulo-bela-vista')).figures.medianAskingPricePerSquareMeter
                .recordCount,
            { timeout: 30000, interval: 100 },
          )
          .toBe(2);
        const initialMedian = (await get('sao-paulo-bela-vista')).figures
          .medianAskingPricePerSquareMeter.value?.minorUnits;
        const modifiedBytes = new TextEncoder().encode(
          new TextDecoder().decode(SYNTHETIC_LISTING_BYTES).replace('78500000', '80000000'),
        );
        expect(modifiedBytes).not.toEqual(SYNTHETIC_LISTING_BYTES);
        const modifiedSource: ListingSource = {
          fetchPage: async (sourceId) => ({
            documents: [
              {
                sourceId,
                sourceListingId: 'SYN-SP-0001',
                sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
                observedAt: clock.now(),
                mediaType: 'application/json',
                bytes: modifiedBytes,
              },
            ],
            nextCursor: null,
            exhausted: true,
          }),
          parse: (document, aborted) => new SyntheticListingSource().parse(document, aborted),
        };
        await collector(modifiedSource).execute(
          'synthetic-data',
          'market-price-change',
          null,
          signal(),
        );
        await expect
          .poll(
            async () =>
              (await get('sao-paulo-bela-vista')).figures.medianAskingPricePerSquareMeter.value
                ?.minorUnits,
            { timeout: 30000, interval: 100 },
          )
          .not.toBe(initialMedian);
        const changed = (
          await db.query<{ business_event: unknown }>(
            `SELECT business_event FROM market.listing_price_evidence WHERE business_event->>'type'='properties.listing.price-changed'
         AND business_event->'payload'->'listing'->>'sourceId'='synthetic-data'`,
          )
        )[0];
        expect(changed).toBeDefined();
        expect(typeof changed!.business_event).toBe('object');
        if (typeof changed!.business_event !== 'object' || changed!.business_event === null)
          throw new Error('Malformed Market evidence');
        expect(parsePropertiesEvent({ ...changed!.business_event, traceContext: null }).type).toBe(
          'properties.listing.price-changed',
        );
        // Every GET is read-only, and broken persistence returns canonical errors.
        await compose('stop', 'worker');
        const snapshot = async () =>
          db.query<{ evidence: string; current: string; inbox: string }>(
            `SELECT
              (SELECT md5(COALESCE(string_agg(to_jsonb(e)::text, '' ORDER BY event_id), ''))
               FROM market.listing_price_evidence e) AS evidence,
              (SELECT md5(COALESCE(string_agg(to_jsonb(c)::text, '' ORDER BY listing_id), ''))
               FROM market.listing_price_current c) AS current,
              (SELECT md5(COALESCE(string_agg(to_jsonb(i)::text, '' ORDER BY event_id), ''))
               FROM platform.inbox i WHERE consumer_name=$1) AS inbox`,
            [MARKET_LISTING_CONSUMER],
          );
        const beforeReads = await snapshot();
        await get();
        await get('brazil');
        await get('sao-paulo-bela-vista');
        expect(await snapshot()).toEqual(beforeReads);
        const unknown = await requestHttp(
          `http://127.0.0.1:${api}/api/v1/places/unknown-place/market`,
        );
        expect(unknown.status).toBe(404);
        await db.query('ALTER TABLE market.property_price_current RENAME TO owned_unavailable');
        await preserveCleanup(
          async () => {
            const failure = await requestHttp(
              `http://127.0.0.1:${api}/api/v1/places/sao-paulo-pinheiros/market`,
            );
            expect(failure.status).toBe(500);
            expect(await failure.json()).toEqual({
              error: {
                code: 'internal_error',
                message: 'An unexpected error occurred.',
                requestId: expect.any(String),
              },
            });
          },
          () => db.query('ALTER TABLE market.owned_unavailable RENAME TO property_price_current'),
        );
        expect(await snapshot()).toEqual(beforeReads);
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
