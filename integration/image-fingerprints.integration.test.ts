import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import nock from 'nock';
import { expect, test, vi } from 'vitest';
import { ResilientListingSource } from '../apps/worker/dist/collection/resilient-listing-source.js';
import { CollectionAuditConsumer } from '../apps/worker/dist/collection/collection-audit.consumer.js';
import {
  CollectSourceOnce,
  CollectSourceRun,
  ConsumeParsedListing,
  ReparseSnapshot,
  type ListingSource,
  type RawListingDocument,
} from '../packages/application/dist/index.js';
import {
  CollectionSnapshotAcquired,
  CollectionSnapshotPerceptuallyCorrected,
  parseCollectedListing,
  parseCollectionEvent,
  Property,
} from '../packages/domain/dist/index.js';
import {
  CanonicalSnapshotSanitizer,
  DatabaseConnection,
  HttpListingPhoto,
  SharpImageFingerprint,
  PostgresAuditEventLog,
  PostgresInbox,
  PostgresPropertyRepository,
  PostgresListingHistoryRepository,
  PostgresLocationsFacade,
  PostgresCollectionRunRepository,
  PostgresCollectionFacade,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  PostgresSnapshotReparseRepository,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
} from '../packages/infrastructure/dist/index.js';
import { ComposeFixture, allocatePorts, cleanupAll, preserveCleanup } from './support/fixture.ts';

const requireInfrastructure = createRequire(
  new URL('../packages/infrastructure/package.json', import.meta.url),
);
const sharp = requireInfrastructure(
  'sharp',
) as typeof import('../packages/infrastructure/node_modules/sharp/lib/index.js');
const { S3Client, GetObjectCommand, ListObjectsV2Command } = requireInfrastructure(
  '@aws-sdk/client-s3',
) as typeof import('@aws-sdk/client-s3');

test('permitted/denied photo acquisition, atomic failure recovery and acquisition-free reparse retain exact durable evidence', async () => {
  const [postgres, minio, consolePort, rabbit, management] = await allocatePorts(5);
  const credentials = {
    user: 'rei_image_fixture',
    password: 'rei-image-local-fixture',
    database: 'rei_image_fixture',
  };
  const fixture = new ComposeFixture(`rei-image-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    POSTGRES_USER: credentials.user,
    POSTGRES_PASSWORD: credentials.password,
    POSTGRES_DB: credentials.database,
    MINIO_ROOT_USER: credentials.user,
    MINIO_ROOT_PASSWORD: credentials.password,
    MINIO_API_PORT: String(minio),
    MINIO_CONSOLE_PORT: String(consolePort),
    RABBITMQ_USER: credentials.user,
    RABBITMQ_PASSWORD: credentials.password,
    RABBITMQ_VHOST: 'rei-image-fixture',
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    SNAPSHOT_ENCRYPTION_KEY_ID: '',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: '',
  });
  let connection: DatabaseConnection | undefined;
  let store: S3RawSnapshotStore | undefined;
  let broker: RabbitMqEventBroker | undefined;
  const sdk = new S3Client({
    endpoint: `http://127.0.0.1:${minio}`,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: credentials.user, secretAccessKey: credentials.password },
    maxAttempts: 1,
  });
  await preserveCleanup(
    async () => {
      await fixture.up(['--build', 'postgres', 'migrations', 'minio', 'rabbitmq']);
      const url = new URL(`postgres://127.0.0.1:${postgres}/${credentials.database}`);
      url.username = credentials.user;
      url.password = credentials.password;
      connection = new DatabaseConnection(url.toString());
      const db = connection;
      const transactions = new PostgresTransactionRunner(db);
      const identifiers = new PostgresUuidV7Generator(db);
      const outbox = new PostgresOutbox(db);
      const runs = new PostgresCollectionRunRepository(db);
      const register = new PostgresSourceRegisterRepository(db);
      const clock = { now: () => new Date().toISOString() };
      const bucket = 'rei-image-fixture';
      store = new S3RawSnapshotStore({
        endpoint: `http://127.0.0.1:${minio}`,
        region: 'us-east-1',
        bucket,
        accessKeyId: credentials.user,
        secretAccessKey: credentials.password,
        lifecycle: new PostgresSnapshotLifecycle(db),
        clock,
        encryption: { keyId: 'image-fixture-key', keyBase64: randomBytes(32).toString('base64') },
      });
      const snapshots = store;
      await db.query(`INSERT INTO collection.source_register
      (source_id,source_label,enabled,enabled_at,collection_allowed,image_fetching_allowed,listing_text_display_allowed,permission_evidence,
       reviewed_at,source_category,review_outcome,access_method,access_policy,rate_status,rate_limit,rate_window_seconds,licence_status,licence_label,licence_url)
      VALUES ('image-fixture','Owned photograph fixture',true,clock_timestamp(),true,true,false,'Local synthetic HTTP only',
       clock_timestamp(),'listing','allowed','remote-http','Explicit synthetic origins','configured',1,1,'licensed','Fixture','https://listing-fixture.invalid/licence')`);
      const canonical = {
        ...parseCollectedListing(JSON.parse(Buffer.from(SYNTHETIC_LISTING_BYTES).toString())),
        imageFingerprints: [],
      };
      const origin = 'https://photographs-fixture.invalid';
      const photoUrls = ['/one.png', '/one.png', '/two.webp', '/three.jpg', '/unselected.png'].map(
        (path) => origin + path,
      );
      let listingId = 'permitted';
      let pages = 0;
      const adapter = new HttpListingPhoto([origin], new SharpImageFingerprint());
      const source: ListingSource = {
        async fetchPage(sourceId, _cursor, signal) {
          signal.throwIfAborted();
          pages++;
          const document: RawListingDocument = {
            sourceId,
            sourceListingId: listingId,
            sourceUrl: 'https://listing-fixture.invalid/listings/' + listingId,
            observedAt: clock.now(),
            mediaType: 'application/json',
            bytes: Buffer.from(JSON.stringify(canonical)),
            photoUrls,
          };
          return { documents: [document], nextCursor: null, exhausted: true };
        },
        async parse(document, signal) {
          signal.throwIfAborted();
          return parseCollectedListing(
            JSON.parse(Buffer.from(document.bytes).toString()),
            true,
            true,
          );
        },
        fingerprintPhoto: adapter.fingerprintPhoto.bind(adapter),
      };
      const resilient = new ResilientListingSource(source, register);
      const once = new CollectSourceOnce(
        resilient,
        snapshots,
        register,
        runs,
        transactions,
        identifiers,
        clock,
        outbox,
        new CanonicalSnapshotSanitizer(),
      );
      const resumable = new CollectSourceRun(
        resilient,
        snapshots,
        register,
        runs,
        transactions,
        identifiers,
        clock,
        outbox,
        new CanonicalSnapshotSanitizer(),
      );
      const photo = sharp(Buffer.from(Array.from({ length: 72 }, (_, i) => (i % 9) * 30)), {
        raw: { width: 9, height: 8, channels: 1 },
      });
      const png = await photo.clone().png().toBuffer();
      const webp = await photo.clone().webp().toBuffer();
      const jpeg = await photo.clone().jpeg().toBuffer();
      const requests: { path: string; time: number }[] = [];
      const scope = nock(origin);
      for (const [path, bytes, type] of [
        ['/one.png', png, 'image/png'],
        ['/two.webp', webp, 'image/webp'],
        ['/three.jpg', jpeg, 'image/jpeg'],
      ] as const)
        scope.get(path).reply(() => {
          requests.push({ path, time: Date.now() });
          return [200, bytes, { 'content-type': type }];
        });
      const start = Date.now();
      const result = await once.execute(
        'image-fixture',
        'permitted',
        null,
        AbortSignal.timeout(30_000),
        Date.now() + 30_000,
      );
      scope.done();
      expect(requests.map((request) => request.path)).toEqual([
        '/one.png',
        '/two.webp',
        '/three.jpg',
      ]);
      expect(requests[0]!.time - start).toBeGreaterThanOrEqual(900);
      expect(requests[1]!.time - requests[0]!.time).toBeGreaterThanOrEqual(900);
      expect(requests[2]!.time - requests[1]!.time).toBeGreaterThanOrEqual(900);
      const acquired = await db.query<{ image_fingerprints: unknown }>(
        'SELECT image_fingerprints FROM collection.snapshot_observation WHERE snapshot_id=$1',
        [result.snapshotId],
      );
      const hashes = Array(3).fill('dhash64-v1:ffffffffffffffff');
      expect(acquired[0]!.image_fingerprints).toEqual(hashes);
      const retained = await db.query<{ event: unknown }>(
        'SELECT event FROM collection.parsed_event_evidence WHERE event_id=$1',
        [result.parsedEventId],
      );
      const event = parseCollectionEvent(retained[0]!.event);
      expect(event).toBeInstanceOf(CollectionSnapshotAcquired);
      if (!(event instanceof CollectionSnapshotAcquired)) throw new Error('Expected acquisition.');
      expect(event.payload.listing.imageFingerprints).toEqual(hashes);
      const originalBytes = await snapshots.read(result.objectKey, AbortSignal.timeout(5_000));
      expect(Buffer.from(originalBytes).toString()).toBe(JSON.stringify(canonical));
      expect(JSON.stringify(retained)).not.toContain(origin);
      const objects = await sdk.send(new ListObjectsV2Command({ Bucket: bucket }));
      expect(objects.KeyCount).toBe(1);
      const rawObject = await sdk.send(
        new GetObjectCommand({ Bucket: bucket, Key: result.objectKey }),
      );
      expect(Buffer.from(await rawObject.Body!.transformToByteArray()).includes(png)).toBe(false);

      await db.query(
        "UPDATE collection.source_register SET image_fetching_allowed=false WHERE source_id='image-fixture'",
      );
      listingId = 'denied';
      await resumable.execute(
        'image-fixture',
        'denied',
        null,
        AbortSignal.timeout(30_000),
        Date.now() + 30_000,
      );
      expect(requests).toHaveLength(3);
      const denied = await db.query<{ image_fingerprints: unknown; event_version: number }>(
        `SELECT observation.image_fingerprints, evidence.event_version FROM collection.snapshot_observation observation JOIN collection.parsed_event_evidence evidence USING (snapshot_id) WHERE source_listing_id='denied'`,
      );
      expect(denied).toEqual([{ image_fingerprints: [], event_version: 3 }]);

      await db.query(
        "UPDATE collection.source_register SET image_fetching_allowed=true WHERE source_id='image-fixture'",
      );
      listingId = 'recovery';
      nock(origin).get('/one.png').reply(200, png, { 'content-type': 'image/png' });
      nock(origin).get('/two.webp').reply(200, 'corrupt media', { 'content-type': 'image/webp' });
      await expect(
        resumable.execute(
          'image-fixture',
          'recovery',
          null,
          AbortSignal.timeout(30_000),
          Date.now() + 30_000,
        ),
      ).rejects.toMatchObject({ kind: 'rejected', operation: 'collection.source.photo' });
      expect(
        await db.query(
          "SELECT * FROM collection.snapshot_observation WHERE source_listing_id='recovery'",
        ),
      ).toEqual([]);
      expect(
        await db.query(
          "SELECT * FROM platform.outbox WHERE payload->'source'->>'sourceListingId'='recovery'",
        ),
      ).toEqual([]);
      const failedRun = await runs.loadRunByOperationKey('recovery');
      expect(failedRun?.checkpoint.ordinal).toBe(0);
      for (const path of ['/one.png', '/two.webp', '/three.jpg'])
        nock(origin).get(path).reply(200, png, { 'content-type': 'image/png' });
      expect(
        (
          await resumable.execute(
            'image-fixture',
            'recovery',
            null,
            AbortSignal.timeout(30_000),
            Date.now() + 30_000,
          )
        ).status,
      ).toBe('completed');

      const pageCount = pages;
      const beforeReparse = JSON.stringify(
        await db.query(
          "SELECT to_jsonb(observation)-'correction_order' AS observation FROM collection.snapshot_observation observation ORDER BY snapshot_id",
        ),
      );
      const reparse = new ReparseSnapshot(
        {
          parse: async (document, signal) => ({
            ...(await source.parse(document, signal)),
            bedrooms: 3,
            imageFingerprints: ['invented'],
          }),
        },
        { read: snapshots.read.bind(snapshots) },
        new PostgresSnapshotReparseRepository(db),
        transactions,
        identifiers,
        clock,
        outbox,
        new CanonicalSnapshotSanitizer(),
      );
      const correction = await reparse.execute(
        result.snapshotId,
        'image-parser-2',
        'image-correction',
        null,
        AbortSignal.timeout(15_000),
      );
      expect(
        (
          await reparse.execute(
            result.snapshotId,
            'image-parser-2',
            'image-correction',
            null,
            AbortSignal.timeout(15_000),
          )
        ).replayed,
      ).toBe(true);
      expect(pages).toBe(pageCount);
      const corrected = parseCollectionEvent(
        (
          await db.query<{ event: unknown }>(
            'SELECT event FROM collection.parsed_event_evidence WHERE event_id=$1',
            [correction.eventId],
          )
        )[0]!.event,
      );
      expect(corrected).toBeInstanceOf(CollectionSnapshotPerceptuallyCorrected);
      if (!(corrected instanceof CollectionSnapshotPerceptuallyCorrected))
        throw new Error('Expected correction.');
      expect(corrected.payload.listing.imageFingerprints).toEqual(hashes);
      expect(corrected.payload.listing.bedrooms).toBe(3);
      // Reparse may advance correction_order but cannot rewrite original hashes or acquisition identity.
      const afterReparse = await db.query<{ image_fingerprints: unknown }>(
        'SELECT image_fingerprints FROM collection.snapshot_observation WHERE snapshot_id=$1',
        [result.snapshotId],
      );
      expect(afterReparse[0]!.image_fingerprints).toEqual(hashes);
      expect(
        JSON.stringify(
          await db.query(
            "SELECT to_jsonb(observation)-'correction_order' AS observation FROM collection.snapshot_observation observation ORDER BY snapshot_id",
          ),
        ),
      ).toBe(beforeReparse);
      // Use the existing owned fixture gate for authenticated downstream property work.
      await db.query(
        "UPDATE collection.source_register SET image_fetching_allowed=true WHERE source_id='synthetic-data'",
      );
      listingId = 'synthetic-perceptual';
      for (const path of ['/one.png', '/two.webp', '/three.jpg'])
        nock(origin).get(path).reply(200, png, { 'content-type': 'image/png' });
      const synthetic = await once.execute(
        'synthetic-data',
        'synthetic-perceptual',
        null,
        AbortSignal.timeout(30_000),
        Date.now() + 30_000,
      );
      const syntheticCorrection = await reparse.execute(
        synthetic.snapshotId,
        'image-parser-2',
        'synthetic-correction',
        null,
        AbortSignal.timeout(15_000),
      );
      const facade = new PostgresCollectionFacade(db, register);
      const history = new PostgresListingHistoryRepository(db);
      const consume = new ConsumeParsedListing(
        facade,
        new PostgresLocationsFacade(db),
        new PostgresPropertyRepository(db),
        transactions,
        new PostgresInbox(db),
        history,
      );
      const syntheticEvents = await transactions.runInTransaction(async (transaction) => {
        const acquisitions = await facade.getRunListingFacts(
          transaction,
          synthetic.runId,
          'synthetic-perceptual',
        );
        const corrections = await facade.getSnapshotCorrections(transaction, synthetic.snapshotId);
        expect(acquisitions.map((fact) => fact.version)).toEqual([3]);
        expect(corrections.map((fact) => fact.version)).toEqual([4]);
        expect(corrections[0]!.eventId).toBe(syntheticCorrection.eventId);
        return [...acquisitions, ...corrections];
      });
      for (const fact of syntheticEvents)
        await consume.execute({ ...fact }, AbortSignal.timeout(10_000));
      expect(
        await db.query(
          `SELECT fact.event_version, disposition.disposition FROM properties.incoming_fact fact JOIN properties.fact_disposition disposition USING(event_id) ORDER BY fact.event_version`,
        ),
      ).toEqual([
        { event_version: 3, disposition: 'pending-history' },
        { event_version: 4, disposition: 'pending-correction' },
      ]);
      await transactions.runInTransaction(async (transaction) => {
        const original = syntheticEvents[0]!;
        const resolved = await new PostgresLocationsFacade(db).resolveFixtureAddress(
          original.payload.listing.location,
          transaction,
        );
        if (!resolved) throw new Error('Fixture place missing.');
        const property = new Property(
          await identifiers.generate(transaction),
          await identifiers.generate(transaction),
          original,
          resolved,
        );
        await new PostgresPropertyRepository(db).create(transaction, property);
      });
      expect(
        await history.pendingOriginalIdentities('synthetic-data', 10, AbortSignal.timeout(10_000)),
      ).toEqual(['synthetic-perceptual']);
      expect(
        (await history.pendingCorrections('synthetic-data', 10, AbortSignal.timeout(10_000))).map(
          (fact) => fact.version,
        ),
      ).toEqual([4]);
      // Every persisted row is inspectable JSON; no photo URL, compressed bytes or decoder metadata escapes.
      for (const table of [
        'snapshot_observation',
        'parsed_event_evidence',
        'snapshot_content',
        'snapshot_generation',
        'raw_object',
      ]) {
        const rows = await db.query(`SELECT row_to_json(t) AS row FROM collection.${table} t`);
        expect(JSON.stringify(rows)).not.toMatch(
          /photographs-fixture|one\.png|two\.webp|three\.jpg|exif|icc|orientation/i,
        );
      }
      expect(JSON.stringify(await db.query('SELECT * FROM platform.outbox'))).not.toContain(origin);
      broker = new RabbitMqEventBroker({
        url: `amqp://${credentials.user}:${credentials.password}@127.0.0.1:${rabbit}/rei-image-fixture`,
        operationTimeoutMs: 5_000,
        handlerTimeoutMs: 5_000,
        drainTimeoutMs: 5_000,
      });
      await broker.start(AbortSignal.timeout(15_000));
      await new CollectionAuditConsumer(
        broker,
        transactions,
        new PostgresInbox(db),
        new PostgresAuditEventLog(db),
      ).start();
      const expectedPublications = await db.query<{ event_id: string }>(
        'SELECT event_id::text FROM platform.outbox ORDER BY event_id',
      );
      const publications: string[] = [];
      // A claim admits only the next unpublished event per aggregate; drain causal batches.
      while (true) {
        const batch = await outbox.claimPending(25, 10_000);
        if (batch.length === 0) break;
        for (const row of batch) {
          await broker.publish(
            parseCollectionEvent({
              eventId: row.eventId,
              type: row.type,
              version: row.version,
              aggregateId: row.aggregateId,
              occurredAt: row.occurredAt,
              traceContext: row.traceContext,
              payload: row.payload,
            }),
            AbortSignal.timeout(10_000),
          );
          await outbox.markPublished(row.eventId, row.claimId);
          publications.push(row.eventId);
        }
      }
      expect(publications.sort()).toEqual(expectedPublications.map((row) => row.event_id));
      await vi.waitFor(
        async () =>
          expect(
            (
              await db.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM audit.event_log',
              )
            )[0]!.count,
          ).toBe(publications.length),
        { timeout: 10_000, interval: 50 },
      );
      expect(
        await db.query('SELECT event_id::text FROM audit.event_log ORDER BY event_id'),
      ).toEqual(expectedPublications);
      expect(
        (
          await db.query<{ event_version: number }>(
            'SELECT event_version FROM audit.event_log WHERE event_id=$1',
            [correction.eventId],
          )
        )[0]!.event_version,
      ).toBe(4);
    },
    () =>
      cleanupAll(
        async () => {
          await broker?.close();
        },
        async () => {
          store?.destroy();
          sdk.destroy();
        },
        async () => {
          await connection?.close();
        },
        () => fixture.down(),
      ),
  );
});
