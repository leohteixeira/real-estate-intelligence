import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import {
  CollectSourceRun,
  ConsumeCollectionRunRequest,
  EnableSource,
  ExternalFailure,
  ListingSourceAccessRefusal,
} from '../packages/application/dist/index.js';
import { CollectionRunRequested } from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresCollectionScheduleRepository,
  PostgresInbox,
  PostgresOutbox,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SyntheticSaoPauloListingSource,
} from '../packages/infrastructure/dist/index.js';
import { ResilientListingSource } from '../apps/worker/dist/collection/resilient-listing-source.js';
import { ResilientRawSnapshotStore } from '../apps/worker/dist/collection/resilient-raw-snapshot-store.js';
import { rawSnapshotStoreResilienceSettings } from '../apps/worker/dist/collection/collection-resilience.settings.js';
import { coordinateSourceRegisterCleanup } from './source-register-cleanup.mjs';

const exec = promisify(execFile);
const SOURCE = 'synthetic-portal-aurora';
const clock = { now: () => new Date().toISOString() };
const signal = () => AbortSignal.timeout(15_000);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function allocatePorts(count) {
  const servers = [];
  try {
    for (let index = 0; index < count; index++) {
      const server = createServer();
      server.unref();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
      });
      servers.push(server);
    }
    return servers.map((server) => server.address().port);
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}

function services(connection, source, store) {
  const sources = new PostgresSourceRegisterRepository(connection);
  const runs = new PostgresCollectionRunRepository(connection);
  const transactions = new PostgresTransactionRunner(connection);
  const identifiers = new PostgresUuidV7Generator(connection);
  const outbox = new PostgresOutbox(connection);
  const collector = new CollectSourceRun(
    source(sources),
    store,
    sources,
    runs,
    transactions,
    identifiers,
    clock,
    outbox,
  );
  return { sources, runs, transactions, identifiers, outbox, collector };
}

async function restartProbe() {
  const connection = new DatabaseConnection(process.env.RESILIENCE_FIXTURE_DATABASE_URL);
  try {
    let requests = 0;
    const adapter = {
      fetchPage: async () => {
        requests++;
        throw new Error('Held adapter must not be reached.');
      },
      parse: async () => {
        throw new Error('Held parser must not be reached.');
      },
    };
    const sources = new PostgresSourceRegisterRepository(connection);
    try {
      await new ResilientListingSource(adapter, sources).fetchPage(SOURCE, null, signal());
      throw new Error('Restarted source should refuse.');
    } catch (error) {
      assert(
        error instanceof ListingSourceAccessRefusal,
        'Restart lost its canonical source hold.',
      );
    }
    assert(requests === 0, 'Restart repeated a forbidden source request.');
    const runs = new PostgresCollectionRunRepository(connection);
    const run = await runs.loadRunByOperationKey(
      process.env.RESILIENCE_FIXTURE_OPERATION_KEY,
      signal(),
    );
    assert(
      run.status === 'paused' && run.checkpoint.ordinal === 1,
      'Restart lost the paused committed prefix.',
    );
  } finally {
    await connection.close();
  }
}

async function main() {
  const projectName = `rei-resilience-${process.pid}`;
  const [
    postgresPort,
    apiPort,
    rabbitPort,
    rabbitManagementPort,
    minioPort,
    minioConsolePort,
    aiPort,
    webPort,
    valkeyPort,
  ] = await allocatePorts(9);
  const fixture = {
    user: 'rei_resilience_fixture',
    password: 'rei-resilience-fixture-password',
    database: 'rei_resilience_fixture',
    vhost: 'rei-resilience-fixture',
    bucket: 'rei-resilience-fixture',
  };
  const environment = {
    ...process.env,
    COMPOSE_FILE: 'compose.yaml',
    COMPOSE_PROJECT_NAME: projectName,
    COMPOSE_DISABLE_ENV_FILE: '1',
    COMPOSE_ENV_FILES: '',
    COMPOSE_PROFILES: 'tools',
    NODE_ENV: 'test',
    POSTGRES_USER: fixture.user,
    POSTGRES_PASSWORD: fixture.password,
    POSTGRES_DB: fixture.database,
    POSTGRES_PORT: String(postgresPort),
    API_PORT: String(apiPort),
    RABBITMQ_PORT: String(rabbitPort),
    RABBITMQ_MANAGEMENT_PORT: String(rabbitManagementPort),
    MINIO_API_PORT: String(minioPort),
    MINIO_CONSOLE_PORT: String(minioConsolePort),
    AI_PORT: String(aiPort),
    WEB_PORT: String(webPort),
    VALKEY_PORT: String(valkeyPort),
    RABBITMQ_USER: fixture.user,
    RABBITMQ_PASSWORD: fixture.password,
    RABBITMQ_VHOST: fixture.vhost,
    MINIO_ROOT_USER: fixture.user,
    MINIO_ROOT_PASSWORD: fixture.password,
    OBJECT_STORE_REGION: 'us-east-1',
    OBJECT_STORE_BUCKET: fixture.bucket,
    WORKER_OPERATION_TIMEOUT_MS: '5000',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  const databaseUrl = new URL(`postgres://127.0.0.1:${postgresPort}/${fixture.database}`);
  databaseUrl.username = fixture.user;
  databaseUrl.password = fixture.password;
  const rabbitUrl = new URL(`amqp://127.0.0.1:${rabbitPort}/${fixture.vhost}`);
  rabbitUrl.username = fixture.user;
  rabbitUrl.password = fixture.password;
  const compose = (...args) => [
    'compose',
    '--project-name',
    projectName,
    '--profile',
    'tools',
    ...args,
  ];
  const execute = (file, args, extra = {}) =>
    exec(file, args, {
      cwd: new URL('..', import.meta.url),
      env: { ...environment, ...extra },
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  let connection;
  let broker;
  let snapshots;
  let primaryFailure;
  let servicesReady = false;
  try {
    await execute(
      'docker',
      compose(
        'up',
        '--detach',
        '--build',
        '--wait',
        'postgres',
        'migrations',
        'rabbitmq',
        'minio',
        'api',
      ),
    );
    servicesReady = true;
    connection = new DatabaseConnection(databaseUrl.toString());
    snapshots = new S3RawSnapshotStore({
      endpoint: `http://127.0.0.1:${minioPort}`,
      region: 'us-east-1',
      bucket: fixture.bucket,
      accessKeyId: fixture.user,
      secretAccessKey: fixture.password,
    });
    const store = new ResilientRawSnapshotStore(snapshots);
    const fixtureSource = new SyntheticSaoPauloListingSource();
    let requests = 0;
    let parses = 0;
    const scripted = {
      fetchPage: async (sourceId, cursor, attempt) => {
        requests++;
        if (cursor !== null) throw new ListingSourceAccessRefusal('captcha');
        return fixtureSource.fetchPage(sourceId, cursor, attempt);
      },
      parse: async (document, attempt) => {
        parses++;
        return fixtureSource.parse(document, attempt);
      },
    };
    const runtime = services(
      connection,
      (sources) => new ResilientListingSource(scripted, sources),
      store,
    );
    await connection.query(
      `UPDATE collection.collection_schedule SET enabled = true, next_run_at = '2026-10-10T00:00:00Z' WHERE source_id = $1`,
      [SOURCE],
    );
    const schedules = new PostgresCollectionScheduleRepository(connection);
    const claims = await runtime.transactions.runInTransaction((transaction) =>
      schedules.claimDue(transaction, clock.now(), 10),
    );
    assert(claims.length === 1, 'Enabled fixture schedule was not claimed.');
    const claim = claims[0];
    const event = await runtime.transactions.runInTransaction(async (transaction) => {
      const eventId = await runtime.identifiers.generate(transaction);
      const requested = new CollectionRunRequested({
        eventId,
        aggregateId: eventId,
        occurredAt: clock.now(),
        traceContext: null,
        payload: {
          sourceId: SOURCE,
          scheduledFor: claim.scheduledFor,
          operationKey: claim.operationKey,
        },
      });
      await runtime.outbox.append(transaction, [requested]);
      return requested;
    });
    const consumed = new ConsumeCollectionRunRequest(
      runtime.collector,
      schedules,
      runtime.transactions,
      new PostgresInbox(connection),
    );
    broker = new RabbitMqEventBroker({
      url: rabbitUrl.toString(),
      operationTimeoutMs: 5_000,
      handlerTimeoutMs: 20_000,
      redeliveryDelayMs: 100,
    });
    let delivered = 0;
    let resolveDelivery;
    let deliveryDone = new Promise((resolve) => {
      resolveDelivery = resolve;
    });
    await broker.subscribe(
      { consumerName: 'collection.scheduled-run', eventTypes: ['collection.run.requested'] },
      async (message, delivery) => {
        const result = await consumed.execute(message, delivery.signal);
        assert(result.status === 'paused', 'Scheduled refusal fabricated a completed result.');
        const durable = await runtime.runs.loadRunByOperationKey(claim.operationKey, signal());
        const disposition = await connection.query(
          `SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name = 'collection.scheduled-run' AND event_id = $1`,
          [event.eventId],
        );
        const slot = await connection.query(
          `SELECT in_flight_operation_key FROM collection.collection_schedule WHERE source_id = $1`,
          [SOURCE],
        );
        assert(
          durable.status === 'paused' &&
            disposition[0].count === 1 &&
            slot[0].in_flight_operation_key === null,
          'Handler returned before durable pause/inbox/slot disposition.',
        );
        delivered++;
        resolveDelivery();
      },
    );
    await broker.publish(event, signal());
    await Promise.race([
      deliveryDone,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Scheduled pause delivery timed out.')),
          15_000,
        );
        timer.unref();
      }),
    ]);
    const held = await runtime.sources.findById(SOURCE, signal());
    const paused = await runtime.runs.loadRunByOperationKey(claim.operationKey, signal());
    assert(!held.enabled && held.hold.reason === 'captcha', 'Source hold did not persist.');
    assert(
      paused.status === 'paused' && paused.checkpoint.ordinal === 1 && paused.counts.observed === 1,
      'Blocked run did not retain checkpoint one.',
    );
    assert(
      paused.completedAt === null &&
        paused.completedEventId === null &&
        paused.manifestHash === null,
      'Paused run carried terminal fields.',
    );
    assert(requests === 2 && parses === 1, 'Forbidden page was fetched again or parsed.');
    const artifacts = await connection.query(
      `SELECT
      (SELECT count(*)::integer FROM collection.snapshot_observation WHERE run_id = $1) AS observations,
      (SELECT count(*)::integer FROM platform.outbox WHERE event_type = 'collection.run.completed' AND aggregate_id = $1) AS completions`,
      [paused.runId],
    );
    assert(
      artifacts[0].observations === 1 && artifacts[0].completions === 0,
      'Blocked page created artifacts or completion.',
    );
    assert(
      (await new EnableSource(runtime.sources, clock).execute(SOURCE, signal())).status ===
        'refused',
      'Ordinary operator enable cleared a hold.',
    );
    assert(
      (
        await runtime.transactions.runInTransaction((transaction) =>
          schedules.claimDue(transaction, '2027-01-01T00:00:00Z', 10),
        )
      ).length === 0,
      'Held source was scheduled.',
    );
    deliveryDone = new Promise((resolve) => {
      resolveDelivery = resolve;
    });
    await broker.publish(event, signal());
    await Promise.race([
      deliveryDone,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Redelivery timed out.')), 15_000);
        timer.unref();
      }),
    ]);
    assert(delivered === 2 && requests === 2 && parses === 1, 'Redelivery repeated source work.');

    await execute(
      process.execPath,
      ['integration/collection-resilience.integration.mjs', '--restart-probe'],
      {
        RESILIENCE_FIXTURE_DATABASE_URL: databaseUrl.toString(),
        RESILIENCE_FIXTURE_OPERATION_KEY: claim.operationKey,
      },
    );
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/collection/sources`);
    const listed = await response.json();
    assert(
      response.ok && listed.sources.every((source) => source.sourceId !== SOURCE),
      'API exposed a held source.',
    );

    // Prove hold-first crash recovery: source hold durable, running run not paused yet.
    const recoveringSource = 'synthetic-portal-cobalto';
    const recoveringKey = 'resilience-hold-before-pause';
    const recoveringRun = await runtime.transactions.runInTransaction(async (transaction) =>
      runtime.runs.startOrLoad(transaction, {
        operationKey: recoveringKey,
        runId: await runtime.identifiers.generate(transaction),
        sourceId: recoveringSource,
        startedAt: clock.now(),
      }),
    );
    await runtime.sources.holdAtomically(
      recoveringSource,
      { reason: 'block', heldAt: clock.now() },
      signal(),
    );
    const recovered = await runtime.collector.execute(
      recoveringSource,
      recoveringKey,
      null,
      signal(),
    );
    assert(
      recovered.status === 'paused' && recovered.runId === recoveringRun.runId && requests === 2,
      'Hold/pause intermediate state was not recovered.',
    );

    // Prepared-page race: commit a hold while the source bytes are already stored, before its transaction.
    const racingSource = 'synthetic-portal-brisa';
    let racingParses = 0;
    const racingRuntime = services(
      connection,
      (sources) =>
        new ResilientListingSource(
          {
            fetchPage: (...args) => fixtureSource.fetchPage(...args),
            parse: async (document, attempt) => {
              racingParses++;
              await sources.holdAtomically(
                racingSource,
                { reason: 'access-denied', heldAt: clock.now() },
                signal(),
              );
              return fixtureSource.parse(document, attempt);
            },
          },
          sources,
        ),
      store,
    );
    const raced = await racingRuntime.collector.execute(
      racingSource,
      'resilience-prepared-race',
      null,
      signal(),
    );
    assert(
      raced.status === 'paused' && raced.observedCount === 0 && racingParses === 1,
      'Prepared page escaped a durable hold.',
    );
    assert(
      (await racingRuntime.runs.loadRunByOperationKey('resilience-prepared-race')).checkpoint
        .ordinal === 0,
      'Prepared race advanced checkpoint.',
    );
    const racedArtifacts = await connection.query(
      `SELECT count(*)::integer AS count FROM collection.snapshot_observation WHERE run_id = $1`,
      [raced.runId],
    );
    assert(racedArtifacts[0].count === 0, 'Prepared race persisted an observation.');

    // Review is explicit and ordinary enable still leaves the run paused until explicit resume.
    await runtime.sources.clearHoldAfterReview(SOURCE, clock.now(), signal());
    await runtime.sources.enableAtomically(SOURCE, clock.now(), signal());
    assert(
      (await runtime.runs.loadRunByOperationKey(claim.operationKey)).status === 'paused',
      'Enable silently resumed the paused run.',
    );
    const resumed = await runtime.transactions.runInTransaction((transaction) =>
      runtime.runs.resume(transaction, paused.runId),
    );
    assert(
      resumed.runId === paused.runId && resumed.checkpoint.ordinal === 1,
      'Explicit resume lost the prefix.',
    );

    // Real MinIO outage at page two: parsing/checkpoint must stop at the committed first page.
    let outageParses = 0;
    let outageAttempts = 0;
    let stopped = false;
    const failureStore = new ResilientRawSnapshotStore(
      {
        store: async (input, attempt) => {
          outageAttempts++;
          return snapshots.store(input, attempt);
        },
      },
      {
        ...rawSnapshotStoreResilienceSettings,
        attemptTimeoutMs: 1_000,
        retry: { ...rawSnapshotStoreResilienceSettings.retry, baseDelayMs: 10 },
      },
      Date.now,
      () => 0,
    );
    const outageRuntime = services(
      connection,
      (sources) =>
        new ResilientListingSource(
          {
            fetchPage: async (sourceId, cursor, attempt) => {
              if (cursor !== null && !stopped) {
                stopped = true;
                await execute('docker', compose('stop', 'minio'));
              }
              return fixtureSource.fetchPage(sourceId, cursor, attempt);
            },
            parse: async (...args) => {
              outageParses++;
              return fixtureSource.parse(...args);
            },
          },
          sources,
        ),
      failureStore,
    );
    let failed = false;
    try {
      await outageRuntime.collector.execute(SOURCE, 'resilience-store-down', null, signal());
    } catch (error) {
      failed = error instanceof ExternalFailure && error.kind === 'exhausted';
    }
    assert(
      failed && outageParses === 1 && outageAttempts === 3,
      'Store outage did not preserve store-before-parse or retry budget.',
    );
    const outageRun = await outageRuntime.runs.loadRunByOperationKey('resilience-store-down');
    assert(
      outageRun.status === 'running' &&
        outageRun.checkpoint.ordinal === 1 &&
        outageRun.counts.observed === 1,
      'Store failure lost its committed prefix.',
    );
    assert(
      (await outageRuntime.sources.findById(SOURCE)).enabled,
      'Storage failure held a healthy source.',
    );
    await execute('docker', compose('up', '--detach', '--wait', 'minio'));
    const recovery = services(
      connection,
      (sources) => new ResilientListingSource(fixtureSource, sources),
      new ResilientRawSnapshotStore(snapshots),
    );
    assert(
      (await recovery.collector.execute(SOURCE, 'resilience-store-down', null, signal())).status ===
        'completed',
      'Store failure could not redeliver.',
    );
  } catch (error) {
    primaryFailure = error;
    if (!servicesReady) {
      try {
        const { stdout, stderr } = await execute(
          'docker',
          compose('logs', '--no-color', '--tail', '200', 'rabbitmq'),
        );
        const logs = `${stdout}\n${stderr}`;
        const diagnostic = /Failed to create .*thread|pthread_create/.test(logs)
          ? 'thread-allocation-failure'
          : /Cannot allocate memory|out of memory/i.test(logs)
            ? 'memory-allocation-failure'
            : /BOOT FAILED/.test(logs)
              ? 'broker-boot-failure'
              : 'no-recognized-broker-failure';
        // Emit only a closed diagnostic code; broker logs may contain sensitive configuration.
        console.error(`Collection resilience startup diagnostic: ${diagnostic}`);
      } catch {
        console.error('Collection resilience startup diagnostic: logs-unavailable');
      }
    }
  }
  await coordinateSourceRegisterCleanup({
    primaryFailure,
    close: async () => {
      const results = await Promise.allSettled([
        broker?.close(),
        Promise.resolve().then(() => snapshots?.destroy()),
        connection?.close(),
      ]);
      const failures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);
      if (failures.length)
        throw new AggregateError(failures, 'Collection resilience resource cleanup failed.');
    },
    down: async () => execute('docker', compose('down', '--volumes', '--remove-orphans')),
    onSuccess: async () => console.log('Collection resilience integration passed.'),
  });
}

if (process.argv.includes('--restart-probe')) await restartProbe();
else await main();
