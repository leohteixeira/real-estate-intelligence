import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import amqp from 'amqplib';
import { CollectSourceOnce } from '../packages/application/dist/index.js';
import { parseCollectionEvent } from '../packages/domain/dist/index.js';
import {
  parsePropertyResponse,
  parseListingResponse,
  parseSearchResponse,
} from '../packages/contracts/dist/index.js';
import {
  CanonicalSnapshotSanitizer,
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
  SyntheticListingSource,
} from '../packages/infrastructure/dist/index.js';

const run = promisify(execFile);
const project = `rei-properties-ingestion-${process.pid}-${randomUUID().slice(0, 8)}`;
const fixture = {
  user: 'rei_ingest_fixture',
  password: 'rei-ingest-owned-local-fixture',
  database: 'rei_ingest_fixture',
  bucket: 'rei-ingest-fixture',
  vhost: 'rei-ingest-fixture',
};
const reservations = [];
async function reservePort() {
  const server = createServer();
  reservations.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return address.port;
}
const [postgres, rabbit, management, minio, minioConsole, api] = await Promise.all(
  Array.from({ length: 6 }, reservePort),
);
assert.equal(new Set([postgres, rabbit, management, minio, minioConsole, api]).size, 6);
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
const compose = (...args) =>
  run(
    'docker',
    ['compose', '--file', 'compose.yaml', '--project-name', project, '--profile', 'tools', ...args],
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
async function waitFor(description, probe, duration = 60000) {
  const end = Date.now() + duration;
  while (Date.now() < end) {
    if (await probe()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
async function queueState(name) {
  const response = await fetch(
    `http://127.0.0.1:${management}/api/queues/${encodeURIComponent(fixture.vhost)}/${encodeURIComponent(name)}`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${fixture.user}:${fixture.password}`).toString('base64')}`,
      },
      signal: signal(),
    },
  );
  return response.ok ? response.json() : null;
}
async function drained() {
  await waitFor('Properties queue to drain', async () => {
    const state = await queueState(queue);
    return state && state.messages_ready === 0 && state.messages_unacknowledged === 0;
  });
}
let deadLetters = 0;
async function rejected(publisher, wire) {
  // Preserve deliberately malformed wire fields: the production publisher emits only canonical
  // envelope keys, so it cannot represent an injected extra-field negative test.
  const transport = await amqp.connect(rabbitUrl.toString());
  try {
    const channel = await transport.createConfirmChannel();
    await new Promise((resolve, reject) => {
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
  } finally {
    await transport.close();
  }
  deadLetters++;
  await waitFor(
    'bounded failure to reach Properties dead-letter queue',
    async () => (await queueState(`${queue}.dead-letter`))?.messages_ready >= deadLetters,
  );
  await drained();
}
async function get(path, parser) {
  const response = await fetch(`http://127.0.0.1:${api}/api/v1/${path}`, { signal: signal() });
  assert.equal(response.status, 200, path);
  return parser(await response.json());
}
let connection;
let store;
let publisher;
try {
  await Promise.all(reservations.map((server) => new Promise((resolve) => server.close(resolve))));
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
  publisher = new RabbitMqEventBroker({ url: rabbitUrl.toString(), operationTimeoutMs: 5000 });
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
  const collector = (source = productionSource) =>
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
  const customSource = (sourceListingId, location = undefined) => ({
    fetchPage: async (_sourceId, cursor) => ({
      documents:
        cursor === null
          ? [
              {
                sourceId: 'synthetic-data',
                sourceListingId,
                sourceUrl: `https://synthetic.invalid/listings/${sourceListingId}`,
                observedAt: '2026-10-10T11:59:59.000Z',
                mediaType: 'application/json',
                bytes: location
                  ? new TextEncoder().encode(
                      JSON.stringify({
                        ...JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
                        location,
                      }),
                    )
                  : SYNTHETIC_LISTING_BYTES,
              },
            ]
          : [],
      nextCursor: null,
      exhausted: true,
    }),
    parse: (document, cancellation) => productionSource.parse(document, cancellation),
  });
  const evidence = async (eventId) =>
    (
      await connection.query(
        'SELECT event FROM collection.parsed_event_evidence WHERE event_id=$1',
        [eventId],
      )
    )[0].event;
  const counts = async () =>
    (
      await connection.query(`SELECT
    (SELECT count(*) FROM properties.property)::integer AS properties,
    (SELECT count(*) FROM properties.listing)::integer AS listings,
    (SELECT count(*) FROM properties.incoming_fact)::integer AS facts,
    (SELECT count(*) FROM platform.inbox WHERE consumer_name='properties.parsed-listing')::integer AS inbox,
    (SELECT count(*) FROM platform.outbox WHERE event_type='properties.listing.created')::integer AS creations`)
    )[0];
  const stable = async (expected) => {
    await drained();
    assert.deepEqual(await counts(), expected);
  };

  // A failure after fact/property insert must leave no inbox, fact, entity or creation outbox.
  await connection.query(
    `CREATE FUNCTION properties.integration_fail_listing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned fixture insertion failure'; END $$`,
  );
  await connection.query(
    'CREATE TRIGGER integration_fail_listing BEFORE INSERT ON properties.listing FOR EACH ROW EXECUTE FUNCTION properties.integration_fail_listing()',
  );
  const collected = await collector().execute('synthetic-data', 'ingest-initial', null, signal());
  const original = await evidence(collected.parsedEventId);
  parseCollectionEvent(original);
  deadLetters++;
  await waitFor(
    'injected insertion failure to dead-letter',
    async () => (await queueState(`${queue}.dead-letter`))?.messages_ready >= deadLetters,
  );
  await stable({ properties: 0, listings: 0, facts: 0, inbox: 0, creations: 0 });
  await connection.query('DROP TRIGGER integration_fail_listing ON properties.listing');
  await connection.query('DROP FUNCTION properties.integration_fail_listing()');
  console.log('Rollback and bounded delivery verified; retrying the genuine canonical event.');
  await publisher.publish(original, signal());
  await waitFor('the genuine initial Property', async () => (await counts()).properties === 1);
  console.log('Initial persisted Property created through the production worker.');
  const identity = (
    await connection.query('SELECT property_id::text, listing_id::text FROM properties.listing')
  )[0];
  const detail = await get(`properties/${identity.property_id}`, parsePropertyResponse);
  const listing = await get(`listings/${identity.listing_id}`, parseListingResponse);
  assert.deepEqual(listing.listing, detail.property.listings[0]);
  assert.notEqual(identity.property_id, identity.listing_id);
  assert.equal(
    listing.listing.askingPriceMinorUnits,
    original.payload.listing.askingPriceMinorUnits,
  );
  assert.equal(listing.listing.areaSquareMeters, 82.5);
  assert.equal(listing.listing.pricePerSquareMeter, 951515);
  assert.equal(listing.listing.place.id, 'sao-paulo-bela-vista');
  assert.deepEqual(listing.listing.provenance, {
    ...original.payload.source,
    ...original.payload.run,
    ...original.payload.snapshot,
  });
  assert.equal(detail.metadata.asOf, original.payload.source.observedAt);
  assert.deepEqual(detail.property.priceChanges, []);
  assert.equal(detail.property.summary.neighborhoodComparison, null);
  assert.equal(detail.property.preparedEvidence.productionMatchScore, null);
  const baseline = { properties: 1, listings: 1, facts: 1, inbox: 1, creations: 1 };
  await stable(baseline);
  await assert.rejects(
    connection.query('UPDATE properties.incoming_fact SET event=event WHERE event_id=$1', [
      original.eventId,
    ]),
    /immutable/,
  );
  await connection.query(
    "DELETE FROM platform.outbox WHERE event_id=$1 AND event_type='collection.snapshot.parsed' AND published_at IS NOT NULL",
    [original.eventId],
  );

  await Promise.all(Array.from({ length: 8 }, () => publisher.publish(original, signal())));
  await stable(baseline);
  await connection.query('DELETE FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2', [
    queue,
    original.eventId,
  ]);
  await Promise.all(Array.from({ length: 4 }, () => publisher.publish(original, signal())));
  await waitFor('semantic replay inbox marker', async () => (await counts()).inbox === 1);
  await stable(baseline);
  await compose('restart', 'worker', 'api');
  await compose('up', '--detach', '--wait', 'worker', 'api');
  await publisher.publish(original, signal());
  await stable(baseline);
  assert.deepEqual(await get(`properties/${identity.property_id}`, parsePropertyResponse), detail);

  const later = await collector().execute('synthetic-data', 'ingest-later', null, signal());
  await waitFor('pending later observation', async () => (await counts()).facts === 2);
  assert.equal(
    (
      await connection.query(
        'SELECT disposition FROM properties.fact_disposition WHERE event_id=$1',
        [later.parsedEventId],
      )
    )[0].disposition,
    'pending-history',
  );
  assert.deepEqual(await get(`properties/${identity.property_id}`, parsePropertyResponse), detail);
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
        source: { ...original.payload.source, sourceUrl: 'https://synthetic.invalid/forged' },
      },
    },
    { ...original, extra: true },
    { ...original, version: 3 },
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
    payload: { ...original.payload, source: { ...original.payload.source, sourceId: 'olx' } },
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
  console.log('Canonical mutation, denied/real/held authority and immutable replay verified.');
  const unknown = await collector(
    customSource('SYN-UNKNOWN', {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Unknown',
      street: 'Unknown',
    }),
  ).execute('synthetic-data', 'ingest-unknown-address', null, signal());
  deadLetters++;
  await waitFor(
    'unknown address to dead-letter',
    async () => (await queueState(`${queue}.dead-letter`))?.messages_ready >= deadLetters,
  );
  await stable(laterBaseline);
  assert.equal(
    (
      await connection.query(
        'SELECT count(*)::integer AS count FROM properties.incoming_fact WHERE event_id=$1',
        [unknown.parsedEventId],
      )
    )[0].count,
    0,
  );

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
    await connection.query(
      'SELECT event FROM collection.parsed_event_evidence WHERE snapshot_id=$1 AND event_version=2',
      [second.snapshotId],
    )
  )[0].event;
  assert.equal(parseCollectionEvent(corrected).version, 2);
  console.log('Production reparse published canonical v2 evidence before the delayed v1.');
  await compose('up', '--detach', '--wait', 'worker');
  await waitFor('v2-first pending correction', async () => (await counts()).facts === 3);
  await stable({ ...laterBaseline, facts: 3, inbox: 3 });
  assert.equal(
    (
      await connection.query(
        'SELECT disposition FROM properties.fact_disposition WHERE event_id=$1',
        [corrected.eventId],
      )
    )[0].disposition,
    'pending-correction',
  );
  await publisher.publish(secondWire, signal());
  await waitFor('later original v1 creation', async () => (await counts()).properties === 2);
  await stable({ properties: 2, listings: 2, facts: 4, inbox: 4, creations: 2 });
  const secondIdentity = (
    await connection.query(
      'SELECT property_id::text FROM properties.listing WHERE source_listing_id=$1',
      ['SYN-SP-0002'],
    )
  )[0];
  const secondDetail = await get(`properties/${secondIdentity.property_id}`, parsePropertyResponse);
  assert.equal(secondDetail.metadata.asOf, secondWire.payload.source.observedAt);
  assert.equal(secondDetail.property.listings[0].collectionCount, 1);
  assert.deepEqual(secondDetail.property.priceChanges, []);
  const creations = await connection.query(
    "SELECT occurred_at, payload FROM platform.outbox WHERE event_type='properties.listing.created'",
  );
  assert(
    creations.every(
      (row) =>
        row.occurred_at.toISOString() === original.payload.source.observedAt &&
        row.payload.revision === 1,
    ),
  );

  await connection.query(
    "UPDATE collection.source_register SET listing_text_display_allowed=false WHERE source_id='synthetic-data'",
  );
  for (const [path, parser] of [
    [`properties/${identity.property_id}`, parsePropertyResponse],
    [`listings/${identity.listing_id}`, parseListingResponse],
  ]) {
    const response = await get(path, parser);
    assert(!/Bright synthetic|"current"|"versions"|"text"|excerpt/.test(JSON.stringify(response)));
    assert(JSON.stringify(response).includes(original.payload.snapshot.contentHash));
  }
  const prepared = await get('properties', parseSearchResponse);
  assert.equal(prepared.totalItems, 5);
  assert(!prepared.items.some((item) => item.id === identity.property_id));
  assert(!/unitNumber|contactName|phone|email|photo|imageFingerprint/.test(JSON.stringify(detail)));
  await connection.query(
    "UPDATE collection.source_register SET listing_text_display_allowed=true WHERE source_id='synthetic-data'",
  );
  console.log(
    'Properties ingestion passed: production collection/evidence/broker/worker/HTTP, rollback/retry, concurrency/inbox expiry/restart, immutable pending v1/v2, authority/mutation/address rejection, current rights and prepared isolation.',
  );
} catch (error) {
  await compose('logs', '--no-color', '--tail', '100', 'worker', 'api', 'migrations')
    .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
    .catch(() => undefined);
  throw error;
} finally {
  await publisher?.close().catch(() => undefined);
  store?.destroy();
  await connection?.close().catch(() => undefined);
  await compose('down', '--volumes', '--remove-orphans');
  const remaining = await run('docker', [
    'ps',
    '--all',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.ID}}',
  ]);
  assert.equal(remaining.stdout.trim(), '', 'The exact campaign project retained a container.');
  const volumes = await run('docker', [
    'volume',
    'ls',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.Name}}',
  ]);
  assert.equal(volumes.stdout.trim(), '', 'The exact campaign project retained a volume.');
  console.log(`Cleaned exact campaign project ${project}.`);
}
