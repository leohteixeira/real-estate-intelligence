import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import {
  ConsumeMarketListing,
  MARKET_LISTING_CONSUMER,
  type EventEnvelope,
} from '../packages/application/dist/index.js';
import { parsePlaceMarketResponse } from '../packages/contracts/dist/index.js';
import {
  PropertiesEvent,
  PropertiesEventV2,
  isSerializableEventPayload,
  parseUuidV7,
  type ListingFact,
  type MinimumAskingPriceFact,
  type CausalListingState,
  type PropertiesEventType,
} from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresInbox,
  PostgresMarketPriceFacts,
  PostgresOutbox,
  PostgresTransactionRunner,
  RabbitMqEventBroker,
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
    sourceId: 'synthetic-causal',
    sourceListingId: `listing-${n}`,
    placeId: block,
    propertyType: 'apartment',
    areaSquareMeters: 10,
    status: 'active',
    askingPriceMinorUnits: price,
    currency: 'BRL',
    effectiveAt: at,
    provenance: {
      sourceId: 'synthetic-causal',
      sourceListingId: `listing-${n}`,
      sourceUrl: `https://causal.invalid/${n}`,
      runId: id(800),
      snapshotId: id(801),
      contentHash: `sha256:${'a'.repeat(64)}`,
      observedAt: at,
    },
    ...changes,
  };
}
function wire(event: PropertiesEvent | PropertiesEventV2): EventEnvelope {
  if (!isSerializableEventPayload(event.payload))
    throw new Error('Invalid synthetic event payload');
  return { ...event, payload: event.payload };
}
function listingEvent(
  n: number,
  revision: number,
  fact: ListingFact,
  assignmentRevision = 0,
  type: PropertiesEventType = 'properties.listing.created',
): EventEnvelope {
  const extra =
    type === 'properties.listing.price-changed'
      ? { previousMinorUnits: fact.askingPriceMinorUnits + 1 }
      : type === 'properties.listing.description-changed'
        ? { beforeHash: `sha256:${'b'.repeat(64)}`, afterHash: `sha256:${'c'.repeat(64)}` }
        : {};
  return wire(
    new PropertiesEventV2(type, {
      eventId: id(n),
      aggregateId: fact.listingId,
      occurredAt: at,
      payload: {
        revision,
        effectiveAt: fact.effectiveAt,
        listing: fact,
        assignmentRevision,
        ...extra,
      },
    }),
  );
}
function minimum(property: string, facts: readonly ListingFact[]): MinimumAskingPriceFact {
  const active = facts
    .filter((f) => f.propertyId === property && f.status === 'active')
    .sort(
      (a, b) =>
        a.askingPriceMinorUnits - b.askingPriceMinorUnits || (a.listingId < b.listingId ? -1 : 1),
    );
  const f = active[0];
  return {
    propertyId: property,
    placeId: f?.placeId ?? block,
    areaSquareMeters: f?.areaSquareMeters ?? null,
    minimumMinorUnits: f?.askingPriceMinorUnits ?? null,
    currency: 'BRL',
    selectedListingId: f?.listingId ?? null,
    provenance: f?.provenance ?? null,
    activeListingIds: active.map((l) => l.listingId),
  };
}
function assignmentEvent(
  n: number,
  revision: number,
  type: 'properties.property.merged' | 'properties.property.split',
  states: readonly CausalListingState[],
  destinations: readonly string[],
  from: readonly string[],
  to: readonly string[],
): EventEnvelope {
  const assignments = states.map((state, i) => ({
    listingId: state.listing.listingId,
    fromPropertyId: state.listing.propertyId,
    toPropertyId: destinations[i]!,
    fromAssignmentRevision: state.assignmentRevision,
    assignmentRevision: state.assignmentRevision + 1,
  }));
  const before = states.map((s) => s.listing);
  const after = before.map((f, i) => ({ ...f, propertyId: destinations[i]! }));
  return wire(
    new PropertiesEventV2(type, {
      eventId: id(n),
      aggregateId: to[0]!,
      occurredAt: at,
      payload: {
        revision,
        effectiveAt: at,
        previous: from.map((p) => minimum(p, before)),
        resulting: to.map((p) => minimum(p, after)),
        listingStates: states,
        assignments,
      },
    }),
  );
}
test('complete causal facts prove upgrade, all eight families, adversarial delivery, atomic conflicts and HTTP on owned real services', async () => {
  await withCampaign(async ({ command }) => {
    const project = `rei-market-price-facts-${randomUUID()}`;
    const [postgres, rabbit, management, minio, minioConsole, api] = await allocatePorts(6);
    const user = 'rei_causal_fixture',
      password = 'controlled_causal_fixture';
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
      OBJECT_STORE_BUCKET: 'rei-causal-fixture',
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
    let connection: DatabaseConnection | undefined, publisher: RabbitMqEventBroker | undefined;
    const signal = () => AbortSignal.timeout(30000);
    await preserveCleanup(
      async () => {
        await compose('up', '--detach', '--wait', 'postgres', 'rabbitmq', 'minio');
        const db = new DatabaseConnection(database.toString());
        connection = db;
        const transactions = new PostgresTransactionRunner(db);
        await db.query(
          'CREATE TABLE schema_migrations (version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
        );
        const migrations = (await readdir(new URL('../migrations/', import.meta.url)))
          .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
          .sort();
        const apply = async (file: string) => {
          const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
          const client = await db.leaseClient();
          await preserveCleanup(
            async () => {
              await client.query('BEGIN');
              try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
                  file.replace(/\.sql$/, ''),
                ]);
                await client.query('COMMIT');
              } catch (error) {
                await client.query('ROLLBACK');
                throw error;
              }
            },
            async () => client.release(),
          );
        };
        for (const file of migrations.filter((f) => f !== '2002_market_causal_price_facts.sql'))
          await apply(file);
        const legacy = listing(90, 190, 30000, { areaSquareMeters: null });
        const uppercaseLegacy = {
          ...legacy,
          listingId: legacy.listingId.toUpperCase(),
          propertyId: legacy.propertyId.toUpperCase(),
          provenance: {
            ...legacy.provenance,
            runId: legacy.provenance.runId.toUpperCase(),
            snapshotId: legacy.provenance.snapshotId.toUpperCase(),
          },
        };
        const legacyEvents = [
          wire(
            new PropertiesEvent('properties.listing.created', {
              eventId: id(290),
              aggregateId: legacy.listingId,
              occurredAt: at,
              payload: {
                revision: 1,
                effectiveAt: at,
                listing: { ...uppercaseLegacy, askingPriceMinorUnits: 40000 },
              },
            }),
          ),
          wire(
            new PropertiesEvent('properties.listing.price-changed', {
              eventId: id(291),
              aggregateId: legacy.listingId,
              occurredAt: at,
              payload: {
                revision: 2,
                effectiveAt: at,
                listing: uppercaseLegacy,
                previousMinorUnits: 40000,
              },
            }),
          ),
        ];
        for (const event of legacyEvents)
          await db.query(
            'INSERT INTO market.listing_price_evidence (event_id,listing_id,revision,business_event) VALUES ($1,$2,$3,$4::jsonb)',
            [
              event.eventId,
              event.aggregateId,
              Reflect.get(event.payload, 'revision'),
              JSON.stringify({ ...event, traceContext: undefined }),
            ],
          );
        await db.query(
          'INSERT INTO market.listing_price_current (listing_id,revision,event_id) VALUES ($1,2,$2)',
          [legacy.listingId, id(291)],
        );
        const legacyBefore = await db.query(
          'SELECT * FROM market.listing_price_evidence ORDER BY event_id',
        );
        await apply('2002_market_causal_price_facts.sql');
        expect(
          await db.query('SELECT * FROM market.listing_price_evidence ORDER BY event_id'),
        ).toEqual(legacyBefore);
        expect(
          await db.query<{ revision: string }>(
            'SELECT revision FROM market.listing_state_current WHERE listing_id=$1',
            [legacy.listingId],
          ),
        ).toEqual([{ revision: '2' }]);
        expect(
          await db.query<{ revision: string }>(
            'SELECT revision FROM market.listing_assignment_current WHERE listing_id=$1',
            [legacy.listingId],
          ),
        ).toEqual([{ revision: '0' }]);
        for (const [table, key, value] of [
          ['price_event_evidence', 'event_id', legacyEvents[0]!.eventId],
          ['listing_price_identity', 'listing_id', legacy.listingId],
          ['listing_state_evidence', 'listing_id', legacy.listingId],
          ['listing_assignment_evidence', 'listing_id', legacy.listingId],
        ] as const) {
          await expect(
            db.query(`DELETE FROM market.${table} WHERE ${key}=$1`, [value]),
          ).rejects.toThrow('immutable');
        }
        const facts = new PostgresMarketPriceFacts(db);
        expect(await facts.readCurrent()).toEqual([legacy]);
        await compose('up', '--detach', '--build', '--wait', 'migrations', 'worker', 'api');
        const broker = new RabbitMqEventBroker({
          url: brokerUrl.toString(),
          operationTimeoutMs: 5000,
        });
        publisher = broker;
        const outbox = new PostgresOutbox(db);
        const consume = new ConsumeMarketListing(facts, transactions, new PostgresInbox(db));
        const get = async () => {
          const response = await requestHttp(
            `http://127.0.0.1:${api}/api/v1/places/sao-paulo-pinheiros/market`,
          );
          expect(response.status).toBe(200);
          return parsePlaceMarketResponse(await response.json());
        };
        const median = async (amount: number | null, count: number) =>
          vi.waitFor(
            async () => {
              const response = await get();
              expect(
                response.figures.medianAskingPricePerSquareMeter.value?.minorUnits ?? null,
              ).toBe(amount);
              expect(response.figures.medianAskingPricePerSquareMeter.recordCount).toBe(count);
              expect(response.parentMedian?.median.value?.minorUnits ?? null).toBe(amount);
              expect(response.parentMedian?.median.recordCount).toBe(count);
              expect(response.basis).toBe('event-fed-place-figures');
              expect(response.figures.medianAskingPricePerSquareMeter.freshness.status).toBe(
                'untracked',
              );
            },
            { timeout: 30000, interval: 100 },
          );
        const applied = async (event: EventEnvelope) =>
          expect
            .poll(
              async () =>
                (
                  await db.query<{ present: boolean }>(
                    'SELECT EXISTS(SELECT 1 FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2) AS present',
                    [MARKET_LISTING_CONSUMER, event.eventId],
                  )
                )[0]!.present,
              { timeout: 30000, interval: 100 },
            )
            .toBe(true);
        const history: EventEnvelope[] = [...legacyEvents];
        const publish = async (event: EventEnvelope) => {
          history.push(event);
          await transactions.runInTransaction((tx) => outbox.append(tx, [event]));
          await applied(event);
        };
        // Canonical same-revision snapshot references agree with uppercase retained v1 history.
        const legacyCurrent = minimum(legacy.propertyId, [legacy]);
        await publish(
          wire(
            new PropertiesEventV2('properties.property.asking-price-changed', {
              eventId: id(294),
              aggregateId: legacy.propertyId,
              occurredAt: at,
              payload: {
                revision: 1,
                effectiveAt: at,
                previous: { ...legacyCurrent, minimumMinorUnits: 40000 },
                current: legacyCurrent,
                listingStates: [{ listing: legacy, revision: 2, assignmentRevision: 0 }],
              },
            }),
          ),
        );
        const a = listing(1, 101, 10000),
          aOther = listing(2, 101, 15000),
          b = listing(3, 102, 20000);
        await Promise.all([
          publish(
            listingEvent(201, 1, {
              ...a,
              listingId: a.listingId.toUpperCase(),
              propertyId: a.propertyId.toUpperCase(),
              provenance: {
                ...a.provenance,
                runId: a.provenance.runId.toUpperCase(),
                snapshotId: a.provenance.snapshotId.toUpperCase(),
              },
            }),
          ),
          publish(listingEvent(202, 1, aOther)),
          publish(listingEvent(203, 1, b)),
        ]);
        await median(1500, 2);
        const merge = assignmentEvent(
          204,
          1,
          'properties.property.merged',
          [a, aOther, b].map((listing) => ({ listing, revision: 1, assignmentRevision: 0 })),
          [id(103), id(103), id(103)],
          [id(101), id(102)],
          [id(103)],
        );
        await publish(merge);
        await median(1000, 1);
        const moved = [a, aOther, b].map((l) => ({ ...l, propertyId: id(103) }));
        const removedA = { ...moved[0]!, status: 'removed' as const };
        await publish(listingEvent(205, 2, removedA, 1, 'properties.listing.removed'));
        await median(1500, 1);
        const removedOther = { ...moved[1]!, status: 'removed' as const };
        await publish(listingEvent(206, 2, removedOther, 1, 'properties.listing.removed'));
        await median(2000, 1);
        const removedB = { ...moved[2]!, status: 'removed' as const };
        await publish(listingEvent(207, 2, removedB, 1, 'properties.listing.removed'));
        await median(null, 0);
        const reappeared = { ...moved[0]!, askingPriceMinorUnits: 12000 };
        await publish(listingEvent(208, 3, reappeared, 1, 'properties.listing.reappeared'));
        await median(1200, 1);
        const splitStates = [
          { listing: reappeared, revision: 3, assignmentRevision: 1 },
          { listing: removedOther, revision: 2, assignmentRevision: 1 },
          { listing: removedB, revision: 2, assignmentRevision: 1 },
        ];
        const split = assignmentEvent(
          209,
          2,
          'properties.property.split',
          splitStates,
          [id(103), id(104), id(104)],
          [id(103)],
          [id(103), id(104)],
        );
        await publish(split);
        await median(1200, 1);
        await publish(
          listingEvent(
            210,
            3,
            { ...aOther, propertyId: id(104) },
            2,
            'properties.listing.reappeared',
          ),
        );
        await median(1350, 2);
        const changed = { ...reappeared, askingPriceMinorUnits: 18000 };
        await publish(listingEvent(211, 4, changed, 2, 'properties.listing.price-changed'));
        await median(1650, 2);
        const propertyPrice = wire(
          new PropertiesEventV2('properties.property.asking-price-changed', {
            eventId: id(212),
            aggregateId: id(103),
            occurredAt: at,
            payload: {
              revision: 3,
              effectiveAt: at,
              previous: minimum(id(103), [reappeared]),
              current: minimum(id(103), [changed]),
              listingStates: [{ listing: changed, revision: 4, assignmentRevision: 2 }],
            },
          }),
        );
        await publish(propertyPrice);
        await median(1650, 2);
        await publish(
          listingEvent(
            213,
            5,
            { ...changed, areaSquareMeters: null },
            2,
            'properties.listing.description-changed',
          ),
        );
        await median(1500, 1);
        await publish(
          listingEvent(
            214,
            6,
            { ...changed, placeId: 'sao-paulo-bela-vista-avenida-exemplo-fictional-block' },
            2,
            'properties.listing.description-changed',
          ),
        );
        await median(1500, 1);
        // A global cheaper member outside the selected scope prevents an in-scope substitute.
        await publish(
          listingEvent(
            215,
            4,
            {
              ...b,
              propertyId: id(104),
              askingPriceMinorUnits: 10000,
              placeId: 'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
            },
            2,
            'properties.listing.reappeared',
          ),
        );
        await median(null, 0);
        await publish(
          listingEvent(
            216,
            5,
            { ...b, propertyId: id(104), askingPriceMinorUnits: 15000 },
            2,
            'properties.listing.description-changed',
          ),
        );
        await median(1500, 1);
        expect((await get()).figures.medianAskingPricePerSquareMeter.sources[0]?.url).toBe(
          aOther.provenance.sourceUrl,
        );
        // Legacy assignment zero cannot undo a later merge, even with a new higher state revision.
        const legacyMove = assignmentEvent(
          292,
          4,
          'properties.property.merged',
          [
            { listing: legacy, revision: 2, assignmentRevision: 0 },
            { listing: changed, revision: 4, assignmentRevision: 2 },
          ],
          [id(103), id(103)],
          [id(190), id(103)],
          [id(103)],
        );
        await publish(legacyMove);
        const laterLegacy = wire(
          new PropertiesEvent('properties.listing.description-changed', {
            eventId: id(293),
            aggregateId: legacy.listingId,
            occurredAt: at,
            payload: {
              revision: 3,
              effectiveAt: at,
              listing: legacy,
              beforeHash: `sha256:${'b'.repeat(64)}`,
              afterHash: `sha256:${'c'.repeat(64)}`,
            },
          }),
        );
        await publish(laterLegacy);
        expect(
          (
            await db.query<{ property_id: string }>(
              'SELECT property_id FROM market.listing_assignment_current WHERE listing_id=$1',
              [legacy.listingId],
            )
          )[0]!.property_id,
        ).toBe(id(103));
        await median(1500, 1);
        const snapshot = async () =>
          db.query<{ name: string; rows: unknown }>(
            `SELECT 'events' AS name,jsonb_agg(to_jsonb(e) ORDER BY event_id) AS rows FROM market.price_event_evidence e UNION ALL SELECT 'identity',jsonb_agg(to_jsonb(e) ORDER BY listing_id) FROM market.listing_price_identity e UNION ALL SELECT 'legacy-events',jsonb_agg(to_jsonb(e) ORDER BY event_id) FROM market.listing_price_evidence e UNION ALL SELECT 'legacy-current',jsonb_agg(to_jsonb(e) ORDER BY listing_id) FROM market.listing_price_current e UNION ALL SELECT 'states',jsonb_agg(to_jsonb(e) ORDER BY listing_id,revision) FROM market.listing_state_evidence e UNION ALL SELECT 'assignments',jsonb_agg(to_jsonb(e) ORDER BY listing_id,revision) FROM market.listing_assignment_evidence e UNION ALL SELECT 'state-current',jsonb_agg(to_jsonb(e) ORDER BY listing_id) FROM market.listing_state_current e UNION ALL SELECT 'assignment-current',jsonb_agg(to_jsonb(e) ORDER BY listing_id) FROM market.listing_assignment_current e UNION ALL SELECT 'properties',jsonb_agg(to_jsonb(e) ORDER BY property_id) FROM market.property_price_current e ORDER BY name`,
          );
        const normal = await snapshot();
        await db.query('DELETE FROM platform.inbox WHERE consumer_name=$1', [
          MARKET_LISTING_CONSUMER,
        ]);
        await compose('restart', 'worker');
        await compose('up', '--detach', '--wait', 'worker');
        for (const event of [...history].reverse()) {
          await broker.publish({ ...event, traceContext: null }, signal());
          await applied(event);
        }
        expect(await snapshot()).toEqual(normal);
        await median(1500, 1);
        // Reset only this owned fixture's projection to prove an actual reverse-first history.
        await db.query(
          'TRUNCATE market.price_event_evidence,market.listing_price_evidence,market.listing_price_current,market.listing_price_identity,market.listing_state_evidence,market.listing_state_current,market.listing_assignment_evidence,market.listing_assignment_current,market.property_price_current',
        );
        await db.query('DELETE FROM platform.inbox WHERE consumer_name=$1', [
          MARKET_LISTING_CONSUMER,
        ]);
        for (const event of [...history].reverse()) {
          await broker.publish(event, signal());
          await applied(event);
        }
        expect(await snapshot()).toEqual(normal);
        await median(1500, 1);
        const stable = await snapshot();
        const stableInbox = await db.query(
          'SELECT * FROM platform.inbox ORDER BY consumer_name,event_id',
        );
        // An actual SQL trigger fails after assignment writes but before minimum commit.
        await db.query(
          `CREATE FUNCTION market.owned_fail_minimum() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned midmerge failure'; END $$`,
        );
        await db.query(
          'CREATE TRIGGER owned_fail_minimum BEFORE UPDATE ON market.property_price_current FOR EACH ROW EXECUTE FUNCTION market.owned_fail_minimum()',
        );
        await preserveCleanup(
          async () => {
            const next = assignmentEvent(
              300,
              5,
              'properties.property.merged',
              [
                {
                  listing: {
                    ...changed,
                    placeId: 'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
                  },
                  revision: 6,
                  assignmentRevision: 3,
                },
                { listing: { ...aOther, propertyId: id(104) }, revision: 3, assignmentRevision: 2 },
                {
                  listing: { ...b, propertyId: id(104), askingPriceMinorUnits: 15000 },
                  revision: 5,
                  assignmentRevision: 2,
                },
                { listing: { ...legacy, propertyId: id(103) }, revision: 3, assignmentRevision: 1 },
              ],
              [id(103), id(103), id(103), id(103)],
              [id(103), id(104)],
              [id(103)],
            );
            await expect(consume.execute(next, signal())).rejects.toThrow();
            const failedTransport = await amqp.connect(brokerUrl.toString());
            await preserveCleanup(
              async () => {
                const channel = await failedTransport.createChannel();
                await preserveCleanup(
                  async () => {
                    const queue = `${MARKET_LISTING_CONSUMER}.dead-letter`;
                    const before = (await channel.checkQueue(queue)).messageCount;
                    await broker.publish(next, signal());
                    await expect
                      .poll(async () => (await channel.checkQueue(queue)).messageCount, {
                        timeout: 30000,
                        interval: 100,
                      })
                      .toBe(before + 1);
                    const rejected = await channel.get(queue, { noAck: true });
                    if (!rejected) throw new Error('Expected the broker-rejected injected merge.');
                    const rejectedEvent: unknown = JSON.parse(rejected.content.toString('utf8'));
                    expect(rejectedEvent).toMatchObject({ eventId: next.eventId });
                  },
                  () => channel.close(),
                );
              },
              () => failedTransport.close(),
            );
            expect(await snapshot()).toEqual(stable);
            expect(
              await db.query('SELECT * FROM platform.inbox ORDER BY consumer_name,event_id'),
            ).toEqual(stableInbox);
            expect(
              (
                await db.query<{ present: boolean }>(
                  'SELECT EXISTS(SELECT 1 FROM platform.inbox WHERE event_id=$1) AS present',
                  [next.eventId],
                )
              )[0]!.present,
            ).toBe(false);
          },
          async () => {
            await db.query('DROP TRIGGER owned_fail_minimum ON market.property_price_current');
            await db.query('DROP FUNCTION market.owned_fail_minimum()');
          },
        );
        const transport = await amqp.connect(brokerUrl.toString());
        await preserveCleanup(
          async () => {
            const channel = await transport.createChannel();
            await preserveCleanup(
              async () => {
                const queue = `${MARKET_LISTING_CONSUMER}.dead-letter`,
                  before = (await channel.checkQueue(queue)).messageCount;
                const previous = minimum(id(103), [changed]);
                const legacyProperty = wire(
                  new PropertiesEvent('properties.property.asking-price-changed', {
                    eventId: id(400),
                    aggregateId: id(103),
                    occurredAt: at,
                    payload: {
                      revision: 5,
                      effectiveAt: at,
                      previous,
                      current: { ...previous, minimumMinorUnits: 17000 },
                    },
                  }),
                );
                const conflictEvents = [
                  legacyProperty,
                  { ...propertyPrice, eventId: parseUuidV7(id(201)) },
                  { ...propertyPrice, eventId: parseUuidV7(id(401)) },
                  listingEvent(402, 1, { ...a, askingPriceMinorUnits: 11000 }),
                  listingEvent(
                    403,
                    7,
                    {
                      ...changed,
                      sourceId: 'other-source',
                      provenance: { ...changed.provenance, sourceId: 'other-source' },
                    },
                    3,
                  ),
                  listingEvent(404, 6, { ...changed, askingPriceMinorUnits: 19000 }, 3),
                  listingEvent(405, 7, { ...changed, propertyId: id(999) }, 3),
                  {
                    ...propertyPrice,
                    eventId: parseUuidV7(id(406)),
                    payload: { ...propertyPrice.payload, listingStates: [] },
                  },
                ];
                for (const event of conflictEvents) await broker.publish(event, signal());
                await expect
                  .poll(async () => (await channel.checkQueue(queue)).messageCount, {
                    timeout: 30000,
                    interval: 100,
                  })
                  .toBe(before + conflictEvents.length);
              },
              () => channel.close(),
            );
          },
          () => transport.close(),
        );
        expect(await snapshot()).toEqual(stable);
        // Concurrent commits and reads never expose assignments without their matching minima.
        const equal = listingEvent(
          500,
          7,
          {
            ...changed,
            askingPriceMinorUnits: 17000,
            placeId: 'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
          },
          3,
          'properties.listing.price-changed',
        );
        const concurrentSplit = assignmentEvent(
          501,
          1,
          'properties.property.split',
          [
            { listing: { ...aOther, propertyId: id(104) }, revision: 3, assignmentRevision: 2 },
            {
              listing: { ...b, propertyId: id(104), askingPriceMinorUnits: 20000 },
              revision: 6,
              assignmentRevision: 2,
            },
          ],
          [id(105), id(104)],
          [id(104)],
          [id(104), id(105)],
        );
        const concurrent = await Promise.all([
          consume.execute(equal, signal()),
          consume.execute(equal, signal()),
          consume.execute(concurrentSplit, signal()),
          consume.execute(concurrentSplit, signal()),
          ...Array.from({ length: 8 }, () => get()),
        ]);
        for (const overview of concurrent.slice(4)) {
          if (!overview) throw new Error('Expected a concurrent HTTP overview.');
          const median = overview.figures.medianAskingPricePerSquareMeter;
          expect([
            [1500, 1],
            [1750, 2],
          ]).toContainEqual([median.value?.minorUnits, median.recordCount]);
          expect(overview.parentMedian?.median.value).toEqual(median.value);
          expect(overview.parentMedian?.median.recordCount).toBe(median.recordCount);
        }
        await median(1750, 2);
        await compose('stop', 'worker');
        const beforeReads = await snapshot();
        await get();
        await get();
        expect(await snapshot()).toEqual(beforeReads);
        await db.query(
          `UPDATE market.property_price_current SET selected_listing = selected_listing || '{"private":true}'::jsonb WHERE selected_listing IS NOT NULL`,
        );
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
      async () =>
        cleanupAll(
          async () => publisher?.close(),
          async () => connection?.close(),
          async () => {
            await compose('down', '--volumes', '--remove-orphans');
          },
        ),
    );
  });
});
