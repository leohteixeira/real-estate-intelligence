import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { CollectSourceOnce, ReparseSnapshot } from '../packages/application/dist/index.js';
import type { ListingDescription } from '../packages/contracts/dist/index.js';
import {
  parseListingResponse,
  parsePropertyResponse,
  parseReductionsResponse,
} from '../packages/contracts/dist/index.js';
import type {
  CollectionSnapshotCorrected,
  ListingChronologyState,
  PropertiesEvent,
} from '../packages/domain/dist/index.js';
import {
  CollectionSnapshotParsed,
  isSerializableEventPayload,
  parseCollectedListing,
  parseCollectionSnapshotParsed,
  Property,
} from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionFacade,
  PostgresCollectionRunRepository,
  PostgresLocationsFacade,
  PostgresOutbox,
  PostgresPropertyReductionsRepository,
  PostgresPropertyRepository,
  PostgresSnapshotLifecycle,
  PostgresSnapshotReparseRepository,
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
test('properties-history-upgrade preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-properties-history-upgrade-${process.pid}-${randomUUID().slice(0, 8)}`;
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
    let connection: DatabaseConnection, store: S3RawSnapshotStore, publisher: RabbitMqEventBroker;
    {
      let cleanupPrimary2: unknown;
      let cleanupPrimaryThrown2 = false;
      try {
        try {
          console.log(`Starting genuine baseline upgrade campaign ${project}.`);
          await compose('up', '--detach', '--wait', 'postgres', 'rabbitmq', 'minio');
          connection = new DatabaseConnection(databaseUrl.toString());
          const applySql = async (file: string) => {
            const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
            const client = await connection.leaseClient();
            {
              let cleanupPrimary1: unknown;
              let cleanupPrimaryThrown1 = false;
              try {
                try {
                  await client.query('BEGIN');
                  await client.query(sql);
                  await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
                    file.replace(/\.sql$/, ''),
                  ]);
                  await client.query('COMMIT');
                } catch (error) {
                  await client.query('ROLLBACK');
                  throw error;
                }
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
                      client.release();
                    });
                  },
                );
              }
            }
          };
          await connection.query(
            'CREATE TABLE schema_migrations (version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
          );
          const migrations = (await readdir(new URL('../migrations/', import.meta.url)))
            .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
            .sort();
          const upgrades = [
            '1002_properties_create_listing_history.sql',
            '1004_properties_create_entity_resolution.sql',
            '4009_collection_create_completed_event_evidence.sql',
            '4010_collection_add_failed_one_shot_runs.sql',
          ];
          for (const file of migrations.filter((file) => !upgrades.includes(file)))
            await applySql(file);
          expect(
            (
              await connection.query<{ relation: string }>(
                "SELECT to_regclass('properties.listing_current') AS relation",
              )
            )[0]!.relation,
          ).toBe(null);
          expect(
            (
              await connection.query<{ relation: string }>(
                "SELECT to_regclass('collection.completed_event_evidence') AS relation",
              )
            )[0]!.relation,
          ).toBe(null);
          let instant = '2028-01-01T12:00:00.000Z';
          const clock = { now: () => instant };
          store = new S3RawSnapshotStore({
            endpoint: `http://127.0.0.1:${minio}`,
            region: 'us-east-1',
            bucket: fixture.bucket,
            accessKeyId: fixture.user,
            secretAccessKey: fixture.password,
            lifecycle: new PostgresSnapshotLifecycle(connection),
            clock,
          });
          const parser = new SyntheticListingSource();
          const transactions = new PostgresTransactionRunner(connection);
          const identifiers = new PostgresUuidV7Generator(connection);
          const outbox = new PostgresOutbox(connection);
          const sources = new PostgresSourceRegisterRepository(connection);
          const collection = new PostgresCollectionFacade(connection, sources);
          const properties = new PostgresPropertyRepository(connection);
          const first = parseCollectedListing(
            JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
          );
          const listingId = 'OWNED-PRE-UPGRADE';
          const originals: CollectionSnapshotParsed[] = [];
          let property: Property | Property;
          let retainedCreation;
          let earlierOriginal: CollectionSnapshotParsed;
          for (const [day, listing] of [
            [
              0,
              {
                ...first,
                askingPriceMinorUnits: first.askingPriceMinorUnits + 100000,
                maskedDescription: 'Owned earlier-than-creation text.',
              },
            ],
            [1, first],
            [2, { ...first, askingPriceMinorUnits: first.askingPriceMinorUnits - 100000 }],
            [
              3,
              {
                ...first,
                askingPriceMinorUnits: first.askingPriceMinorUnits - 100000,
                maskedDescription: 'Owned genuine pre-upgrade changed description.',
              },
            ],
          ] as const) {
            instant = day === 0 ? '2027-12-31T12:00:00.000Z' : `2028-01-0${day}T12:00:00.000Z`;
            const document = {
              sourceId: 'synthetic-data',
              sourceListingId: listingId,
              sourceUrl: 'https://synthetic.invalid/listings/owned-pre-upgrade',
              observedAt: instant,
              mediaType: 'application/json' as const,
              bytes: new TextEncoder().encode(JSON.stringify(listing)),
            };
            const runs = new PostgresCollectionRunRepository(connection);
            // The baseline producer has parsed-publication evidence but no completed-publication table.
            runs.appendCompletedEvidence = async () => {};
            const produced = await new CollectSourceOnce(
              {
                fetchPage: async () => ({
                  documents: [document],
                  nextCursor: null,
                  exhausted: true,
                }),
                parse: (input, cancellation: AbortSignal) => parser.parse(input, cancellation),
              },
              store,
              sources,
              runs,
              transactions,
              identifiers,
              clock,
              outbox,
            ).execute('synthetic-data', `owned-pre-upgrade-${day}`, null, signal());
            const original = parseCollectionSnapshotParsed(
              (
                await connection.query<{
                  event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
                }>('SELECT event FROM collection.parsed_event_evidence WHERE event_id=$1', [
                  produced.parsedEventId,
                ])
              )[0]!.event,
            );
            // Produce the earlier run at its authentic earlier time, but delay its Properties
            // receipt until after legacy creation from the later observation. Admission never
            // requires a regressing clock or rewritten start to model reordered delivery.
            if (day === 0) {
              earlierOriginal = original;
              continue;
            }
            originals.push(original);
            await transactions.runInTransaction(async (tx) => {
              expect(await collection.verifyParsedEvent(tx, original)).toBeTruthy();
              await properties.lockSourceIdentity(tx, 'synthetic-data', listingId);
              await properties.appendFact(tx, original, day === 1 ? 'initial' : 'pending-history');
              if (day === 1) {
                const place = await new PostgresLocationsFacade(connection).resolveFixtureAddress(
                  original.payload.listing.location,
                  tx,
                );
                expect(place).toBeTruthy();
                property = new Property(
                  await identifiers.generate(tx),
                  await identifiers.generate(tx),
                  original,
                  place!,
                );
                await properties.create(tx, property);
                retainedCreation = property.creationEvent(await identifiers.generate(tx));
                const payload: unknown = JSON.parse(JSON.stringify(retainedCreation.payload));
                if (!isSerializableEventPayload(payload))
                  throw new TypeError('Invalid listing event payload.');
                await outbox.append(tx, [{ ...retainedCreation, payload }]);
              }
            }, signal());
          }
          originals.push(earlierOriginal!);
          await transactions.runInTransaction(async (tx) => {
            expect(await collection.verifyParsedEvent(tx, earlierOriginal!)).toBeTruthy();
            await properties.lockSourceIdentity(tx, 'synthetic-data', listingId);
            await properties.appendFact(tx, earlierOriginal, 'pending-history');
          }, signal());
          // A second genuine baseline identity has expired its published creation envelope.
          // Recovery may rebuild read state, but cannot manufacture an event identifier or envelope.
          instant = '2028-01-01T13:00:00.000Z';
          const missingSource = 'synthetic-portal-aurora';
          const missingIdentity = 'OWNED-EXPIRED-CREATION';
          const missingDocument = {
            sourceId: missingSource,
            sourceListingId: missingIdentity,
            sourceUrl: 'https://synthetic.invalid/listings/owned-expired-creation',
            observedAt: instant,
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(JSON.stringify(first)),
          };
          const missingRuns = new PostgresCollectionRunRepository(connection);
          missingRuns.appendCompletedEvidence = async () => {};
          const missingProduced = await new CollectSourceOnce(
            {
              fetchPage: async () => ({
                documents: [missingDocument],
                nextCursor: null,
                exhausted: true,
              }),
              parse: (input, cancellation: AbortSignal) => parser.parse(input, cancellation),
            },
            store,
            sources,
            missingRuns,
            transactions,
            identifiers,
            clock,
            outbox,
          ).execute(missingSource, 'owned-expired-creation', null, signal());
          const missingOriginal = parseCollectionSnapshotParsed(
            (
              await connection.query<{
                event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
              }>('SELECT event FROM collection.parsed_event_evidence WHERE event_id=$1', [
                missingProduced.parsedEventId,
              ])
            )[0]!.event,
          );
          let missingProperty: Property | Property;
          await transactions.runInTransaction(async (tx) => {
            await properties.lockSourceIdentity(tx, missingSource, missingIdentity);
            await properties.appendFact(tx, missingOriginal, 'initial');
            const place = await new PostgresLocationsFacade(connection).resolveFixtureAddress(
              missingOriginal.payload.listing.location,
              tx,
            );
            missingProperty = new Property(
              await identifiers.generate(tx),
              await identifiers.generate(tx),
              missingOriginal,
              place!,
            );
            await properties.create(tx, missingProperty);
            const event = missingProperty.creationEvent(await identifiers.generate(tx));
            const payload: unknown = JSON.parse(JSON.stringify(event.payload));
            if (!isSerializableEventPayload(payload))
              throw new TypeError('Invalid listing event payload.');
            await outbox.append(tx, [{ ...event, payload }]);
          }, signal());
          await connection.query(
            "DELETE FROM platform.outbox WHERE aggregate_id=$1 AND event_type='properties.listing.created'",
            [missingProperty!.listingId],
          );
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.incoming_fact',
              )
            )[0]!.count,
          ).toBe(5);
          const initialBytes = JSON.stringify(
            await connection.query<{ event: unknown }>(
              'SELECT event FROM properties.incoming_fact ORDER BY event_id',
            ),
          );
          const creationBytes = JSON.stringify(
            await connection.query<{
              event_id: string;
              payload: PropertiesEvent<'properties.listing.created'>['payload'];
            }>(
              "SELECT event_id::text,payload FROM platform.outbox WHERE event_type='properties.listing.created'",
            ),
          );

          for (const file of upgrades) await applySql(file);
          const initialCandidates = await new PostgresPropertyReductionsRepository(
            connection,
          ).readCandidates(
            (await new PostgresLocationsFacade(connection).registeredScopeIds('sao-paulo'))!,
          );
          expect(initialCandidates.length).toBe(2);
          expect(
            initialCandidates.every((candidate) => candidate.priceChanges.length === 0),
          ).toBeTruthy();
          expect(
            initialCandidates.every((candidate) => candidate.asOf.startsWith('2028-01-01T')),
          ).toBeTruthy();
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM collection.completed_event_evidence',
              )
            )[0]!.count,
          ).toBe(0);
          await compose('up', '--detach', '--build', '--wait', 'migrations', 'worker', 'api');
          await waitFor(
            'pending genuine legacy acquisitions without a new run',
            async () =>
              (await get(`listings/${property.listingId}`, parseListingResponse)).listing
                .collectionCount === 4,
          );
          let response = (await get(`listings/${property!.listingId}`, parseListingResponse))
            .listing;
          expect(response.history.map((item) => item.type)).toStrictEqual([
            'created',
            'price-changed',
            'description-changed',
          ]);
          expect(response.status).toBe('active');
          expect(response.askingPriceMinorUnits).toBe(first.askingPriceMinorUnits - 100000);
          const reductions = () =>
            get('places/sao-paulo/largest-reductions', parseReductionsResponse);
          const recoveredRanking = await reductions();
          expect(recoveredRanking.metadata.fixtureVersion).toBe(
            'persisted-synthetic-reductions-v1',
          );
          expect(recoveredRanking.metadata.asOf).toBe('2028-01-03T12:00:00.000Z');
          expect(recoveredRanking.totalItems).toBe(1);
          expect(recoveredRanking!.items[0]!.propertyId).toBe(property!.propertyId);
          expect(recoveredRanking!.items[0]!.listingId).toBe(property!.listingId);
          expect(recoveredRanking!.items[0]!.previousMinorUnits).toBe(first.askingPriceMinorUnits);
          expect(recoveredRanking!.items[0]!.currentMinorUnits).toBe(
            first.askingPriceMinorUnits - 100000,
          );
          expect(recoveredRanking!.items[0]!.effectiveAt).toBe('2028-01-02T12:00:00.000Z');
          expect(recoveredRanking!.items[0]!.provenance).toStrictEqual(
            response!.history.find((item: { type: string }) => item.type === 'price-changed')!
              .provenance,
          );
          expect(
            (await get(`properties/${property!.propertyId}`, parsePropertyResponse)).property!
              .listings[0]!.collectionCount,
          ).toBe(4);
          expect(
            JSON.stringify(
              await connection.query<{ event: unknown }>(
                'SELECT event FROM properties.incoming_fact ORDER BY event_id',
              ),
            ),
          ).toBe(initialBytes);
          expect(
            JSON.stringify(
              await connection.query<{
                event_id: string;
                payload: PropertiesEvent<'properties.listing.created'>['payload'];
              }>(
                "SELECT event_id::text,payload FROM platform.outbox WHERE event_type='properties.listing.created'",
              ),
            ),
          ).toBe(creationBytes);
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type='properties.listing.removed'",
              )
            )[0]!.count,
          ).toBe(0);
          expect(response.firstCollectedAt).toBe('2027-12-31T12:00:00.000Z');
          expect(response!.lifeline[0]!.from).toBe('2027-12-31T12:00:00.000Z');
          const recoveredCreation = (
            await connection.query<{
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>('SELECT event FROM properties.listing_event WHERE listing_id=$1 AND revision=1', [
              property!.listingId,
            ])
          )[0]!.event;
          expect(recoveredCreation).toStrictEqual(JSON.parse(JSON.stringify(retainedCreation)));
          await waitFor(
            'missing retained creation still materializes genuine baseline state',
            async () =>
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM properties.listing_current WHERE listing_id=$1',
                  [missingProperty.listingId],
                )
              )[0]!.count === 1,
          );
          expect(
            (await get(`listings/${missingProperty!.listingId}`, parseListingResponse)).listing
              .collectionCount,
          ).toBe(1);
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.listing_event WHERE listing_id=$1',
                [missingProperty!.listingId],
              )
            )[0]!.count,
          ).toBe(0);
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM platform.outbox WHERE aggregate_id=$1 AND event_type='properties.listing.created'",
                [missingProperty!.listingId],
              )
            )[0]!.count,
          ).toBe(0);
          await waitFor(
            'eligible legacy identity resolves while expired-creation identity remains unresolved',
            async () => {
              const assigned = await connection.query<{ listing_id: string }>(
                'SELECT listing_id::text FROM properties.listing_assignment ORDER BY listing_id',
              );
              return assigned.length === 1 && assigned[0]!.listing_id === property!.listingId;
            },
          );
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type LIKE 'properties.property.%'",
              )
            )[0]!.count,
          ).toBe(0);
          const marketBytes = JSON.stringify(
            await connection.query<{
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>('SELECT event FROM properties.listing_event ORDER BY revision'),
          );
          instant = '2028-01-05T12:00:00.000Z';
          const corrected = await new ReparseSnapshot(
            {
              parse: async (document, cancellation: AbortSignal) => ({
                ...(await parser.parse(document, cancellation)),
                askingPriceMinorUnits: first.askingPriceMinorUnits + 200000,
                maskedDescription: 'Owned corrected earlier-than-creation text.',
              }),
            },
            store,
            new PostgresSnapshotReparseRepository(connection),
            transactions,
            identifiers,
            clock,
            outbox,
          ).execute(
            originals!.at(-1)!.payload.snapshot.snapshotId,
            'owned-upgrade-backfill-correction',
            'backfill-v2',
            null,
            signal(),
          );
          await waitFor('correction of earlier-than-creation acquisition', async () => {
            const rows = await connection.query<{ state: ListingChronologyState }>(
              'SELECT state FROM properties.listing_current WHERE listing_id=$1',
              [property.listingId],
            );
            return rows![0]!.state.acquisitions[0]!.corrected?.eventId === corrected.eventId;
          });
          response = (await get(`listings/${property!.listingId}`, parseListingResponse)).listing;
          expect(response.collectionCount).toBe(4);
          expect(response.askingPriceMinorUnits).toBe(first.askingPriceMinorUnits - 100000);
          expect(
            (response.description as Extract<ListingDescription, { permission: 'allowed' }>)
              .versions[0]!.text,
          ).toBe('Owned corrected earlier-than-creation text.');
          expect(
            await reductions(),
            'Legacy backfill and its correction invent no negative effect or receipt-time asOf.',
          ).toStrictEqual(recoveredRanking);
          expect(
            JSON.stringify(
              await connection.query<{
                event: PropertiesEvent<
                  | 'properties.listing.created'
                  | 'properties.listing.price-changed'
                  | 'properties.listing.description-changed'
                  | 'properties.listing.removed'
                  | 'properties.listing.reappeared'
                >;
              }>('SELECT event FROM properties.listing_event ORDER BY revision'),
            ),
          ).toBe(marketBytes);
          await connection.query(
            "UPDATE collection.source_register SET listing_text_display_allowed=false WHERE source_id='synthetic-data'",
          );
          for (const path of [
            `listings/${property!.listingId}`,
            `properties/${property!.propertyId}`,
          ]) {
            const denied = await get(
              path,
              path.startsWith('listings/') ? parseListingResponse : parsePropertyResponse,
            );
            expect(
              !JSON.stringify(denied).includes('Owned corrected earlier-than-creation text.'),
            ).toBeTruthy();
          }
          await connection.query(
            "UPDATE collection.source_register SET listing_text_display_allowed=true WHERE source_id='synthetic-data'",
          );
          publisher = new RabbitMqEventBroker({
            url: rabbitUrl.toString(),
            operationTimeoutMs: 5000,
          });
          await connection.query(
            "DELETE FROM platform.inbox WHERE consumer_name IN ('properties.parsed-listing','properties.completed-run')",
          );
          for (const event of [...originals].reverse()) await publisher.publish(event, signal());
          await publisher.publish(missingOriginal, signal());
          await compose('restart', 'worker', 'api');
          await compose('up', '--detach', '--wait', 'worker', 'api');
          response = (await get(`listings/${property!.listingId}`, parseListingResponse)).listing;
          expect(response.collectionCount).toBe(4);
          expect(response.status).toBe('active');
          expect(
            await reductions(),
            'Restart/reverse replay preserves original reductions.',
          ).toStrictEqual(recoveredRanking);
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.listing_event WHERE listing_id=$1',
                [missingProperty!.listingId],
              )
            )[0]!.count,
          ).toBe(0);
          instant = '2028-01-04T12:00:00.000Z';
          const fourth = {
            sourceId: 'synthetic-data',
            sourceListingId: listingId,
            sourceUrl: originals![0]!.payload.source.sourceUrl,
            observedAt: instant,
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(
              JSON.stringify({
                ...first,
                askingPriceMinorUnits: first.askingPriceMinorUnits - 200000,
                maskedDescription: 'Owned genuine pre-upgrade changed description.',
              }),
            ),
          };
          await new CollectSourceOnce(
            {
              fetchPage: async () => ({
                documents: [fourth],
                nextCursor: null,
                exhausted: true,
              }),
              parse: (input, cancellation: AbortSignal) => parser.parse(input, cancellation),
            },
            store,
            sources,
            new PostgresCollectionRunRepository(connection),
            transactions,
            identifiers,
            clock,
            outbox,
          ).execute('synthetic-data', 'owned-upgraded-new-run', null, signal());
          await waitFor(
            'new complete run after recovered legacy history',
            async () =>
              (await get(`listings/${property.listingId}`, parseListingResponse)).listing
                .collectionCount === 5,
          );
          response = (await get(`listings/${property!.listingId}`, parseListingResponse)).listing;
          expect(response.history.map((item) => item.type)).toStrictEqual([
            'created',
            'price-changed',
            'description-changed',
            'price-changed',
          ]);
          expect(response.status).toBe('active');
          const newRanking = await reductions();
          expect(newRanking.totalItems).toBe(1);
          expect(newRanking.metadata.asOf).toBe('2028-01-04T12:00:00.000Z');
          expect(newRanking!.items[0]!.previousMinorUnits).toBe(
            first.askingPriceMinorUnits - 100000,
          );
          expect(newRanking!.items[0]!.currentMinorUnits).toBe(
            first.askingPriceMinorUnits - 200000,
          );
          expect(newRanking!.items[0]!.effectiveAt).toBe('2028-01-04T12:00:00.000Z');
          expect(
            JSON.stringify(
              await connection.query<{
                event_id: string;
                payload: PropertiesEvent<'properties.listing.created'>['payload'];
              }>(
                "SELECT event_id::text,payload FROM platform.outbox WHERE event_type='properties.listing.created'",
              ),
            ),
          ).toBe(creationBytes);
          expect(
            (
              await connection.query<{ revision: number }>(
                'SELECT revision FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
                [property!.listingId],
              )
            ).map((row) => row.revision),
          ).toStrictEqual([1, 2, 3, 4]);
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM collection.completed_event_evidence',
              )
            )[0]!.count,
          ).toBe(1);
          console.log(
            'Genuine baseline upgrade passed: pending v1 facts including earlier-than-creation evidence/correction/permission gating without completion/new run; immutable creation/events/revisions, no inferred absence, reverse replay/restart, then new complete run.',
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
                for (const [command, format] of [
                  ['ps', '{{.ID}}'],
                  ['volume', '{{.Name}}'],
                ] as const) {
                  const args = command === 'ps' ? ['ps', '--all'] : ['volume', 'ls'];
                  const remaining = await run('docker', [
                    ...args,
                    '--filter',
                    `label=com.docker.compose.project=${project}`,
                    '--format',
                    format!,
                  ]);
                  expect(remaining.stdout.trim(), 'The exact campaign retained resources.').toBe(
                    '',
                  );
                }
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
