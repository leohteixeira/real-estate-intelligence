import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
import { ResilientRawSnapshotStore } from '../apps/worker/dist/collection/resilient-raw-snapshot-store.js';
import { SnapshotRetentionJob } from '../apps/worker/dist/collection/snapshot-retention.job.js';
import type { RawListingDocument } from '../packages/application/dist/index.js';
import {
  CollectSourceOnce,
  CollectSourceRun,
  ExpireSnapshots,
  ExternalFailure,
  SNAPSHOT_RETENTION_MS,
} from '../packages/application/dist/index.js';
import type { CollectionSnapshotParsed } from '../packages/domain/dist/index.js';
import { hashCollectionManifest, parseCollectedListing } from '../packages/domain/dist/index.js';
import {
  CanonicalSnapshotSanitizer,
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
test('snapshot-lifecycle preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const requireInfrastructure = createRequire(
      new URL('../packages/infrastructure/package.json', import.meta.url),
    );
    const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } =
      requireInfrastructure('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');
    const executeFile = command;
    const project = `rei-snapshot-lifecycle-${process.pid}`;
    const fixture = {
      user: 'rei_snapshot_fixture',
      password: 'rei-snapshot-local-fixture',
      database: 'rei_snapshot_fixture',
      bucket: 'rei-snapshot-fixture',
    };
    const SOURCE = 'privacy-fixture';
    const key = { keyId: 'local-fixture-key', keyBase64: randomBytes(32).toString('base64') };
    const signal = () => AbortSignal.timeout(15000);
    const ports = allocatePorts;
    const [postgres, minio, consolePort, rabbit, management] = await ports(5);
    const environment = {
      ...process.env,
      COMPOSE_FILE: 'compose.yaml',
      COMPOSE_PROJECT_NAME: project,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      COMPOSE_PROFILES: '',
      NODE_ENV: 'test',
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
      RABBITMQ_VHOST: 'rei-snapshot-fixture',
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
    const sdk = new S3Client({
      endpoint: storageConfig.endpoint,
      region: storageConfig.region,
      forcePathStyle: true,
      credentials: { accessKeyId: fixture.user, secretAccessKey: fixture.password },
      maxAttempts: 1,
    });
    const raw = async (objectKey: string | undefined) => {
      const result = await sdk.send(
        new GetObjectCommand({ Bucket: fixture.bucket, Key: objectKey }),
        {
          abortSignal: signal(),
        },
      );
      return result!.Body!.transformToByteArray();
    };
    const absent = async (objectKey: string | undefined) => {
      await expect(
        sdk.send(new HeadObjectCommand({ Bucket: fixture.bucket, Key: objectKey }), {
          abortSignal: signal(),
        }),
      ).rejects.toSatisfy(
        (error: { $metadata: { httpStatusCode: number } }) =>
          error.$metadata?.httpStatusCode === 404,
      );
    };
    let connection: DatabaseConnection;
    const stores: S3RawSnapshotStore[] = [];
    {
      let cleanupPrimary8: unknown;
      let cleanupPrimaryThrown8 = false;
      try {
        await compose('up', '--detach', '--wait', 'postgres', 'minio', 'rabbitmq');
        connection = new DatabaseConnection(databaseUrl);
        const migrationDirectory = new URL('../migrations/', import.meta.url);
        const migrations = (await readdir(migrationDirectory))
          .filter((name) => name.endsWith('.sql'))
          .sort();
        for (const migration of migrations.filter((name) => !/^(400[67]|4012)_/.test(name))) {
          await connection.query(await readFile(new URL(migration, migrationDirectory), 'utf8'));
        }
        // A pre-4006 synthetic identity survives the upgrade exactly, without an encryption key.
        const synthetic = new S3RawSnapshotStore(storageConfig);
        stores.push(synthetic);
        const legacy = await synthetic.store(
          {
            sourceId: 'synthetic-data',
            mediaType: 'application/json' as const,
            synthetic: true,
            bytes: SYNTHETIC_LISTING_BYTES,
          },
          signal(),
        );
        const legacyRuns = await connection.query<{ run_id: string }>(
          `INSERT INTO collection.collection_run
    (operation_key, source_id, status, started_at, completed_at, observed_count, parsed_count,
     changed_count, suppressed_count, failed_count, manifest_hash, completed_event_id, checkpoint_ordinal, checkpointed_at)
    VALUES ('legacy-snapshot','synthetic-data','completed',clock_timestamp(),clock_timestamp(),1,1,0,0,0,$1,uuidv7(),1,clock_timestamp()) RETURNING run_id::text`,
          [hashCollectionManifest(['legacy-listing'])],
        );
        await connection.query(
          `INSERT INTO collection.raw_object (content_hash,object_key,byte_length,media_type,synthetic) VALUES ($1,$2,$3,$4,true)`,
          [legacy.contentHash, legacy.objectKey, legacy.byteLength, legacy.mediaType],
        );
        const observations = await connection.query<{ snapshot_id: string }>(
          `INSERT INTO collection.snapshot_observation
    (run_id,content_hash,source_listing_id,source_url,observed_at,parsed_event_id,outcome,changed)
    VALUES ($1,$2,'legacy-listing','https://synthetic.invalid/listings/legacy',clock_timestamp(),uuidv7(),'parsed',false)
    RETURNING snapshot_id::text`,
          [legacyRuns![0]!.run_id, legacy.contentHash],
        );
        await connection.query(
          await readFile(
            new URL('4006_collection_add_snapshot_lifecycle.sql', migrationDirectory),
            'utf8',
          ),
        );
        await connection.query(
          await readFile(
            new URL('4007_collection_add_snapshot_reparse.sql', migrationDirectory),
            'utf8',
          ),
        );
        // Suppression builds on lifecycle/reparse; apply it after the legacy upgrade fixtures.
        await connection.query(
          await readFile(
            new URL('4012_collection_add_listing_suppression.sql', migrationDirectory),
            'utf8',
          ),
        );
        const upgraded = await new PostgresCollectionRunRepository(connection).findByOperationKey(
          'legacy-snapshot',
          signal(),
        );
        expect(upgraded!.snapshotId).toBe(observations![0]!.snapshot_id);
        expect(upgraded!.contentHash).toBe(legacy.contentHash);
        expect(upgraded!.objectKey).toBe(legacy.objectKey);
        // This register entry exists only in the isolated campaign database. No adapter performs HTTP.
        await connection.query(
          `INSERT INTO collection.source_register
    (source_id,source_label,enabled,collection_allowed,image_fetching_allowed,listing_text_display_allowed,
     permission_evidence,reviewed_at,source_category,review_outcome,access_method,access_policy,
     rate_status,rate_limit,rate_window_seconds,licence_status,licence_label,licence_url,enabled_at)
    VALUES ($1,'Isolated canonical privacy fixture',true,true,false,false,'Local generated test fixture only',clock_timestamp(),
      'listing','allowed','remote-http','No external requests; in-process canonical fixture',
      'configured',100,1,'licensed','Local test fixture','https://fixture.invalid/licence',clock_timestamp())`,
          [SOURCE],
        );
        let now = Date.now();
        const clock = {
          now: () => new Date(now).toISOString(),
        };
        const lifecycle = new PostgresSnapshotLifecycle(connection);
        const adapter = new S3RawSnapshotStore({
          ...storageConfig,
          lifecycle,
          encryption: key,
          clock,
          reconciliationIntervalMs: 100,
        });
        stores.push(adapter);
        const store = new ResilientRawSnapshotStore(adapter);
        const privateListing = {
          ...parseCollectedListing(JSON.parse(Buffer.from(SYNTHETIC_LISTING_BYTES).toString())),
          location: {
            city: 'S\u00E3o Paulo',
            stateCode: 'SP',
            neighborhood: 'Centro',
            street: 'Rua Exemplo',
            unit: 'secret-unit',
            complement: 'secret-complement',
          },
          advertiser: {
            type: 'private' as const,
            agencyName: 'Maria Private',
            name: 'Maria Private',
            email: 'private@example.test',
            cpf: '123.456.789-01',
            creci: '12345-F',
          },
          maskedDescription:
            'Maria Private offers an apartment. private@example.test +55 (11) 99999-8888 123.456.789-01 https://contact.invalid CRECI 12345-F CRECI-SP 12345-F +1 (202) 555-0123 +33 (0)1 23 45 67 89 / 01 23 45 67 89 Beatriz Confidential CRECI n\u00BA 12345-F CRECI n\u00B0 12345-F CRECI: 123.456-F 06.12.34.56.78 +33 6.12.34.56.78 CRECI N.\u00BA 12345-F CRECI n\u00B0: 12345-F 0800 123 4567 0800-123-4567 +34 612 345 678 +351 912 345 678 CRECI (SP) 12345-F CRECI N\u00BA. 54321-F',
          features: [
            'balcony',
            'Maria Private +55 (11) 99999-8888',
            'CRECI-SP 12345-F +1 (202) 555-0123',
            '+33 (0)1 23 45 67 89 / 01 23 45 67 89',
            'Beatriz Confidential CRECI n\u00BA 12345-F CRECI n\u00B0 12345-F CRECI: 123.456-F',

            '06.12.34.56.78 +33 6.12.34.56.78 CRECI N.\u00BA 12345-F CRECI n\u00B0: 12345-F',
            '0800 123 4567 0800-123-4567 +34 612 345 678 +351 912 345 678 CRECI (SP) 12345-F CRECI N\u00BA. 54321-F',
          ],
          imageFingerprints: [`sha256:${'a'.repeat(64)}`],
          photos: ['secret-photo'],
          contact: { firstName: 'Beatriz', lastName: 'Confidential' },
          unknown: 'secret-unknown',
        };
        const document = {
          sourceId: SOURCE,
          sourceListingId: 'listing-1',
          sourceUrl: 'https://fixture.invalid/listings/1?email=private@example.test#Maria',
          observedAt: clock.now(),
          mediaType: 'application/json' as const,
          bytes: Buffer.from(JSON.stringify(privateListing)),
        };
        const sanitizer = new CanonicalSnapshotSanitizer();
        const sanitized = sanitizer.sanitize(document);
        let fetches = 0;
        const parserInputs: RawListingDocument[] = [];
        let rejectParser = false;
        const source = {
          fetchPage: async (
            _sourceId: string,
            _cursor: string | null,
            attempt: { throwIfAborted: () => void },
          ) => {
            attempt.throwIfAborted();
            fetches++;
            return { documents: [document], nextCursor: null, exhausted: true };
          },
          parse: async (input: RawListingDocument, attempt: { throwIfAborted: () => void }) => {
            attempt.throwIfAborted();
            parserInputs.push(input);
            if (rejectParser)
              throw new ExternalFailure({ kind: 'rejected', operation: 'fixture.parse' });
            return {
              ...privateListing,
              parserContact: { firstName: 'Daniela', lastName: 'Restricted' },
              maskedDescription: `${privateListing.maskedDescription} Daniela Restricted`,
            };
          },
        };
        const register = new PostgresSourceRegisterRepository(connection);
        const runs = new PostgresCollectionRunRepository(connection);
        const transactions = new PostgresTransactionRunner(connection);
        const identifiers = new PostgresUuidV7Generator(connection);
        const outbox = new PostgresOutbox(connection);
        const once = new CollectSourceOnce(
          source,
          store,
          register,
          runs,
          transactions,
          identifiers,
          clock,
          outbox,
          sanitizer,
        );
        const resumable = new CollectSourceRun(
          source,
          store,
          register,
          runs,
          transactions,
          identifiers,
          clock,
          outbox,
          sanitizer,
        );
        const concurrent = await Promise.all([
          once.execute(SOURCE, 'private-once', null, signal()),
          once.execute(SOURCE, 'private-once', null, signal()),
        ]);
        expect(concurrent[0].objectKey).toBe(concurrent[1].objectKey);
        expect(concurrent.filter((result) => result.replayed).length).toBe(1);

        const completed = concurrent[0];
        const resumableResult = await resumable.execute(
          SOURCE,
          'private-resumable',
          null,
          signal(),
        );
        expect(resumableResult.status).toBe('completed');
        const storedCiphertext = await raw(completed.objectKey);
        expect(Buffer.from(storedCiphertext).toString().includes('apartment')).toBe(false);
        expect(Buffer.from(await store.read(completed.objectKey, signal()))).toStrictEqual(
          Buffer.from(sanitized.document.bytes),
        );
        const sqlPrivacy = await connection.query<{
          source_listing_id: string;
          source_url: string;
          content_hash: string;
          object_key: string;
        }>(
          `SELECT source_listing_id,source_url,content_hash,object_key FROM collection.snapshot_observation`,
        );
        const events = await connection.query<{ payload: CollectionSnapshotParsed['payload'] }>(
          'SELECT payload FROM platform.outbox',
        );
        const decryptedSnapshot = Buffer.from(
          await store.read(completed.objectKey, signal()),
        ).toString();
        const allPersisted =
          decryptedSnapshot +
          JSON.stringify(sqlPrivacy) +
          JSON.stringify(events) +
          parserInputs
            .map((input) => Buffer.from(input.bytes).toString() + input.sourceUrl)
            .join('');
        for (const forbidden of [
          'Maria Private',
          'private@example.test',
          '99999',
          '123.456.789-01',
          'secret-',
          'contact.invalid',
          '12345-F',
          'CRECI-SP',
          '+1 (202) 555-0123',
          '555-0123',
          '+33 (0)1 23 45 67 89',
          '01 23 45 67 89',
          '23 45 67 89',
          'Beatriz',
          'Confidential',
          'Daniela',
          'Restricted',
          'CRECI n\u00BA',
          'CRECI n\u00B0',
          '456-F',
          '06.12.34.56.78',
          '+33 6.12.34.56.78',
          '6.12.34.56.78',
          'CRECI N.\u00BA',
          'CRECI n\u00B0:',
          '0800 123 4567',
          '0800-123-4567',
          '+34 612 345 678',
          '+351 912 345 678',
          'CRECI (SP)',
          'CRECI N\u00BA.',
          '54321-F',
        ])
          expect(
            allPersisted.includes(forbidden),
            `Privacy projection retained prohibited fixture data: ${forbidden}`,
          ).toBe(false);
        const storedListing = parseCollectedListing(JSON.parse(decryptedSnapshot));
        expect(storedListing.areaSquareMeters).toBe(privateListing.areaSquareMeters);
        expect(storedListing.features.includes('balcony')).toBeTruthy();
        expect(events.length).toBe(4);
        // An upload that fails parsing remains reserved and is included in expiry scans.
        rejectParser = true;
        await expect(once.execute(SOURCE, 'private-orphan', null, signal())).rejects.toMatchObject({
          kind: 'rejected',
        });
        rejectParser = false;
        const orphanRows = await connection.query<{ object_key: string }>(
          `SELECT object_key FROM collection.snapshot_generation WHERE available AND object_key NOT IN (SELECT object_key FROM collection.snapshot_observation)`,
        );
        expect(orphanRows.length).toBe(1);
        const orphanKey = orphanRows![0]!.object_key;
        now += 60 * 60 * 1000;
        const independent = await once.execute(SOURCE, 'private-independent', null, signal());
        expect(independent.contentHash).toBe(completed.contentHash);
        expect(independent.objectKey).not.toBe(completed.objectKey);
        // Wrong keys, identity swaps and tampering fail closed even with plausible object metadata.
        const wrongKey = new S3RawSnapshotStore({
          ...storageConfig,
          lifecycle,
          clock,
          encryption: { ...key, keyBase64: randomBytes(32).toString('base64') },
        });
        stores.push(wrongKey);
        await expect(wrongKey.read(completed.objectKey, signal())).rejects.toMatchObject({
          kind: 'rejected',
        });
        const unknownKey = new S3RawSnapshotStore({
          ...storageConfig,
          lifecycle,
          clock,
          encryption: { ...key, keyId: 'unknown-key' },
        });
        stores.push(unknownKey);
        await expect(unknownKey.read(completed.objectKey, signal())).rejects.toMatchObject({
          kind: 'rejected',
        });
        await sdk.send(
          new PutObjectCommand({ Bucket: fixture.bucket, Key: orphanKey, Body: storedCiphertext }),
          { abortSignal: signal() },
        );
        await expect(store.read(orphanKey, signal())).rejects.toMatchObject({ kind: 'rejected' });
        await sdk.send(
          new PutObjectCommand({
            Bucket: fixture.bucket,
            Key: orphanKey,
            Body: Buffer.from('tampered'),
          }),
          { abortSignal: signal() },
        );
        await expect(store.read(orphanKey, signal())).rejects.toMatchObject({ kind: 'rejected' });
        const generation = (
          await connection.query<{
            object_key: string;
            content_hash: string;
            acquisition_scope: string;
            key_id: string;
            collected_at: Date;
            expires_at: Date;
            next_reconciliation_at: Date | null;
            available: boolean;
            deleted: boolean;
            selection_order: string;
          }>('SELECT * FROM collection.snapshot_generation WHERE object_key = $1', [
            completed.objectKey,
          ])
        )[0];
        const originalExpiry = generation!.expires_at.valueOf();
        now = originalExpiry - 1;
        expect(Buffer.from(await store.read(completed.objectKey, signal()))).toStrictEqual(
          Buffer.from(sanitized.document.bytes),
        );
        await store.store(
          {
            sourceId: SOURCE,
            sourceListingId: document.sourceListingId,
            synthetic: false,
            acquisitionId: JSON.stringify(['private-once', SOURCE, document.sourceListingId]),
            mediaType: 'application/json' as const,
            bytes: sanitized.document.bytes,
          },
          signal(),
        );
        expect(
          (
            await connection.query<{ expires_at: Date }>(
              'SELECT expires_at FROM collection.snapshot_generation WHERE object_key = $1',
              [completed.objectKey],
            )
          )[0]!.expires_at.valueOf(),
        ).toBe(originalExpiry);
        now = originalExpiry;
        expect(originalExpiry - generation!.collected_at.valueOf()).toBe(SNAPSHOT_RETENTION_MS);
        await expect(store.read(completed.objectKey, signal())).rejects.toMatchObject({
          kind: 'rejected',
        });
        await expect(
          store.store(
            {
              sourceId: SOURCE,
              sourceListingId: document.sourceListingId,
              synthetic: false,
              acquisitionId: JSON.stringify(['private-once', SOURCE, document.sourceListingId]),
              mediaType: 'application/json' as const,
              bytes: sanitized.document.bytes,
            },
            signal(),
          ),
        ).rejects.toMatchObject({ kind: 'rejected' });
        // A failed deletion is not confirmed. A restart after physical deletion resumes idempotently.
        const originalDelete = adapter.delete.bind(adapter);
        adapter.delete = async () => {
          throw new ExternalFailure({ kind: 'transient', operation: 'raw-snapshot.delete' });
        };
        const retention = new ExpireSnapshots(lifecycle, store, clock);
        const job = new SnapshotRetentionJob(retention);
        const workerSettings = {
          OBJECT_STORE_ENDPOINT: storageConfig.endpoint,
          OBJECT_STORE_REGION: storageConfig.region,
          OBJECT_STORE_BUCKET: storageConfig.bucket,
          OBJECT_STORE_ACCESS_KEY_ID: fixture.user,
          OBJECT_STORE_SECRET_ACCESS_KEY: fixture.password,
          SNAPSHOT_RETENTION_BATCH_SIZE: '100',
          SNAPSHOT_RETENTION_INTERVAL_MS: '100',
          SNAPSHOT_RETENTION_CYCLE_TIMEOUT_MS: '1000',
          SNAPSHOT_ENCRYPTION_KEY_ID: key.keyId,
          SNAPSHOT_ENCRYPTION_KEY_BASE64: key.keyBase64,
        };
        const savedSettings = Object.fromEntries(
          Object.keys(workerSettings).map((name) => [name, process.env[name]]),
        );
        Object.assign(process.env, workerSettings);
        {
          let cleanupPrimary4: unknown;
          let cleanupPrimaryThrown4 = false;
          try {
            await job.runCycle(signal());
            expect(
              (
                await connection.query<{ deleted: boolean }>(
                  'SELECT deleted FROM collection.snapshot_generation WHERE object_key = $1',
                  [completed.objectKey],
                )
              )[0]!.deleted,
            ).toBe(false);
            adapter.delete = originalDelete;
            await sdk.send(new DeleteObjectCommand({ Bucket: fixture.bucket, Key: orphanKey }), {
              abortSignal: signal(),
            });
            // Restart uses a new pool, lifecycle and storage adapter while retaining reservations/history.
            const restartedConnection = new DatabaseConnection(databaseUrl);
            const restartedLifecycle = new PostgresSnapshotLifecycle(restartedConnection);
            const restartedAdapter = new S3RawSnapshotStore({
              ...storageConfig,
              encryption: key,
              clock,
              lifecycle: restartedLifecycle,
              reconciliationIntervalMs: 100,
            });
            stores.push(restartedAdapter);
            const restartedJob = new SnapshotRetentionJob(
              new ExpireSnapshots(
                restartedLifecycle,
                new ResilientRawSnapshotStore(restartedAdapter),
                clock,
              ),
            );
            {
              let cleanupPrimary1: unknown;
              let cleanupPrimaryThrown1 = false;
              try {
                restartedJob.start();
                await vi.waitFor(
                  async () => {
                    expect(
                      (
                        await restartedConnection.query<{ deleted: boolean }>(
                          'SELECT deleted FROM collection.snapshot_generation WHERE object_key = $1',
                          [orphanKey],
                        )
                      )[0]!.deleted === true,
                      'Immediate worker expiry did not converge',
                    ).toBeTruthy();
                  },
                  { timeout: 5000, interval: 20 },
                );
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
                        await restartedJob.stop();
                      },
                      async () => {
                        await restartedConnection.close();
                      },
                    );
                  },
                );
              }
            }
            // Cycle boundaries may differ by milliseconds across first acquisitions.
            now = originalExpiry + 1000;
            await job.runCycle(signal());
            await absent(completed.objectKey);
            await absent(orphanKey);
            expect(Buffer.from(await store.read(independent.objectKey, signal()))).toStrictEqual(
              Buffer.from(sanitized.document.bytes),
            );
            const countBefore = fetches;
            expect((await once.execute(SOURCE, 'private-once', null, signal())).replayed).toBe(
              true,
            );
            expect(
              (await resumable.execute(SOURCE, 'private-resumable', null, signal())).manifestHash,
            ).toBe(resumableResult.manifestHash);
            expect(fetches).toBe(countBefore);
            expect(
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM platform.outbox',
                )
              )[0]!.count,
            ).toBe(6);
            expect(Buffer.from(await synthetic.read(legacy.objectKey, signal()))).toStrictEqual(
              Buffer.from(SYNTHETIC_LISTING_BYTES),
            );
            const missingKey = new S3RawSnapshotStore({ ...storageConfig, lifecycle, clock });
            stores.push(missingKey);
            await expect(
              missingKey.store(
                {
                  sourceId: SOURCE,
                  sourceListingId: document.sourceListingId,
                  synthetic: false,
                  acquisitionId: 'missing-key',
                  mediaType: 'application/json' as const,
                  bytes: sanitized.document.bytes,
                },
                signal(),
              ),
            ).rejects.toMatchObject({ kind: 'forbidden' });
            now = (
              await connection.query<{ expires_at: Date }>(
                'SELECT expires_at FROM collection.snapshot_generation WHERE object_key = $1',
                [independent.objectKey],
              )
            )[0]!.expires_at.valueOf();
            await Promise.all([
              job.runCycle(signal()),
              adapter.delete(independent.objectKey, signal()),
            ]);
            await absent(independent.objectKey);
            // The database independently rejects an expired reference, even from a bypassed caller.
            const expiredScope = 'c'.repeat(64);
            const expiredKey = `real/${expiredScope}/sha256/${independent.contentHash.slice(7)}.aead`;
            const collectedAt = Date.now() - SNAPSHOT_RETENTION_MS - 1000;
            await connection.query<{
              content_hash: string;
              byte_length: number;
              media_type: string;
              true: string;
            }>(
              `INSERT INTO collection.snapshot_generation
      (object_key,acquisition_scope,source_id,content_hash,byte_length,media_type,key_id,collected_at,expires_at,available)
      SELECT $1,$2,$3,content_hash,byte_length,media_type,$4,$5,$6,true
      FROM collection.snapshot_content WHERE content_hash = $7`,
              [
                expiredKey,
                expiredScope,
                SOURCE,
                key.keyId,
                new Date(collectedAt).toISOString(),
                new Date(collectedAt + SNAPSHOT_RETENTION_MS).toISOString(),
                independent.contentHash,
              ],
            );
            await expect(
              connection.query(
                `INSERT INTO collection.snapshot_observation
      (run_id,content_hash,object_key,source_listing_id,source_url,observed_at,parsed_event_id,outcome,changed)
      VALUES ($1,$2,$3,'expired-commit-fixture','https://fixture.invalid/listings/expired',clock_timestamp(),uuidv7(),'parsed',false)`,
                [completed.runId, independent.contentHash, expiredKey],
              ),
            ).rejects.toThrow(/Real snapshot generation is unavailable/);
            await expect(
              connection.query(
                `UPDATE collection.snapshot_generation SET expires_at = expires_at + interval '1 hour' WHERE object_key = $1`,
                [completed.objectKey],
              ),
            ).rejects.toThrow(/metadata is immutable/);
            await expect(
              connection.query(
                'UPDATE collection.snapshot_generation SET deleted = false WHERE object_key = $1',
                [completed.objectKey],
              ),
            ).rejects.toThrow(/metadata is immutable/);
            await job.runCycle(signal());
            expect(
              (
                await connection.query<{ deleted: boolean }>(
                  'SELECT deleted FROM collection.snapshot_generation WHERE object_key = $1',
                  [expiredKey],
                )
              )[0]!.deleted,
            ).toBe(true);
            expect(
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM collection.snapshot_observation',
                )
              )[0]!.count,
            ).toBe(4);
            // Reproduce the actual PostgreSQL abort/lock-release race with a late server-side PUT.
            // The SDK seam delays the remote commit independently of its cancelled client signal.
            let lateNow = Date.now();
            const lateClock = { now: () => new Date(lateNow).toISOString() };
            const lateAdapter = new S3RawSnapshotStore({
              ...storageConfig,
              encryption: key,
              lifecycle,
              clock: lateClock,
              reconciliationIntervalMs: 100,
            });
            stores.push(lateAdapter);
            const originalSend = S3Client.prototype.send;
            let releasePut: () => void;
            const putGate = new Promise<void>((resolve) => {
              releasePut = resolve;
            });
            let putStarted: () => void;
            const startedPut = new Promise<void>((resolve) => {
              putStarted = resolve;
            });
            let latePut: Promise<unknown> | undefined;
            Reflect.set(
              S3Client.prototype,
              'send',
              function (this: InstanceType<typeof S3Client>, command: unknown, options: unknown) {
                if (command instanceof PutObjectCommand) {
                  S3Client.prototype.send = originalSend;
                  latePut = (async () => {
                    putStarted();

                    await putGate;
                    // The remote server is free to commit after its client has cancelled.
                    return Reflect.apply(originalSend, this, [command, { abortSignal: signal() }]);
                  })();
                  return latePut;
                }
                return Reflect.apply(originalSend, this, [command, options]);
              },
            );
            const aborted = new AbortController();
            const pendingStore = lateAdapter.store(
              {
                sourceId: SOURCE,
                sourceListingId: document.sourceListingId,
                synthetic: false,
                acquisitionId: 'late-aborted-put',
                mediaType: 'application/json' as const,
                bytes: sanitized.document.bytes,
              },
              aborted.signal,
            );
            // Attach the rejection assertion before aborting to avoid an unhandled rejection.
            const cancelledStore = expect(pendingStore).rejects.toMatchObject({
              kind: 'cancelled',
            });
            {
              let cleanupPrimary3: unknown;
              let cleanupPrimaryThrown3 = false;
              try {
                await startedPut;
                aborted.abort();
                await cancelledStore;
                const lateGeneration = (
                  await connection.query<{
                    object_key: string;
                    content_hash: string;
                    acquisition_scope: string;
                    key_id: string;
                    collected_at: Date;
                    expires_at: Date;
                    next_reconciliation_at: Date | null;
                    available: boolean;
                    deleted: boolean;
                    selection_order: string;
                  }>(
                    'SELECT * FROM collection.snapshot_generation WHERE NOT available AND NOT deleted',
                  )
                )[0];
                expect(
                  lateGeneration,
                  'Cancelled PUT must retain its durable reservation',
                ).toBeTruthy();
                lateNow = lateGeneration!.expires_at.valueOf();
                await lateAdapter.delete(lateGeneration!.object_key, signal());
                releasePut!();
                await latePut;
                await sdk.send(
                  new HeadObjectCommand({
                    Bucket: fixture.bucket,
                    Key: lateGeneration!.object_key,
                  }),
                  { abortSignal: signal() },
                );
                await expect(
                  lateAdapter.read(lateGeneration!.object_key, signal()),
                ).rejects.toMatchObject({
                  kind: 'rejected',
                });
                // A fresh pool proves scheduling survived cancellation and restart.
                const lateConnection = new DatabaseConnection(databaseUrl);
                {
                  let cleanupPrimary2: unknown;
                  let cleanupPrimaryThrown2 = false;
                  try {
                    const lateLifecycle = new PostgresSnapshotLifecycle(lateConnection);
                    const reconciliation = new S3RawSnapshotStore({
                      ...storageConfig,
                      encryption: key,
                      lifecycle: lateLifecycle,
                      clock: lateClock,
                      reconciliationIntervalMs: 100,
                    });
                    stores.push(reconciliation);
                    const due = await lateLifecycle.listExpired(lateClock.now(), 100, signal());
                    expect(due.includes(lateGeneration!.object_key)).toBe(false);
                    // Earlier acquisition assertions intentionally advanced their separate clock by an hour.
                    // Move this isolated clock beyond every retained due schedule to exercise the full queue.
                    lateNow = Math.max(
                      lateNow + 100,
                      (
                        await lateConnection.query<{ due_at: Date }>(
                          'SELECT max(COALESCE(next_reconciliation_at, expires_at)) AS due_at FROM collection.snapshot_generation',
                        )
                      )[0]!.due_at.valueOf(),
                    );
                    const dueAfterRestart = await lateLifecycle.listExpired(
                      lateClock.now(),
                      100,
                      signal(),
                    );
                    expect(
                      dueAfterRestart.length > 1,
                      'Batch progression must include prior tombstones',
                    ).toBeTruthy();
                    expect(dueAfterRestart.includes(lateGeneration!.object_key)).toBeTruthy();
                    const boundedRetention = new ExpireSnapshots(
                      lateLifecycle,
                      reconciliation,
                      lateClock,
                    );
                    for (let batch = 0; batch < dueAfterRestart.length; batch++)
                      expect(await boundedRetention.expire(1, signal())).toBe(1);
                    expect(await boundedRetention.expire(1, signal())).toBe(0);
                    await absent(lateGeneration!.object_key);
                    const final = (
                      await lateConnection.query<{
                        object_key: string;
                        content_hash: string;
                        acquisition_scope: string;
                        key_id: string;
                        collected_at: Date;
                        expires_at: Date;
                        next_reconciliation_at: Date | null;
                        available: boolean;
                        deleted: boolean;
                        selection_order: string;
                      }>('SELECT * FROM collection.snapshot_generation WHERE object_key = $1', [
                        lateGeneration!.object_key,
                      ])
                    )[0];
                    expect(final!.deleted).toBe(true);
                    expect(final!.available).toBe(false);
                    expect(final!.expires_at.valueOf()).toBe(lateGeneration!.expires_at.valueOf());
                    expect(final!.next_reconciliation_at!.valueOf()).toBe(lateNow + 100);
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
                        await cleanupAll(async () => {
                          await lateConnection.close();
                        });
                      },
                    );
                  }
                }
              } catch (error) {
                cleanupPrimary3 = error;
                cleanupPrimaryThrown3 = true;
                throw error;
              } finally {
                await preserveCleanup(
                  async () => {
                    if (cleanupPrimaryThrown3) throw cleanupPrimary3;
                  },
                  async () => {
                    await cleanupAll(
                      async () => {
                        S3Client.prototype.send = originalSend;
                      },
                      async () => {
                        releasePut();
                      },
                      async () => {
                        if (latePut) await latePut;
                      },
                    );
                  },
                );
              }
            }
          } catch (error) {
            cleanupPrimary4 = error;
            cleanupPrimaryThrown4 = true;
            throw error;
          } finally {
            await preserveCleanup(
              async () => {
                if (cleanupPrimaryThrown4) throw cleanupPrimary4;
              },
              async () => {
                await cleanupAll(
                  async () => {
                    await job.stop();
                  },
                  async () => {
                    for (const [name, value] of Object.entries(savedSettings)) {
                      if (value === undefined) delete process.env[name];
                      else process.env[name] = value;
                    }
                  },
                );
              },
            );
          }
        }
        // Selection priority advances before an attempt, independently of due timestamps and the clock.
        let fairNow = Math.max(
          Date.now(),
          (
            await connection.query<{ due_at: Date }>(
              'SELECT max(COALESCE(next_reconciliation_at, expires_at)) AS due_at FROM collection.snapshot_generation',
            )
          )[0]!.due_at.valueOf(),
        );
        const fairClock = { now: () => new Date(fairNow).toISOString() };
        const fairConnection = new DatabaseConnection(databaseUrl);
        let fairConnectionClosed = false;
        {
          let cleanupPrimary6: unknown;
          let cleanupPrimaryThrown6 = false;
          try {
            const fairLifecycle = new PostgresSnapshotLifecycle(fairConnection);
            const fairStore = new S3RawSnapshotStore({
              ...storageConfig,
              encryption: key,
              lifecycle: fairLifecycle,
              clock: fairClock,
              reconciliationIntervalMs: 100,
            });
            stores.push(fairStore);
            const cohort = await Promise.all(
              ['one', 'two', 'three', 'four'].map((name) =>
                fairStore.store(
                  {
                    sourceId: SOURCE,
                    sourceListingId: document.sourceListingId,
                    synthetic: false,
                    acquisitionId: `fair-selection-${name}`,
                    mediaType: 'application/json' as const,
                    bytes: sanitized.document.bytes,
                  },
                  signal(),
                ),
              ),
            );
            // Reconcile the older campaign cohort immediately before the new cohort's fixed deadline.
            fairNow += SNAPSHOT_RETENTION_MS - 1;
            await new ExpireSnapshots(
              fairLifecycle,

              fairStore,
              fairClock,
            ).expire(100, signal());
            fairNow++;
            const keys = cohort.map((snapshot) => snapshot.objectKey).sort();
            const failingKey = keys[0];
            const cancelledKey = keys[1];
            const deleteOriginal = fairStore.delete.bind(fairStore);
            const attempts: (string | undefined)[] = [];
            fairStore.delete = async (objectKey: string, attempt: AbortSignal) => {
              attempts.push(objectKey);
              if (objectKey === failingKey)
                throw new ExternalFailure({ kind: 'transient', operation: 'raw-snapshot.delete' });
              return deleteOriginal(objectKey, attempt);
            };
            const fairRetention = new ExpireSnapshots(fairLifecycle, fairStore, fairClock);
            await expect(fairRetention.expire(1, signal())).rejects.toMatchObject({
              kind: 'exhausted',
            });
            expect(attempts).toStrictEqual([failingKey]);
            const beforeCancellation = (
              await fairConnection.query<{
                selection_order: string;
                deleted: string;
                available: string;
                next_reconciliation_at: string;
              }>(
                'SELECT selection_order,deleted,available,next_reconciliation_at FROM collection.snapshot_generation WHERE object_key = $1',
                [cancelledKey],
              )
            )[0];
            const controller = new AbortController();
            const listOriginal = fairLifecycle.listExpired.bind(fairLifecycle);
            fairLifecycle.listExpired = async (
              ...args: Parameters<typeof fairLifecycle.listExpired>
            ) => {
              const selected = await listOriginal(...args);
              expect(selected).toStrictEqual([cancelledKey]);
              controller.abort();
              return selected;
            };
            await expect(fairRetention.expire(1, controller.signal)).rejects.toThrow();
            expect(attempts).toStrictEqual([failingKey]);
            const afterCancellation = (
              await fairConnection.query<{
                selection_order: string;
                deleted: string;
                available: string;
                next_reconciliation_at: string;
              }>(
                'SELECT selection_order,deleted,available,next_reconciliation_at FROM collection.snapshot_generation WHERE object_key = $1',
                [cancelledKey],
              )
            )[0];

            expect(
              BigInt(afterCancellation!.selection_order) >
                BigInt(beforeCancellation!.selection_order),
            ).toBeTruthy();
            expect(afterCancellation!.deleted).toBe(beforeCancellation!.deleted);
            expect(afterCancellation!.available).toBe(beforeCancellation!.available);
            expect(afterCancellation!.next_reconciliation_at).toBe(
              beforeCancellation!.next_reconciliation_at,
            );
            await fairConnection.close();
            fairConnectionClosed = true;
            // A fresh pool must preserve both failed and cancelled selection priority at the same clock.
            const restartConnection = new DatabaseConnection(databaseUrl);
            {
              let cleanupPrimary5: unknown;
              let cleanupPrimaryThrown5 = false;
              try {
                const restartLifecycle = new PostgresSnapshotLifecycle(restartConnection);
                const restartStore = new S3RawSnapshotStore({
                  ...storageConfig,
                  encryption: key,
                  lifecycle: restartLifecycle,
                  clock: fairClock,
                  reconciliationIntervalMs: 100,
                });
                stores.push(restartStore);
                const restartDelete = restartStore.delete.bind(restartStore);
                let fail = true;
                restartStore.delete = async (objectKey: string, attempt: AbortSignal) => {
                  attempts.push(objectKey);
                  if (objectKey === failingKey && fail)
                    throw new ExternalFailure({
                      kind: 'transient',
                      operation: 'raw-snapshot.delete',
                    });
                  return restartDelete(objectKey, attempt);
                };
                const restartRetention = new ExpireSnapshots(
                  restartLifecycle,
                  restartStore,
                  fairClock,
                );
                for (const healthyKey of keys.slice(2)) {
                  expect(await restartRetention.expire(1, signal())).toBe(1);
                  await absent(healthyKey);
                }
                await expect(restartRetention.expire(1, signal())).rejects.toMatchObject({
                  kind: 'exhausted',
                });
                expect(await restartRetention.expire(1, signal())).toBe(1);
                await absent(cancelledKey);
                expect(
                  (
                    await restartConnection.query<{ deleted: boolean }>(
                      'SELECT deleted FROM collection.snapshot_generation WHERE object_key = $1',
                      [failingKey],
                    )
                  )[0]!.deleted,
                ).toBe(false);
                expect((await raw(failingKey)).byteLength > 0).toBeTruthy();
                expect(attempts).toStrictEqual([
                  failingKey,
                  ...keys.slice(2),
                  failingKey,
                  cancelledKey,
                ]);
                fail = false;
                expect(await restartRetention.expire(1, signal())).toBe(1);
                await absent(failingKey);
                expect(await restartRetention.expire(1, signal())).toBe(0);
                for (const snapshot of cohort) {
                  const final = (
                    await restartConnection.query<{
                      collected_at: Date;
                      expires_at: Date;
                      deleted: boolean;
                      available: boolean;
                    }>(
                      'SELECT collected_at,expires_at,deleted,available FROM collection.snapshot_generation WHERE object_key = $1',
                      [snapshot.objectKey],
                    )
                  )[0];
                  expect(final!.deleted).toBe(true);
                  expect(final!.available).toBe(false);
                  expect(final!.expires_at.valueOf() - final!.collected_at.valueOf()).toBe(
                    SNAPSHOT_RETENTION_MS,
                  );
                }
              } catch (error) {
                cleanupPrimary5 = error;
                cleanupPrimaryThrown5 = true;
                throw error;
              } finally {
                await preserveCleanup(
                  async () => {
                    if (cleanupPrimaryThrown5) throw cleanupPrimary5;
                  },
                  async () => {
                    await cleanupAll(async () => {
                      await restartConnection.close();
                    });
                  },
                );
              }
            }
          } catch (error) {
            cleanupPrimary6 = error;
            cleanupPrimaryThrown6 = true;
            throw error;
          } finally {
            await preserveCleanup(
              async () => {
                if (cleanupPrimaryThrown6) throw cleanupPrimary6;
              },
              async () => {
                await cleanupAll(async () => {
                  if (!fairConnectionClosed) await fairConnection.close();
                });
              },
            );
          }
        }
        // A cohort fits the configured batch, but only the next attempt may advance its priority.
        // The actual worker deadline cancels a slow deletion; later peers must progress at this clock.
        let incrementalNow = Date.now();
        const incrementalClock = { now: () => new Date(incrementalNow).toISOString() };
        const incrementalSettings = {
          ...workerSettings,
          SNAPSHOT_RETENTION_BATCH_SIZE: '3',
        };
        const savedIncrementalSettings = Object.fromEntries(
          Object.keys(incrementalSettings).map((name) => [name, process.env[name]]),
        );
        Object.assign(process.env, incrementalSettings);
        let incrementalConnection = new DatabaseConnection(databaseUrl);
        {
          let cleanupPrimary7: unknown;
          let cleanupPrimaryThrown7 = false;
          try {
            const incrementalLifecycle = new PostgresSnapshotLifecycle(incrementalConnection);
            const incrementalAdapter = new S3RawSnapshotStore({
              ...storageConfig,
              encryption: key,
              lifecycle: incrementalLifecycle,
              clock: incrementalClock,
              reconciliationIntervalMs: 100,
            });
            stores.push(incrementalAdapter);
            const cohort = await Promise.all(
              ['one', 'two', 'three'].map((name) =>
                incrementalAdapter.store(
                  {
                    sourceId: SOURCE,
                    sourceListingId: document.sourceListingId,
                    synthetic: false,
                    acquisitionId: `incremental-selection-${name}`,
                    mediaType: 'application/json' as const,
                    bytes: sanitized.document.bytes,
                  },
                  signal(),
                ),
              ),
            );
            incrementalNow += SNAPSHOT_RETENTION_MS - 1;
            await new ExpireSnapshots(
              incrementalLifecycle,
              incrementalAdapter,
              incrementalClock,
            ).expire(100, signal());
            incrementalNow++;
            const keys = cohort.map((snapshot) => snapshot.objectKey).sort();
            const slowKey = keys[0];
            const cancelledKey = keys[1];
            const attempts: string[] = [];
            const before = await incrementalConnection.query<{
              object_key: string;
              content_hash: string;
              acquisition_scope: string;
              key_id: string;
              collected_at: Date;
              expires_at: Date;
              next_reconciliation_at: Date | null;
              available: boolean;
              deleted: boolean;
              selection_order: string;
            }>(
              'SELECT * FROM collection.snapshot_generation WHERE object_key = ANY($1::text[]) ORDER BY object_key',
              [keys],
            );
            const deleteOriginal = incrementalAdapter.delete.bind(incrementalAdapter);
            incrementalAdapter.delete = async (objectKey: string, attempt: AbortSignal) => {
              attempts.push(objectKey!);
              if (objectKey === slowKey) {
                attempt.throwIfAborted();
                await new Promise((_resolve, reject) => {
                  attempt.addEventListener('abort', () => reject(attempt.reason), { once: true });
                });
              }
              return deleteOriginal(objectKey, attempt);
            };
            const incrementalJob = new SnapshotRetentionJob(
              new ExpireSnapshots(
                incrementalLifecycle,
                new ResilientRawSnapshotStore(incrementalAdapter),
                incrementalClock,
              ),
            );
            await incrementalJob.runCycle(signal());
            expect(attempts).toStrictEqual([slowKey]);
            const afterTimeout = await incrementalConnection.query<{
              object_key: string;
              content_hash: string;
              acquisition_scope: string;
              key_id: string;
              collected_at: Date;
              expires_at: Date;
              next_reconciliation_at: Date | null;
              available: boolean;
              deleted: boolean;
              selection_order: string;
            }>(
              'SELECT * FROM collection.snapshot_generation WHERE object_key = ANY($1::text[]) ORDER BY object_key',
              [keys],
            );
            expect(
              BigInt(afterTimeout![0]!.selection_order) > BigInt(before![0]!.selection_order),
            ).toBeTruthy();
            for (let index = 0; index < keys.length; index++) {
              const row = afterTimeout[index];
              const prior = before[index];
              if (index > 0) expect(row!.selection_order).toBe(prior!.selection_order);
              for (const field of [
                'available',
                'deleted',
                'content_hash',
                'acquisition_scope',
                'key_id',
              ] as const)
                expect(row![field]).toBe(prior![field]);
              expect(row!.collected_at.valueOf()).toBe(prior!.collected_at.valueOf());
              expect(row!.expires_at.valueOf()).toBe(prior!.expires_at.valueOf());
              expect(row!.next_reconciliation_at).toBe(prior!.next_reconciliation_at);
              expect((await raw(row!.object_key)).byteLength > 0).toBeTruthy();
              await expect(
                incrementalAdapter.read(row!.object_key, signal()),
              ).rejects.toMatchObject({
                kind: 'rejected',
              });
            }
            await incrementalConnection.close();
            incrementalConnection = new DatabaseConnection(databaseUrl);
            const cancellationLifecycle = new PostgresSnapshotLifecycle(incrementalConnection);
            const cancellationAdapter = new S3RawSnapshotStore({
              ...storageConfig,
              encryption: key,
              lifecycle: cancellationLifecycle,
              clock: incrementalClock,
              reconciliationIntervalMs: 100,
            });
            stores.push(cancellationAdapter);
            const cancelled = new AbortController();
            const selectOriginal = cancellationLifecycle.listExpired.bind(cancellationLifecycle);
            cancellationLifecycle.listExpired = async (
              now,

              limit,
              attempt,
            ) => {
              expect(limit).toBe(1);
              const selected = await selectOriginal(now, limit, attempt);
              expect(selected).toStrictEqual([cancelledKey]);
              cancelled.abort();
              return selected;
            };
            const cancellationDelete = cancellationAdapter.delete.bind(cancellationAdapter);
            cancellationAdapter.delete = async (
              ...args: Parameters<typeof cancellationAdapter.delete>
            ) => {
              attempts.push(args[0]);
              return cancellationDelete(...args);
            };
            await new SnapshotRetentionJob(
              new ExpireSnapshots(
                cancellationLifecycle,
                new ResilientRawSnapshotStore(cancellationAdapter),
                incrementalClock,
              ),
            ).runCycle(cancelled.signal);
            expect(attempts).toStrictEqual([slowKey]);
            const afterSelection = (
              await incrementalConnection.query<{
                object_key: string;
                content_hash: string;
                acquisition_scope: string;
                key_id: string;
                collected_at: Date;
                expires_at: Date;
                next_reconciliation_at: Date | null;
                available: boolean;
                deleted: boolean;
                selection_order: string;
              }>('SELECT * FROM collection.snapshot_generation WHERE object_key = $1', [
                cancelledKey,
              ])
            )[0];
            expect(
              BigInt(afterSelection!.selection_order) > BigInt(afterTimeout![1]!.selection_order),
            ).toBeTruthy();
            expect(afterSelection!.available).toBe(true);
            expect(afterSelection!.deleted).toBe(false);
            expect(afterSelection!.next_reconciliation_at).toBe(null);
            expect(afterSelection!.expires_at.valueOf()).toBe(before![1]!.expires_at.valueOf());
            await incrementalConnection.close();
            incrementalConnection = new DatabaseConnection(databaseUrl);
            const restartLifecycle = new PostgresSnapshotLifecycle(incrementalConnection);
            const restartAdapter = new S3RawSnapshotStore({
              ...storageConfig,
              encryption: key,
              lifecycle: restartLifecycle,
              clock: incrementalClock,
              reconciliationIntervalMs: 100,
            });
            stores.push(restartAdapter);
            const restartDelete = restartAdapter.delete.bind(restartAdapter);
            let slow = true;
            restartAdapter.delete = async (objectKey: string, attempt: AbortSignal) => {
              attempts.push(objectKey!);
              if (objectKey === slowKey && slow) {
                attempt.throwIfAborted();
                await new Promise((_resolve, reject) => {
                  attempt.addEventListener('abort', () => reject(attempt.reason), { once: true });
                });
              }
              return restartDelete(objectKey, attempt);
            };
            const restartJob = new SnapshotRetentionJob(
              new ExpireSnapshots(
                restartLifecycle,
                new ResilientRawSnapshotStore(restartAdapter),
                incrementalClock,
              ),
            );
            await restartJob.runCycle(signal());
            // The untouched peer is reached first; the cancelled peer keeps its durable place too.
            expect(attempts).toStrictEqual([slowKey, keys[2], slowKey]);
            const afterRestartTimeout = (
              await incrementalConnection.query<{ selection_order: string }>(
                'SELECT selection_order FROM collection.snapshot_generation WHERE object_key = $1',
                [cancelledKey],
              )
            )[0];
            expect(
              afterRestartTimeout!.selection_order,
              'A spent deletion deadline must not advance an unattempted peer',
            ).toBe(afterSelection!.selection_order);
            await absent(keys[2]);
            expect((await raw(cancelledKey)).byteLength > 0).toBeTruthy();
            await restartJob.runCycle(signal());
            expect(attempts).toStrictEqual([slowKey, keys[2], slowKey, cancelledKey, slowKey]);
            await absent(cancelledKey);
            expect((await raw(slowKey)).byteLength > 0).toBeTruthy();
            const stillDue = (
              await incrementalConnection.query<{
                object_key: string;
                content_hash: string;
                acquisition_scope: string;
                key_id: string;
                collected_at: Date;
                expires_at: Date;
                next_reconciliation_at: Date | null;
                available: boolean;
                deleted: boolean;
                selection_order: string;
              }>('SELECT * FROM collection.snapshot_generation WHERE object_key = $1', [slowKey])
            )[0];
            expect(stillDue!.available).toBe(true);
            expect(stillDue!.deleted).toBe(false);
            expect(stillDue!.next_reconciliation_at).toBe(null);
            await expect(restartAdapter.read(slowKey!, signal())).rejects.toMatchObject({
              kind: 'rejected',
            });
            slow = false;
            await restartJob.runCycle(signal());
            expect(attempts.filter((objectKey) => objectKey === slowKey).length).toBe(4);
            await absent(slowKey);
            const final = await incrementalConnection.query<{
              object_key: string;
              content_hash: string;
              acquisition_scope: string;
              key_id: string;
              collected_at: Date;
              expires_at: Date;
              next_reconciliation_at: Date | null;
              available: boolean;
              deleted: boolean;
              selection_order: string;
            }>(
              'SELECT * FROM collection.snapshot_generation WHERE object_key = ANY($1::text[]) ORDER BY object_key',
              [keys],
            );
            for (let index = 0; index < keys.length; index++) {
              expect(final![index]!.deleted).toBe(true);
              expect(final![index]!.available).toBe(false);
              expect(final![index]!.expires_at.valueOf()).toBe(
                before![index]!.expires_at.valueOf(),
              );
              expect(final![index]!.collected_at.valueOf()).toBe(
                before![index]!.collected_at.valueOf(),
              );
              expect(final![index]!.next_reconciliation_at!.valueOf()).toBe(incrementalNow + 100);
            }
          } catch (error) {
            cleanupPrimary7 = error;
            cleanupPrimaryThrown7 = true;
            throw error;
          } finally {
            await preserveCleanup(
              async () => {
                if (cleanupPrimaryThrown7) throw cleanupPrimary7;
              },
              async () => {
                await cleanupAll(
                  async () => {
                    await incrementalConnection.close();
                  },
                  async () => {
                    for (const [name, value] of Object.entries(savedIncrementalSettings)) {
                      if (value === undefined) delete process.env[name];
                      else process.env[name] = value;
                    }
                  },
                );
              },
            );
          }
        }
        console.log(
          'Snapshot lifecycle integration passed: sanitized/encrypted real fixtures, immutable acquisition deadlines, exact expiry, orphan cleanup, concurrent writers/cleanup, restart recovery and legacy synthetic history.',
        );
      } catch (error) {
        cleanupPrimary8 = error;
        cleanupPrimaryThrown8 = true;
        throw error;
      } finally {
        await preserveCleanup(
          async () => {
            if (cleanupPrimaryThrown8) throw cleanupPrimary8;
          },
          async () => {
            await cleanupAll(
              async () => {
                for (const store of stores) store.destroy();
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
            );
          },
        );
      }
    }
  });
});
