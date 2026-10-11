import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import {
  CollectSourceOnce,
  CollectSourceRun,
  ExternalFailure,
  ReparseSnapshot,
} from '../packages/application/dist/index.js';
import { parseCollectionEvent } from '../packages/domain/dist/index.js';
import { parsePropertyResponse, parseListingResponse } from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresCollectionFacade,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
  SyntheticListingSource,
  SYNTHETIC_SAO_PAULO_DATASET,
  PostgresSnapshotReparseRepository,
} from '../packages/infrastructure/dist/index.js';

const run = promisify(execFile);
const project = `rei-properties-history-${process.pid}-${randomUUID().slice(0, 8)}`;
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

const signal = () => AbortSignal.timeout(15000);
async function waitFor(description, probe, duration = 60000) {
  const end = Date.now() + duration;
  while (Date.now() < end) {
    if (await probe()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
async function get(path, parser) {
  const response = await fetch(`http://127.0.0.1:${api}/api/v1/${path}`, { signal: signal() });
  assert.equal(response.status, 200, path);
  return parser(await response.json());
}
let connection, store, publisher;
try {
  await Promise.all(reservations.map((server) => new Promise((resolve) => server.close(resolve))));
  console.log(`Starting isolated Properties history campaign ${project}.`);
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
  let instant = '2025-10-01T12:00:00.000Z';
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
  const collect = async (sourceId, key, documents, observedAt, completionOffset = 1000) => {
    instant = observedAt;
    const source = {
      fetchPage: async () => {
        instant = new Date(Date.parse(observedAt) + completionOffset).toISOString();
        return { documents, nextCursor: null, exhausted: true };
      },
      parse: (document, cancellation) => parser.parse(document, cancellation),
    };
    const service = new CollectSourceRun(
      source,
      store,
      new PostgresSourceRegisterRepository(connection),
      new PostgresCollectionRunRepository(connection),
      new PostgresTransactionRunner(connection),
      new PostgresUuidV7Generator(connection),
      clock,
      new PostgresOutbox(connection),
    );
    return service.execute(sourceId, key, null, signal());
  };
  // Genuine collections populate evidence/outbox while subscriptions are offline. Canonical
  // source chronology must not depend on cross-aggregate broker prefetch or reception order.
  await compose('stop', 'worker');
  for (const cycle of SYNTHETIC_SAO_PAULO_DATASET.runs) {
    for (const [index, source] of SYNTHETIC_SAO_PAULO_DATASET.sources.entries()) {
      const observations = cycle.observations.filter((item) => item.sourceId === source.sourceId);
      const documents = observations.map((item) => ({
        ...item,
        mediaType: 'application/json',
        bytes: new TextEncoder().encode(JSON.stringify(item.listing)),
      }));
      await collect(
        source.sourceId,
        `history-catalog-${cycle.runKey}-${source.sourceId}`,
        documents,
        cycle.observedAt,
        (index + 1) * 1000,
      );
    }
  }
  assert.equal(
    (
      await connection.query(
        'SELECT count(*)::integer AS count FROM collection.completed_event_evidence',
      )
    )[0].count,
    39,
  );
  await compose('up', '--detach', '--wait', 'worker');
  await waitFor(
    '115 durable acquisitions',
    async () =>
      (
        await connection.query(
          'SELECT count(*)::integer AS count FROM properties.listing_acquisition',
        )
      )[0].count === 115,
  );
  await waitFor(
    'all canonical source runs',
    async () =>
      (
        await connection.query(
          'SELECT count(*)::integer AS count FROM properties.source_work WHERE listing_cursor IS NULL AND last_run_id IS NOT NULL',
        )
      )[0].count === 3,
  );
  const eventCounts = await connection.query(
    "SELECT event_type,count(*)::integer AS count FROM platform.outbox WHERE event_type LIKE 'properties.listing.%' GROUP BY event_type ORDER BY event_type",
  );
  assert.deepEqual(Object.fromEntries(eventCounts.map((row) => [row.event_type, row.count])), {
    'properties.listing.created': 9,
    'properties.listing.description-changed': 3,
    'properties.listing.price-changed': 4,
    'properties.listing.reappeared': 1,
    'properties.listing.removed': 1,
  });
  const identities = await connection.query(
    'SELECT listing_id::text,property_id::text,source_id,source_listing_id FROM properties.listing ORDER BY source_id,source_listing_id',
  );
  let acquisitions = 0;
  for (const row of identities) {
    const listing = (await get(`listings/${row.listing_id}`, parseListingResponse)).listing;
    const property = (await get(`properties/${row.property_id}`, parsePropertyResponse)).property;
    acquisitions += listing.collectionCount;
    assert.deepEqual(property.listings[0], listing);
    const observations = SYNTHETIC_SAO_PAULO_DATASET.runs
      .flatMap((run) => run.observations)
      .filter(
        (item) => item.sourceId === row.source_id && item.sourceListingId === row.source_listing_id,
      );
    assert.equal(listing.collectionCount, observations.length);
    assert.equal(listing.firstCollectedAt, observations[0].observedAt);
    assert.equal(listing.lastCollectedAt, observations.at(-1).observedAt);
    assert.equal(listing.askingPriceMinorUnits, observations.at(-1).listing.askingPriceMinorUnits);
    const durable = await connection.query(
      'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
      [row.listing_id],
    );
    assert.deepEqual(
      durable.map((item) => item.revision),
      Array.from({ length: durable.length }, (_, i) => i + 1),
    );
    assert.deepEqual(
      durable.map((item) => item.event.type.replace('properties.listing.', '')),
      listing.history.map((item) => item.type),
    );
    for (const event of durable)
      assert.equal(
        event.event.payload.listing.provenance.observedAt,
        listing.history[event.revision - 1].provenance.observedAt,
      );
    const removal = durable.find((item) => item.event.type === 'properties.listing.removed');
    if (removal) {
      const run = (
        await connection.query(
          "SELECT event FROM collection.completed_event_evidence WHERE event->>'occurredAt'=$1",
          [removal.event.payload.effectiveAt],
        )
      )[0];
      assert(run);
      assert.equal(listing.lifeline[0].to, run.event.occurredAt);
      assert.equal(
        listing.lifeline[1].from,
        listing.history.find((item) => item.type === 'reappeared').effectiveAt,
      );
    }
  }
  assert.equal(acquisitions, 115);
  const document = (day, listing) => ({
    sourceId: 'synthetic-data',
    sourceListingId: 'OWNED-FIVE-TYPES',
    sourceUrl: 'https://synthetic.invalid/listings/owned-five-types',
    observedAt: `2027-01-0${day}T12:00:00.000Z`,
    mediaType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify(listing)),
  });
  const first = JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES));
  const price = { ...first, askingPriceMinorUnits: first.askingPriceMinorUnits - 100000 };
  const description = {
    ...price,
    maskedDescription: 'Owned history journey changed synthetic description.',
  };
  for (const [day, listing] of [
    [1, first],
    [2, price],
    [3, description],
    [4, null],
    [5, description],
  ]) {
    const observedAt = `2027-01-0${day}T12:00:00.000Z`;
    await collect(
      'synthetic-data',
      `owned-five-types-${day}`,
      listing ? [document(day, listing)] : [],
      observedAt,
    );
  }
  await waitFor(
    'five focused market types',
    async () =>
      (
        await connection.query(
          "SELECT count(*)::integer AS count FROM properties.listing_event event JOIN properties.listing listing USING(listing_id) WHERE listing.source_listing_id='OWNED-FIVE-TYPES'",
        )
      )[0].count === 5,
  );
  const focused = (
    await connection.query(
      "SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id='OWNED-FIVE-TYPES'",
    )
  )[0];
  let focusedResponse = await get(`listings/${focused.listing_id}`, parseListingResponse);
  assert.deepEqual(
    focusedResponse.listing.history.map((item) => item.type),
    ['created', 'price-changed', 'description-changed', 'removed', 'reappeared'],
  );
  assert.equal(focusedResponse.listing.collectionCount, 4);
  assert.deepEqual(focusedResponse.listing.lifeline, [
    { from: '2027-01-01T12:00:00.000Z', to: '2027-01-04T12:00:01.000Z' },
    { from: '2027-01-05T12:00:00.000Z', to: null },
  ]);
  const reparse = async (snapshotId, key, price, description, invalidGeography = false) =>
    new ReparseSnapshot(
      {
        parse: async (document, cancellation) => {
          const listing = await parser.parse(document, cancellation);
          return {
            ...listing,
            askingPriceMinorUnits: price,
            maskedDescription: description,
            ...(invalidGeography
              ? { location: { ...listing.location, street: 'Unknown correction street' } }
              : {}),
          };
        },
      },
      store,
      new PostgresSnapshotReparseRepository(connection),
      new PostgresTransactionRunner(connection),
      new PostgresUuidV7Generator(connection),
      clock,
      new PostgresOutbox(connection),
    ).execute(snapshotId, key, key, null, signal());
  const originalFocusedEffects = JSON.stringify(
    await connection.query(
      'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
      [focused.listing_id],
    ),
  );
  const focusedSnapshots = await connection.query(
    "SELECT snapshot_id::text FROM collection.snapshot_observation WHERE source_listing_id='OWNED-FIVE-TYPES' ORDER BY observed_at,snapshot_id",
  );
  // Historical correction changes only dated values, never a later acquisition's current price.
  await reparse(
    focusedSnapshots[0].snapshot_id,
    'history-historical-correction',
    100000,
    'Owned corrected historical text.',
  );
  await waitFor(
    'authenticated historical correction',
    async () =>
      (
        await connection.query('SELECT state FROM properties.listing_current WHERE listing_id=$1', [
          focused.listing_id,
        ])
      )[0].state.acquisitions[0].corrected !== null,
  );
  assert.equal(
    (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing
      .askingPriceMinorUnits,
    description.askingPriceMinorUnits,
  );
  const lower = await reparse(
    focusedSnapshots.at(-1).snapshot_id,
    'history-current-correction-1',
    200000,
    'Owned lower-order corrected text.',
  );
  const higher = await reparse(
    focusedSnapshots.at(-1).snapshot_id,
    'history-current-correction-2',
    300000,
    'Owned higher-order corrected text.',
  );
  await waitFor(
    'highest corrected current price',
    async () =>
      (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing
        .askingPriceMinorUnits === 300000,
  );
  const correctedWires = await connection.query(
    'SELECT event FROM collection.parsed_event_evidence WHERE event_id=ANY($1::uuid[]) ORDER BY event_id DESC',
    [[lower.eventId, higher.eventId]],
  );
  for (const row of correctedWires)
    await publisher.publish(parseCollectionEvent(row.event), signal());
  focusedResponse = await get(`listings/${focused.listing_id}`, parseListingResponse);
  assert.equal(focusedResponse.listing.collectionCount, 4);
  assert.equal(focusedResponse.listing.provenance.snapshotId, focusedSnapshots.at(-1).snapshot_id);
  assert.equal(focusedResponse.listing.description.current, 'Owned higher-order corrected text.');
  assert.equal(
    JSON.stringify(
      await connection.query(
        'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
        [focused.listing_id],
      ),
    ),
    originalFocusedEffects,
  );
  // Correction-first receipt plus completion-first recovery, with both original broker facts withheld.
  await compose('stop', 'worker');
  const interruptRun = async (sourceId, key, startedAt) => {
    instant = startedAt;
    const interrupted = new CollectSourceRun(
      {
        fetchPage: async () => {
          throw new Error('Owned interrupted source page.');
        },
        parse: (document, cancellation) => parser.parse(document, cancellation),
      },
      store,
      new PostgresSourceRegisterRepository(connection),
      new PostgresCollectionRunRepository(connection),
      new PostgresTransactionRunner(connection),
      new PostgresUuidV7Generator(connection),
      clock,
      new PostgresOutbox(connection),
    );
    await assert.rejects(interrupted.execute(sourceId, key, null, signal()));
  };
  // Durable completion may be found without broker delivery. An authentic earlier running run
  // keeps this acquisition unavailable until the correction-first receipt has been exercised.
  await interruptRun(
    'synthetic-portal-cobalto',
    'owned-correction-first-barrier',
    '2027-01-06T11:00:00.000Z',
  );
  const correctionDocument = {
    ...document(6, first),
    sourceId: 'synthetic-portal-cobalto',
    sourceListingId: 'OWNED-CORRECTION-FIRST',
    sourceUrl: 'https://synthetic.invalid/listings/owned-correction-first',
  };
  const correctionRun = await collect(
    'synthetic-portal-cobalto',
    'owned-correction-first',
    [correctionDocument],
    correctionDocument.observedAt,
  );
  const completion = (
    await connection.query(
      'SELECT event FROM collection.completed_event_evidence WHERE run_id=$1',
      [correctionRun.runId],
    )
  )[0].event;
  const correctionSnapshot = (
    await connection.query(
      'SELECT snapshot_id::text,parsed_event_id::text FROM collection.snapshot_observation WHERE run_id=$1',
      [correctionRun.runId],
    )
  )[0];
  await connection.query(
    'UPDATE platform.outbox SET published_at=clock_timestamp() WHERE event_id=ANY($1::uuid[])',
    [[completion.eventId, correctionSnapshot.parsed_event_id]],
  );
  const firstCorrection = await reparse(
    correctionSnapshot.snapshot_id,
    'history-correction-first',
    400000,
    'Owned correction-first text.',
    true,
  );
  await compose('up', '--detach', '--wait', 'worker');
  await waitFor(
    'v2-first durable receipt',
    async () =>
      (
        await connection.query(
          'SELECT count(*)::integer AS count FROM properties.incoming_fact WHERE event_id=$1',
          [firstCorrection.eventId],
        )
      )[0].count === 1,
  );
  assert.equal(
    (
      await connection.query(
        "SELECT count(*)::integer AS count FROM properties.listing WHERE source_listing_id='OWNED-CORRECTION-FIRST'",
      )
    )[0].count,
    0,
  );
  await publisher.publish(parseCollectionEvent(completion), signal());
  await collect(
    'synthetic-portal-cobalto',
    'owned-correction-first-barrier',
    [],
    '2027-01-06T11:00:00.000Z',
  );
  await waitFor(
    'completion recovers missing v1 despite invalid correction',
    async () =>
      (
        await connection.query(
          'SELECT disposition FROM properties.correction_effect WHERE event_id=$1',
          [firstCorrection.eventId],
        )
      )[0]?.disposition === 'rejected',
  );
  const correctionIdentity = (
    await connection.query(
      "SELECT listing_id::text FROM properties.listing WHERE source_listing_id='OWNED-CORRECTION-FIRST'",
    )
  )[0];
  const originalRecovery = (
    await get(`listings/${correctionIdentity.listing_id}`, parseListingResponse)
  ).listing;
  assert.equal(originalRecovery.collectionCount, 1);
  assert.equal(originalRecovery.askingPriceMinorUnits, first.askingPriceMinorUnits);
  const correctionFirstEffects = JSON.stringify(
    await connection.query(
      'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
      [correctionIdentity.listing_id],
    ),
  );
  await reparse(
    correctionSnapshot.snapshot_id,
    'history-correction-first-valid',
    400000,
    'Owned correction-first text.',
  );
  await waitFor(
    'valid higher correction after durable rejection',
    async () =>
      (await get(`listings/${correctionIdentity.listing_id}`, parseListingResponse)).listing
        .askingPriceMinorUnits === 400000,
  );
  const invalidAfter = await reparse(
    correctionSnapshot.snapshot_id,
    'history-correction-after-invalid',
    900000,
    'Owned invalid later correction.',
    true,
  );
  await waitFor(
    'invalid correction after materialization rejected alone',
    async () =>
      (
        await connection.query(
          'SELECT disposition FROM properties.correction_effect WHERE event_id=$1',
          [invalidAfter.eventId],
        )
      )[0]?.disposition === 'rejected',
  );
  assert.equal(
    (await get(`listings/${correctionIdentity.listing_id}`, parseListingResponse)).listing
      .askingPriceMinorUnits,
    400000,
  );
  await reparse(
    correctionSnapshot.snapshot_id,
    'history-correction-after-valid',
    400000,
    'Owned correction-first text.',
  );
  await waitFor(
    'later valid correction recovers after materialization',
    async () =>
      (
        await connection.query('SELECT state FROM properties.listing_current WHERE listing_id=$1', [
          correctionIdentity.listing_id,
        ])
      )[0].state.acquisitions[0].corrected?.payload.correction.order === 4,
  );
  assert.equal(
    JSON.stringify(
      await connection.query(
        'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
        [correctionIdentity.listing_id],
      ),
    ),
    correctionFirstEffects,
  );
  const recovered = (await get(`listings/${correctionIdentity.listing_id}`, parseListingResponse))
    .listing;
  assert.equal(recovered.askingPriceMinorUnits, 400000);
  assert.equal(recovered.collectionCount, 1);
  assert.deepEqual(
    recovered.history.map((item) => item.type),
    ['created'],
  );
  // A genuine unfinished earlier run fences an already-complete later run across restart.
  await interruptRun('synthetic-data', 'owned-earlier-barrier', '2027-01-07T12:00:00.000Z');
  const laterListing = { ...description, askingPriceMinorUnits: 700000 };
  const laterRun = await collect(
    'synthetic-data',
    'owned-later-barrier',
    [document(8, laterListing)],
    '2027-01-08T12:00:00.000Z',
  );
  await waitFor(
    'later completion receipt behind earlier run',
    async () =>
      (
        await connection.query(
          "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
          [laterRun.completedEventId],
        )
      )[0].count === 1,
  );
  await compose('restart', 'worker');
  await compose('up', '--detach', '--wait', 'worker');
  assert.equal(
    (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing.collectionCount,
    4,
  );
  assert.equal(
    (
      await connection.query(
        'SELECT count(*)::integer AS count FROM properties.listing_run_effect WHERE run_id=$1',
        [laterRun.runId],
      )
    )[0].count,
    0,
  );
  // Fail only source cursor progress: listing business effects commit independently and replay once.
  await connection.query(
    "CREATE FUNCTION properties.owned_fail_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_id='synthetic-data' THEN RAISE EXCEPTION 'owned progress interruption'; END IF; RETURN NEW; END $$",
  );
  await connection.query(
    'CREATE TRIGGER owned_fail_progress BEFORE UPDATE ON properties.source_work FOR EACH ROW EXECUTE FUNCTION properties.owned_fail_progress()',
  );
  await collect(
    'synthetic-data',
    'owned-earlier-barrier',
    [document(7, { ...description, askingPriceMinorUnits: 800000 })],
    '2027-01-07T12:00:00.000Z',
  );
  await waitFor(
    'effect committed before failed source progress',
    async () =>
      (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing
        .collectionCount === 5,
  );
  const effectBeforeProgress = JSON.stringify(
    await connection.query(
      'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
      [focused.listing_id],
    ),
  );
  await compose('stop', 'worker');
  assert.equal(
    JSON.stringify(
      await connection.query(
        'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
        [focused.listing_id],
      ),
    ),
    effectBeforeProgress,
  );
  await connection.query('DROP TRIGGER owned_fail_progress ON properties.source_work');
  await connection.query('DROP FUNCTION properties.owned_fail_progress()');
  await compose('up', '--detach', '--wait', 'worker');
  await waitFor(
    'canonical earlier then later catch-up',
    async () =>
      (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing
        .collectionCount === 6,
  );
  assert.equal(
    (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing
      .askingPriceMinorUnits,
    700000,
  );
  // A failed parse is still a seen identity, so complete full-manifest evidence cannot remove it.
  const failedDocument = { ...document(9, laterListing), bytes: new TextEncoder().encode('{}') };
  const failedRun = await collect(
    'synthetic-data',
    'owned-seen-failed',
    [failedDocument],
    failedDocument.observedAt,
  );
  assert.equal(failedRun.failedCount, 1);
  await waitFor(
    'failed seen manifest is reconciled',
    async () =>
      (
        await connection.query(
          "SELECT last_run_id::text FROM properties.source_work WHERE source_id='synthetic-data'",
        )
      )[0].last_run_id === failedRun.runId,
  );
  focusedResponse = await get(`listings/${focused.listing_id}`, parseListingResponse);
  assert.equal(focusedResponse.listing.status, 'active');
  assert.equal(focusedResponse.listing.collectionCount, 6);
  // One-shot runs establish source chronology before either remote fetch returns.
  let releaseEarlier;
  let enteredEarlier;
  const earlierEntered = new Promise((resolve) => {
    enteredEarlier = resolve;
  });
  const earlierRelease = new Promise((resolve) => {
    releaseEarlier = resolve;
  });
  const oneShot = (observedAt, price, held = false) =>
    new CollectSourceOnce(
      {
        fetchPage: async () => {
          if (held) {
            enteredEarlier();
            await earlierRelease;
          }
          return {
            documents: [
              { ...document(9, { ...laterListing, askingPriceMinorUnits: price }), observedAt },
            ],
            nextCursor: null,
            exhausted: true,
          };
        },
        parse: (fetched, cancellation) => parser.parse(fetched, cancellation),
      },
      store,
      new PostgresSourceRegisterRepository(connection),
      new PostgresCollectionRunRepository(connection),
      new PostgresTransactionRunner(connection),
      new PostgresUuidV7Generator(connection),
      { now: () => observedAt },
      new PostgresOutbox(connection),
    );
  const earlierPending = oneShot('2027-02-01T12:00:00.000Z', 600000, true).execute(
    'synthetic-data',
    'owned-once-earlier',
    null,
    AbortSignal.timeout(60000),
  );
  await earlierEntered;
  const earlierBoundary = (
    await connection.query(
      "SELECT run_id::text,status,started_at FROM collection.collection_run WHERE operation_key='owned-once-earlier'",
    )
  )[0];
  assert.equal(earlierBoundary.status, 'running');
  assert.equal(new Date(earlierBoundary.started_at).toISOString(), '2027-02-01T12:00:00.000Z');
  const laterOnce = await oneShot('2027-02-02T12:00:00.000Z', 500000).execute(
    'synthetic-data',
    'owned-once-later',
    null,
    signal(),
  );
  await waitFor(
    'later one-shot completion remains fenced during earlier fetch',
    async () =>
      (
        await connection.query(
          "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
          [laterOnce.completedEventId],
        )
      )[0].count === 1,
  );
  assert.equal(
    (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing.collectionCount,
    6,
  );
  assert.equal(
    (
      await connection.query(
        'SELECT count(*)::integer AS count FROM properties.listing_run_effect WHERE run_id=$1',
        [laterOnce.runId],
      )
    )[0].count,
    0,
  );
  releaseEarlier();
  const earlierOnce = await earlierPending;
  assert.equal(earlierOnce.runId, earlierBoundary.run_id);
  await waitFor(
    'canonical overlapping one-shot acquisitions',
    async () =>
      (await get(`listings/${focused.listing_id}`, parseListingResponse)).listing
        .collectionCount === 8,
  );
  focusedResponse = await get(`listings/${focused.listing_id}`, parseListingResponse);
  assert.equal(focusedResponse.listing.askingPriceMinorUnits, 500000);
  assert.deepEqual(
    (
      await connection.query('SELECT state FROM properties.listing_current WHERE listing_id=$1', [
        focused.listing_id,
      ])
    )[0].state.acquisitions
      .slice(-2)
      .map((item) => item.original.payload.source.observedAt),
    ['2027-02-01T12:00:00.000Z', '2027-02-02T12:00:00.000Z'],
  );
  // Authentic temporal inversion: A starts first but completes empty after B observed.
  // Each live run reads the wall clock; no fixture clock rewrites B's acquisition date.
  const invertedSource = 'synthetic-portal-brisa';
  const wallClock = { now: () => new Date().toISOString() };
  const invertedDocument = (observedAt) => ({
    sourceId: invertedSource,
    sourceListingId: 'OWNED-TEMPORAL-INVERSION',
    sourceUrl: 'https://synthetic.invalid/listings/owned-temporal-inversion',
    observedAt,
    mediaType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify(first)),
  });
  const initialObservation = new Date(Date.now() - 5 * 86400000).toISOString();
  const seed = await collect(
    invertedSource,
    'owned-inversion-seed',
    [invertedDocument(initialObservation)],
    initialObservation,
  );
  await waitFor(
    'inversion seed reconciled',
    async () =>
      (
        await connection.query(
          'SELECT last_run_id::text FROM properties.source_work WHERE source_id=$1',
          [invertedSource],
        )
      )[0]?.last_run_id === seed.runId,
  );
  const invertedIdentity = (
    await connection.query(
      "SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id='OWNED-TEMPORAL-INVERSION'",
    )
  )[0];
  const liveService = (source, snapshots = store, liveClock = wallClock, resumable = false) =>
    new (resumable ? CollectSourceRun : CollectSourceOnce)(
      source,
      snapshots,
      new PostgresSourceRegisterRepository(connection),
      new PostgresCollectionRunRepository(connection),
      new PostgresTransactionRunner(connection),
      new PostgresUuidV7Generator(connection),
      liveClock,
      new PostgresOutbox(connection),
    );
  let releaseEmpty;
  let enteredEmpty;
  const emptyEntered = new Promise((resolve) => {
    enteredEmpty = resolve;
  });
  const emptyRelease = new Promise((resolve) => {
    releaseEmpty = resolve;
  });
  const emptyPending = liveService(
    {
      fetchPage: async () => {
        enteredEmpty();
        await emptyRelease;
        return { documents: [], nextCursor: null, exhausted: true };
      },
      parse: (input, cancellation) => parser.parse(input, cancellation),
    },
    store,
    wallClock,
    true,
  ).execute(invertedSource, 'owned-inversion-empty-A', null, AbortSignal.timeout(60000));
  await emptyEntered;
  const emptyBoundary = (
    await connection.query(
      "SELECT run_id::text,started_at FROM collection.collection_run WHERE operation_key='owned-inversion-empty-A'",
    )
  )[0];
  let returnedObservation;
  const returnSource = {
    fetchPage: async () => {
      returnedObservation = wallClock.now();
      return {
        documents: [invertedDocument(returnedObservation)],
        nextCursor: null,
        exhausted: true,
      };
    },
    parse: (input, cancellation) => parser.parse(input, cancellation),
  };
  const returnedRun = await liveService(returnSource).execute(
    invertedSource,
    'owned-inversion-return-B',
    null,
    signal(),
  );
  await waitFor(
    'inverted B completion received while A held',
    async () =>
      (
        await connection.query(
          "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
          [returnedRun.completedEventId],
        )
      )[0].count === 1,
  );
  assert.equal(
    (await get(`listings/${invertedIdentity.listing_id}`, parseListingResponse)).listing
      .collectionCount,
    1,
  );
  releaseEmpty();
  const emptyRun = await emptyPending;
  assert.equal(emptyRun.runId, emptyBoundary.run_id);
  await waitFor(
    'inverted A then B reconciled',
    async () =>
      (await get(`listings/${invertedIdentity.listing_id}`, parseListingResponse)).listing
        .collectionCount === 2,
  );
  const emptyCompletedAt = (
    await connection.query('SELECT completed_at FROM collection.collection_run WHERE run_id=$1', [
      emptyRun.runId,
    ])
  )[0].completed_at.toISOString();
  assert(Date.parse(returnedObservation) < Date.parse(emptyCompletedAt));
  let invertedResponse = await get(`listings/${invertedIdentity.listing_id}`, parseListingResponse);
  assert.deepEqual(
    invertedResponse.listing.history.map((item) => [item.type, item.effectiveAt]),
    [
      ['created', initialObservation],
      ['removed', emptyCompletedAt],
      ['reappeared', returnedObservation],
    ],
  );
  assert.deepEqual(invertedResponse.listing.lifeline, [{ from: initialObservation, to: null }]);
  assert.equal(invertedResponse.metadata.asOf, emptyCompletedAt);
  assert.deepEqual(
    (
      await connection.query(
        'SELECT revision FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
        [invertedIdentity.listing_id],
      )
    ).map((row) => row.revision),
    [1, 2, 3],
  );

  // Permanent one-shot failures cannot leave an absence-blocking running boundary.
  const rejectedSource = {
    fetchPage: async () => ({ documents: [], nextCursor: null, exhausted: true }),
    parse: returnSource.parse,
  };
  await assert.rejects(
    liveService(rejectedSource).execute(
      invertedSource,
      'owned-once-terminal-rejection',
      null,
      signal(),
    ),
  );
  let retryFetches = 0;
  await assert.rejects(
    liveService({
      ...returnSource,
      fetchPage: async () => {
        retryFetches++;
        return returnSource.fetchPage();
      },
    }).execute(invertedSource, 'owned-once-terminal-rejection', null, signal()),
  );
  assert.equal(retryFetches, 0);
  await assert.rejects(
    liveService(returnSource).execute(
      'synthetic-portal-aurora',
      'owned-once-terminal-rejection',
      null,
      signal(),
    ),
  );
  const cancellation = new AbortController();
  await assert.rejects(
    liveService({
      ...returnSource,
      fetchPage: async () => {
        cancellation.abort();
        cancellation.signal.throwIfAborted();
      },
    }).execute(invertedSource, 'owned-once-terminal-cancellation', null, cancellation.signal),
  );
  const terminalRuns = await connection.query(
    "SELECT run_id::text,source_id,status,completed_at,completed_event_id,manifest_hash FROM collection.collection_run WHERE operation_key IN ('owned-once-terminal-rejection','owned-once-terminal-cancellation') ORDER BY operation_key",
  );
  assert.equal(terminalRuns.length, 2);
  for (const failed of terminalRuns) {
    assert.equal(failed.source_id, invertedSource);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.completed_at, null);
    assert.equal(failed.completed_event_id, null);
    assert.equal(failed.manifest_hash, null);
    assert.equal(
      (
        await connection.query(
          'SELECT count(*)::integer AS count FROM collection.completed_event_evidence WHERE run_id=$1',
          [failed.run_id],
        )
      )[0].count,
      0,
    );
  }
  const transientStore = {
    store: async () => {
      throw new ExternalFailure({ kind: 'transient', operation: 'collection.snapshot.store' });
    },
  };
  await assert.rejects(
    liveService(returnSource, transientStore).execute(
      invertedSource,
      'owned-once-transient-recovery',
      null,
      signal(),
    ),
  );
  const transientBoundary = (
    await connection.query(
      "SELECT run_id::text,started_at,status FROM collection.collection_run WHERE operation_key='owned-once-transient-recovery'",
    )
  )[0];
  assert.equal(transientBoundary.status, 'running');
  const recoveredRun = await liveService(returnSource).execute(
    invertedSource,
    'owned-once-transient-recovery',
    null,
    signal(),
  );
  assert.equal(recoveredRun.runId, transientBoundary.run_id);
  const recoveredBoundary = (
    await connection.query(
      'SELECT started_at,status FROM collection.collection_run WHERE run_id=$1',
      [recoveredRun.runId],
    )
  )[0];
  assert.equal(
    recoveredBoundary.started_at.toISOString(),
    transientBoundary.started_at.toISOString(),
  );
  assert.equal(recoveredBoundary.status, 'completed');
  await waitFor(
    'valid run progresses past failed boundaries',
    async () =>
      (await get(`listings/${invertedIdentity.listing_id}`, parseListingResponse)).listing
        .collectionCount === 3,
  );
  // A cleanup racing an already completed same-key request cannot downgrade success.
  await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
    assert.equal(
      (await new PostgresCollectionRunRepository(connection).fail(tx, recoveredRun.runId)).status,
      'completed',
    );
  }, signal());
  const nextObservation = new Date(Date.now() + 2 * 86400000).toISOString();
  await liveService(
    {
      fetchPage: async () => ({
        documents: [invertedDocument(nextObservation)],
        nextCursor: null,
        exhausted: true,
      }),
      parse: returnSource.parse,
    },
    store,
    { now: () => nextObservation },
  ).execute(invertedSource, 'owned-inversion-subsequent', null, signal());
  await waitFor(
    'subsequent inversion acquisition',
    async () =>
      (await get(`listings/${invertedIdentity.listing_id}`, parseListingResponse)).listing
        .collectionCount === 4,
  );
  invertedResponse = await get(`listings/${invertedIdentity.listing_id}`, parseListingResponse);
  assert.equal(invertedResponse.metadata.asOf, nextObservation);
  const invertedPropertyResponse = await get(
    `properties/${invertedIdentity.property_id}`,
    parsePropertyResponse,
  );
  assert.equal(
    invertedPropertyResponse.property.summary.timeOnMarketDays,
    Math.floor((Date.parse(nextObservation) - Date.parse(initialObservation)) / 86400000),
  );
  assert.deepEqual(invertedResponse.listing.lifeline, [{ from: initialObservation, to: null }]);
  assert.equal(invertedResponse.listing.history.length, 3);
  assert.deepEqual(invertedPropertyResponse.property.listings[0], invertedResponse.listing);
  // Real combined command deadlines preserve same-key source/storage recovery.
  const observationSource = 'synthetic-portal-aurora';
  const liveDocument = (identity, observedAt, price, description) => ({
    sourceId: observationSource,
    sourceListingId: identity,
    sourceUrl: `https://synthetic.invalid/listings/${identity}`,
    observedAt,
    mediaType: 'application/json',
    bytes: new TextEncoder().encode(
      JSON.stringify({ ...first, askingPriceMinorUnits: price, maskedDescription: description }),
    ),
  });
  const timeoutSource = {
    fetchPage: async () => ({
      documents: [liveDocument('OWNED-DEADLINE', wallClock.now(), 1000000, 'Deadline recovery.')],
      nextCursor: null,
      exhausted: true,
    }),
    parse: returnSource.parse,
  };
  for (const dependency of ['source', 'storage']) {
    let entered = false;
    const awaitDeadline = async (cancellation) => {
      entered = true;
      await new Promise((resolve) =>
        cancellation.addEventListener('abort', resolve, { once: true }),
      );
      // The production source and S3 adapters sanitize command aborts this way.
      throw new ExternalFailure({ kind: 'cancelled', operation: `owned-deadline-${dependency}` });
    };
    const shutdown = new AbortController();
    const deadlineMs = 500;
    const deadlineAt = Date.now() + deadlineMs;
    const combined = AbortSignal.any([shutdown.signal, AbortSignal.timeout(deadlineMs)]);
    const key = `owned-command-deadline-${dependency}`;
    await assert.rejects(
      liveService(
        dependency === 'source'
          ? {
              ...timeoutSource,
              fetchPage: (_source, _cursor, cancellation) => awaitDeadline(cancellation),
            }
          : timeoutSource,
        dependency === 'storage'
          ? { store: (_input, cancellation) => awaitDeadline(cancellation) }
          : store,
      ).execute(observationSource, key, null, combined, deadlineAt),
    );
    assert.equal(entered, true);
    assert.equal(combined.reason.name, 'TimeoutError');
    const boundary = (
      await connection.query(
        'SELECT run_id::text,started_at,status FROM collection.collection_run WHERE operation_key=$1',
        [key],
      )
    )[0];
    assert.equal(boundary.status, 'running');
    assert.equal(
      (
        await connection.query(
          'SELECT count(*)::integer AS count FROM collection.parsed_event_evidence evidence JOIN collection.snapshot_observation observation USING (snapshot_id) WHERE observation.run_id=$1',
          [boundary.run_id],
        )
      )[0].count,
      0,
    );
    assert.equal(
      (
        await connection.query(
          'SELECT count(*)::integer AS count FROM collection.completed_event_evidence WHERE run_id=$1',
          [boundary.run_id],
        )
      )[0].count,
      0,
    );
    const recovered = await liveService(timeoutSource).execute(
      observationSource,
      key,
      null,
      signal(),
    );
    assert.equal(recovered.runId, boundary.run_id);
    const completed = (
      await connection.query(
        'SELECT started_at,status FROM collection.collection_run WHERE run_id=$1',
        [boundary.run_id],
      )
    )[0];
    assert.equal(completed.started_at.toISOString(), boundary.started_at.toISOString());
    assert.equal(completed.status, 'completed');
  }
  await waitFor(
    'deadline retries materialized exactly once',
    async () =>
      (
        await connection.query(
          "SELECT count(*)::integer AS count FROM properties.listing_acquisition acquisition JOIN properties.listing listing USING (listing_id) WHERE listing.source_listing_id='OWNED-DEADLINE'",
        )
      )[0].count === 2,
  );

  // A starts first and fetches later; B observes first but its canonical effects wait for A.
  // Both the existing identity and the newly created identity retain this genuine inversion.
  const observedIdentities = ['OWNED-OBSERVATION-EXISTING', 'OWNED-OBSERVATION-NEW'];
  const observationRun = (source) => liveService(source, store, wallClock, true);
  const seedObservation = wallClock.now();
  await observationRun({
    ...timeoutSource,
    fetchPage: async () => ({
      documents: [liveDocument(observedIdentities[0], seedObservation, 1000000, 'Seed values.')],
      nextCursor: null,
      exhausted: true,
    }),
  }).execute(observationSource, 'owned-observation-seed', null, signal());
  await waitFor(
    'observation seed materialized',
    async () =>
      (
        await connection.query(
          'SELECT listing_id FROM properties.listing WHERE source_listing_id=$1',
          [observedIdentities[0]],
        )
      ).length === 1,
  );
  let releaseDocuments, enteredDocuments;
  const documentRelease = new Promise((resolve) => {
    releaseDocuments = resolve;
  });
  const documentEntered = new Promise((resolve) => {
    enteredDocuments = resolve;
  });
  let observationA, observationB;
  const pendingDocuments = observationRun({
    ...timeoutSource,
    fetchPage: async () => {
      enteredDocuments();
      await documentRelease;
      observationA = wallClock.now();
      return {
        documents: observedIdentities.map((identity) =>
          liveDocument(identity, observationA, 1300000, 'A later observation.'),
        ),
        nextCursor: null,
        exhausted: true,
      };
    },
  }).execute(observationSource, 'owned-observation-A', null, AbortSignal.timeout(60000));
  await documentEntered;
  const runB = await observationRun({
    ...timeoutSource,
    fetchPage: async () => {
      observationB = wallClock.now();
      return {
        documents: observedIdentities.map((identity) =>
          liveDocument(identity, observationB, 1200000, 'B earlier observation.'),
        ),
        nextCursor: null,
        exhausted: true,
      };
    },
  }).execute(observationSource, 'owned-observation-B', null, signal());
  await waitFor(
    'document-bearing B completion fenced by A',
    async () =>
      (
        await connection.query(
          "SELECT event_id FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
          [runB.completedEventId],
        )
      ).length === 1,
  );
  assert.equal(
    (
      await connection.query('SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1', [
        runB.runId,
      ])
    ).length,
    0,
  );
  releaseDocuments();
  const runA = await pendingDocuments;
  assert(Date.parse(observationB) < Date.parse(observationA));
  const observationResponses = [];
  for (const [index, identity] of observedIdentities.entries()) {
    await waitFor(
      `${identity} retains both inverted acquisitions`,
      async () =>
        (
          await connection.query(
            "SELECT jsonb_array_length(current.state->'acquisitions') AS count FROM properties.listing_current current JOIN properties.listing listing USING (listing_id) WHERE listing.source_listing_id=$1",
            [identity],
          )
        )[0]?.count === (index === 0 ? 3 : 2),
    );
    const ids = (
      await connection.query(
        'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
        [identity],
      )
    )[0];
    const detail = await get(`listings/${ids.listing_id}`, parseListingResponse);
    assert.equal(detail.listing.askingPriceMinorUnits, 1300000);
    assert.equal(detail.listing.description.current, 'A later observation.');
    assert.equal(detail.listing.provenance.runId, runA.runId);
    assert.equal(detail.listing.lastCollectedAt, observationA);
    assert.equal(detail.metadata.asOf, observationA);
    assert.deepEqual(
      detail.listing.description.versions.slice(-2).map((item) => [item.effectiveAt, item.text]),
      [
        [observationB, 'B earlier observation.'],
        [observationA, 'A later observation.'],
      ],
    );
    assert.deepEqual(
      detail.listing.history.slice(-2).map((item) => [item.type, item.effectiveAt]),
      [
        ['price-changed', observationB],
        ['description-changed', observationB],
      ],
    );
    assert.equal(detail.listing.history.at(-2).previousMinorUnits, 1300000);
    const effects = await connection.query(
      'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
      [ids.listing_id],
    );
    assert.deepEqual(
      effects.map((row) => row.revision),
      Array.from({ length: index === 0 ? 5 : 3 }, (_item, i) => i + 1),
    );
    assert.deepEqual(
      (await get(`properties/${ids.property_id}`, parsePropertyResponse)).property.listings[0],
      detail.listing,
    );
    const olderSnapshot = (
      await connection.query(
        'SELECT snapshot_id::text FROM collection.snapshot_observation WHERE run_id=$1 AND source_listing_id=$2',
        [runB.runId, identity],
      )
    )[0].snapshot_id;
    await reparse(
      olderSnapshot,
      `owned-inverted-correction-${index}`,
      1100000,
      'Corrected earlier observation.',
    );
    await waitFor('inverted historical correction', async () =>
      (
        await get(`listings/${ids.listing_id}`, parseListingResponse)
      ).listing.description.versions.some((item) => item.text === 'Corrected earlier observation.'),
    );
    assert.deepEqual(
      await connection.query(
        'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
        [ids.listing_id],
      ),
      effects,
    );
    observationResponses.push({ ...ids, count: index === 0 ? 3 : 2 });
  }
  const subsequentObservation = wallClock.now();
  await observationRun({
    ...timeoutSource,
    fetchPage: async () => ({
      documents: observedIdentities.map((identity) =>
        liveDocument(identity, subsequentObservation, 1400000, 'Subsequent observation.'),
      ),
      nextCursor: null,
      exhausted: true,
    }),
  }).execute(observationSource, 'owned-observation-subsequent', null, signal());
  for (const item of observationResponses) {
    await waitFor(
      'subsequent canonical observation',
      async () =>
        (await get(`listings/${item.listing_id}`, parseListingResponse)).listing.collectionCount ===
        item.count + 1,
    );
    item.response = await get(`listings/${item.listing_id}`, parseListingResponse);
    assert.equal(item.response.listing.history.at(-2).previousMinorUnits, 1200000);
    assert.equal(item.response.listing.askingPriceMinorUnits, 1400000);
    assert.deepEqual(
      (await get(`properties/${item.property_id}`, parsePropertyResponse)).property.listings[0],
      item.response.listing,
    );
  }
  // Additional identities use an already owned source without widening Collection authority.
  // This source already has January 2027 runs. Shift the live clock beyond that cursor while
  // retaining real elapsed start/observation/completion differences during overlapping fetches.
  const edgeClockOffset = Date.parse('2027-02-10T12:00:00.000Z') - Date.now();
  const edgeClock = { now: () => new Date(Date.now() + edgeClockOffset).toISOString() };
  const edgeDocument = (sourceId, identity, observedAt) => ({
    sourceId,
    sourceListingId: identity,
    sourceUrl: `https://synthetic.invalid/listings/${identity}`,
    observedAt,
    mediaType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify(first)),
  });
  const edgeRun = (sourceId, key, documents, runClock = edgeClock, onFetch = async () => {}) =>
    liveService(
      {
        fetchPage: async () => {
          await onFetch();
          return {
            documents: typeof documents === 'function' ? documents() : documents,
            nextCursor: null,
            exhausted: true,
          };
        },
        parse: returnSource.parse,
      },
      store,
      runClock,
      true,
    ).execute(sourceId, key, null, AbortSignal.timeout(60000));
  const waitProgress = (sourceId, result) =>
    waitFor(
      'edge-case source progress',
      async () =>
        (
          await connection.query(
            'SELECT last_run_id::text FROM properties.source_work WHERE source_id=$1',
            [sourceId],
          )
        )[0]?.last_run_id === result.runId,
    );
  const edgeResponses = [];
  const absenceSource = 'synthetic-portal-cobalto';
  const absenceIdentities = ['OWNED-ABSENCE-EXISTING', 'OWNED-ABSENCE-NEW'];
  const absenceSeed = new Date(Date.parse(edgeClock.now()) - 5 * 86400000).toISOString();
  await waitProgress(
    absenceSource,
    await edgeRun(absenceSource, 'owned-absence-seed', [
      edgeDocument(absenceSource, absenceIdentities[0], absenceSeed),
    ]),
  );
  let releaseAbsence, enterAbsence;
  const absenceHeld = new Promise((resolve) => {
    releaseAbsence = resolve;
  });
  const absenceEntered = new Promise((resolve) => {
    enterAbsence = resolve;
  });
  let absenceObservation;
  const documentA = edgeRun(
    absenceSource,
    'owned-absence-document-A',
    () => {
      absenceObservation = edgeClock.now();
      return absenceIdentities.map((identity) =>
        edgeDocument(absenceSource, identity, absenceObservation),
      );
    },
    edgeClock,
    async () => {
      enterAbsence();
      await absenceHeld;
    },
  );
  await absenceEntered;
  const emptyB = await edgeRun(absenceSource, 'owned-absence-empty-B', []);
  const earlierCompletion = (
    await connection.query('SELECT completed_at FROM collection.collection_run WHERE run_id=$1', [
      emptyB.runId,
    ])
  )[0].completed_at.toISOString();
  assert.equal(
    (
      await connection.query('SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1', [
        emptyB.runId,
      ])
    ).length,
    0,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  releaseAbsence();
  await documentA;
  await waitProgress(absenceSource, emptyB);
  assert(Date.parse(absenceObservation) > Date.parse(earlierCompletion));
  for (const [index, identity] of absenceIdentities.entries()) {
    const ids = (
      await connection.query(
        'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
        [identity],
      )
    )[0];
    const detail = await get(`listings/${ids.listing_id}`, parseListingResponse);
    assert.equal(detail.listing.collectionCount, index === 0 ? 2 : 1);
    assert.equal(detail.listing.status, index === 0 ? 'removed' : 'active');
    assert.equal(detail.metadata.asOf, absenceObservation);
    if (index === 0) {
      assert.deepEqual(
        detail.listing.history.map((entry) => [entry.type, entry.effectiveAt]),
        [
          ['created', absenceSeed],
          ['removed', earlierCompletion],
        ],
      );
      assert.equal(detail.listing.history.at(-1).provenance.observedAt, absenceSeed);
      const event = (
        await connection.query(
          'SELECT event FROM properties.listing_event WHERE listing_id=$1 AND revision=2',
          [ids.listing_id],
        )
      )[0].event;
      assert.equal(event.payload.listing.provenance.observedAt, absenceSeed);
      assert.equal(event.payload.effectiveAt, earlierCompletion);
    } else
      assert.deepEqual(
        detail.listing.history.map((entry) => entry.type),
        ['created'],
      );
    assert.equal(
      (
        await connection.query(
          'SELECT disposition FROM properties.listing_run_effect WHERE run_id=$1 AND source_listing_id=$2',
          [emptyB.runId, identity],
        )
      )[0].disposition,
      'applied',
    );
    assert.deepEqual(
      (await get(`properties/${ids.property_id}`, parsePropertyResponse)).property.listings[0],
      detail.listing,
    );
    edgeResponses.push({ ...ids, sourceId: absenceSource });
  }
  const subsequentAbsenceObservation = edgeClock.now();
  await waitProgress(
    absenceSource,
    await edgeRun(
      absenceSource,
      'owned-absence-subsequent',
      absenceIdentities.map((identity) =>
        edgeDocument(absenceSource, identity, subsequentAbsenceObservation),
      ),
    ),
  );
  for (const [index, item] of edgeResponses.entries()) {
    item.response = await get(`listings/${item.listing_id}`, parseListingResponse);
    assert.equal(item.response.listing.collectionCount, index === 0 ? 3 : 2);
    assert.equal(item.response.listing.status, 'active');
    assert.equal(item.response.listing.history.at(-1).type, index === 0 ? 'reappeared' : 'created');
    assert.deepEqual(
      (await get(`properties/${item.property_id}`, parsePropertyResponse)).property.listings[0],
      item.response.listing,
    );
  }

  // Independent synthetic start/completion clocks retain real publication evidence for all runs.
  // Holding Removed(7) lets the later-started return(3) and absence(5) complete first.
  const periodsSource = absenceSource;
  const periodDate = (day) => `2027-03-${String(day).padStart(2, '0')}T12:00:00.000Z`;
  const periodIdentity = 'OWNED-CONSTITUENT-PERIODS';
  const periodClock = (ordinal, completedDay) => {
    let calls = 0;
    return {
      now: () =>
        calls++ === 0
          ? new Date(Date.parse(periodDate(1)) + ordinal * 1000).toISOString()
          : periodDate(completedDay),
    };
  };
  const periodRun = (ordinal, observedDay, completedDay, onFetch) =>
    edgeRun(
      periodsSource,
      `owned-period-${ordinal}`,
      observedDay === null
        ? []
        : [edgeDocument(periodsSource, periodIdentity, periodDate(observedDay))],
      periodClock(ordinal, completedDay),
      onFetch,
    );
  await waitProgress(periodsSource, await periodRun(0, 1, 1));
  await waitProgress(periodsSource, await periodRun(1, null, 4));
  await waitProgress(periodsSource, await periodRun(2, 6, 6));
  let releasePeriod, enterPeriod;
  const periodHeld = new Promise((resolve) => {
    releasePeriod = resolve;
  });
  const periodEntered = new Promise((resolve) => {
    enterPeriod = resolve;
  });
  const removal7 = periodRun(3, null, 7, async () => {
    enterPeriod();
    await periodHeld;
  });
  await periodEntered;
  const return3 = await periodRun(4, 3, 3);
  const removal5 = await periodRun(5, null, 5);
  assert.equal(
    (
      await connection.query('SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1', [
        return3.runId,
      ])
    ).length,
    0,
  );
  releasePeriod();
  await removal7;
  await waitProgress(periodsSource, removal5);
  const periodIds = (
    await connection.query(
      'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
      [periodIdentity],
    )
  )[0];
  const periodResponse = await get(`listings/${periodIds.listing_id}`, parseListingResponse);
  const constituents = [
    { from: periodDate(1), to: periodDate(4) },
    { from: periodDate(6), to: periodDate(7) },
    { from: periodDate(3), to: periodDate(5) },
  ];
  assert.deepEqual(
    (
      await connection.query('SELECT state FROM properties.listing_current WHERE listing_id=$1', [
        periodIds.listing_id,
      ])
    )[0].state.lifeline,
    constituents,
  );
  assert.deepEqual(periodResponse.listing.lifeline, [
    { from: periodDate(1), to: periodDate(5) },
    { from: periodDate(6), to: periodDate(7) },
  ]);
  assert.deepEqual(
    periodResponse.listing.history.map((entry) => [entry.type, entry.effectiveAt]),
    [
      ['created', periodDate(1)],
      ['removed', periodDate(4)],
      ['reappeared', periodDate(6)],
      ['removed', periodDate(7)],
      ['reappeared', periodDate(3)],
      ['removed', periodDate(5)],
    ],
  );
  assert.equal(periodResponse.listing.collectionCount, 3);
  assert.equal(periodResponse.metadata.asOf, periodDate(7));
  const periodProperty = await get(`properties/${periodIds.property_id}`, parsePropertyResponse);
  assert.equal(periodProperty.property.summary.timeOnMarketDays, 5);
  assert.deepEqual(periodProperty.property.listings[0], periodResponse.listing);
  const periodEvents = await connection.query(
    'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
    [periodIds.listing_id],
  );
  assert.deepEqual(
    periodEvents.map((entry) => entry.revision),
    [1, 2, 3, 4, 5, 6],
  );
  edgeResponses.push({ ...periodIds, response: periodResponse, constituents, exposure: 5 });

  for (const item of edgeResponses)
    item.response = await get(`listings/${item.listing_id}`, parseListingResponse);

  const originals = await connection.query(
    'SELECT event FROM collection.parsed_event_evidence ORDER BY event_id',
  );
  const immutableEffects = JSON.stringify(
    await connection.query(
      'SELECT event FROM properties.listing_event ORDER BY listing_id,revision',
    ),
  );
  await connection.query(
    "DELETE FROM platform.inbox WHERE consumer_name IN ('properties.parsed-listing','properties.completed-run')",
  );
  await compose('restart', 'worker', 'api');
  await compose('up', '--detach', '--wait', 'worker', 'api');
  for (const row of [...originals].reverse())
    await publisher.publish(parseCollectionEvent(row.event), signal());
  const completions = await connection.query(
    'SELECT event FROM collection.completed_event_evidence ORDER BY event_id DESC',
  );
  for (const row of completions) await publisher.publish(parseCollectionEvent(row.event), signal());
  await waitFor(
    'replayed receipt markers',
    async () =>
      (
        await connection.query(
          "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.parsed-listing'",
        )
      )[0].count === originals.length,
  );
  assert.equal(
    JSON.stringify(
      await connection.query(
        'SELECT event FROM properties.listing_event ORDER BY listing_id,revision',
      ),
    ),
    immutableEffects,
  );
  assert.deepEqual(
    await get(`listings/${focused.listing_id}`, parseListingResponse),
    focusedResponse,
  );
  assert.deepEqual(
    await get(`listings/${invertedIdentity.listing_id}`, parseListingResponse),
    invertedResponse,
  );
  for (const item of observationResponses) {
    assert.deepEqual(await get(`listings/${item.listing_id}`, parseListingResponse), item.response);
    assert.deepEqual(
      (await get(`properties/${item.property_id}`, parsePropertyResponse)).property.listings[0],
      item.response.listing,
    );
  }
  for (const item of edgeResponses) {
    assert.deepEqual(await get(`listings/${item.listing_id}`, parseListingResponse), item.response);
    const property = await get(`properties/${item.property_id}`, parsePropertyResponse);
    assert.deepEqual(property.property.listings[0], item.response.listing);
    if (item.constituents) {
      assert.deepEqual(
        (
          await connection.query(
            'SELECT state FROM properties.listing_current WHERE listing_id=$1',
            [item.listing_id],
          )
        )[0].state.lifeline,
        item.constituents,
      );
      assert.equal(property.property.summary.timeOnMarketDays, item.exposure);
    }
  }
  await connection.query(
    "UPDATE collection.source_register SET listing_text_display_allowed=false WHERE source_id='synthetic-data'",
  );
  for (const [path, parse] of [
    [`listings/${focused.listing_id}`, parseListingResponse],
    [`properties/${focused.property_id}`, parsePropertyResponse],
  ]) {
    const response = await get(path, parse);
    assert(!/"current"|"versions"|"text"|Owned history journey/.test(JSON.stringify(response)));
    const listing = response.listing ?? response.property.listings[0];
    assert.equal(listing.description.permission, 'denied');
    assert.deepEqual(listing.history, focusedResponse.listing.history);
  }
  await assert.rejects(
    connection.query(
      'UPDATE properties.listing_acquisition SET observed_at=observed_at WHERE listing_id=$1',
      [focused.listing_id],
    ),
    /immutable/,
  );
  await assert.rejects(
    connection.query('UPDATE properties.listing_event SET event=event WHERE listing_id=$1', [
      focused.listing_id,
    ]),
    /immutable/,
  );
  await assert.rejects(
    connection.query('UPDATE collection.completed_event_evidence SET event=event'),
    /immutable/,
  );
  // Source admission is shared by both production entries and canonical selection. An
  // uncommitted running registration cannot be invisible to an advancing selection.
  const admissionSource = absenceSource;
  const admissionOffset = Date.parse('2027-04-10T12:00:00.000Z') - Date.now();
  const admissionClock = { now: () => new Date(Date.now() + admissionOffset).toISOString() };
  const admissionResponses = [];
  const makeAdmissionService = (Entry, identity, repository, entryClock = admissionClock, fetch) =>
    new Entry(
      {
        fetchPage: async () => {
          if (fetch) await fetch();
          return {
            documents: [edgeDocument(admissionSource, identity, entryClock.now())],
            nextCursor: null,
            exhausted: true,
          };
        },
        parse: (document, cancellation) => parser.parse(document, cancellation),
      },
      store,
      new PostgresSourceRegisterRepository(connection),
      repository,
      new PostgresTransactionRunner(connection),
      new PostgresUuidV7Generator(connection),
      entryClock,
      new PostgresOutbox(connection),
    );
  const retainAdmission = async (identity, count) => {
    await waitFor(
      `${identity} durable acquisitions`,
      async () =>
        (
          await connection.query(
            "SELECT jsonb_array_length(current.state->'acquisitions') AS count FROM properties.listing_current current JOIN properties.listing listing USING(listing_id) WHERE listing.source_listing_id=$1",
            [identity],
          )
        )[0]?.count === count,
    );
    const ids = (
      await connection.query(
        'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
        [identity],
      )
    )[0];
    const response = await get(`listings/${ids.listing_id}`, parseListingResponse);
    assert.equal(response.listing.collectionCount, count);
    assert.deepEqual(
      (await get(`properties/${ids.property_id}`, parsePropertyResponse)).property.listings[0],
      response.listing,
    );
    admissionResponses.push({ ...ids, response });
  };
  for (const [index, Entry] of [CollectSourceOnce, CollectSourceRun].entries()) {
    const identity = `OWNED-ADMISSION-${index}`;
    const keyA = `owned-admission-A-${index}`;
    let enterRegistration, releaseRegistration, enterFetch, releaseFetch;
    const registrationEntered = new Promise((resolve) => {
      enterRegistration = resolve;
    });
    const registrationHeld = new Promise((resolve) => {
      releaseRegistration = resolve;
    });
    const fetchEntered = new Promise((resolve) => {
      enterFetch = resolve;
    });
    const fetchHeld = new Promise((resolve) => {
      releaseFetch = resolve;
    });
    class HeldRegistration extends PostgresCollectionRunRepository {
      async startOrLoad(transaction, input) {
        const retained = await super.startOrLoad(transaction, input);
        enterRegistration();
        await registrationHeld;
        return retained;
      }
    }
    const frontier = (
      await connection.query(
        'SELECT started_at,run_id::text FROM collection.collection_run WHERE source_id=$1 ORDER BY started_at DESC,run_id DESC LIMIT 1',
        [admissionSource],
      )
    )[0];
    const after = frontier
      ? { startedAt: frontier.started_at.toISOString(), runId: frontier.run_id }
      : null;
    const pendingA = makeAdmissionService(
      Entry,
      identity,
      new HeldRegistration(connection),
      admissionClock,
      async () => {
        enterFetch();
        await fetchHeld;
      },
    ).execute(admissionSource, keyA, null, AbortSignal.timeout(60000));
    await registrationEntered;
    assert.equal(
      (
        await connection.query(
          'SELECT run_id FROM collection.collection_run WHERE operation_key=$1',
          [keyA],
        )
      ).length,
      0,
    );
    let bClockCalls = 0,
      bFetchCalls = 0,
      selectionFinished = false;
    const bClock = {
      now: () => {
        bClockCalls++;
        return admissionClock.now();
      },
    };
    const OtherEntry = Entry === CollectSourceOnce ? CollectSourceRun : CollectSourceOnce;
    const pendingB = makeAdmissionService(
      OtherEntry,
      identity,
      new PostgresCollectionRunRepository(connection),
      bClock,
      async () => {
        bFetchCalls++;
      },
    ).execute(admissionSource, `owned-admission-B-${index}`, null, AbortSignal.timeout(60000));
    const selection = new PostgresTransactionRunner(connection).runInTransaction(
      async (transaction) => {
        const result = await new PostgresCollectionFacade(
          connection,
          new PostgresSourceRegisterRepository(connection),
        ).nextCompletedRun(transaction, admissionSource, after);
        selectionFinished = true;
        return result;
      },
      signal(),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(selectionFinished, false);
    assert.equal(bClockCalls, 0);
    assert.equal(bFetchCalls, 0);
    await assert.rejects(
      new PostgresTransactionRunner(connection).runInTransaction(
        (transaction) =>
          new PostgresCollectionFacade(
            connection,
            new PostgresSourceRegisterRepository(connection),
          ).nextCompletedRun(transaction, admissionSource, after),
        AbortSignal.timeout(20),
      ),
      (error) => error.name === 'TimeoutError',
    );
    releaseRegistration();
    await fetchEntered;
    const resultB = await pendingB;
    assert.equal(await selection, null);
    assert.equal(
      (
        await connection.query('SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1', [
          resultB.runId,
        ])
      ).length,
      0,
    );
    releaseFetch();
    const resultA = await pendingA;
    await waitProgress(admissionSource, resultB);
    const admitted = await connection.query(
      'SELECT operation_key,run_id::text,started_at FROM collection.collection_run WHERE operation_key=ANY($1::text[]) ORDER BY started_at,run_id',
      [[keyA, `owned-admission-B-${index}`]],
    );
    assert.deepEqual(
      admitted.map((row) => row.run_id),
      [resultA.runId, resultB.runId],
    );
    await retainAdmission(identity, 2);
  }

  // A caller held after a genuine empty lookup must capture its start after B is admitted.
  // The same gate also proves that a same-key completion becomes a successful one-shot replay.
  for (const [index, Entry, sameKey] of [
    [0, CollectSourceOnce, false],
    [1, CollectSourceRun, false],
    [2, CollectSourceOnce, true],
  ]) {
    const identity = `OWNED-ADMISSION-LOOKUP-${index}`;
    const keyA = `owned-admission-lookup-A-${index}`;
    const keyB = sameKey ? keyA : `owned-admission-lookup-B-${index}`;
    let enterLookup, releaseLookup;
    const lookupEntered = new Promise((resolve) => {
      enterLookup = resolve;
    });
    const lookupHeld = new Promise((resolve) => {
      releaseLookup = resolve;
    });
    class HeldLookup extends PostgresCollectionRunRepository {
      async loadRunByOperationKey(key, cancellation) {
        const result = await super.loadRunByOperationKey(key, cancellation);
        enterLookup();
        await lookupHeld;
        return result;
      }
    }
    let aFetchCalls = 0;
    const pendingA = makeAdmissionService(
      Entry,
      identity,
      new HeldLookup(connection),
      admissionClock,
      async () => {
        aFetchCalls++;
      },
    ).execute(admissionSource, keyA, null, AbortSignal.timeout(60000));
    await lookupEntered;
    const resultB = await makeAdmissionService(
      CollectSourceOnce,
      identity,
      new PostgresCollectionRunRepository(connection),
    ).execute(admissionSource, keyB, null, signal());
    await waitProgress(admissionSource, resultB);
    releaseLookup();
    const resultA = await pendingA;
    if (sameKey) {
      assert.deepEqual(resultA, { ...resultB, replayed: true });
      assert.equal(aFetchCalls, 0);
      assert.equal(
        (
          await connection.query(
            'SELECT event_id FROM collection.completed_event_evidence WHERE run_id=$1',
            [resultA.runId],
          )
        ).length,
        1,
      );
    } else {
      await waitProgress(admissionSource, resultA);
      const ordered = await connection.query(
        'SELECT run_id::text FROM collection.collection_run WHERE operation_key=ANY($1::text[]) ORDER BY started_at,run_id',
        [[keyA, keyB]],
      );
      assert.deepEqual(
        ordered.map((row) => row.run_id),
        [resultB.runId, resultA.runId],
      );
    }
    await retainAdmission(identity, sameKey ? 1 : 2);
  }

  // Force equal start milliseconds and an initially smaller UUID through the actual generator
  // seam. Admission chooses another authentic UUID; dates and completed publications stay intact.
  const tiedIdentity = 'OWNED-ADMISSION-TIED';
  const tiedDate = '2027-04-11T12:00:00.000Z';
  const tiedClock = { now: () => tiedDate };
  const tiedA = await makeAdmissionService(
    CollectSourceRun,
    tiedIdentity,
    new PostgresCollectionRunRepository(connection),
    tiedClock,
  ).execute(admissionSource, 'owned-admission-tied-A', null, signal());
  await waitProgress(admissionSource, tiedA);
  const realIdentifiers = new PostgresUuidV7Generator(connection);
  let generated = 0;
  const tiedB = await new CollectSourceOnce(
    {
      fetchPage: async () => ({
        documents: [edgeDocument(admissionSource, tiedIdentity, tiedDate)],
        nextCursor: null,
        exhausted: true,
      }),
      parse: (document, cancellation) => parser.parse(document, cancellation),
    },
    store,
    new PostgresSourceRegisterRepository(connection),
    new PostgresCollectionRunRepository(connection),
    new PostgresTransactionRunner(connection),
    {
      generate: async (transaction) =>
        generated++ === 0
          ? '00000000-0000-7000-8000-000000000000'
          : realIdentifiers.generate(transaction),
    },
    tiedClock,
    new PostgresOutbox(connection),
  ).execute(admissionSource, 'owned-admission-tied-B', null, signal());
  assert(tiedB.runId > tiedA.runId);
  assert(generated >= 5);
  const tiedRuns = await connection.query(
    'SELECT started_at FROM collection.collection_run WHERE run_id=ANY($1::uuid[])',
    [[tiedA.runId, tiedB.runId]],
  );
  assert(tiedRuns.every((row) => row.started_at.toISOString() === tiedDate));
  await waitProgress(admissionSource, tiedB);
  await retainAdmission(tiedIdentity, 2);

  // Later completed source runs can legitimately remove earlier scenario listings. Capture
  // the final current state only after all admissions, independently of the old campaign above.
  for (const item of admissionResponses)
    item.response = await get(`listings/${item.listing_id}`, parseListingResponse);
  const admissionEffects = JSON.stringify(
    await connection.query(
      'SELECT event FROM properties.listing_event ORDER BY listing_id,revision',
    ),
  );
  const admissionOriginals = await connection.query(
    'SELECT event FROM collection.parsed_event_evidence ORDER BY event_id DESC',
  );
  const admissionCompletions = await connection.query(
    'SELECT event FROM collection.completed_event_evidence ORDER BY event_id DESC',
  );
  await connection.query(
    "DELETE FROM platform.inbox WHERE consumer_name IN ('properties.parsed-listing','properties.completed-run')",
  );
  await compose('restart', 'worker', 'api');
  await compose('up', '--detach', '--wait', 'worker', 'api');
  for (const row of admissionCompletions)
    await publisher.publish(parseCollectionEvent(row.event), signal());
  for (const row of admissionOriginals)
    await publisher.publish(parseCollectionEvent(row.event), signal());
  await waitFor(
    'admission replay receipt markers',
    async () =>
      (
        await connection.query(
          "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.parsed-listing'",
        )
      )[0].count === admissionOriginals.length,
  );
  assert.equal(
    JSON.stringify(
      await connection.query(
        'SELECT event FROM properties.listing_event ORDER BY listing_id,revision',
      ),
    ),
    admissionEffects,
  );
  for (const item of admissionResponses) {
    assert.deepEqual(await get(`listings/${item.listing_id}`, parseListingResponse), item.response);
    assert.deepEqual(
      (await get(`properties/${item.property_id}`, parsePropertyResponse)).property.listings[0],
      item.response.listing,
    );
  }
  console.log(
    'Properties history passed: 39 genuine catalog runs, 115 acquisitions, exactly 18 immutable catalog market events, five-type journey, acquisition dates/provenance/revisions/lifelines, historical/current highest-order corrections, correction-first receipt/completion-first missing-original recovery, both-entry transactional admission races, tied starts, authentic one-shot replay, restart/replay and current privacy.',
  );
} catch (error) {
  await compose('logs', '--no-color', '--tail', '100', 'worker', 'api', 'migrations')
    .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
    .catch(() => undefined);
  throw error;
} finally {
  await Promise.all(
    reservations
      .filter((server) => server.listening)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
  await publisher?.close().catch(() => undefined);
  store?.destroy();
  await connection?.close().catch(() => undefined);
  await compose('down', '--volumes', '--remove-orphans');
  for (const [command, format] of [
    ['ps', '{{.ID}}'],
    ['volume', '{{.Name}}'],
  ]) {
    const args = command === 'ps' ? ['ps', '--all'] : ['volume', 'ls'];
    const remaining = await run('docker', [
      ...args,
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      format,
    ]);
    assert.equal(remaining.stdout.trim(), '', 'The exact campaign retained resources.');
  }
  console.log(`Cleaned exact campaign project ${project}.`);
}
