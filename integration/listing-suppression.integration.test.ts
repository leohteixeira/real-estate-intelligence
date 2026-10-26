import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
import {
  ParsedListingConsumer,
  ListingCompletionConsumer,
  ListingSuppressionConsumer,
} from '../apps/worker/dist/properties/index.js';
import { CollectionAuditConsumer } from '../apps/worker/dist/collection/collection-audit.consumer.js';
import {
  ConsumeParsedListing,
  ConsumeListingCompletion,
  ConsumeListingSuppression,
  ReconcileListingHistory,
  ReconcilePropertyResolution,
  CollectSourceOnce,
  CollectSourceRun,
  RemoveListing,
  ReparseSnapshot,
  ExpireSnapshots,
  SNAPSHOT_RETENTION_MS,
  type RawListingDocument,
  type ListingSource,
  type SnapshotContentStore,
} from '../packages/application/dist/index.js';
import {
  parseCollectionEvent,
  parseUuidV7,
  parsePropertiesListingSuppressed,
  parseCollectedListing,
  hashCollectionManifest,
  type TraceContext,
  type ListingChronologyState,
} from '../packages/domain/dist/index.js';
import {
  PostgresPropertyRepository,
  PostgresPropertySuppressionRepository,
  PostgresListingHistoryRepository,
  PostgresPropertyResolutionRepository,
  SyntheticLocationsAdapter,
  DatabaseConnection,
  PostgresListingSuppression,
  PostgresCollectionRunRepository,
  PostgresCollectionFacade,
  PostgresSourceRegisterRepository,
  PostgresSnapshotLifecycle,
  PostgresSnapshotReparseRepository,
  PostgresAuditEventLog,
  PostgresInbox,
  PostgresOutbox,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SyntheticListingSource,
  SyntheticSaoPauloListingSource,
  SYNTHETIC_LISTING_BYTES,
} from '../packages/infrastructure/dist/index.js';
import {
  parsePropertyResponse,
  parseListingResponse,
  parseSearchResponse,
  parseReductionsResponse,
} from '../packages/contracts/dist/index.js';
import { requestHttp } from './support/http.ts';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';

test('listing suppression erases owned copies, survives failures and prevents prepared work and late writes restoring them', async () => {
  await withCampaign(async ({ command }) => {
    const executeFile = command;
    const project = `rei-listing-suppression-${process.pid}`;
    const fixture = {
      user: 'rei_suppression_fixture',
      password: 'rei-suppression-local-fixture',
      database: 'rei_suppression_fixture',
      bucket: 'rei-suppression-fixture',
    };
    const signal = () => AbortSignal.timeout(15000);
    const encryption = {
      keyId: 'reparse-local-key',
      keyBase64: randomBytes(32).toString('base64'),
    };
    const ports = allocatePorts;
    const [postgres, minio, consolePort, rabbit, management, api] = await ports(6);
    const environment = {
      ...process.env,
      COMPOSE_FILE: 'compose.yaml',
      COMPOSE_PROJECT_NAME: project,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      COMPOSE_PROFILES: '',
      NODE_ENV: 'test',
      API_PORT: String(api),
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      POSTGRES_USER: fixture.user,
      POSTGRES_PASSWORD: fixture.password,
      POSTGRES_DB: fixture.database,
      POSTGRES_PORT: String(postgres),
      MINIO_ROOT_USER: fixture.user,
      MINIO_ROOT_PASSWORD: fixture.password,
      MINIO_API_PORT: String(minio),
      MINIO_CONSOLE_PORT: String(consolePort),
      RABBITMQ_USER: fixture.user,
      RABBITMQ_PASSWORD: fixture.password,
      RABBITMQ_VHOST: 'rei-suppression-fixture',
      RABBITMQ_PORT: String(rabbit),
      RABBITMQ_MANAGEMENT_PORT: String(management),
      SNAPSHOT_ENCRYPTION_KEY_ID: '',
      SNAPSHOT_ENCRYPTION_KEY_BASE64: '',
    };
    const compose = (...args: string[]) =>
      executeFile('docker', ['compose', '--project-name', project, ...args], {
        cwd: new URL('..', import.meta.url),
        env: environment,
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
      });
    const fixtureDatabaseUrl = new URL(`postgres://127.0.0.1:${postgres}/${fixture.database}`);
    fixtureDatabaseUrl.username = fixture.user;
    fixtureDatabaseUrl.password = fixture.password;
    const databaseUrl = fixtureDatabaseUrl.toString();
    const storageConfig = {
      endpoint: `http://127.0.0.1:${minio}`,
      region: 'us-east-1',
      bucket: fixture.bucket,
      accessKeyId: fixture.user,
      secretAccessKey: fixture.password,
    };
    const commandEnvironment = {
      ...environment,
      DATABASE_URL: databaseUrl,
      WORKER_OPERATION_TIMEOUT_MS: '5000',
      COLLECTION_DEADLINE_MS: '30000',
      OBJECT_STORE_ENDPOINT: storageConfig.endpoint,
      OBJECT_STORE_REGION: storageConfig.region,
      OBJECT_STORE_BUCKET: fixture.bucket,
      OBJECT_STORE_ACCESS_KEY_ID: fixture.user,
      OBJECT_STORE_SECRET_ACCESS_KEY: fixture.password,
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const cli = (name: string, ...args: string[]) =>
      executeFile('node', ['-r', './dist/otel.js', `dist/collection/${name}.js`, ...args], {
        cwd: new URL('../apps/worker/', import.meta.url),
        env: commandEnvironment,
        timeout: 45000,
        maxBuffer: 2 * 1024 * 1024,
      });
    const requireInfrastructure = createRequire(
      new URL('../packages/infrastructure/package.json', import.meta.url),
    );
    const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } =
      requireInfrastructure('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');
    const sdk = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      forcePathStyle: true,
      credentials: { accessKeyId: fixture.user, secretAccessKey: fixture.password },
      maxAttempts: 1,
    });
    let connection: DatabaseConnection | undefined;
    let broker: RabbitMqEventBroker | undefined;
    const stores: S3RawSnapshotStore[] = [];
    await preserveCleanup(
      async () => {
        await compose(
          'up',
          '--build',
          '--detach',
          '--wait',
          'postgres',
          'minio',
          'rabbitmq',
          'migrations',
        );
        const db = new DatabaseConnection(databaseUrl);
        connection = db;
        const transactions = new PostgresTransactionRunner(db);
        const identifiers = new PostgresUuidV7Generator(db);
        const outbox = new PostgresOutbox(db);
        const audit = new PostgresAuditEventLog(db);
        const sources = new PostgresSourceRegisterRepository(db);
        const runs = new PostgresCollectionRunRepository(db);
        const authority = new PostgresListingSuppression(db);
        const lifecycle = new PostgresSnapshotLifecycle(db);
        let now = Date.now();
        const clock = { now: () => new Date(Math.max(now, Date.now())).toISOString() };
        const store = new S3RawSnapshotStore({
          ...storageConfig,
          lifecycle,
          encryption,
          clock,
          reconciliationIntervalMs: 100,
        });
        stores.push(store);
        const source = new SyntheticListingSource();
        const remove = (snapshots: Pick<SnapshotContentStore, 'delete'> = store) =>
          new RemoveListing(
            authority,
            sources,
            snapshots,
            [outbox, audit],
            transactions,
            identifiers,
            clock,
            outbox,
          );
        const collect = (adapter: ListingSource = source, snapshots = store) =>
          new CollectSourceOnce(
            adapter,
            snapshots,
            sources,
            runs,
            transactions,
            identifiers,
            clock,
            outbox,
            undefined,
            5000,
            authority,
          );
        const count = async (sql: string, args: readonly unknown[] = []) =>
          (await db.query<{ count: number }>(sql, [...args]))[0]!.count;
        const objects = async () =>
          (
            await sdk.send(new ListObjectsV2Command({ Bucket: fixture.bucket }), {
              abortSignal: signal(),
            })
          ).Contents?.map((row) => row.Key).sort() ?? [];
        await cli('collect-synthetic', 'cli-original');
        const original = (
          await db.query<{ snapshot_id: string; object_key: string; event: unknown }>(
            `SELECT observation.snapshot_id::text,observation.object_key,evidence.event FROM collection.snapshot_observation observation JOIN collection.parsed_event_evidence evidence USING(snapshot_id)`,
          )
        )[0]!;
        const originalEvent = parseCollectionEvent(original.event);
        if (originalEvent.type !== 'collection.snapshot.parsed')
          throw new Error('Expected canonical parsed fixture event.');
        const sharedSource: ListingSource = {
          fetchPage: async (_sourceId, _cursor, scoped) => {
            const page = await source.fetchPage('synthetic-data', null, scoped);
            return {
              ...page,
              documents: page.documents.map((document) => ({
                ...document,
                sourceListingId: 'shared-owner',
                sourceUrl: 'https://synthetic.invalid/shared-owner',
              })),
            };
          },
          parse: source.parse.bind(source),
        };
        await collect(sharedSource).execute('synthetic-data', 'shared-owner-run', null, signal());
        expect(await objects()).toEqual([original.object_key]);
        broker = new RabbitMqEventBroker({
          url: `amqp://${fixture.user}:${fixture.password}@127.0.0.1:${rabbit}/rei-suppression-fixture`,
          operationTimeoutMs: 5000,
          handlerTimeoutMs: 5000,
          drainTimeoutMs: 5000,
        });
        await broker.start(signal());
        await new CollectionAuditConsumer(
          broker,
          transactions,
          new PostgresInbox(db),
          audit,
          authority,
        ).start();
        const properties = new PostgresPropertyRepository(db);
        const history = new PostgresListingHistoryRepository(db);
        const collection = new PostgresCollectionFacade(db, sources);
        const locations = new SyntheticLocationsAdapter();
        const inbox = new PostgresInbox(db);
        const parsed = () =>
          new ConsumeParsedListing(
            collection,
            locations,
            properties,
            transactions,
            inbox,
            history,
            authority,
          );
        const suppress = (publication = outbox) =>
          new ConsumeListingSuppression(
            authority,
            new PostgresPropertySuppressionRepository(db, outbox),
            transactions,
            inbox,
            publication,
            identifiers,
          );
        const chronology = new ReconcileListingHistory(
          collection,
          locations,
          properties,
          history,
          transactions,
          outbox,
          identifiers,
          (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`,
          outbox,
          authority,
        );
        const resolution = new ReconcilePropertyResolution(
          new PostgresPropertyResolutionRepository(db, outbox, identifiers),
          transactions,
        );
        await new ParsedListingConsumer(broker, parsed()).start();
        await new ListingCompletionConsumer(
          broker,
          new ConsumeListingCompletion(collection, history, transactions, inbox),
        ).start();
        await new ListingSuppressionConsumer(broker, suppress()).start();
        const materialize = async (expected: number) => {
          await vi.waitFor(
            async () => {
              await chronology.execute(100, signal());
              expect(await count('SELECT count(*)::integer AS count FROM properties.listing')).toBe(
                expected,
              );
            },
            { timeout: 15000, interval: 100 },
          );
          for (let cycle = 0; cycle < 12; cycle++) await chronology.execute(100, signal());
          await resolution.execute(signal());
        };
        const http = (path: string) =>
          requestHttp(`http://127.0.0.1:${api}/api/v1/${path}`, { signal: signal() });
        const property = async (id: string) => {
          const response = await http(`properties/${id}`);
          expect(response.status).toBe(200);
          return parsePropertyResponse(await response.json()).property;
        };
        const identityRows = () =>
          db.query<{ listing_id: string; property_id: string; source_listing_id: string }>(
            'SELECT listing_id::text,property_id::text,source_listing_id FROM properties.listing ORDER BY property_id',
          );
        const waitErased = async (identity: string) =>
          vi.waitFor(
            async () => {
              expect(
                await count(
                  'SELECT count(*)::integer AS count FROM properties.listing_suppression_receipt WHERE source_listing_id=$1',
                  [identity],
                ),
              ).toBe(1);
              for (const table of ['listing', 'incoming_fact', 'listing_run_effect'])
                expect(
                  await count(
                    `SELECT count(*)::integer AS count FROM properties.${table} WHERE source_listing_id=$1`,
                    [identity],
                  ),
                ).toBe(0);
            },
            { timeout: 10000, interval: 50 },
          );
        const raceErasure = async (
          identity: string,
          admittedWork: () => Promise<unknown>,
          eraseWork: () => Promise<unknown>,
        ) => {
          let entered!: () => void;
          let release!: () => void;
          const enteredLock = new Promise<void>((resolve) => {
            entered = resolve;
          });
          const barrier = new Promise<void>((resolve) => {
            release = resolve;
          });
          const lease = db.leaseClient.bind(db);
          const paused = vi.spyOn(db, 'leaseClient').mockImplementation(async () => {
            const client = await lease();
            return {
              ...client,
              query: async <TRow extends object>(
                sql: string,
                parameters: readonly unknown[] = [],
              ) => {
                if (
                  sql.startsWith('SELECT pg_advisory_xact_lock') &&
                  parameters[0] === JSON.stringify(['properties', 'synthetic-data', identity])
                ) {
                  entered();
                  await barrier;
                }
                return client.query<TRow>(sql, parameters);
              },
            };
          });
          const admitted = admittedWork();
          const admittedOutcome = admitted.then(
            () => null,
            (error: unknown) => error,
          );
          try {
            await enteredLock;
            const erasing = eraseWork().then(
              () => null,
              (error: unknown) => error,
            );
            await vi.waitFor(
              async () =>
                expect(
                  await count(
                    "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
                  ),
                ).toBeGreaterThan(0),
              { timeout: 2000, interval: 50 },
            );
            release();
            expect(await admittedOutcome).toBeNull();
            expect(await erasing).toBeNull();
          } finally {
            release();
            paused.mockRestore();
          }
        };
        let delivery = broker;
        const relay = async () => {
          for (;;) {
            const rows = await outbox.claimPending(25, 10000);
            if (!rows.length) return;
            for (const row of rows) {
              const event = {
                eventId: row.eventId,
                type: row.type,
                version: row.version,
                aggregateId: row.aggregateId,
                occurredAt: row.occurredAt,
                traceContext: row.traceContext,
                payload: row.payload,
              };
              await delivery.publish(event, signal());
              await outbox.markPublished(row.eventId, row.claimId);
            }
          }
        };
        await relay();
        await vi.waitFor(
          async () =>
            expect(
              await count(
                "SELECT count(*)::integer AS count FROM audit.event_log WHERE event_type='collection.snapshot.parsed'",
              ),
            ).toBe(2),
          { timeout: 10000, interval: 50 },
        );
        await materialize(2);
        await compose('up', '--build', '--detach', '--wait', 'api');
        const initialRows = await identityRows();
        const erased = initialRows.find((row) => row.source_listing_id === 'SYN-SP-0001')!;
        const surviving = initialRows.find((row) => row.source_listing_id === 'shared-owner')!;
        expect(
          (await property(erased.property_id)).listings.map((listing) => listing.id).sort(),
        ).toEqual(initialRows.map((row) => row.listing_id).sort());
        // Add and erase a non-anchor through the same real broker entry.
        const unrelatedBytes = (
          await new SyntheticSaoPauloListingSource().fetchPage(
            'synthetic-portal-aurora',
            null,
            signal(),
          )
        ).documents[0]!.bytes;
        const renamed = (sourceListingId: string): ListingSource => ({
          fetchPage: async (_id, _cursor, scoped) => {
            const page = await source.fetchPage('synthetic-data', null, scoped);
            return {
              ...page,
              documents: page.documents.flatMap((document) =>
                (sourceListingId === 'non-anchor'
                  ? ['SYN-SP-0001', 'shared-owner', sourceListingId, 'unrelated']
                  : [sourceListingId]
                ).map((identity) => ({
                  ...document,
                  sourceListingId: identity,
                  sourceUrl: `https://synthetic.invalid/${identity}`,
                  bytes: identity === 'unrelated' ? unrelatedBytes : document.bytes,
                })),
              ),
            };
          },
          parse: source.parse.bind(source),
        });
        await new CollectSourceRun(
          renamed('non-anchor'),
          store,
          sources,
          runs,
          transactions,
          identifiers,
          clock,
          outbox,
          undefined,
          authority,
        ).execute('synthetic-data', 'non-anchor-run', null, signal());
        await relay();
        await materialize(4);
        const unrelated = (await identityRows()).find(
          (row) => row.source_listing_id === 'unrelated',
        )!;
        expect((await property(erased.property_id)).listings).toHaveLength(3);
        const nonAnchorEvent = (
          await db.query<{ event: unknown }>(
            "SELECT event FROM collection.parsed_event_evidence WHERE event->'payload'->'source'->>'sourceListingId'='non-anchor'",
          )
        )[0]!.event;
        const canonicalNonAnchor = parseCollectionEvent(nonAnchorEvent);
        await db.query(
          "DELETE FROM platform.inbox WHERE consumer_name='properties.parsed-listing' AND event_id=$1",
          [canonicalNonAnchor.eventId],
        );
        await raceErasure(
          'non-anchor',
          () => parsed().execute(nonAnchorEvent, signal()),
          () => remove().execute('synthetic-data', 'non-anchor', null, signal()),
        );
        await relay();
        await waitErased('non-anchor');
        expect(
          (await property(erased.property_id)).listings.map((listing) => listing.id).sort(),
        ).toEqual(initialRows.map((row) => row.listing_id).sort());
        await resolution.execute(signal());
        expect((await property(erased.property_id)).listings).toHaveLength(2);
        const beforeAnchorErasure = await identityRows();
        // The privacy capability does not authorize arbitrary audit deletion or mutation.
        await expect(
          db.query("DELETE FROM audit.event_log WHERE event_type='collection.snapshot.parsed'"),
        ).rejects.toThrow('append-only');
        await expect(
          db.query('UPDATE audit.event_log SET occurred_at=clock_timestamp()'),
        ).rejects.toThrow('append-only');
        // A correction has already read and reserved the target when removal starts.
        let entered!: () => void;
        let release!: () => void;
        const parsing = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const barrier = new Promise<void>((resolve) => {
          release = resolve;
        });
        const reparse = new ReparseSnapshot(
          {
            parse: async (document) => {
              entered();
              await barrier;
              return parseCollectedListing(
                JSON.parse(Buffer.from(document.bytes).toString()),
                true,
              );
            },
          },
          store,
          new PostgresSnapshotReparseRepository(db),
          transactions,
          identifiers,
          clock,
          outbox,
        );
        const prepared = reparse.execute(
          originalEvent.aggregateId,
          'suppression-race',
          'suppression-reparse-race',
          null,
          signal(),
        );
        const preparedOutcome = prepared.then(
          () => ({ succeeded: true }),
          () => ({ succeeded: false }),
        );
        await parsing;
        await cli(
          'reparse-snapshot',
          originalEvent.aggregateId,
          'properties-history-overlap',
          'properties-history-overlap',
        );
        await relay();
        await vi.waitFor(
          async () =>
            expect(
              await count(
                "SELECT count(*)::integer AS count FROM properties.incoming_fact WHERE source_listing_id='SYN-SP-0001' AND event_version IN (2,4)",
              ),
            ).toBe(1),
          { timeout: 10000, interval: 50 },
        );
        await raceErasure(
          'SYN-SP-0001',
          () => chronology.execute(100, signal()),
          () => remove().execute('synthetic-data', 'SYN-SP-0001', null, signal()),
        );
        release();
        // The same real SQL deletion must roll back together with inbox/receipt/outbox.
        const suppressionWire = (
          await db.query<{
            event_id: string;
            aggregate_id: string;
            occurred_at: Date;
            trace_context: TraceContext | null;
            payload: { sourceId: string; sourceListingId: string };
          }>(
            "SELECT event_id::text,aggregate_id::text,occurred_at,trace_context,payload FROM platform.outbox WHERE event_type='collection.listing.suppressed' AND payload->>'sourceListingId'='SYN-SP-0001'",
          )
        )[0]!;
        const suppressionEvent = {
          eventId: parseUuidV7(suppressionWire.event_id),
          aggregateId: parseUuidV7(suppressionWire.aggregate_id),
          occurredAt: suppressionWire.occurred_at.toISOString(),
          traceContext: suppressionWire.trace_context,
          type: 'collection.listing.suppressed',
          version: 1,
          payload: suppressionWire.payload,
        };
        const failPublication = {
          append: async () => {
            throw new Error('controlled Properties publication failure');
          },
        };
        await expect(
          new ConsumeListingSuppression(
            authority,
            new PostgresPropertySuppressionRepository(db, outbox),
            transactions,
            inbox,
            failPublication,
            identifiers,
          ).execute(suppressionEvent, signal()),
        ).rejects.toThrow('controlled Properties publication failure');
        expect(await identityRows()).toEqual(beforeAnchorErasure);
        expect(
          await count(
            "SELECT count(*)::integer AS count FROM properties.listing_suppression_receipt WHERE source_listing_id='SYN-SP-0001'",
          ),
        ).toBe(0);
        const suppressionCancelled = new AbortController();
        await expect(
          new ConsumeListingSuppression(
            authority,
            new PostgresPropertySuppressionRepository(db, outbox),
            transactions,
            inbox,
            {
              append: async () => {
                suppressionCancelled.abort(new Error('controlled Properties cancellation'));
              },
            },
            identifiers,
          ).execute(suppressionEvent, suppressionCancelled.signal),
        ).rejects.toThrow('controlled Properties cancellation');
        expect(await identityRows()).toEqual(beforeAnchorErasure);
        expect(await preparedOutcome).toEqual({ succeeded: false });
        const first = (
          await db.query<{ suppression_id: string; event_id: string; completed_at: Date }>(
            'SELECT * FROM collection.listing_suppression WHERE source_listing_id=$1',
            ['SYN-SP-0001'],
          )
        )[0]!;
        expect(first.completed_at).toBeInstanceOf(Date);
        expect(
          await count(
            `SELECT count(*)::integer AS count FROM collection.snapshot_observation WHERE source_listing_id='SYN-SP-0001'`,
          ),
        ).toBe(0);
        expect(
          await count(`SELECT count(*)::integer AS count FROM collection.snapshot_reparse`),
        ).toBe(0);
        expect(
          await count(
            `SELECT count(*)::integer AS count FROM collection.parsed_event_evidence WHERE event->'payload'->'source'->>'sourceListingId'='SYN-SP-0001'`,
          ),
        ).toBe(0);
        for (const table of ['platform.outbox', 'audit.event_log'])
          expect(
            await count(
              `SELECT count(*)::integer AS count FROM ${table} WHERE event_type='collection.snapshot.parsed' AND payload->'source'->>'sourceListingId'='SYN-SP-0001'`,
            ),
          ).toBe(0);
        // Other owners of globally addressed bytes remain readable.
        expect(Buffer.from(await store.read(original.object_key, signal()))).toEqual(
          Buffer.from(SYNTHETIC_LISTING_BYTES),
        );
        const facade = new PostgresCollectionFacade(db, sources);
        expect(
          await transactions.runInTransaction((tx) => facade.verifyParsedEvent(tx, originalEvent)),
        ).toBe(false);
        const historical = await facade.getRun(
          (
            await db.query<{ run_id: string }>(
              "SELECT run_id::text FROM collection.collection_run WHERE operation_key='cli-original'",
            )
          )[0]!.run_id,
        );
        expect(historical?.observedSourceListingIds).toEqual(['SYN-SP-0001']);
        expect(historical?.manifestHash).toBe(hashCollectionManifest(['SYN-SP-0001']));
        await cli('remove-listing', 'synthetic-data', 'SYN-SP-0001');
        expect(
          await count(
            "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type='collection.listing.suppressed' AND payload->>'sourceListingId'='SYN-SP-0001'",
          ),
        ).toBe(1);
        await relay();
        await waitErased('SYN-SP-0001');
        expect((await http(`listings/${erased.listing_id}`)).status).toBe(404);
        expect((await http(`properties/${erased.property_id}`)).status).toBe(404);
        expect(
          (await property(unrelated.property_id)).listings[0]!.provenance.sourceListingId,
        ).toBe('unrelated');
        const afterAnchor = await property(surviving.property_id);
        expect(afterAnchor.listings.map((listing) => listing.id)).toEqual([surviving.listing_id]);
        expect(afterAnchor.summary.askingPrice?.provenance.sourceListingId).toBe('shared-owner');
        const listingResponse = await http(`listings/${surviving.listing_id}`);
        expect(parseListingResponse(await listingResponse.json()).listing.propertyId).toBe(
          surviving.property_id,
        );
        const searchResponse = await http('properties');
        expect(
          parseSearchResponse(await searchResponse.json()).items.map((item) => item.id),
        ).toEqual(expect.arrayContaining([surviving.property_id, unrelated.property_id]));
        const reductionsResponse = await http(
          `places/${afterAnchor.summary.place.id}/largest-reductions`,
        );
        expect(reductionsResponse.status).toBe(200);
        expect(
          JSON.stringify(parseReductionsResponse(await reductionsResponse.json())),
        ).not.toContain(erased.listing_id);
        const privacyRows = await db.query<{ payload: unknown }>(
          "SELECT payload FROM platform.outbox WHERE event_type='properties.listing.suppressed' AND payload->>'sourceListingId'='SYN-SP-0001'",
        );
        expect(privacyRows).toHaveLength(1);
        const privacy = parsePropertiesListingSuppressed({
          eventId: await transactions.runInTransaction((tx) => identifiers.generate(tx)),
          aggregateId: erased.listing_id,
          occurredAt: suppressionEvent.occurredAt,
          type: 'properties.listing.suppressed',
          version: 1,
          traceContext: null,
          payload: privacyRows[0]!.payload,
        });
        expect(privacy.payload.changes[0]).toMatchObject({
          previousPropertyId: erased.property_id,
          propertyId: surviving.property_id,
        });
        expect(JSON.stringify(privacy)).not.toContain(originalEvent.payload.source.sourceUrl);
        expect(
          await count(
            'SELECT count(*)::integer AS count FROM properties.match_comparison WHERE left_listing_id=$1 OR right_listing_id=$1',
            [erased.listing_id],
          ),
        ).toBe(0);
        expect(
          await count(
            'SELECT count(*)::integer AS count FROM properties.property_minimum_effect WHERE minimum_effect::text LIKE $1',
            [`%${erased.listing_id}%`],
          ),
        ).toBe(0);
        await resolution.execute(signal());
        expect((await property(surviving.property_id)).listings).toHaveLength(1);
        // Fresh services and pruned transport records still use the minimal permanent receipt.
        await db.query(
          "DELETE FROM platform.inbox WHERE consumer_name IN ('properties.listing-suppression','properties.parsed-listing')",
        );
        await broker.close();
        broker = new RabbitMqEventBroker({
          url: `amqp://${fixture.user}:${fixture.password}@127.0.0.1:${rabbit}/rei-suppression-fixture`,
          operationTimeoutMs: 5000,
          handlerTimeoutMs: 5000,
          drainTimeoutMs: 5000,
        });
        await broker.start(signal());
        await new CollectionAuditConsumer(broker, transactions, inbox, audit, authority).start();
        await new ParsedListingConsumer(broker, parsed()).start();
        await new ListingCompletionConsumer(
          broker,
          new ConsumeListingCompletion(collection, history, transactions, inbox),
        ).start();
        await new ListingSuppressionConsumer(broker, suppress()).start();
        delivery = broker;
        await delivery.publish({ ...suppressionEvent, traceContext: null }, signal());
        const delayedNew = {
          ...originalEvent,
          eventId: await transactions.runInTransaction((tx) => identifiers.generate(tx)),
        };
        await delivery.publish(delayedNew, signal());
        await vi.waitFor(
          async () =>
            expect(
              await count(
                "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.parsed-listing' AND event_id=$1",
                [delayedNew.eventId],
              ),
            ).toBe(1),
          { timeout: 10000, interval: 50 },
        );
        await suppress().execute(suppressionEvent, signal());
        await parsed().execute({ ...originalEvent }, signal());
        await parsed().execute(
          {
            ...originalEvent,
            eventId: await transactions.runInTransaction((tx) => identifiers.generate(tx)),
          },
          signal(),
        );
        expect(
          await count(
            "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type='properties.listing.suppressed' AND payload->>'sourceListingId'='SYN-SP-0001'",
          ),
        ).toBe(1);
        await waitErased('SYN-SP-0001');
        await expect(
          parsed().execute(
            {
              ...originalEvent,
              eventId: await transactions.runInTransaction((tx) => identifiers.generate(tx)),
              payload: {
                ...originalEvent.payload,
                source: { ...originalEvent.payload.source, sourceListingId: 'unconfirmed-forged' },
              },
            },
            signal(),
          ),
        ).rejects.toMatchObject({ kind: 'rejected' });
        await db.query(
          "DELETE FROM platform.inbox WHERE consumer_name='audit.collection-events' AND event_id=$1",
          [originalEvent.eventId],
        );
        await delivery.publish(originalEvent, signal());
        await vi.waitFor(
          async () =>
            expect(
              await count(
                "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='audit.collection-events' AND event_id=$1",
                [originalEvent.eventId],
              ),
            ).toBe(1),
          { timeout: 10000, interval: 50 },
        );
        await vi.waitFor(
          async () =>
            expect(
              await count(
                "SELECT count(*)::integer AS count FROM audit.event_log WHERE event_type='collection.listing.suppressed' AND payload->>'sourceListingId'='SYN-SP-0001'",
              ),
            ).toBe(1),
          { timeout: 10000, interval: 50 },
        );
        expect(
          await count(
            "SELECT count(*)::integer AS count FROM audit.event_log WHERE event_type='collection.snapshot.parsed' AND payload->'source'->>'sourceListingId'='SYN-SP-0001'",
          ),
        ).toBe(0);
        await expect(cli('collect-synthetic', 'blocked-after-removal')).rejects.toThrow();
        await expect(cli('remove-listing', 'unknown-source', 'listing-1')).rejects.toThrow();
        await expect(
          cli('remove-listing', 'synthetic-data', 'listing-1', 'extra'),
        ).rejects.toThrow();
        await expect(cli('remove-listing', '../unsafe', 'listing-1')).rejects.toThrow();
        await cli('remove-listing', 'synthetic-data', 'never-observed');
        await cli('remove-listing', 'synthetic-data', 'never-observed');
        expect(
          await count(
            "SELECT count(*)::integer AS count FROM collection.listing_suppression WHERE source_listing_id='never-observed'",
          ),
        ).toBe(1);
        // A physical storage failure keeps progress and identity durable across adapter restart.
        await expect(
          remove({
            delete: async () => {
              throw new Error('controlled deletion failure');
            },
          }).execute('synthetic-data', 'shared-owner', null, signal()),
        ).rejects.toThrow();
        expect(
          await authority.isSuppressed(
            { sourceId: 'synthetic-data', sourceListingId: 'shared-owner' },
            signal(),
          ),
        ).toBe(true);
        expect(
          await count(
            "SELECT count(*)::integer AS count FROM collection.listing_suppression WHERE source_listing_id='shared-owner' AND completed_at IS NULL",
          ),
        ).toBe(1);
        await cli('remove-listing', 'synthetic-data', 'shared-owner');
        await relay();
        await waitErased('shared-owner');
        expect((await http(`properties/${surviving.property_id}`)).status).toBe(404);
        expect((await http(`listings/${surviving.listing_id}`)).status).toBe(404);
        expect(
          parseSearchResponse(await (await http('properties')).json()).items.map((item) => item.id),
        ).toEqual([unrelated.property_id]);
        expect(
          (await property(unrelated.property_id)).listings[0]!.provenance.sourceListingId,
        ).toBe('unrelated');
        await cli('remove-listing', 'synthetic-data', 'unrelated');
        await relay();
        await waitErased('unrelated');
        expect(await objects()).toEqual([]);
        // Pending facts are removed before history materializes them.
        await collect(renamed('pending-only')).execute(
          'synthetic-data',
          'pending-only-run',
          null,
          signal(),
        );
        await relay();
        await vi.waitFor(
          async () =>
            expect(
              await count(
                "SELECT count(*)::integer AS count FROM properties.incoming_fact WHERE source_listing_id='pending-only'",
              ),
            ).toBe(1),
          { timeout: 10000, interval: 50 },
        );
        await cli('remove-listing', 'synthetic-data', 'pending-only');
        await relay();
        await waitErased('pending-only');
        await materialize(0);
        // Chronology can advance before resolution; the privacy event reports only identities.
        const minimalIdentities = ['minimal-first', 'minimal-second', 'minimal-survivor'];
        const minimalSource: ListingSource = {
          fetchPage: async (_id, _cursor, scoped) => {
            const page = await source.fetchPage('synthetic-data', null, scoped);
            return {
              ...page,
              documents: page.documents.flatMap((document) =>
                minimalIdentities.map((identity) => ({
                  ...document,
                  sourceListingId: identity,
                  sourceUrl: `https://synthetic.invalid/${identity}`,
                })),
              ),
            };
          },
          parse: source.parse.bind(source),
        };
        await new CollectSourceRun(
          minimalSource,
          store,
          sources,
          runs,
          transactions,
          identifiers,
          clock,
          outbox,
          undefined,
          authority,
        ).execute('synthetic-data', 'minimal-notifications-run', null, signal());
        await relay();
        await materialize(3);
        const [minimalFirst, minimalSecond, minimalSurvivor] = await identityRows();
        const survivorSnapshot = (
          await db.query<{ snapshot_id: string }>(
            'SELECT snapshot_id::text FROM collection.snapshot_observation WHERE source_listing_id=$1',
            [minimalSurvivor!.source_listing_id],
          )
        )[0]!;
        const correctedPrice = 78_400_000;
        await new ReparseSnapshot(
          {
            parse: async (document) =>
              parseCollectedListing(
                {
                  ...(await source.parse(document, signal())),
                  askingPriceMinorUnits: correctedPrice,
                },
                true,
              ),
          },
          store,
          new PostgresSnapshotReparseRepository(db),
          transactions,
          identifiers,
          clock,
          outbox,
        ).execute(
          survivorSnapshot.snapshot_id,
          'minimal-price-correction',
          'minimal-price-correction',
          null,
          signal(),
        );
        await relay();
        await vi.waitFor(
          async () => {
            await chronology.execute(100, signal());
            expect(
              (await property(minimalFirst!.property_id)).summary.askingPrice?.minorUnits,
            ).toBe(correctedPrice);
          },
          { timeout: 15000, interval: 100 },
        );
        const ahead = (
          await db.query<{
            market_fact: { askingPriceMinorUnits: number };
            input_event_id: string;
            state: ListingChronologyState;
          }>(
            'SELECT assigned.market_fact,assigned.input_event_id::text,current.state FROM properties.listing_assignment assigned JOIN properties.listing_current current USING(listing_id) WHERE assigned.listing_id=$1',
            [minimalSurvivor!.listing_id],
          )
        )[0]!;
        // Corrections replace dated values without advancing the original-acquisition revision.
        const currentAcquisition = ahead.state.acquisitions.at(-1)!;
        expect(ahead.market_fact.askingPriceMinorUnits).toBe(78_500_000);
        expect(currentAcquisition.original.payload.listing.askingPriceMinorUnits).toBe(78_500_000);
        expect(currentAcquisition.original.eventId).toBe(ahead.input_event_id);
        expect(currentAcquisition.corrected?.payload.listing.askingPriceMinorUnits).toBe(
          correctedPrice,
        );
        expect(currentAcquisition.corrected?.eventId).not.toBe(ahead.input_event_id);
        const removeWithoutRelay = async (identity: string) => {
          await remove().execute('synthetic-data', identity, null, signal());
          const row = (
            await db.query<{
              event_id: string;
              aggregate_id: string;
              occurred_at: Date;
              trace_context: TraceContext | null;
              payload: { sourceId: string; sourceListingId: string };
            }>(
              "SELECT event_id::text,aggregate_id::text,occurred_at,trace_context,payload FROM platform.outbox WHERE event_type='collection.listing.suppressed' AND payload->>'sourceListingId'=$1",
              [identity],
            )
          )[0]!;
          const event = {
            eventId: row.event_id,
            aggregateId: row.aggregate_id,
            occurredAt: row.occurred_at.toISOString(),
            traceContext: row.trace_context,
            type: 'collection.listing.suppressed',
            version: 1,
            payload: row.payload,
          };
          await suppress().execute(event, signal());
          return event;
        };
        const firstMinimalCause = await removeWithoutRelay(minimalFirst!.source_listing_id);
        const minimumAhead = (await property(minimalSecond!.property_id)).summary.askingPrice;
        expect(minimumAhead?.minorUnits).toBe(correctedPrice);
        expect(minimumAhead?.provenance.sourceListingId).toBe(minimalSurvivor!.source_listing_id);
        const pendingMinimal = async () => {
          const rows = await db.query<{ event: unknown; published_at: Date | null }>(
            `SELECT jsonb_build_object('eventId',event_id,'aggregateId',aggregate_id,
              'occurredAt',occurred_at,'traceContext',trace_context,'type',event_type,
              'version',event_version,'payload',payload) AS event,published_at
              FROM platform.outbox WHERE event_type='properties.listing.suppressed'
              AND payload->>'sourceListingId'=ANY($1::text[]) ORDER BY event_id`,
            [minimalIdentities],
          );
          return rows.map((row) => ({
            event: parsePropertiesListingSuppressed(row.event),
            publishedAt: row.published_at,
          }));
        };
        const firstNotification = await pendingMinimal();
        expect(firstNotification).toHaveLength(1);
        expect(firstNotification[0]!.publishedAt).toBeNull();
        expect(firstNotification[0]!.event.payload.changes).toEqual([
          {
            previousPropertyId: minimalFirst!.property_id,
            propertyId: minimalSecond!.property_id,
            previousRevision: expect.any(Number),
            revision: expect.any(Number),
          },
        ]);
        const secondMinimalCause = await removeWithoutRelay(minimalSecond!.source_listing_id);
        const bothNotifications = await pendingMinimal();
        expect(bothNotifications).toHaveLength(2);
        expect(bothNotifications.map((row) => row.publishedAt)).toEqual([null, null]);
        expect(bothNotifications[0]!.event).toEqual(firstNotification[0]!.event);
        for (const { event } of bothNotifications) {
          for (const change of event.payload.changes) {
            expect(Object.keys(change).sort()).toEqual([
              'previousPropertyId',
              'previousRevision',
              'propertyId',
              'revision',
            ]);
            expect(change.revision).toBeGreaterThan(change.previousRevision);
          }
          expect(JSON.stringify(event)).not.toContain('askingPriceMinorUnits');
          expect(JSON.stringify(event)).not.toContain('provenance');
          expect(JSON.stringify(event)).not.toContain(minimalSurvivor!.listing_id);
          expect(JSON.stringify(event)).not.toContain(minimalSurvivor!.source_listing_id);
        }
        await db.query(
          "DELETE FROM platform.inbox WHERE consumer_name='properties.listing-suppression'",
        );
        await suppress().execute(firstMinimalCause, signal());
        await suppress().execute(secondMinimalCause, signal());
        expect(await pendingMinimal()).toEqual(bothNotifications);
        await relay();
        await vi.waitFor(
          async () => {
            expect((await pendingMinimal()).every((row) => row.publishedAt !== null)).toBe(true);
          },
          { timeout: 10000, interval: 50 },
        );
        await db.query(
          "DELETE FROM platform.inbox WHERE consumer_name='properties.listing-suppression'",
        );
        await suppress().execute(firstMinimalCause, signal());
        await suppress().execute(secondMinimalCause, signal());
        expect((await pendingMinimal()).map((row) => row.event)).toEqual(
          bothNotifications.map((row) => row.event),
        );
        expect((await property(minimalSurvivor!.property_id)).summary.askingPrice?.minorUnits).toBe(
          correctedPrice,
        );
        await cli('remove-listing', 'synthetic-data', minimalSurvivor!.source_listing_id);
        await relay();
        await waitErased(minimalSurvivor!.source_listing_id);
        // B owns and has validated shared metadata, but has not inserted its observation yet.
        // A must preserve that metadata while erasing its own last committed observation.
        const ownerRaceBytes = Buffer.concat([
          Buffer.from(SYNTHETIC_LISTING_BYTES),
          Buffer.from('\n'),
        ]);
        const ownerRaceSource = (sourceListingId: string): ListingSource => ({
          fetchPage: async () => ({
            documents: [
              {
                sourceId: 'synthetic-data',
                sourceListingId,
                sourceUrl: `https://synthetic.invalid/${sourceListingId}`,
                observedAt: new Date().toISOString(),
                mediaType: 'application/json',
                bytes: ownerRaceBytes,
              },
            ],
            nextCursor: null,
            exhausted: true,
          }),
          parse: source.parse.bind(source),
        });
        const ownerA = await collect(ownerRaceSource('metadata-owner-a')).execute(
          'synthetic-data',
          'metadata-owner-a-run',
          null,
          signal(),
        );
        let metadataRead!: () => void;
        let resumeObservation!: () => void;
        let rawDeletionFinished!: () => void;
        let resumeContentDeletion!: () => void;
        const metadataReady = new Promise<void>((resolve) => {
          metadataRead = resolve;
        });
        const observationBarrier = new Promise<void>((resolve) => {
          resumeObservation = resolve;
        });
        const rawDeletionReady = new Promise<void>((resolve) => {
          rawDeletionFinished = resolve;
        });
        const contentBarrier = new Promise<void>((resolve) => {
          resumeContentDeletion = resolve;
        });
        const leaseClient = db.leaseClient.bind(db);
        const pausedQueries = vi.spyOn(db, 'leaseClient').mockImplementation(async () => {
          const client = await leaseClient();
          return {
            ...client,
            query: async <TRow extends object>(
              sql: string,
              parameters: readonly unknown[] = [],
            ) => {
              const rows = await client.query<TRow>(sql, parameters);
              if (
                sql.includes('FROM collection.raw_object WHERE content_hash = $1') &&
                parameters[0] === ownerA.contentHash
              ) {
                metadataRead();
                await observationBarrier;
              }
              if (sql.startsWith('DELETE FROM collection.raw_object raw')) {
                rawDeletionFinished();
                await contentBarrier;
              }
              return rows;
            },
          };
        });
        try {
          const collectingB = collect(ownerRaceSource('metadata-owner-b')).execute(
            'synthetic-data',
            'metadata-owner-b-run',
            null,
            signal(),
          );
          await metadataReady;
          expect(
            await count(
              "SELECT count(*)::integer AS count FROM collection.snapshot_upload_owner WHERE object_key=$1 AND source_listing_id='metadata-owner-b'",
              [ownerA.objectKey],
            ),
          ).toBe(1);
          expect(
            await count(
              "SELECT count(*)::integer AS count FROM collection.snapshot_observation WHERE source_listing_id='metadata-owner-b'",
            ),
          ).toBe(0);
          const removingA = remove().execute('synthetic-data', 'metadata-owner-a', null, signal());
          await rawDeletionReady;
          resumeObservation();
          const ownerB = await collectingB;
          resumeContentDeletion();
          await removingA;
          expect(
            await count(
              "SELECT count(*)::integer AS count FROM collection.snapshot_observation WHERE source_listing_id='metadata-owner-a'",
            ),
          ).toBe(0);
          expect(
            await count(
              'SELECT count(*)::integer AS count FROM collection.raw_object WHERE object_key=$1',
              [ownerB.objectKey],
            ),
          ).toBe(1);
          expect(
            await count(
              'SELECT count(*)::integer AS count FROM collection.snapshot_content WHERE content_hash=$1',
              [ownerB.contentHash],
            ),
          ).toBe(1);
          const ownerBEvent = parseCollectionEvent(
            (
              await db.query<{ event: unknown }>(
                'SELECT event FROM collection.parsed_event_evidence WHERE snapshot_id=$1',
                [ownerB.snapshotId],
              )
            )[0]!.event,
          );
          if (ownerBEvent.type !== 'collection.snapshot.parsed')
            throw new Error('Expected canonical surviving owner event.');
          expect(
            await facade.getSnapshotMetadata({
              snapshotId: ownerB.snapshotId,
              runId: ownerB.runId,
              sourceId: ownerB.sourceId,
              sourceListingId: 'metadata-owner-b',
              sourceUrl: 'https://synthetic.invalid/metadata-owner-b',
              contentHash: ownerB.contentHash,
              observedAt: ownerBEvent.payload.source.observedAt,
            }),
          ).toMatchObject({ availability: 'available' });
          expect(Buffer.from(await store.read(ownerB.objectKey, signal()))).toEqual(ownerRaceBytes);
        } finally {
          resumeObservation();
          resumeContentDeletion();
          pausedQueries.mockRestore();
        }
        await remove().execute('synthetic-data', 'metadata-owner-b', null, signal());
        expect(await objects()).toEqual([]);
        // An upload prepared before suppression cannot commit an observation after it.
        const lateDocument: RawListingDocument = {
          sourceId: 'synthetic-data',
          sourceListingId: 'prepared-acquisition',
          sourceUrl: 'https://synthetic.invalid/prepared',
          observedAt: new Date().toISOString(),
          mediaType: 'application/json',
          bytes: SYNTHETIC_LISTING_BYTES,
        };
        const lateSource: ListingSource = {
          fetchPage: async () => ({ documents: [lateDocument], nextCursor: null, exhausted: true }),
          parse: source.parse.bind(source),
        };
        let uploaded!: () => void;
        let resume!: () => void;
        const uploadReady = new Promise<void>((resolve) => {
          uploaded = resolve;
        });
        const resumeUpload = new Promise<void>((resolve) => {
          resume = resolve;
        });
        const delayedStore = {
          store: async (
            input: import('../packages/application/dist/index.js').StoreRawSnapshotInput,
            scoped: AbortSignal,
          ) => {
            const stored = await store.store(input, scoped);
            uploaded();
            await resumeUpload;
            return stored;
          },
        };
        const pendingCollection = new CollectSourceOnce(
          lateSource,
          delayedStore,
          sources,
          runs,
          transactions,
          identifiers,
          clock,
          outbox,
          undefined,
          5000,
          authority,
        ).execute('synthetic-data', 'prepared-collection', null, signal());
        const pendingOutcome = pendingCollection.then(
          () => ({ succeeded: true }),
          () => ({ succeeded: false }),
        );
        await uploadReady;
        await remove().execute('synthetic-data', 'prepared-acquisition', null, signal());
        resume();
        expect(await pendingOutcome).toEqual({ succeeded: false });
        expect(
          await count(
            "SELECT count(*)::integer AS count FROM collection.snapshot_observation WHERE source_listing_id='prepared-acquisition'",
          ),
        ).toBe(0);
        // A suppressed discovery still advances the actual portal fixture checkpoint and full manifest.
        const portal = new SyntheticSaoPauloListingSource();
        const discovered = await portal.fetchPage('synthetic-portal-aurora', null, signal());
        const suppressedId = discovered.documents[0]!.sourceListingId;
        await cli('remove-listing', 'synthetic-portal-aurora', suppressedId);
        const run = await new CollectSourceRun(
          portal,
          store,
          sources,
          runs,
          transactions,
          identifiers,
          clock,
          outbox,
          undefined,
          authority,
        ).execute('synthetic-portal-aurora', 'suppressed-portal-run', null, signal());
        expect(run.suppressedCount).toBe(1);
        expect(run.failedCount).toBe(0);
        expect(run.parsedCount).toBe(run.observedCount - 1);
        const runView = await facade.getRun(run.runId);
        expect(runView?.observedSourceListingIds).toContain(suppressedId);
        expect(runView?.manifestHash).toBe(
          hashCollectionManifest(runView!.observedSourceListingIds),
        );
        const completion = (
          await db.query<{ observed_source_listing_ids: string[] }>(
            'SELECT observed_source_listing_ids FROM collection.completed_event_evidence WHERE run_id=$1',
            [run.runId],
          )
        )[0]!;
        expect(completion.observed_source_listing_ids).toEqual(runView!.observedSourceListingIds);
        // Real reservations own explicit listing identity even without an observation, and retain fixed expiry.
        await db.query(`INSERT INTO collection.source_register (source_id,source_label,enabled,collection_allowed,image_fetching_allowed,listing_text_display_allowed,permission_evidence,reviewed_at,source_category,review_outcome,access_method,access_policy,rate_status,rate_limit,rate_window_seconds,licence_status,licence_label,licence_url,enabled_at)
        VALUES ('suppression-local-real','Local generated fixture',true,true,false,false,'Owned local fixture only',clock_timestamp(),'listing','allowed','remote-http','No outside requests','configured',100,1,'licensed','Local fixture','https://fixture.invalid/licence',clock_timestamp())`);
        const safeBytes = Buffer.from(
          JSON.stringify({
            ...parseCollectedListing(JSON.parse(Buffer.from(SYNTHETIC_LISTING_BYTES).toString())),
            imageFingerprints: [],
          }),
        );
        const realInput = {
          sourceId: 'suppression-local-real',
          sourceListingId: 'orphan-before-observation',
          synthetic: false,
          acquisitionId: 'real-reservation-owned',
          mediaType: 'application/json' as const,
          bytes: safeBytes,
        };
        const real = await store.store(realInput, signal());
        const ciphertext = await sdk.send(
          new GetObjectCommand({ Bucket: fixture.bucket, Key: real.objectKey }),
          { abortSignal: signal() },
        );
        const cipherBytes = await ciphertext.Body!.transformToByteArray();
        const generation = (
          await db.query<{ collected_at: Date; expires_at: Date }>(
            'SELECT collected_at,expires_at FROM collection.snapshot_generation WHERE object_key=$1',
            [real.objectKey],
          )
        )[0]!;
        expect(generation.expires_at.valueOf() - generation.collected_at.valueOf()).toBe(
          SNAPSHOT_RETENTION_MS,
        );
        const cancelled = new AbortController();
        await expect(
          remove({
            delete: async () => {
              cancelled.abort(new Error('controlled interruption'));
              throw cancelled.signal.reason;
            },
          }).execute(realInput.sourceId, realInput.sourceListingId, null, cancelled.signal),
        ).rejects.toThrow();
        await expect(store.read(real.objectKey, signal())).rejects.toMatchObject({
          kind: 'rejected',
        });
        await expect(store.store(realInput, signal())).rejects.toMatchObject({ kind: 'rejected' });
        await remove().execute(realInput.sourceId, realInput.sourceListingId, null, signal());
        expect(await objects()).not.toContain(real.objectKey);
        expect(
          (
            await db.query<{ expires_at: Date }>(
              'SELECT expires_at FROM collection.snapshot_generation WHERE object_key=$1',
              [real.objectKey],
            )
          )[0]!.expires_at,
        ).toEqual(generation.expires_at);
        await sdk.send(
          new PutObjectCommand({ Bucket: fixture.bucket, Key: real.objectKey, Body: cipherBytes }),
          { abortSignal: signal() },
        );
        now = Math.max(now, Date.now()) + 200;
        await new ExpireSnapshots(lifecycle, store, clock).expire(100, signal());
        expect(await objects()).not.toContain(real.objectKey);
        // Synthetic late writes use the same retention cycle without deleting surviving portal owners.
        await sdk.send(
          new PutObjectCommand({
            Bucket: fixture.bucket,
            Key: original.object_key,
            Body: SYNTHETIC_LISTING_BYTES,
          }),
          { abortSignal: signal() },
        );
        now = Math.max(now, Date.now()) + 200;
        await new ExpireSnapshots(lifecycle, store, clock).expire(100, signal());
        expect(await objects()).not.toContain(original.object_key);
        expect(
          await count(
            `SELECT count(*)::integer AS count FROM collection.snapshot_observation observation JOIN collection.collection_run run USING(run_id) WHERE run.source_id='synthetic-portal-aurora'`,
          ),
        ).toBe(run.parsedCount);
        await relay();
        console.log(
          'Listing suppression campaign passed: actual CLI, durable single-event replay, owner-safe erasure, delayed audit, reparse/acquisition races, suppressed manifests, deletion failure/resume, cancellation, unexpired owned orphan and real/synthetic late-write reconciliation.',
        );
      },
      async () =>
        cleanupAll(
          async () => {
            await broker?.close();
          },
          async () => {
            await connection?.close();
          },
          async () => {
            sdk.destroy();
            for (const store of stores) store.destroy();
          },
          async () => {
            await compose('down', '--volumes', '--remove-orphans');
          },
        ),
    );
  });
});
