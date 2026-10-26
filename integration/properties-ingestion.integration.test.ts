import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import type { ListingSource, RawListingDocument } from '../packages/application/dist/index.js';
import { CollectSourceOnce } from '../packages/application/dist/index.js';
import type { ListingDescription } from '../packages/contracts/dist/index.js';
import {
  parseListingResponse,
  parsePlaceResponse,
  parsePropertyResponse,
  parseSearchResponse,
} from '../packages/contracts/dist/index.js';
import type {
  CollectedListing,
  CollectionSnapshotCorrected,
  CollectionSnapshotParsed,
  PropertiesEvent,
  ResolvedPropertyPlace,
  UuidV7,
} from '../packages/domain/dist/index.js';
import {
  isSerializableEventPayload,
  parseCollectedListing,
  parseCollectionEvent,
  parseCollectionSnapshotParsed,
  Property,
} from '../packages/domain/dist/index.js';
import {
  CanonicalSnapshotSanitizer,
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresInbox,
  PostgresOutbox,
  PostgresPropertyRepository,
  PostgresSnapshotLifecycle,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
  SyntheticListingSource,
  SyntheticLocationsAdapter,
} from '../packages/infrastructure/dist/index.js';
import {
  allocatePorts,
  cleanupAll,
  preserveCleanup,
  withPreparedSearchCampaign as withCampaign,
} from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
test('properties-ingestion preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-properties-ingestion-${process.pid}-${randomUUID().slice(0, 8)}`;
    const fixture = {
      user: 'rei_ingest_fixture',
      password: 'rei-ingest-owned-local-fixture',
      database: 'rei_ingest_fixture',
      bucket: 'rei-ingest-fixture',
      vhost: 'rei-ingest-fixture',
    };
    async function reservePort() {
      const [selected] = await allocatePorts(1);
      expect(Number.isInteger(selected)).toBeTruthy();
      return selected;
    }
    const [postgres, rabbit, management, minio, minioConsole, api] = await Promise.all(
      Array.from({ length: 6 }, reservePort),
    );
    expect(new Set([postgres, rabbit, management, minio, minioConsole, api]).size).toBe(6);
    const environment = {
      ...process.env,
      COMPOSE_FILE: 'compose.yaml',
      COMPOSE_PROJECT_NAME: project,
      COMPOSE_PROFILES: 'tools',
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      NODE_ENV: 'test',
      POSTGRES_USER: fixture.user,
      POSTGRES_PASSWORD: fixture.password,
      POSTGRES_DB: fixture.database,
      POSTGRES_PORT: String(postgres),
      RABBITMQ_USER: fixture.user,
      RABBITMQ_PASSWORD: fixture.password,
      RABBITMQ_VHOST: fixture.vhost,
      RABBITMQ_PORT: String(rabbit),
      RABBITMQ_MANAGEMENT_PORT: String(management),
      MINIO_ROOT_USER: fixture.user,
      MINIO_ROOT_PASSWORD: fixture.password,
      MINIO_API_PORT: String(minio),
      MINIO_CONSOLE_PORT: String(minioConsole),
      OBJECT_STORE_REGION: 'us-east-1',
      OBJECT_STORE_BUCKET: fixture.bucket,
      API_PORT: String(api),
      SNAPSHOT_ENCRYPTION_KEY_ID: '',
      SNAPSHOT_ENCRYPTION_KEY_BASE64: '',
      WORKER_INTERVAL_MS: '30000',
      OUTBOX_RELAY_INTERVAL_MS: '250',
      RABBITMQ_RECONNECT_INTERVAL_MS: '1000',
      WORKER_OPERATION_TIMEOUT_MS: '5000',
      COLLECTION_DEADLINE_MS: '30000',
      SHUTDOWN_TIMEOUT_MS: '15000',
      EVENT_DELIVERY_LIMIT: '3',
      EVENT_REDELIVERY_DELAY_MS: '250',
      OUTBOX_CLAIM_LEASE_MS: '130000',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const compose = (...args: string[]) =>
      run(
        'docker',
        [
          'compose',
          '--file',
          'compose.yaml',
          '--project-name',
          project,
          '--profile',
          'tools',
          ...args,
        ],
        {
          cwd: new URL('..', import.meta.url),
          env: environment,
          timeout: 240000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
    const databaseUrl = new URL(`postgres://127.0.0.1:${postgres}/${fixture.database}`);
    databaseUrl.username = fixture.user;
    databaseUrl.password = fixture.password;
    const rabbitUrl = new URL(`amqp://127.0.0.1:${rabbit}/${fixture.vhost}`);
    rabbitUrl.username = fixture.user;
    rabbitUrl.password = fixture.password;
    const queue = 'properties.parsed-listing';
    const signal = () => AbortSignal.timeout(15000);
    async function waitFor<T>(description: string, probe: () => Promise<T> | T, duration = 60000) {
      let result: T | undefined;
      await vi.waitFor(
        async () => {
          result = await probe();
          expect(result, description).toBeTruthy();
        },
        { timeout: duration, interval: 100 },
      );
    }
    async function queueState(name: string | number | boolean) {
      const response = await requestHttp(
        `http://127.0.0.1:${management}/api/queues/${encodeURIComponent(fixture.vhost)}/${encodeURIComponent(name)}`,
        {
          headers: {
            authorization: `Basic ${Buffer.from(`${fixture.user}:${fixture.password}`).toString('base64')}`,
          },
          signal: signal(),
        },
      );
      return response.ok
        ? (response.json() as Promise<{ messages_ready: number; messages_unacknowledged: number }>)
        : null;
    }
    async function drained() {
      await waitFor('Properties queue to drain', async () => {
        const state = await queueState(queue);
        return state && state.messages_ready === 0 && state.messages_unacknowledged === 0;
      });
    }
    let deadLetters = 0;
    async function rejected(
      _publisher: RabbitMqEventBroker,
      wire: CollectionSnapshotParsed | CollectionSnapshotCorrected,
    ) {
      // Preserve deliberately malformed wire fields: the production publisher emits only canonical
      // envelope keys, so it cannot represent an injected extra-field negative test.
      const transport = await amqp.connect(rabbitUrl.toString());
      {
        let cleanupPrimary1: unknown;
        let cleanupPrimaryThrown1 = false;
        try {
          const channel = await transport.createConfirmChannel();
          await new Promise<void>((resolve, reject) => {
            channel.publish(
              'rei.events',
              wire.type,
              Buffer.from(JSON.stringify(wire)),
              {
                persistent: true,
                contentType: 'application/json',
                messageId: wire.eventId,
              },
              (error) => (error ? reject(error) : resolve()),
            );
          });
          await channel.close();
        } catch (error) {
          cleanupPrimary1 = error;
          cleanupPrimaryThrown1 = true;
          throw error;
        } finally {
          await preserveCleanup(
            async () => {
              if (cleanupPrimaryThrown1) throw cleanupPrimary1;
            },
            async () => {
              await cleanupAll(async () => {
                await transport.close();
              });
            },
          );
        }
      }
      deadLetters++;
      await waitFor(
        'bounded failure to reach Properties dead-letter queue',
        async () =>
          ((await queueState(`${queue}.dead-letter`))?.messages_ready ?? 0) >= deadLetters,
      );
      await drained();
    }
    async function get<
      T extends (value: unknown) => {
        metadata: { dataMode: string; fixtureVersion: string; asOf: string };
      },
    >(path: string, parser: T) {
      const response = await requestHttp(`http://127.0.0.1:${api}/api/v1/${path}`, {
        signal: signal(),
      });
      expect(response.status, path).toBe(200);
      return parser(await response.json()) as ReturnType<T>;
    }
    let connection: DatabaseConnection;
    let store: S3RawSnapshotStore;
    let publisher: RabbitMqEventBroker;
    {
      let cleanupPrimary2: unknown;
      let cleanupPrimaryThrown2 = false;
      try {
        try {
          console.log(`Starting isolated Properties ingestion campaign ${project}.`);
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
          connection = new DatabaseConnection(databaseUrl.toString());
          publisher = new RabbitMqEventBroker({
            url: rabbitUrl.toString(),
            operationTimeoutMs: 5000,
          });
          const clock = { now: () => new Date().toISOString() };
          store = new S3RawSnapshotStore({
            endpoint: `http://127.0.0.1:${minio}`,
            region: 'us-east-1',
            bucket: fixture.bucket,
            accessKeyId: fixture.user,
            secretAccessKey: fixture.password,
            lifecycle: new PostgresSnapshotLifecycle(connection),
            clock,
          });
          const productionSource = new SyntheticListingSource();
          const collector = (source: ListingSource = productionSource) =>
            new CollectSourceOnce(
              source,
              store,
              new PostgresSourceRegisterRepository(connection),
              new PostgresCollectionRunRepository(connection),
              new PostgresTransactionRunner(connection),
              new PostgresUuidV7Generator(connection),
              clock,
              new PostgresOutbox(connection),
              new CanonicalSnapshotSanitizer(),
            );
          const customSource = (
            sourceListingId: string,
            location: CollectedListing['location'] | undefined = undefined,
          ) => ({
            fetchPage: async (_sourceId: string, cursor: string | null) => ({
              documents:
                cursor === null
                  ? [
                      {
                        sourceId: 'synthetic-data',
                        sourceListingId,
                        sourceUrl: `https://synthetic.invalid/listings/${sourceListingId}`,
                        observedAt: '2026-10-10T11:59:59.000Z',
                        mediaType: 'application/json' as const,
                        bytes: new TextEncoder().encode(
                          JSON.stringify({
                            ...parseCollectedListing(
                              JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
                            ),
                            ...(location ? { location } : {}),
                            imageFingerprints: [
                              `fixture-fingerprint:v1:ingestion-${sourceListingId.toLowerCase()}`,
                            ],
                          }),
                        ),
                      },
                    ]
                  : [],
              nextCursor: null,
              exhausted: true,
            }),
            parse: (document: RawListingDocument, cancellation: AbortSignal) =>
              productionSource.parse(document, cancellation),
          });
          const evidence = async (eventId: UuidV7) =>
            (
              await connection.query<{
                event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
              }>('SELECT event FROM collection.parsed_event_evidence WHERE event_id=$1', [eventId])
            )[0]!.event;
          const counts = async () =>
            (
              await connection.query<{
                properties: number;
                listings: number;
                facts: number;
                inbox: number;
                creations: number;
              }>(`SELECT
    (SELECT count(*) FROM properties.property)::integer AS properties,
    (SELECT count(*) FROM properties.listing)::integer AS listings,
    (SELECT count(*) FROM properties.incoming_fact)::integer AS facts,
    (SELECT count(*) FROM platform.inbox WHERE consumer_name='properties.parsed-listing')::integer AS inbox,
    (SELECT count(*) FROM platform.outbox WHERE event_type='properties.listing.created')::integer AS creations`)
            )[0];
          const stable = async (expected: object | undefined) => {
            await drained();
            expect(await counts()).toStrictEqual(expected);
          };
          // A failure after fact/property insert must leave no inbox, fact, entity or creation outbox.
          await connection.query(
            `CREATE FUNCTION properties.integration_fail_listing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned fixture insertion failure'; END $$`,
          );
          await connection.query(
            'CREATE TRIGGER integration_fail_listing BEFORE INSERT ON properties.listing FOR EACH ROW EXECUTE FUNCTION properties.integration_fail_listing()',
          );
          const collected = await collector().execute(
            'synthetic-data',
            'ingest-initial',
            null,
            signal(),
          );
          const original = await evidence(collected.parsedEventId);
          parseCollectionEvent(original);
          await waitFor(
            'durable receipt while listing effect repeatedly fails',
            async () => (await counts())!.facts! === 1,
          );
          await stable({ properties: 0, listings: 0, facts: 1, inbox: 1, creations: 0 });
          await connection.query('DROP TRIGGER integration_fail_listing ON properties.listing');
          await connection.query('DROP FUNCTION properties.integration_fail_listing()');
          console.log(
            'Rollback and bounded delivery verified; retrying the genuine canonical event.',
          );
          await publisher.publish(original, signal());
          await waitFor(
            'the genuine initial Property',
            async () => (await counts())!.properties! === 1,
          );
          console.log('Initial persisted Property created through the production worker.');
          const identity = (
            await connection.query<{ property_id: string; listing_id: string }>(
              'SELECT property_id::text, listing_id::text FROM properties.listing',
            )
          )[0];
          let detail = await get(`properties/${identity!.property_id}`, parsePropertyResponse);
          const listing = await get(`listings/${identity!.listing_id}`, parseListingResponse);
          expect(listing.listing).toStrictEqual(
            detail.property.listings.find((member) => member.id === identity!.listing_id),
          );
          expect(identity!.property_id).not.toBe(identity!.listing_id);
          expect(listing.listing.askingPriceMinorUnits).toBe(
            original.payload.listing.askingPriceMinorUnits,
          );
          expect(listing.listing.areaSquareMeters).toBe(82.5);
          expect(listing.listing.pricePerSquareMeter).toBe(951515);
          expect(listing.listing.place.id).toBe(
            'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
          );
          expect(detail.property.summary.place.id).toBe(listing.listing.place.id);
          expect(detail.property.summary.breadcrumbs.map((crumb) => crumb.kind)).toStrictEqual([
            'country',
            'state',
            'city',
            'zone',
            'neighborhood',
            'street-block',
          ]);
          expect(
            (await get(`places/${listing.listing.place.id}`, parsePlaceResponse)).place.breadcrumbs,
          ).toStrictEqual(detail.property.summary.breadcrumbs);
          expect(listing.listing.provenance).toStrictEqual({
            ...original.payload.source,
            ...original.payload.run,
            ...original.payload.snapshot,
          });
          expect(detail.metadata.asOf).toBe(original.payload.source.observedAt);
          expect(detail.property.priceChanges).toStrictEqual([]);
          expect(detail.property.summary.neighborhoodComparison).toBe(null);
          expect(detail.property.preparedEvidence.productionMatchScore).toBe(null);
          const baseline = { properties: 1, listings: 1, facts: 1, inbox: 1, creations: 1 };
          await stable(baseline);
          await expect(
            connection.query('UPDATE properties.incoming_fact SET event=event WHERE event_id=$1', [
              original.eventId,
            ]),
          ).rejects.toThrow(/immutable/);
          await connection.query(
            "DELETE FROM platform.outbox WHERE event_id=$1 AND event_type='collection.snapshot.parsed' AND published_at IS NOT NULL",
            [original.eventId],
          );
          await Promise.all(Array.from({ length: 8 }, () => publisher.publish(original, signal())));
          await stable(baseline);
          await connection.query(
            'DELETE FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2',
            [queue, original.eventId],
          );
          await Promise.all(Array.from({ length: 4 }, () => publisher.publish(original, signal())));
          await waitFor('semantic replay inbox marker', async () => (await counts())!.inbox! === 1);
          await stable(baseline);
          await compose('restart', 'worker', 'api');
          await compose('up', '--detach', '--wait', 'worker', 'api');
          await publisher.publish(original, signal());
          await stable(baseline);
          expect(
            await get(`properties/${identity!.property_id}`, parsePropertyResponse),
          ).toStrictEqual(detail);
          const later = await collector().execute('synthetic-data', 'ingest-later', null, signal());
          await waitFor('pending later observation', async () => (await counts())!.facts! === 2);
          expect(
            (
              await connection.query<{ disposition: string }>(
                'SELECT disposition FROM properties.fact_disposition WHERE event_id=$1',
                [later.parsedEventId],
              )
            )[0]!.disposition,
          ).toBe('pending-history');
          await waitFor(
            'completed unchanged acquisition',
            async () =>
              (
                await get(`properties/${identity!.property_id}`, parsePropertyResponse)
              ).property!.listings.find((member) => member.id === identity!.listing_id)!
                .collectionCount === 2,
          );
          detail = await get(`properties/${identity!.property_id}`, parsePropertyResponse);
          expect(
            detail.property.listings
              .find((member) => member.id === identity!.listing_id)!
              .history.map((item) => item.type),
          ).toStrictEqual(['created']);
          const laterBaseline = { ...baseline, facts: 2, inbox: 2 };
          await stable(laterBaseline);
          // Exact canonical mutations and refused source authority fail before dedup/effects.
          for (const changed of [
            { ...original, occurredAt: '2026-10-10T12:01:00.000Z' },
            {
              ...original,
              payload: {
                ...original.payload,
                listing: { ...original.payload.listing, askingPriceMinorUnits: 1 },
              },
            },
            {
              ...original,
              payload: {
                ...original.payload,
                source: {
                  ...original.payload.source,
                  sourceUrl: 'https://synthetic.invalid/forged',
                },
              },
            },
            { ...original, extra: true },
            {
              ...original,
              version: 3,
            },
          ]) {
            await rejected(publisher, changed);
            await stable(laterBaseline);
          }
          await connection.query(
            "UPDATE collection.source_register SET enabled=false, enabled_at=NULL, collection_allowed=false WHERE source_id='synthetic-data'",
          );
          await rejected(publisher, original);
          await stable(laterBaseline);
          await connection.query(
            "UPDATE collection.source_register SET collection_allowed=true, enabled=true, enabled_at='2026-10-10T00:00:00Z' WHERE source_id='synthetic-data'",
          );
          await rejected(publisher, {
            ...original,
            payload: {
              ...original.payload,
              source: { ...original.payload.source, sourceId: 'olx' },
            },
          });
          await stable(laterBaseline);
          await connection.query(
            "UPDATE collection.source_register SET enabled=false, enabled_at=NULL, hold_reason='access-denied', held_at=now() WHERE source_id='synthetic-data'",
          );
          await rejected(publisher, original);
          await stable(laterBaseline);
          await connection.query(
            "UPDATE collection.source_register SET hold_reason=NULL, held_at=NULL, enabled=true, enabled_at='2026-10-10T00:00:00Z' WHERE source_id='synthetic-data'",
          );
          console.log(
            'Canonical mutation, denied/real/held authority and immutable replay verified.',
          );
          const unknown = await collector(
            customSource('SYN-UNKNOWN', {
              city: 'S\u00E3o Paulo',
              stateCode: 'SP',
              neighborhood: 'Unknown',
              street: 'Unknown',
            }),
          ).execute('synthetic-data', 'ingest-unknown-address', null, signal());
          deadLetters++;
          await waitFor(
            'unknown address to dead-letter',
            async () =>
              ((await queueState(`${queue}.dead-letter`))?.messages_ready ?? 0) >= deadLetters,
          );
          await stable(laterBaseline);
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.incoming_fact WHERE event_id=$1',
                [unknown.parsedEventId],
              )
            )[0]!.count,
          ).toBe(0);
          // Delay only the original test event's publication, then let the production reparse outbox run first.
          await compose('stop', 'worker');
          const second = await collector(customSource('SYN-SP-0002')).execute(
            'synthetic-data',
            'ingest-correction-first',
            null,
            signal(),
          );
          const secondWire = await evidence(second.parsedEventId);
          await connection.query(
            'UPDATE platform.outbox SET published_at=clock_timestamp() WHERE event_id=$1',
            [second.parsedEventId],
          );
          await compose(
            'run',
            '--rm',
            'snapshot-reparse-command',
            second.snapshotId,
            'parser-v2',
            'ingest-correction',
          );
          const corrected = (
            await connection.query<{
              event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
            }>(
              'SELECT event FROM collection.parsed_event_evidence WHERE snapshot_id=$1 AND event_version=2',
              [second.snapshotId],
            )
          )[0]!.event;
          expect(parseCollectionEvent(corrected).version).toBe(2);
          console.log('Production reparse published canonical v2 evidence before the delayed v1.');
          await compose('up', '--detach', '--wait', 'worker');
          await waitFor(
            'completion recovers unpublished original and applies correction',
            async () => {
              const current = await counts();
              return current!.properties === 2 && current!.facts === 4 && current!.inbox === 3;
            },
          );
          await stable({ properties: 2, listings: 2, facts: 4, inbox: 3, creations: 2 });
          expect(
            (
              await connection.query<{ disposition: string }>(
                'SELECT disposition FROM properties.fact_disposition WHERE event_id=$1',
                [corrected.eventId],
              )
            )[0]!.disposition,
          ).toBe('pending-correction');
          await publisher.publish(secondWire, signal());
          await waitFor(
            'later original v1 receipt without duplicate creation',
            async () => (await counts())!.inbox! === 4,
          );
          await stable({ properties: 2, listings: 2, facts: 4, inbox: 4, creations: 2 });
          const secondIdentity = (
            await connection.query<{ property_id: string; listing_id: string }>(
              'SELECT property_id::text, listing_id::text FROM properties.listing WHERE source_listing_id=$1',
              ['SYN-SP-0002'],
            )
          )[0];
          const secondDetail = await get(
            `properties/${secondIdentity!.property_id}`,
            parsePropertyResponse,
          );
          expect(secondDetail.metadata.asOf).toBe(secondWire.payload.source.observedAt);
          expect(
            secondDetail.property.listings.find(
              (member) => member.id === secondIdentity!.listing_id,
            )!.collectionCount,
          ).toBe(1);
          expect(secondDetail.property.priceChanges).toStrictEqual([]);
          const creations = await connection.query<{
            occurred_at: Date;
            payload: PropertiesEvent<'properties.listing.created'>['payload'];
          }>(
            "SELECT occurred_at, payload FROM platform.outbox WHERE event_type='properties.listing.created'",
          );
          expect(
            creations.every(
              (row) =>
                row.occurred_at.toISOString() === original.payload.source.observedAt &&
                row.payload.revision === 1,
            ),
          ).toBeTruthy();
          await connection.query(
            "UPDATE collection.source_register SET listing_text_display_allowed=false WHERE source_id='synthetic-data'",
          );
          for (const [path, parser] of [
            [`properties/${identity!.property_id}`, parsePropertyResponse],
            [`listings/${identity!.listing_id}`, parseListingResponse],
          ] as const) {
            const response = await get(path!, parser);
            expect(
              !/Bright synthetic|"current"|"versions"|"text"|excerpt/.test(
                JSON.stringify(response),
              ),
            ).toBeTruthy();
            expect(
              JSON.stringify(response).includes(original.payload.snapshot.contentHash),
            ).toBeTruthy();
          }
          const prepared = await get('properties', parseSearchResponse);
          expect(prepared.totalItems).toBe(5);
          expect(!prepared.items.some((item) => item.id === identity!.property_id)).toBeTruthy();
          expect(
            !/unitNumber|contactName|phone|email|photo|imageFingerprint/.test(
              JSON.stringify(detail),
            ),
          ).toBeTruthy();
          await connection.query(
            "UPDATE collection.source_register SET listing_text_display_allowed=true WHERE source_id='synthetic-data'",
          );
          // Recreate an authentic pre-3.3 initial observation using the historical resolver.
          // Production replay must keep its immutable five-crumb location, not migrate it.
          await compose('stop', 'worker');
          const historical = await collector(customSource('SYN-HISTORICAL')).execute(
            'synthetic-data',
            'ingest-historical-place',
            null,
            signal(),
          );
          const historicalWire = await evidence(historical.parsedEventId);
          // Seed only the authentic previous SQL shape, not an alternate ingestion algorithm.
          await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
            const repository = new PostgresPropertyRepository(connection);
            const ids = new PostgresUuidV7Generator(connection);
            const property = new Property(
              await ids.generate(tx),
              await ids.generate(tx),
              historicalWire,
              (await new SyntheticLocationsAdapter().resolveFixtureAddress(
                historicalWire.payload.listing.location,
              ))!,
            );
            await repository.appendFact(
              tx,
              parseCollectionSnapshotParsed(historicalWire),
              'initial',
            );
            await repository.create(tx, property);
            await new PostgresInbox(connection).record(tx, queue, historicalWire.eventId);
            const created = property.creationEvent(await ids.generate(tx));
            const payload: unknown = JSON.parse(JSON.stringify(created.payload));
            if (!isSerializableEventPayload(payload))
              throw new TypeError('Invalid listing event payload.');
            await new PostgresOutbox(connection).append(tx, [{ ...created, payload }]);
          }, signal());
          const historicalIdentity = (
            await connection.query<{ property_id: string; listing_id: string }>(
              "SELECT property_id::text, listing_id::text FROM properties.listing WHERE source_listing_id='SYN-HISTORICAL'",
            )
          )[0];
          const historicalDetail = await get(
            `properties/${historicalIdentity!.property_id}`,
            parsePropertyResponse,
          );
          expect(historicalDetail.property.summary.place.id).toBe('sao-paulo-bela-vista');
          expect(historicalDetail.property.summary.breadcrumbs.length).toBe(5);
          const historicalBaseline = await counts();
          await compose('restart', 'api');
          await compose('up', '--detach', '--wait', 'api', 'worker');
          await drained();
          await publisher.publish(historicalWire, signal());
          await drained();
          await stable(historicalBaseline);
          const upgradedHistorical = await get(
            `properties/${historicalIdentity!.property_id}`,
            parsePropertyResponse,
          );
          expect(upgradedHistorical.property.summary.place).toStrictEqual(
            historicalDetail.property.summary.place,
          );
          expect(upgradedHistorical.property.summary.breadcrumbs).toStrictEqual(
            historicalDetail.property.summary.breadcrumbs,
          );
          const upgradedHistoricalMember = upgradedHistorical.property.listings.find(
            (member) => member.id === historicalIdentity!.listing_id,
          )!;
          expect(upgradedHistoricalMember.collectionCount).toBe(1);
          expect(upgradedHistoricalMember.history.map((item) => item.type)).toStrictEqual([
            'created',
          ]);
          const historicalListing = await get(
            `listings/${historicalIdentity!.listing_id}`,
            parseListingResponse,
          );
          expect(historicalListing.listing.place).toStrictEqual(
            historicalDetail.property.summary.place,
          );
          expect(
            (await get(`places/${historicalListing.listing.place.id}`, parsePlaceResponse)).place
              .breadcrumbs.length,
          ).toBe(5);
          expect(historicalListing.listing.provenance.contentHash).toBe(
            historicalWire.payload.snapshot.contentHash,
          );
          // This separately labelled local fixture is synthetic. Source-shaped contact/photo fields
          // exist in memory only; the adapter uses the shared sanitizer before returning any bytes.
          const realShapedId = 'SYN-REAL-SHAPED-LOCAL';
          const realShapedDocument = {
            sourceId: 'synthetic-data',
            sourceListingId: realShapedId,
            sourceUrl: `https://synthetic.invalid/listings/${realShapedId}?email=fixture@example.invalid#contact`,
            observedAt: '2026-10-10T10:30:00.000Z',
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(
              JSON.stringify({
                ...parseCollectedListing(
                  JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
                ),
                bedrooms: 0,
                bathrooms: 0,
                parkingSpaces: 0,
                features: [' Pool ', 'POOL', 'Cafe\u0301', 'CAF\u00C9', ' Unknown\t amenity '],
                location: {
                  city: 'S\u00E3o Paulo',
                  stateCode: 'SP',
                  neighborhood: 'Bela Vista',
                  street: 'Avenida Exemplo',
                  unitNumber: '42',
                  complement: 'Private unit',
                },
                advertiser: {
                  type: 'agency',
                  agencyName: 'Owned Synthetic Realty',
                  contactName: 'Fixture Person Alpha',
                  individualCreci: 'CRECI 12345-F',
                },
                contact: {
                  name: 'Fixture Person Alpha',
                  phone: '(11) 99999-1111',
                  email: 'fixture@example.invalid',
                  cpf: '123.456.789-01',
                },
                photos: ['https://fixture.invalid/person-photo.jpg'],
                photograph: 'in-memory-photo-marker',
                maskedDescription:
                  'Local real-shaped synthetic fixture. Fixture Person Alpha; (11) 99999-1111; fixture@example.invalid; 123.456.789-01; https://fixture.invalid/contact; CRECI 12345-F.',
                imageFingerprints: [`sha256:${'b'.repeat(64)}`],
              }),
            ),
          };
          const sanitizer = new CanonicalSnapshotSanitizer();
          const sanitizedFixture = sanitizer.sanitize(realShapedDocument).document;
          const sanitizedText = new TextDecoder().decode(sanitizedFixture.bytes);
          const canonicalFixture = parseCollectedListing(JSON.parse(sanitizedText));
          const forbidden =
            /Fixture Person Alpha|99999-1111|fixture@example|123\.456\.789-01|12345-F|unitNumber|complement|contactName|individualCreci|"contact"|"phone"|"email"|"cpf"|"photos"|"photograph"|person-photo|in-memory-photo/;
          expect(!forbidden.test(sanitizedText)).toBeTruthy();
          expect(sanitizedFixture.sourceUrl).toBe(
            `https://synthetic.invalid/listings/${realShapedId}`,
          );
          expect(canonicalFixture.maskedDescription.match(/\[REDACTED\]/g)!.length).toBe(6);
          expect(Object.keys(canonicalFixture).sort()).toStrictEqual(
            Object.keys(original.payload.listing).sort(),
          );
          expect(Object.keys(canonicalFixture.location).sort()).toStrictEqual([
            'city',
            'neighborhood',
            'stateCode',
            'street',
          ]);
          expect(Object.keys(canonicalFixture.advertiser).sort()).toStrictEqual([
            'agencyName',
            'type',
          ]);
          expect(() =>
            sanitizer.sanitize({
              ...realShapedDocument,
              sourceUrl: 'https://fixture.invalid/contact/fixture@example.invalid',
            }),
          ).toThrow();
          expect(() =>
            sanitizer.sanitize({ ...realShapedDocument, bytes: new TextEncoder().encode('{}') }),
          ).toThrow();
          const localRealShapedSource = {
            fetchPage: async (_sourceId: string, cursor: string | null) => ({
              documents: cursor === null ? [sanitizer.sanitize(realShapedDocument).document] : [],
              nextCursor: null,
              exhausted: true,
            }),
            parse: (document: RawListingDocument, cancellation: AbortSignal) =>
              productionSource.parse(document, cancellation),
          };
          const realShaped = await collector(localRealShapedSource!).execute(
            'synthetic-data',
            'ingest-real-shaped-local',
            null,
            signal(),
          );
          await waitFor(
            'local real-shaped normalized listing',
            async () => (await counts())!.properties! === historicalBaseline!.properties + 1,
          );
          const realShapedBaseline = {
            properties: historicalBaseline!.properties + 1,
            listings: historicalBaseline!.listings + 1,
            facts: historicalBaseline!.facts + 1,
            inbox: historicalBaseline!.inbox + 1,
            creations: historicalBaseline!.creations + 1,
          };
          await stable(realShapedBaseline);
          const realShapedWire = await evidence(realShaped.parsedEventId);
          const originalEvidence = JSON.stringify(realShapedWire);
          expect(realShapedWire.payload.listing).toStrictEqual(canonicalFixture);
          expect(Buffer.from(await store.read(realShaped.objectKey, signal())).toString()).toBe(
            sanitizedText,
          );
          const realShapedRow = (
            await connection.query<{
              property_id: string;
              listing_id: string;
              asking_price_minor_units: string;
              currency: string;
              area_square_meters: string;
              resolved_place: ResolvedPropertyPlace;
              event: CollectionSnapshotParsed;
            }>(
              `SELECT listing.property_id::text, listing.listing_id::text, listing.asking_price_minor_units::text,
      listing.currency, listing.area_square_meters::text, property.resolved_place, fact.event
      FROM properties.listing AS listing JOIN properties.property AS property ON property.property_id=listing.property_id
      JOIN properties.incoming_fact AS fact ON fact.event_id=property.initial_event_id WHERE listing.source_listing_id=$1`,
              [realShapedId],
            )
          )[0];
          expect(realShapedRow!.event).toStrictEqual(realShapedWire);
          expect(realShapedRow!.asking_price_minor_units).toBe('78500000');
          expect(realShapedRow!.currency).toBe('BRL');
          expect(Number(realShapedRow!.area_square_meters)).toBe(82.5);
          const model = new Property(
            realShapedRow!.property_id,
            realShapedRow!.listing_id,
            realShapedRow!.event,
            realShapedRow!.resolved_place,
          ).normalized;
          for (const value of [
            model.propertyType,
            model.askingPriceMinorUnits,
            model.currency,
            model.areaSquareMeters,
            model.bedrooms,
            model.bathrooms,
            model.parkingSpaces,
            ...model.features,
            ...Object.values(model.location),
            model.listedAt,
            ...Object.values(model.advertiser),
            model.maskedDescription,
            ...model.imageFingerprints,
            model.sourceId,
            model.sourceListingId,
            model.sourceUrl,
            model.observedAt,
          ]) {
            expect(value.source).toBe(realShapedWire.payload.source.sourceId);
            expect(value.sourceUrl).toBe(sanitizedFixture.sourceUrl);
            expect(value.collectedAt).toBe(sanitizedFixture.observedAt);
          }
          const realShapedDetail = await get(
            `properties/${realShapedRow!.property_id}`,
            parsePropertyResponse,
          );
          const realShapedListing = (
            await get(`listings/${realShapedRow!.listing_id}`, parseListingResponse)
          ).listing;
          expect(realShapedListing).toStrictEqual(
            realShapedDetail.property.listings.find(
              (member) => member.id === realShapedRow!.listing_id,
            ),
          );
          expect(realShapedListing.features).toStrictEqual([
            'pool',
            'caf\u00E9',
            'unknown amenity',
          ]);
          expect(
            realShapedDetail.property.featureAgreement.map((row) => row.feature),
          ).toStrictEqual(['caf\u00E9', 'pool', 'unknown amenity']);
          for (const agreement of realShapedDetail.property.featureAgreement) {
            expect(agreement).toMatchObject({
              reportingCount: 1,
              reportingPercent: 100,
              listingIds: [realShapedRow!.listing_id],
              sourceIds: ['synthetic-data'],
            });
          }
          expect([
            realShapedListing.bedrooms,
            realShapedListing.bathrooms,
            realShapedListing.parkingSpaces,
          ]).toStrictEqual([0, 0, 0]);
          expect(realShapedListing.propertyType).toBe(model.propertyType.value);
          expect(realShapedListing.askingPriceMinorUnits).toBe(model.askingPriceMinorUnits.value);
          expect(realShapedListing.areaSquareMeters).toBe(model.areaSquareMeters.value);
          expect(realShapedListing.street).toBe(model.location.street.value);
          expect(realShapedListing.publishedNeighborhood).toBe(model.location.neighborhood.value);
          expect(
            (
              realShapedListing.description as Extract<
                ListingDescription,
                { permission: 'allowed' }
              >
            ).current,
          ).toBe(canonicalFixture.maskedDescription);
          expect(realShapedListing.fieldEffectiveAt).toStrictEqual({
            askingPrice: sanitizedFixture.observedAt,
            description: sanitizedFixture.observedAt,
            attributes: sanitizedFixture.observedAt,
          });
          expect(realShapedListing.provenance).toStrictEqual(model.provenance);
          expect(realShapedWire.occurredAt).not.toBe(realShapedListing.provenance.observedAt);
          const downstream = await connection.query<{
            event_type: string;
            payload: PropertiesEvent<'properties.listing.created'>['payload'];
          }>(
            'SELECT event_type, payload FROM platform.outbox WHERE event_id=$1 OR (event_type=$2 AND aggregate_id=$3)',
            [realShaped.parsedEventId, 'properties.listing.created', realShapedRow!.listing_id],
          );
          expect(
            downstream.filter((row) => row.event_type === 'properties.listing.created').length,
          ).toBe(1);
          expect(
            !forbidden.test(
              JSON.stringify([
                realShapedRow,
                realShapedWire,
                downstream,
                realShapedDetail,
                realShapedListing,
              ]),
            ),
          ).toBeTruthy();
          expect(!/imageFingerprint/.test(JSON.stringify(realShapedDetail))).toBeTruthy();
          for (const listingChange of [
            {
              contactName: 'Forbidden Person',
            },
            { photos: [] },
            { maskedDescription: 'Contact fixture@example.invalid' },
          ]) {
            await rejected(publisher, {
              ...realShapedWire,
              payload: {
                ...realShapedWire.payload,
                listing: { ...realShapedWire.payload.listing, ...listingChange },
              },
            });
            await stable(realShapedBaseline);
          }
          await connection.query(
            'DELETE FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2',
            [queue, realShapedWire.eventId],
          );
          await compose('restart', 'worker', 'api');
          await compose('up', '--detach', '--wait', 'worker', 'api');
          await Promise.all(
            Array.from({ length: 4 }, () => publisher.publish(realShapedWire, signal())),
          );
          await waitFor(
            'local fixture inbox after restart and expiry',
            async () => (await counts())!.inbox! === realShapedBaseline.inbox,
          );
          await stable(realShapedBaseline);
          expect(
            await get(`properties/${realShapedRow!.property_id}`, parsePropertyResponse),
          ).toStrictEqual(realShapedDetail);
          expect(
            (await get(`listings/${realShapedRow!.listing_id}`, parseListingResponse)).listing,
          ).toStrictEqual(realShapedListing);
          expect(JSON.stringify(await evidence(realShapedWire.eventId))).toBe(originalEvidence);
          expect(
            (await new PostgresPropertyRepository(connection).getListing(
              realShapedRow!.listing_id,
            ))!.normalized!,
          ).toStrictEqual(model);
          await connection.query(
            "UPDATE collection.source_register SET listing_text_display_allowed=false WHERE source_id='synthetic-data'",
          );
          for (const [path, parser] of [
            [`properties/${realShapedRow!.property_id}`, parsePropertyResponse],
            [`listings/${realShapedRow!.listing_id}`, parseListingResponse],
          ] as const) {
            const denied = await get(path!, parser);
            expect(
              !/Local real-shaped|"current"|"versions"|"text"|excerpt/.test(JSON.stringify(denied)),
            ).toBeTruthy();
            const listing =
              'listing' in denied
                ? denied.listing
                : denied.property.listings.find(
                    (member) => member.id === realShapedRow!.listing_id,
                  )!;
            expect(listing.provenance).toStrictEqual(model.provenance);
            expect(listing.fieldEffectiveAt).toStrictEqual(realShapedListing.fieldEffectiveAt);
          }
          await connection.query(
            "UPDATE collection.source_register SET listing_text_display_allowed=true WHERE source_id='synthetic-data'",
          );
          console.log(
            'Properties ingestion passed: production collection/evidence/broker/worker/HTTP, local real-shaped synthetic allowlist/masking/normalization and per-value provenance, six-crumb block resolution, historical five-crumb replay/restart compatibility, rollback/retry, concurrency/inbox expiry/restart, immutable originals and corrected current values, authority/mutation/address rejection, current rights and prepared isolation.',
          );
        } catch (error) {
          await compose('logs', '--no-color', '--tail', '100', 'worker', 'api', 'migrations')
            .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
            .catch(() => undefined);
          throw error;
        }
      } catch (error) {
        cleanupPrimary2 = error;
        cleanupPrimaryThrown2 = true;
        throw error;
      } finally {
        await preserveCleanup(
          async () => {
            if (cleanupPrimaryThrown2) throw cleanupPrimary2;
          },
          async () => {
            await cleanupAll(
              async () => {
                await publisher?.close();
              },
              async () => {
                store?.destroy();
              },
              async () => {
                await connection?.close();
              },
              async () => {
                await compose('down', '--volumes', '--remove-orphans');
              },
              async () => {
                const remaining = await run('docker', [
                  'ps',
                  '--all',
                  '--filter',
                  `label=com.docker.compose.project=${project}`,
                  '--format',
                  '{{.ID}}',
                ]);
                expect(
                  remaining.stdout.trim(),
                  'The exact campaign project retained a container.',
                ).toBe('');
              },
              async () => {
                const volumes = await run('docker', [
                  'volume',
                  'ls',
                  '--filter',
                  `label=com.docker.compose.project=${project}`,
                  '--format',
                  '{{.Name}}',
                ]);
                expect(volumes.stdout.trim(), 'The exact campaign project retained a volume.').toBe(
                  '',
                );
              },
              async () => {
                console.log(`Cleaned exact campaign project ${project}.`);
              },
            );
          },
        );
      }
    }
  });
});
