import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { ReparseSnapshot, SNAPSHOT_RETENTION_MS } from '../packages/application/dist/index.js';
import { hashCollectionManifest, parseCollectionEvent } from '../packages/domain/dist/index.js';
import {
  CanonicalSnapshotSanitizer,
  DatabaseConnection,
  PostgresSnapshotReparseRepository,
  PostgresSnapshotLifecycle,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  PostgresOutbox,
  PostgresInbox,
  PostgresAuditEventLog,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
} from '../packages/infrastructure/dist/index.js';
import { ResilientRawSnapshotStore } from '../apps/worker/dist/collection/resilient-raw-snapshot-store.js';
import { CollectionAuditConsumer } from '../apps/worker/dist/collection/collection-audit.consumer.js';

const executeFile = promisify(execFile);
const project = `rei-snapshot-reparse-${process.pid}`;
const fixture = {
  user: 'rei_reparse_fixture',
  password: 'rei-reparse-local-fixture',
  database: 'rei_reparse_fixture',
  bucket: 'rei-reparse-fixture',
};
const signal = () => AbortSignal.timeout(15_000);
const encryption = { keyId: 'reparse-local-key', keyBase64: randomBytes(32).toString('base64') };
async function ports(count) {
  const servers = [];
  try {
    for (let index = 0; index < count; index++) {
      const server = createServer();
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port: 0 }, resolve);
      });
    }
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}
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
  RABBITMQ_VHOST: 'rei-reparse-fixture',
  RABBITMQ_PORT: String(rabbit),
  RABBITMQ_MANAGEMENT_PORT: String(management),
  SNAPSHOT_ENCRYPTION_KEY_ID: '',
  SNAPSHOT_ENCRYPTION_KEY_BASE64: '',
};
const compose = (...args) =>
  executeFile('docker', ['compose', '--project-name', project, ...args], {
    cwd: new URL('..', import.meta.url),
    env: environment,
    timeout: 180_000,
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
const cli = (name, ...args) =>
  executeFile('node', ['-r', './dist/otel.js', `dist/collection/${name}.js`, ...args], {
    cwd: new URL('../apps/worker/', import.meta.url),
    env: commandEnvironment,
    timeout: 45_000,
    maxBuffer: 2 * 1024 * 1024,
  });
const output = (result) => {
  const line = result.stdout.split('\n').find((line) => line.includes('"status":"completed"'));
  assert.ok(line, 'Actual CLI did not return a completed durable result.');
  return JSON.parse(line.slice(line.indexOf('{')));
};
const requireInfrastructure = createRequire(
  new URL('../packages/infrastructure/package.json', import.meta.url),
);
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } =
  requireInfrastructure('@aws-sdk/client-s3');
const sdk = new S3Client({
  endpoint: storageConfig.endpoint,
  region: storageConfig.region,
  forcePathStyle: true,
  credentials: { accessKeyId: fixture.user, secretAccessKey: fixture.password },
  maxAttempts: 1,
});
let connection;
let broker;
const stores = [];
let primary;
try {
  await compose('up', '--detach', '--wait', 'postgres', 'minio', 'rabbitmq');
  connection = new DatabaseConnection(databaseUrl);
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort())
    await connection.query(await readFile(new URL(name, directory), 'utf8'));
  const transactions = new PostgresTransactionRunner(connection);
  const identifiers = new PostgresUuidV7Generator(connection);
  const outbox = new PostgresOutbox(connection);
  const repository = new PostgresSnapshotReparseRepository(connection);
  const clock = { now: () => new Date().toISOString() };
  const store = new S3RawSnapshotStore({
    ...storageConfig,
    lifecycle: new PostgresSnapshotLifecycle(connection),
    encryption,
    clock,
  });
  stores.push(store);
  const reader = new ResilientRawSnapshotStore(store);
  const sourceCalls = { fetch: 0, parse: 0, image: 0 };
  const revisedParser = {
    fetchPage: async () => {
      sourceCalls.fetch++;
      throw new Error('Acquisition forbidden');
    },
    parse: async (document) => {
      sourceCalls.parse++;
      const original = JSON.parse(new TextDecoder().decode(document.bytes));
      return { ...original, bedrooms: original.bedrooms + 1, imageFingerprints: ['invented'] };
    },
  };
  const service = (parser = revisedParser, append = outbox) =>
    new ReparseSnapshot(
      { parse: (document) => parser.parse(document) },
      { read: (...args) => reader.read(...args) },
      repository,
      transactions,
      identifiers,
      clock,
      append,
      new CanonicalSnapshotSanitizer(),
    );

  await cli('collect-synthetic', 'original-1');
  const observations =
    await connection.query(`SELECT snapshot_id::text, run_id::text, parsed_event_id::text,
    content_hash, object_key, image_fingerprints FROM collection.snapshot_observation`);
  const original = observations[0];
  assert.ok(Array.isArray(original.image_fingerprints));
  const history = async () => ({
    runs: await connection.query('SELECT * FROM collection.collection_run ORDER BY run_id'),
    observations:
      await connection.query(`SELECT snapshot_id::text, run_id::text, parsed_event_id::text, content_hash,
      source_listing_id, source_url, observed_at, outcome, changed, failure_reason, object_key FROM collection.snapshot_observation ORDER BY snapshot_id`),
    objects: await connection.query('SELECT * FROM collection.raw_object ORDER BY content_hash'),
  });
  const before = await history();
  const objectCount = async () =>
    (await sdk.send(new ListObjectsV2Command({ Bucket: fixture.bucket }))).KeyCount;
  const beforeObjects = await objectCount();
  // Remove original publication to prove that neither correction nor evidence depends on outbox retention.
  await connection.query('DELETE FROM platform.outbox');
  const first = output(
    await cli('reparse-snapshot', original.snapshot_id, 'parser-v2', 'cli-correction'),
  );
  const repeat = output(
    await cli('reparse-snapshot', original.snapshot_id, 'parser-v2', 'cli-correction'),
  );
  assert.equal(first.eventId, repeat.eventId);
  assert.equal(repeat.replayed, true);
  const concurrent = await Promise.all([
    cli('reparse-snapshot', original.snapshot_id, 'parser-v2', 'race-correction'),
    cli('reparse-snapshot', original.snapshot_id, 'parser-v2', 'race-correction'),
  ]);
  assert.equal(output(concurrent[0]).eventId, output(concurrent[1]).eventId);
  assert.equal(output(concurrent[0]).order, 2);
  await assert.rejects(
    cli('reparse-snapshot', original.snapshot_id, 'other-revision', 'cli-correction'),
  );
  const fixed = await service().execute(
    original.snapshot_id,
    'changed-parser',
    'changed-correction',
    null,
    signal(),
  );
  assert.equal(fixed.order, 3);
  const rows = await connection.query(
    'SELECT event_id::text, event_version, payload FROM platform.outbox ORDER BY event_id',
  );
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.event_version === 2));
  const corrected = rows.find((row) => row.event_id === fixed.eventId);
  assert.equal(
    corrected.payload.listing.bedrooms,
    JSON.parse(Buffer.from(SYNTHETIC_LISTING_BYTES).toString()).bedrooms + 1,
  );
  assert.deepEqual(corrected.payload.listing.imageFingerprints, original.image_fingerprints);
  assert.deepEqual(corrected.payload.run, { runId: original.run_id });
  assert.deepEqual(corrected.payload.snapshot, {
    snapshotId: original.snapshot_id,
    contentHash: original.content_hash,
  });
  assert.equal(corrected.payload.correction.originalParsedEventId, original.parsed_event_id);
  assert.deepEqual(await history(), before);
  assert.equal(await objectCount(), beforeObjects);
  assert.equal(sourceCalls.fetch, 0);
  assert.equal(sourceCalls.image, 0);

  // Actual broker delivery, relay claims and collection audit inbox retain the correction contract.
  broker = new RabbitMqEventBroker({
    url: `amqp://${fixture.user}:${fixture.password}@127.0.0.1:${rabbit}/rei-reparse-fixture`,
    operationTimeoutMs: 5000,
    handlerTimeoutMs: 5000,
    drainTimeoutMs: 5000,
  });
  const consumer = new CollectionAuditConsumer(
    broker,
    transactions,
    new PostgresInbox(connection),
    new PostgresAuditEventLog(connection),
  );
  await broker.start(signal());
  await consumer.start();
  async function relay() {
    while (true) {
      const batch = await outbox.claimPending(25, 10_000);
      if (batch.length === 0) break;
      for (const row of batch) {
        const event = parseCollectionEvent({
          eventId: row.eventId,
          type: row.type,
          version: row.version,
          aggregateId: row.aggregateId,
          occurredAt: row.occurredAt,
          traceContext: row.traceContext,
          payload: row.payload,
        });
        await broker.publish(event, signal());
        await outbox.markPublished(row.eventId, row.claimId);
      }
    }
  }
  await relay();
  async function waitForAudit(count) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const audit = await connection.query(
        'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_version = 2',
      );
      if (audit[0].count === count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Correction audit delivery timed out.');
  }
  await waitForAudit(3);
  const auditRows = await connection.query(
    'SELECT event_id::text, payload FROM audit.event_log ORDER BY event_id',
  );
  assert.deepEqual(
    auditRows.map((row) => row.payload),
    rows.map((row) => row.payload),
  );
  await broker.publish(
    parseCollectionEvent({
      eventId: fixed.eventId,
      type: 'collection.snapshot.parsed',
      version: 2,
      aggregateId: original.snapshot_id,
      occurredAt: (
        await connection.query('SELECT occurred_at FROM platform.outbox WHERE event_id=$1', [
          fixed.eventId,
        ])
      )[0].occurred_at.toISOString(),
      traceContext: null,
      payload: corrected.payload,
    }),
    signal(),
  );

  async function observationFor(bytes, options = {}) {
    const synthetic = options.synthetic ?? true;
    const sourceId = synthetic ? 'synthetic-data' : 'privacy-fixture';
    const localStore = options.store ?? store;
    const stored = await localStore.store(
      {
        sourceId,
        mediaType: 'application/json',
        synthetic,
        acquisitionId: options.operation ?? `fixture-${randomBytes(8).toString('hex')}`,
        bytes,
      },
      signal(),
    );
    const run = await connection.query(
      `INSERT INTO collection.collection_run
      (operation_key,source_id,status,started_at,completed_at,observed_count,parsed_count,changed_count,suppressed_count,
       failed_count,manifest_hash,completed_event_id,checkpoint_ordinal,checkpointed_at)
      VALUES ($1,$2,'completed',clock_timestamp(),clock_timestamp(),1,1,0,0,0,$3,uuidv7(),1,clock_timestamp()) RETURNING run_id::text`,
      [
        options.operation ?? `historical-${randomBytes(8).toString('hex')}`,
        sourceId,
        hashCollectionManifest(['fixture-listing']),
      ],
    );
    if (synthetic)
      await connection.query(
        `INSERT INTO collection.raw_object (content_hash,object_key,byte_length,media_type,synthetic)
      VALUES ($1,$2,$3,'application/json',true) ON CONFLICT DO NOTHING`,
        [stored.contentHash, stored.objectKey, stored.byteLength],
      );
    const observed = await connection.query(
      `INSERT INTO collection.snapshot_observation
      (run_id,content_hash,object_key,source_listing_id,source_url,observed_at,parsed_event_id,outcome,changed,image_fingerprints)
      VALUES ($1,$2,$3,'fixture-listing','https://fixture.invalid/listings/fixture-listing',clock_timestamp(),uuidv7(),'parsed',false,$4::jsonb)
      RETURNING snapshot_id::text`,
      [
        run[0].run_id,
        stored.contentHash,
        stored.objectKey,
        options.fingerprints === undefined ? null : JSON.stringify(options.fingerprints),
      ],
    );
    return { ...stored, snapshotId: observed[0].snapshot_id };
  }
  const canonical = JSON.parse(Buffer.from(SYNTHETIC_LISTING_BYTES).toString());
  const legacy = await observationFor(
    new TextEncoder().encode(JSON.stringify({ ...canonical, imageFingerprints: [] })),
  );
  const emptyCli = output(
    await cli('reparse-snapshot', legacy.snapshotId, 'empty-revision', 'empty-cli-correction'),
  );
  assert.deepEqual(
    (
      await connection.query('SELECT payload FROM platform.outbox WHERE event_id=$1', [
        emptyCli.eventId,
      ])
    )[0].payload.listing.imageFingerprints,
    [],
  );
  const legacyCorrection = await service().execute(
    legacy.snapshotId,
    'legacy-revision',
    'legacy-correction',
    null,
    signal(),
  );
  assert.deepEqual(
    (
      await connection.query(
        'SELECT image_fingerprints FROM collection.snapshot_observation WHERE snapshot_id=$1',
        [legacy.snapshotId],
      )
    )[0].image_fingerprints,
    [],
  );
  assert.deepEqual(
    (
      await connection.query('SELECT payload FROM platform.outbox WHERE event_id=$1', [
        legacyCorrection.eventId,
      ])
    )[0].payload.listing.imageFingerprints,
    [],
  );
  await assert.rejects(cli('reparse-snapshot', legacy.snapshotId, 'parser-v2', 'cli-correction'));
  const unknownEvidence = { ...canonical };
  delete unknownEvidence.imageFingerprints;
  const unknown = await observationFor(new TextEncoder().encode(JSON.stringify(unknownEvidence)));
  await assert.rejects(
    service().execute(unknown.snapshotId, 'revision', 'unknown-evidence', null, signal()),
  );
  assert.equal(
    (
      await connection.query(
        'SELECT count(*)::integer AS count FROM collection.snapshot_reparse WHERE operation_key=$1',
        ['unknown-evidence'],
      )
    )[0].count,
    0,
  );

  // Parser/outbox interruption leaves durable reservation without any partial event or consumed order.
  let failures = 1;
  const interrupted = service({
    parse: async () => {
      if (failures--) throw new Error('Interrupted parser');
      return canonical;
    },
  });
  await assert.rejects(
    interrupted.execute(original.snapshot_id, 'retry-revision', 'parser-retry', null, signal()),
  );
  const pending = await repository.findOperation('parser-retry', signal());
  assert.equal(pending.result, null);
  await assert.rejects(
    service().execute(original.snapshot_id, 'other', 'parser-retry', null, signal()),
  );
  const retried = await service().execute(
    original.snapshot_id,
    'retry-revision',
    'parser-retry',
    null,
    signal(),
  );
  assert.equal(retried.order, 4);
  await assert.rejects(
    service(revisedParser, {
      append: async () => {
        throw new Error('Outbox unavailable');
      },
    }).execute(original.snapshot_id, 'rollback-revision', 'rollback-correction', null, signal()),
  );
  assert.equal((await repository.findOperation('rollback-correction', signal())).result, null);
  const recovered = await service().execute(
    original.snapshot_id,
    'rollback-revision',
    'rollback-correction',
    null,
    signal(),
  );
  assert.equal(recovered.order, 5);
  // A late SQL failure after actual outbox insertion must roll the event and order back together.
  await assert.rejects(
    service(revisedParser, {
      append: async (transaction, events) => {
        await outbox.append(transaction, events);
        throw new Error('Injected post-append failure');
      },
    }).execute(original.snapshot_id, 'postappend', 'postappend-correction', null, signal()),
  );
  assert.equal(
    (
      await connection.query(
        "SELECT count(*)::integer AS count FROM platform.outbox WHERE payload->'correction'->>'operationKey'='postappend-correction'",
      )
    )[0].count,
    0,
  );
  assert.equal(
    (
      await service().execute(
        original.snapshot_id,
        'postappend',
        'postappend-correction',
        null,
        signal(),
      )
    ).order,
    6,
  );

  // Missing, corrupt and unavailable content must not reserve a successful correction.
  const corrupt = await observationFor(
    new TextEncoder().encode(JSON.stringify({ ...canonical, askingPriceMinorUnits: 1234 })),
  );
  await sdk.send(
    new PutObjectCommand({
      Bucket: fixture.bucket,
      Key: corrupt.objectKey,
      Body: Buffer.from('{}'),
    }),
  );
  await assert.rejects(
    service().execute(corrupt.snapshotId, 'revision', 'corrupt', null, signal()),
  );
  await sdk.send(new DeleteObjectCommand({ Bucket: fixture.bucket, Key: corrupt.objectKey }));
  await assert.rejects(
    service().execute(corrupt.snapshotId, 'revision', 'missing', null, signal()),
  );
  assert.equal(
    (
      await connection.query(
        "SELECT count(*)::integer AS count FROM collection.snapshot_reparse WHERE operation_key IN ('corrupt','missing')",
      )
    )[0].count,
    0,
  );
  const unsupported = await observationFor(SYNTHETIC_LISTING_BYTES);
  await connection.query(
    `UPDATE collection.collection_run SET source_id='geosampa-fiscal-blocks'
    WHERE run_id=(SELECT run_id FROM collection.snapshot_observation WHERE snapshot_id=$1)`,
    [unsupported.snapshotId],
  );
  await assert.rejects(
    service().execute(unsupported.snapshotId, 'revision', 'unsupported', null, signal()),
  );
  assert.equal(await repository.findOperation('unsupported', signal()), null);

  await connection.query(`INSERT INTO collection.source_register
    (source_id,source_label,enabled,collection_allowed,image_fetching_allowed,listing_text_display_allowed,permission_evidence,
     reviewed_at,source_category,review_outcome,access_method,access_policy,rate_status,licence_status,licence_label)
    VALUES ('privacy-fixture','Isolated canonical local fixture',false,false,false,false,'Local generated test fixture only',
      clock_timestamp(),'listing','not-verified','manual-download','No external acquisition','unconfigured','not-verified',NULL)`);
  const privateInput = {
    ...canonical,
    advertiser: { type: 'private', agencyName: null, name: 'Private Contact' },
    maskedDescription: 'Private Contact calls private@example.test +55 (11) 99999-8888',
    imageFingerprints: [`sha256:${'a'.repeat(64)}`],
  };
  const sanitizer = new CanonicalSnapshotSanitizer();
  const safe = sanitizer.sanitize({
    sourceId: 'privacy-fixture',
    sourceListingId: 'fixture-listing',
    sourceUrl: 'https://fixture.invalid/listings/fixture-listing',
    observedAt: clock.now(),
    mediaType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify(privateInput)),
  });
  const privateObservation = await observationFor(safe.document.bytes, {
    synthetic: false,
    fingerprints: privateInput.imageFingerprints,
  });
  const privacyParser = {
    parse: async (document) => ({
      ...JSON.parse(new TextDecoder().decode(document.bytes)),
      ownerName: 'Parser Contact',
      phone: '+55 (11) 98888-7777',
      advertiser: { type: 'private', agencyName: null, name: 'Parser Contact' },
      maskedDescription: 'Parser Contact private@example.test +55 (11) 98888-7777',
      imageFingerprints: ['invented'],
    }),
  };
  const privateCorrection = await service(privacyParser).execute(
    privateObservation.snapshotId,
    'privacy-revision',
    'privacy-correction',
    null,
    signal(),
  );
  const privateEvent = (
    await connection.query('SELECT payload FROM platform.outbox WHERE event_id=$1', [
      privateCorrection.eventId,
    ])
  )[0].payload;
  assert.deepEqual(privateEvent.listing.imageFingerprints, privateInput.imageFingerprints);
  assert.doesNotMatch(
    JSON.stringify(privateEvent),
    /Parser Contact|private@example|98888|ownerName|phone|invented/,
  );
  const rawCiphertext = await sdk.send(
    new GetObjectCommand({ Bucket: fixture.bucket, Key: privateObservation.objectKey }),
  );
  const ciphertext = await rawCiphertext.Body.transformToByteArray();
  const tampered = Uint8Array.from(ciphertext);
  tampered[tampered.length - 1] ^= 1;
  await sdk.send(
    new PutObjectCommand({
      Bucket: fixture.bucket,
      Key: privateObservation.objectKey,
      Body: tampered,
    }),
  );
  await assert.rejects(
    service(privacyParser).execute(
      privateObservation.snapshotId,
      'tamper',
      'tamper-correction',
      null,
      signal(),
    ),
  );
  await sdk.send(
    new PutObjectCommand({
      Bucket: fixture.bucket,
      Key: privateObservation.objectKey,
      Body: ciphertext,
    }),
  );

  // A short remaining fixed acquisition window expires during parsing and during deferred commit validation.
  async function expiringObservation(operation, remainingMs) {
    const expiring = new S3RawSnapshotStore({
      ...storageConfig,
      lifecycle: new PostgresSnapshotLifecycle(connection),
      encryption,
      clock: {
        now: () => new Date(Date.now() - SNAPSHOT_RETENTION_MS + remainingMs).toISOString(),
      },
    });
    stores.push(expiring);
    return observationFor(safe.document.bytes, {
      synthetic: false,
      store: expiring,
      operation,
      fingerprints: privateInput.imageFingerprints,
    });
  }
  const slow = await expiringObservation('expires-during-parse', 2000);
  const slowParser = {
    parse: async (document) => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
      return JSON.parse(new TextDecoder().decode(document.bytes));
    },
  };
  await assert.rejects(
    service(slowParser).execute(slow.snapshotId, 'slow', 'slow-correction', null, signal()),
  );
  const expiredGeneration = await connection.query(
    'SELECT expires_at, collected_at, available FROM collection.snapshot_generation WHERE object_key=$1',
    [slow.objectKey],
  );
  assert.equal(
    expiredGeneration[0].expires_at - expiredGeneration[0].collected_at,
    SNAPSHOT_RETENTION_MS,
  );
  await assert.rejects(reader.read(slow.objectKey, signal()));
  const lateCommit = await expiringObservation('expires-at-commit', 2000);
  await assert.rejects(
    service(privacyParser, {
      append: async (transaction, events) => {
        await outbox.append(transaction, events);
        await new Promise((resolve) => setTimeout(resolve, 2100));
      },
    }).execute(lateCommit.snapshotId, 'late', 'late-correction', null, signal()),
  );
  assert.equal(
    (
      await connection.query(
        "SELECT count(*)::integer AS count FROM platform.outbox WHERE payload->'correction'->>'operationKey' IN ('slow-correction','late-correction')",
      )
    )[0].count,
    0,
  );
  await relay();
  await waitForAudit(9);
  assert.equal(
    (
      await connection.query(
        "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='audit.collection-events'",
      )
    )[0].count,
    9,
  );
  assert.equal(sourceCalls.fetch, 0);
  assert.equal(sourceCalls.image, 0);
  console.log(
    'Snapshot reparse integration passed: real CLI, durable replay/races/restart, ordering, legacy recovery, sanitized privacy, corruption, expiry, rollback and broker/audit inbox.',
  );
} catch (error) {
  primary = error;
} finally {
  const cleanup = await Promise.allSettled([broker?.close()]);
  cleanup.push(
    ...(await Promise.allSettled([
      connection?.close(),
      Promise.resolve().then(() => {
        sdk.destroy();
        for (const store of stores) store.destroy();
      }),
    ])),
  );
  try {
    await compose('down', '--volumes', '--remove-orphans');
  } catch (error) {
    if (!primary) primary = error;
  }
  const failed = cleanup.find((result) => result.status === 'rejected');
  if (!primary && failed) primary = failed.reason;
}
if (primary) throw primary;
