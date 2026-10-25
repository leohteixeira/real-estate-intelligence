import type { BinaryLike } from 'node:crypto';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
import type { INestApplication, Type } from '../apps/api/node_modules/@nestjs/common/index.js';
import type { RawListingDocument } from '../packages/application/dist/index.js';
import {
  COLLECTION_FACADE,
  CollectSourceRun,
  ExpireSnapshots,
  ExternalFailure,
  ReparseSnapshot,
} from '../packages/application/dist/index.js';
import type { ListingDescription, ListingResponse } from '../packages/contracts/dist/index.js';
import {
  parseListingResponse,
  parsePropertyResponse,
  type PropertyResponse,
} from '../packages/contracts/dist/index.js';
import type {
  CollectionSnapshotCorrected,
  PropertiesEvent,
} from '../packages/domain/dist/index.js';
import {
  CollectionSnapshotParsed,
  Property,
  hashCollectionManifest,
  parseCollectedListing,
  parseCollectionEvent,
} from '../packages/domain/dist/index.js';
import {
  CanonicalSnapshotSanitizer,
  DatabaseConnection,
  PostgresCollectionFacade,
  PostgresCollectionRunRepository,
  PostgresLocationsFacade,
  PostgresOutbox,
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
import { allowOwnedEndpoint } from './support/network.ts';
test('listing-provenance preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-listing-provenance-${process.pid}-${randomUUID().slice(0, 8)}`;
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
    let connection: DatabaseConnection | undefined,
      store: S3RawSnapshotStore,
      publisher: RabbitMqEventBroker,
      historicalStore: S3RawSnapshotStore,
      clockApp: INestApplication | undefined;
    const requireApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
    const { Test } = requireApi('@nestjs/testing') as typeof import(
      '../apps/api/node_modules/@nestjs/testing/index.js',
      { with: { 'resolution-mode': 'require' } }
    );
    const { PropertiesModule } = requireApi('./dist/properties/properties.module.js') as {
      PropertiesModule: Type<unknown>;
    };
    const { DATABASE_CONNECTION } = requireApi('./dist/persistence/persistence.module.js') as {
      DATABASE_CONNECTION: string | symbol;
    };
    const { configureApi } = requireApi('./dist/configure-api.js') as {
      configureApi: (app: INestApplication) => void;
    };
    const requireInfrastructure = createRequire(
      new URL('../packages/infrastructure/package.json', import.meta.url),
    );
    const { S3Client, GetObjectCommand, HeadObjectCommand } = requireInfrastructure(
      '@aws-sdk/client-s3',
    ) as typeof import('@aws-sdk/client-s3');
    const storageConfig = {
      endpoint: `http://127.0.0.1:${minio}`,
      region: 'us-east-1',
      bucket: fixture.bucket,
      accessKeyId: fixture.user,
      secretAccessKey: fixture.password,
    };
    const sdk = new S3Client({
      endpoint: storageConfig.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: fixture.user, secretAccessKey: fixture.password },
      maxAttempts: 1,
    });
    const hash = (text: BinaryLike) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
    const textA = 'Owned provenance original sanitized description.';
    const textB = 'Owned provenance changed sanitized description.';
    const textC = 'Owned provenance corrected dated description.';
    const sourceId = 'synthetic-data';
    const historyEvents = async (id: string) =>
      JSON.stringify(
        await connection!.query<{
          event: PropertiesEvent<
            | 'properties.listing.created'
            | 'properties.listing.price-changed'
            | 'properties.listing.description-changed'
            | 'properties.listing.removed'
            | 'properties.listing.reappeared'
          >;
        }>('SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision', [
          id,
        ]),
      );
    const rights = (id: unknown, allowed: boolean) =>
      connection!.query(
        'UPDATE collection.source_register SET listing_text_display_allowed=$2 WHERE source_id=$1',
        [id, allowed],
      );
    const readBoth = async (identity: { listing_id: string; property_id: string }) => {
      const listing = await get(`listings/${identity!.listing_id}`, parseListingResponse);
      const property = await get(`properties/${identity!.property_id}`, parsePropertyResponse);
      expect(property.property.listings[0]).toStrictEqual(listing.listing);
      return [listing, property] as const;
    };
    const privateFree = (responses: unknown, forbidden: string[] = []) => {
      const wire = JSON.stringify(responses);
      expect(wire).not.toMatch(
        /objectKey|object_key|ciphertext|keyBase64|keyId|private@example|99999|secret-unit|secret-photo/,
      );
      for (const text of forbidden)
        expect(!wire.includes(text), 'Denied/source-private material leaked.').toBeTruthy();
    };
    {
      let cleanupPrimary1: unknown;
      let cleanupPrimaryThrown1 = false;
      try {
        try {
          console.log(`Starting isolated listing provenance campaign ${project}.`);
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
          let instant = '2026-10-11T12:00:00.000Z';
          const clock = { now: () => instant };
          store = new S3RawSnapshotStore({
            ...storageConfig,
            lifecycle: new PostgresSnapshotLifecycle(connection!),
            clock,
          });
          const parser = new SyntheticListingSource();
          const base = parseCollectedListing(
            JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
          );
          const texts = [textA, textB, textB];
          const acquisitions = [];
          for (let index = 0; index < texts.length; index++) {
            instant = `2026-10-${11 + index}T12:00:00.000Z`;
            const original = {
              ...base,
              maskedDescription: texts[index],
              askingPriceMinorUnits: base.askingPriceMinorUnits - index * 100000,
            };
            const document = {
              sourceId,
              sourceListingId: 'OWNED-PROVENANCE',
              sourceUrl: 'https://synthetic.invalid/listings/owned-provenance',
              observedAt: instant,
              mediaType: 'application/json' as const,
              bytes: new TextEncoder().encode(JSON.stringify(original)),
            };
            const source = {
              fetchPage: async () => ({ documents: [document], nextCursor: null, exhausted: true }),
              parse: (value: RawListingDocument, cancellation: AbortSignal) =>
                parser.parse(value, cancellation),
            };
            const result = await new CollectSourceRun(
              source,
              store,
              new PostgresSourceRegisterRepository(connection!),
              new PostgresCollectionRunRepository(connection!),
              new PostgresTransactionRunner(connection!),
              new PostgresUuidV7Generator(connection!),
              clock,
              new PostgresOutbox(connection!),
            ).execute(sourceId, `owned-provenance-${index}`, null, signal());
            const row = (
              await connection.query<{
                snapshot_id: string;
                run_id: string;
                content_hash: string;
                observed_at: Date;
                object_key: string;
              }>(
                'SELECT snapshot_id::text,run_id::text,content_hash,observed_at,object_key FROM collection.snapshot_observation WHERE run_id=$1',
                [result.runId],
              )
            )[0];
            expect(row!.content_hash).toBe(hash(new TextDecoder().decode(document.bytes)));
            acquisitions.push(row);
          }
          await waitFor(
            'three genuine durable acquisitions',
            async () =>
              (
                await connection!.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM properties.listing_acquisition',
                )
              )[0]!.count === 3,
          );
          const identity = (
            await connection.query<{ listing_id: string; property_id: string }>(
              "SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id='OWNED-PROVENANCE'",
            )
          )[0];
          const [permitted] = await readBoth(identity!);
          const latest = acquisitions.at(-1);
          expect(permitted!.listing.provenance).toStrictEqual({
            sourceId,
            sourceListingId: 'OWNED-PROVENANCE',
            sourceUrl: 'https://synthetic.invalid/listings/owned-provenance',
            runId: latest!.run_id,
            snapshotId: latest!.snapshot_id,
            contentHash: latest!.content_hash,
            observedAt: latest!.observed_at.toISOString(),
          });
          expect(permitted!.listing.snapshot).toStrictEqual({
            availability: 'available',
            collectedAt: latest!.observed_at.toISOString(),
            expiresAt: null,
          });
          expect(permitted!.listing.collectionCount).toBe(3);
          expect(permitted!.listing.firstCollectedAt).toBe(
            acquisitions![0]!.observed_at.toISOString(),
          );
          expect(permitted!.listing.lastCollectedAt).toBe(latest!.observed_at.toISOString());
          expect(permitted!.listing.fieldEffectiveAt).toStrictEqual({
            askingPrice: latest!.observed_at.toISOString(),
            description: acquisitions![1]!.observed_at.toISOString(),
            attributes: acquisitions![0]!.observed_at.toISOString(),
          });
          expect(
            (
              permitted!.listing.description as Extract<
                ListingDescription,
                { permission: 'allowed' }
              >
            ).versions,
          ).toStrictEqual([
            {
              effectiveAt: acquisitions![0]!.observed_at.toISOString(),
              text: textA,
              contentHash: hash(textA),
            },
            {
              effectiveAt: acquisitions![1]!.observed_at.toISOString(),
              text: textB,
              contentHash: hash(textB),
            },
          ]);
          privateFree(await readBoth(identity!));
          const immutable = await historyEvents(identity!.listing_id);
          const reparse = (snapshotId: string, text: string, operation: string) =>
            new ReparseSnapshot(
              {
                parse: async (document, cancellation: AbortSignal) => ({
                  ...(await parser.parse(document, cancellation)),
                  maskedDescription: text,
                }),
              },
              store,
              new PostgresSnapshotReparseRepository(connection!),
              new PostgresTransactionRunner(connection!),
              new PostgresUuidV7Generator(connection!),
              clock,
              new PostgresOutbox(connection!),
              new CanonicalSnapshotSanitizer(),
            ).execute(snapshotId, operation, operation, null, signal());
          for (const [index, row] of acquisitions.slice(1).entries())
            await reparse(row!.snapshot_id, textA, `collapse-${index}`);
          await waitFor(
            'collapsed corrected versions',
            async () =>
              (
                (await get(`listings/${identity!.listing_id}`, parseListingResponse)).listing
                  .description as Extract<ListingDescription, { permission: 'allowed' }>
              ).versions.length === 1,
          );
          await rights(sourceId, false);
          const collapsed = await readBoth(identity!);
          privateFree(collapsed, [textA, textB, textC]);
          expect(
            (
              collapsed![0].listing.description as Extract<
                ListingDescription,
                { permission: 'denied' }
              >
            ).changedAt,
          ).toStrictEqual([acquisitions![1]!.observed_at.toISOString()]);
          await rights(sourceId, true);
          await reparse(latest!.snapshot_id, textC, 'new-dated-transition');
          await waitFor(
            'new corrected current text',
            async () =>
              (
                (await get(`listings/${identity!.listing_id}`, parseListingResponse)).listing
                  .description as Extract<ListingDescription, { permission: 'allowed' }>
              ).current === textC,
          );
          expect(await historyEvents(identity!.listing_id)).toBe(immutable);
          const corrected = await readBoth(identity!);
          await rights(sourceId, false);
          const denied = await readBoth(identity!);
          privateFree(denied, [textA, textB, textC]);
          expect(JSON.stringify(denied)).not.toMatch(/"current"|"versions"|"text"|excerpt/);
          expect(
            (
              denied![0].listing.description as Extract<
                ListingDescription,
                { permission: 'denied' }
              >
            ).changedAt,
          ).toStrictEqual([
            acquisitions![1]!.observed_at.toISOString(),
            latest!.observed_at.toISOString(),
          ]);
          expect(denied![0].listing.history).toStrictEqual(corrected![0].listing.history);
          await compose('restart', 'api', 'worker');
          await compose('up', '--detach', '--wait', 'api', 'worker');
          expect(await readBoth(identity!)).toStrictEqual(denied);
          await rights(sourceId, true);
          expect(await readBoth(identity!)).toStrictEqual(corrected);
          const replay = await connection.query<{
            event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
          }>('SELECT event FROM collection.parsed_event_evidence ORDER BY event_id DESC');
          const replayIds = replay.map((row) => row.event.eventId);
          await connection.query(
            "DELETE FROM platform.inbox WHERE consumer_name='properties.parsed-listing' AND event_id=ANY($1::uuid[])",
            [replayIds],
          );
          for (const row of replay)
            await publisher.publish(parseCollectionEvent(row.event), signal());
          await waitFor(
            'all replay deliveries acknowledged after inbox expiry',
            async () =>
              (
                await connection!.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.parsed-listing' AND event_id=ANY($1::uuid[])",
                  [replayIds],
                )
              )[0]!.count === replayIds.length,
          );
          expect(await historyEvents(identity!.listing_id)).toBe(immutable);
          expect(await readBoth(identity!)).toStrictEqual(corrected);
          const preparedId = '0199a3e0-0000-7000-8000-000000000001';
          const prepared = await get(`properties/${preparedId}`, parsePropertyResponse);
          const preparedSources = [
            ...new Set(prepared.property.listings.map((listing) => listing.source.sourceId)),
          ];
          await rights(preparedSources[1], false);
          const mixed = await get(`properties/${preparedId}`, parsePropertyResponse);
          for (const listing of mixed.property.listings) {
            expect(listing.description.permission).toBe(
              listing.source.sourceId === preparedSources[1] ? 'denied' : 'allowed',
            );
            expect(
              (await get(`listings/${listing.id}`, parseListingResponse)).listing,
            ).toStrictEqual(listing);
          }
          // Remove and restore only this isolated prepared fixture and its disabled schedule.
          const absentSource = (
            await connection.query<{ record: string }>(
              'SELECT row_to_json(s) AS record FROM collection.source_register s WHERE source_id=$1',
              [preparedSources[2]],
            )
          )[0]!.record;
          const absentSchedule = (
            await connection.query<{ record: string }>(
              'SELECT row_to_json(s) AS record FROM collection.collection_schedule s WHERE source_id=$1',
              [preparedSources[2]],
            )
          )[0]!.record;
          await connection.query('DELETE FROM collection.collection_schedule WHERE source_id=$1', [
            preparedSources[2],
          ]);
          await connection.query('DELETE FROM collection.source_register WHERE source_id=$1', [
            preparedSources[2],
          ]);
          const missing = await get(`properties/${preparedId}`, parsePropertyResponse);
          const missingListing = missing.property.listings.find(
            (listing: { source: { sourceId: unknown } }) =>
              listing.source.sourceId === preparedSources[2],
          );
          expect(missingListing!.description.permission).toBe('denied');
          expect(
            (await get(`listings/${missingListing!.id}`, parseListingResponse)).listing,
          ).toStrictEqual(missingListing);
          expect(JSON.stringify(missingListing)).not.toMatch(/"current"|"versions"|"text"|excerpt/);
          await connection.query(
            'INSERT INTO collection.source_register SELECT * FROM json_populate_record(NULL::collection.source_register,$1::json)',
            [JSON.stringify(absentSource)],
          );
          await connection.query(
            'INSERT INTO collection.collection_schedule SELECT * FROM json_populate_record(NULL::collection.collection_schedule,$1::json)',
            [JSON.stringify(absentSchedule)],
          );
          await rights(preparedSources[1], true);
          expect(await get(`properties/${preparedId}`, parsePropertyResponse)).toStrictEqual(
            prepared,
          );
          const deniedSample = await get(
            'listings/0199a3e0-0000-7000-8000-000000000991',
            parseListingResponse,
          );
          await rights(deniedSample.listing.source.sourceId, true);
          expect(
            (await get('listings/0199a3e0-0000-7000-8000-000000000991', parseListingResponse))
              .listing.description.permission,
          ).toBe('denied');
          // Separately labelled historical encrypted fixture: each owner writes only through its repository.
          // This creates no enabled real source and never sends the historical fact through synthetic ingestion.
          await compose('stop', 'worker');
          const historicalSource = 'historical-encrypted-fixture';
          await connection.query(
            `INSERT INTO collection.source_register
    (source_id,source_label,enabled,collection_allowed,image_fetching_allowed,listing_text_display_allowed,
    permission_evidence,reviewed_at,source_category,review_outcome,access_method,access_policy,
    rate_status,rate_limit,rate_window_seconds,licence_status,licence_label,licence_url)
    VALUES ($1,'Local historical encrypted fixture',false,false,false,true,'Local generated historical proof',clock_timestamp(),
    'listing','not-verified','remote-http','Never collect', 'configured',1,1,'licensed','Local fixture','https://fixture.invalid/licence')`,
            [historicalSource],
          );
          let retentionTime = new Date().toISOString();
          const retentionClock = { now: () => retentionTime };
          const encryption = {
            keyId: 'campaign-local',
            keyBase64: randomBytes(32).toString('base64'),
          };
          let lifecycle = new PostgresSnapshotLifecycle(connection!);
          historicalStore = new S3RawSnapshotStore({
            ...storageConfig,
            lifecycle,
            encryption,
            clock: retentionClock,
          });
          const historicalInput = {
            sourceId: historicalSource,
            sourceListingId: 'HISTORICAL-ONLY',
            sourceUrl: 'https://fixture.invalid/listings/historical',
            observedAt: retentionTime,
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(
              JSON.stringify({
                ...base,
                maskedDescription: 'Historical local private@example.test +55 (11) 99999-8888',
                imageFingerprints: [hash('historical-owned-fingerprint')],
                location: { ...base.location, unit: 'secret-unit' },
                contact: { email: 'private@example.test' },
                photos: ['secret-photo'],
              }),
            ),
          };
          const sanitized = new CanonicalSnapshotSanitizer().sanitize(historicalInput);
          const stored = await historicalStore.store(
            {
              sourceId: historicalSource,
              sourceListingId: historicalInput.sourceListingId,
              acquisitionId: 'historical-provenance',
              mediaType: 'application/json' as const,
              synthetic: false,
              bytes: sanitized.document.bytes,
            },
            signal(),
          );
          const encrypted = await sdk.send(
            new GetObjectCommand({ Bucket: fixture.bucket, Key: stored.objectKey }),
            { abortSignal: signal() },
          );
          const ciphertext = await encrypted!.Body!.transformToByteArray();
          expect(!new TextDecoder().decode(ciphertext).includes('Historical local')).toBeTruthy();
          expect(stored.contentHash).toBe(hash(new TextDecoder().decode(sanitized.document.bytes)));
          const transactions = new PostgresTransactionRunner(connection!);
          const identifiers = new PostgresUuidV7Generator(connection!);
          const runs = new PostgresCollectionRunRepository(connection!);
          const properties = new PostgresPropertyRepository(connection!);
          let historicalIdentity: { property_id: string; listing_id: string } | undefined,
            historicalEvent: CollectionSnapshotParsed | undefined;
          await transactions.runInTransaction(async (transaction) => {
            const runId = await identifiers.generate(transaction);
            const snapshotId = await identifiers.generate(transaction);
            const eventId = await identifiers.generate(transaction);
            const completedEventId = await identifiers.generate(transaction);
            const propertyId = await identifiers.generate(transaction);
            const listingId = await identifiers.generate(transaction);
            historicalEvent = new CollectionSnapshotParsed({
              eventId,
              aggregateId: snapshotId,
              occurredAt: retentionTime,
              traceContext: null,
              payload: {
                source: {
                  sourceId: historicalSource,
                  sourceListingId: historicalInput.sourceListingId,
                  sourceUrl: historicalInput.sourceUrl,
                  observedAt: retentionTime,
                },
                run: { runId },
                snapshot: { snapshotId, contentHash: stored.contentHash },
                listing: JSON.parse(new TextDecoder().decode(sanitized.document.bytes)),
              },
            });
            await runs.persistCompleted(transaction, {
              operationKey: 'historical-provenance',
              runId,
              snapshotId,
              parsedEventId: eventId,
              completedEventId,
              sourceId: historicalSource,
              sourceListingId: historicalInput.sourceListingId,
              sourceUrl: historicalInput.sourceUrl,
              observedAt: retentionTime,
              startedAt: retentionTime,
              completedAt: retentionTime,
              ...stored,
              manifestHash: hashCollectionManifest([historicalInput.sourceListingId]),
            });
            await runs.appendParsedEvidence(transaction, [historicalEvent]);
            const resolved = await new PostgresLocationsFacade(connection!).resolveFixtureAddress(
              base.location,
              transaction,
            );
            const property = new Property(propertyId, listingId, historicalEvent, resolved!);
            await properties.appendFact(transaction, historicalEvent, 'initial');
            await properties.create(transaction, property);
            historicalIdentity = { property_id: propertyId, listing_id: listingId };
          }, signal());
          const generation = (
            await connection.query<{ collected_at: Date; expires_at: Date }>(
              'SELECT collected_at,expires_at FROM collection.snapshot_generation',
            )
          )[0];
          const expiresAt = generation!.expires_at.toISOString();
          const expected = {
            ...historicalEvent!.payload.source,
            ...historicalEvent!.payload.run,
            ...historicalEvent!.payload.snapshot,
          };
          expect(
            await new PostgresCollectionFacade(
              connection!,
              new PostgresSourceRegisterRepository(connection!),
            ).verifyParsedEvent(undefined!, historicalEvent!),
          ).toBe(false);
          let rejectRights = false;
          const startClockApi = async () => {
            const sourceRepository = new PostgresSourceRegisterRepository(connection!);
            const lookup = sourceRepository.findById.bind(sourceRepository);
            sourceRepository.findById = (id: string) => {
              if (rejectRights) throw new Error('Private fixture dependency failure.');
              return lookup(id);
            };
            const collection = new PostgresCollectionFacade(
              connection!,
              sourceRepository,
              retentionClock,
            );
            const module = await Test.createTestingModule({ imports: [PropertiesModule] })
              .overrideProvider(DATABASE_CONNECTION)
              .useValue(connection)
              .overrideProvider(COLLECTION_FACADE)
              .useValue(collection)
              .compile();
            clockApp = module.createNestApplication();
            configureApi(clockApp);
            await clockApp.listen(0, '127.0.0.1');
            allowOwnedEndpoint(`http://127.0.0.1:${clockApp.getHttpServer().address().port}`);
            return `http://127.0.0.1:${clockApp.getHttpServer().address().port}/api/v1`;
          };
          let clockBase = await startClockApi();
          const readHistorical = async (status: string) => {
            const responses = [];
            for (const [path, parser] of [
              [`listings/${historicalIdentity!.listing_id}`, parseListingResponse],
              [`properties/${historicalIdentity!.property_id}`, parsePropertyResponse],
            ] as const) {
              const response = await requestHttp(`${clockBase}/${path}`, { signal: signal() });
              expect(response.status).toBe(200);
              responses.push(parser!(await response.json()));
            }
            const listing = (responses[0] as ListingResponse).listing;
            expect((responses[1] as PropertyResponse).property.listings[0]).toStrictEqual(listing);
            expect(listing.provenance).toStrictEqual(expected);
            expect(listing.snapshot).toStrictEqual({
              availability: status,
              collectedAt: generation!.collected_at.toISOString(),
              expiresAt,
            });
            privateFree(responses, [
              stored.objectKey,
              encryption.keyBase64,
              'private@example.test',
            ]);
            return responses;
          };
          retentionTime = new Date(Date.parse(expiresAt) - 1).toISOString();
          await readHistorical('available');
          rejectRights = true;
          for (const path of [
            `listings/${historicalIdentity!.listing_id}`,
            `properties/${historicalIdentity!.property_id}`,
            `properties/${preparedId}`,
            `listings/${prepared!.property.listings[0]!.id}`,
          ]) {
            const response = await requestHttp(`${clockBase}/${path}`, { signal: signal() });

            expect(response.status).toBe(500);
            const body = await response.json();
            privateFree(body, [
              'Historical local',
              textA,
              textB,
              textC,
              'Private fixture dependency failure',
            ]);
            expect(JSON.stringify(body)).not.toMatch(/"current"|"versions"|"text"|excerpt|stack/);
          }
          rejectRights = false;
          retentionTime = expiresAt;
          const expired = await readHistorical('expired');
          // Storage still contains the ciphertext: delayed cleanup cannot extend access.
          await sdk.send(new HeadObjectCommand({ Bucket: fixture.bucket, Key: stored.objectKey }), {
            abortSignal: signal(),
          });
          await expect(
            new ExpireSnapshots(
              lifecycle,
              {
                store: historicalStore.store.bind(historicalStore),
                read: historicalStore.read.bind(historicalStore),
                delete: async () => {
                  throw new ExternalFailure({
                    kind: 'transient',
                    operation: 'fixture.interrupted-delete',
                  });
                },
              },
              retentionClock,
            ).expire(1, signal()),
          ).rejects.toThrow();
          await clockApp!.close();
          clockApp = undefined;
          connection = new DatabaseConnection(databaseUrl.toString());
          lifecycle = new PostgresSnapshotLifecycle(connection!);
          clockBase = await startClockApi();
          retentionTime = new Date(Date.parse(expiresAt) + 1).toISOString();
          expect(await readHistorical('expired')).toStrictEqual(expired);
          historicalStore.destroy();
          historicalStore = new S3RawSnapshotStore({
            ...storageConfig,
            lifecycle,
            encryption,
            clock: retentionClock,
          });
          expect(
            await new ExpireSnapshots(lifecycle, historicalStore, retentionClock).expire(
              1,
              signal(),
            ),
          ).toBe(1);
          await expect(
            sdk.send(new HeadObjectCommand({ Bucket: fixture.bucket, Key: stored.objectKey }), {
              abortSignal: signal(),
            }),
          ).rejects.toSatisfy(
            (error: { $metadata: { httpStatusCode: number } }) =>
              error.$metadata?.httpStatusCode === 404,
          );
          expect(await readHistorical('expired')).toStrictEqual(expired);
          await clockApp!.close();
          clockApp = undefined;
          connection = new DatabaseConnection(databaseUrl.toString());
          clockBase = await startClockApi();
          expect(await readHistorical('expired')).toStrictEqual(expired);
          const readSources = new PostgresSourceRegisterRepository(connection!);
          expect(
            (
              await new PostgresCollectionFacade(
                connection,
                readSources,
                retentionClock,
              ).getSnapshotMetadata({ ...expected, sourceListingId: 'FOREIGN' })
            ).availability,
          ).toBe('unavailable');
          console.log(
            'Listing provenance passed: genuine storage/outbox/broker/worker/HTTP acquisitions, corrected dates and immutable events, live per-source revoke/restore and restart, prepared mixed/missing rights, historical encrypted owner-repository fixture, exact expiry, interrupted cleanup, fresh pool/API restart, durable hashes and privacy.',
          );
        } catch (error) {
          await compose('logs', '--no-color', '--tail', '80', 'worker', 'api', 'migrations')
            .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
            .catch(() => undefined);
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
            await cleanupAll(
              async () => {
                if (clockApp) {
                  await clockApp.close();
                  connection = undefined;
                }
              },
              async () => {
                await publisher?.close();
              },
              async () => {
                store?.destroy();
              },
              async () => {
                historicalStore?.destroy();
              },
              async () => {
                sdk.destroy();
              },
              async () => {
                await connection?.close();
              },
              async () => {
                await compose('down', '--volumes', '--remove-orphans');
              },
              async () => {
                for (const args of [
                  ['ps', '--all'],
                  ['volume', 'ls'],
                ] as const) {
                  const remaining = await run('docker', [
                    ...args,
                    '--filter',
                    `label=com.docker.compose.project=${project}`,
                    '--format',
                    args[0] === 'ps' ? '{{.ID}}' : '{{.Name}}',
                  ]);
                  expect(remaining.stdout.trim(), 'Exact campaign retained resources.').toBe('');
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
