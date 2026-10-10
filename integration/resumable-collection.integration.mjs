import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import { StaleCollectionCheckpointError } from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresTransactionRunner,
} from '../packages/infrastructure/dist/index.js';

const exec = promisify(execFile);
const projectName = `rei-resumable-${process.pid}`;
const commandContainer = `${projectName}-command`;
const operationKey = ['integration', 'resumable', 'aurora', '2026', '10'].join('-');
const sourceId = 'synthetic-portal-aurora';
const expectedIdentities = ['AUR-BV-001', 'AUR-PN-001', 'AUR-SN-001'];
const expectedManifestHash = `sha256:${createHash('sha256')
  .update(JSON.stringify(expectedIdentities), 'utf8')
  .digest('hex')}`;
const legacyUpgradeOperationKey = 'integration-legacy-upgrade';
const checkpointRaceOperationKey = 'integration-checkpoint-race';

async function allocatePorts(count) {
  const servers = [];
  try {
    for (let index = 0; index < count; index += 1) {
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
    await Promise.all(
      servers.map((server) => new Promise((resolve) => server.close(() => resolve()))),
    );
  }
}

const [postgresPort, rabbitPort, rabbitManagementPort, minioPort, minioConsolePort] =
  await allocatePorts(5);
const fixture = {
  database: 'rei_resumable_fixture',
  user: 'rei_resumable_fixture',
  postgresPassword: 'rei-resumable-postgres-fixture',
  rabbitPassword: 'rei-resumable-rabbit-fixture',
  rabbitVhost: 'rei-resumable-fixture',
  minioPassword: 'rei-resumable-minio-fixture',
};
const environment = {
  ...process.env,
  COMPOSE_FILE: 'compose.yaml',
  COMPOSE_PROJECT_NAME: projectName,
  COMPOSE_PROFILES: 'tools',
  COMPOSE_DISABLE_ENV_FILE: '1',
  COMPOSE_ENV_FILES: '',
  NODE_ENV: 'test',
  POSTGRES_DB: fixture.database,
  POSTGRES_USER: fixture.user,
  POSTGRES_PASSWORD: fixture.postgresPassword,
  POSTGRES_PORT: String(postgresPort),
  RABBITMQ_USER: fixture.user,
  RABBITMQ_PASSWORD: fixture.rabbitPassword,
  RABBITMQ_VHOST: fixture.rabbitVhost,
  RABBITMQ_PORT: String(rabbitPort),
  RABBITMQ_MANAGEMENT_PORT: String(rabbitManagementPort),
  MINIO_ROOT_USER: fixture.user,
  MINIO_ROOT_PASSWORD: fixture.minioPassword,
  MINIO_API_PORT: String(minioPort),
  MINIO_CONSOLE_PORT: String(minioConsolePort),
  OBJECT_STORE_REGION: 'us-east-1',
  OBJECT_STORE_BUCKET: 'rei-resumable-fixture',
  WORKER_OPERATION_TIMEOUT_MS: '5000',
  COLLECTION_DEADLINE_MS: '30000',
  SYNTHETIC_PAGE_DELAY_MS: '5000',
  WORKER_INTERVAL_MS: '30000',
  OUTBOX_RELAY_INTERVAL_MS: '250',
  OUTBOX_RELAY_BATCH_SIZE: '25',
  OUTBOX_CLAIM_LEASE_MS: '130000',
  RABBITMQ_RECONNECT_INTERVAL_MS: '250',
  SHUTDOWN_TIMEOUT_MS: '15000',
  EVENT_DELIVERY_LIMIT: '5',
  EVENT_REDELIVERY_DELAY_MS: '250',
  OUTBOX_RETENTION_MS: '604800000',
  INBOX_RETENTION_MS: '2592000000',
  DELIVERY_RETENTION_INTERVAL_MS: '300000',
  DELIVERY_RETENTION_BATCH_SIZE: '1000',
  OTEL_EXPORTER_OTLP_ENDPOINT: '',
};
const databaseUrl = new URL('postgres://127.0.0.1');
databaseUrl.username = fixture.user;
databaseUrl.password = fixture.postgresPassword;
databaseUrl.port = String(postgresPort);
databaseUrl.pathname = `/${fixture.database}`;

function compose(...args) {
  return ['compose', '--project-name', projectName, '--profile', 'tools', ...args];
}

async function execute(file, args, options = {}) {
  return exec(file, args, {
    cwd: new URL('..', import.meta.url),
    env: { ...environment, ...options.environment },
    timeout: options.timeout ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function applyMigrationStage(files) {
  const copies = files.map((file) => `cp /migrations/${file} "$stage_dir/${file}"`).join(' && ');
  await execute(
    'docker',
    compose(
      'run',
      '--rm',
      '--no-deps',
      '--build',
      '--entrypoint',
      'sh',
      'migrations',
      '-c',
      `stage_dir="$(mktemp -d)" && ${copies} && MIGRATIONS_DIR="$stage_dir" migrate`,
    ),
    { timeout: 300_000 },
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(description, probe, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const suffix = lastError instanceof Error ? ` (${lastError.name})` : '';
  throw new Error(`Timed out waiting for ${description}${suffix}.`);
}

async function runState(connection, requestedOperationKey = operationKey) {
  const rows = await connection.query(
    `SELECT run_id::text, status, checkpoint_ordinal, checkpoint_cursor,
            observed_count, parsed_count, manifest_hash, completed_event_id::text, completed_at
       FROM collection.collection_run
      WHERE operation_key = $1`,
    [requestedOperationKey],
  );
  return rows[0] ?? null;
}

async function operationSnapshot(connection, requestedOperationKey = operationKey) {
  const run = await runState(connection, requestedOperationKey);
  if (!run) return null;
  const [observations, events, inbox, audit] = await Promise.all([
    connection.query(
      `SELECT observation.snapshot_id::text, observation.parsed_event_id::text,
              observation.source_listing_id, observation.content_hash, object.object_key
         FROM collection.snapshot_observation AS observation
         JOIN collection.raw_object AS object ON object.content_hash = observation.content_hash
        WHERE observation.run_id = $1
        ORDER BY observation.source_listing_id`,
      [run.run_id],
    ),
    connection.query(
      `SELECT event_id::text, event_type, aggregate_id::text, payload
         FROM platform.outbox
        WHERE event_type IN ('collection.snapshot.parsed', 'collection.run.completed')
          AND (aggregate_id = $1 OR aggregate_id IN (
            SELECT snapshot_id FROM collection.snapshot_observation WHERE run_id = $1
          ))
        ORDER BY event_id`,
      [run.run_id],
    ),
    connection.query(
      `SELECT count(*)::integer AS count
         FROM platform.inbox AS inbox
        WHERE consumer_name = 'audit.collection-events'
          AND EXISTS (
            SELECT 1 FROM platform.outbox AS outbox
             WHERE outbox.event_id = inbox.event_id
               AND (outbox.aggregate_id = $1 OR outbox.aggregate_id IN (
                 SELECT snapshot_id FROM collection.snapshot_observation WHERE run_id = $1
               ))
          )`,
      [run.run_id],
    ),
    connection.query(
      `SELECT count(*)::integer AS count
         FROM audit.event_log AS audit
        WHERE event_type IN ('collection.snapshot.parsed', 'collection.run.completed')
          AND EXISTS (
            SELECT 1 FROM platform.outbox AS outbox
             WHERE outbox.event_id = audit.event_id
               AND (outbox.aggregate_id = $1 OR outbox.aggregate_id IN (
                 SELECT snapshot_id FROM collection.snapshot_observation WHERE run_id = $1
               ))
          )`,
      [run.run_id],
    ),
  ]);
  return { run, observations, events, inbox: inbox[0]?.count, audit: audit[0]?.count };
}

async function runCommand(delayMs) {
  return execute(
    'docker',
    compose('run', '--rm', 'resumable-collection-command', sourceId, operationKey),
    { timeout: 120_000, environment: { SYNTHETIC_PAGE_DELAY_MS: String(delayMs) } },
  );
}

async function seedLegacyCollectionRow(connection) {
  const legacy = {
    runId: '0199c8f2-2394-7ba0-8f9e-286378779230',
    snapshotId: '0199c8f2-2394-7ba0-8f9e-286378779231',
    parsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779232',
    completedEventId: '0199c8f2-2394-7ba0-8f9e-286378779233',
    contentHash: `sha256:${'3'.repeat(64)}`,
    manifestHash: `sha256:${'5'.repeat(64)}`,
  };
  await connection.query(
    `INSERT INTO collection.raw_object
       (content_hash, object_key, byte_length, media_type, synthetic)
     VALUES ($1, $2, 32, 'application/json', true)`,
    [legacy.contentHash, `synthetic/sha256/${'3'.repeat(64)}.json`],
  );
  await connection.query(
    `INSERT INTO collection.collection_run
       (run_id, operation_key, source_id, status, started_at, completed_at,
        observed_count, parsed_count, suppressed_count, failed_count, manifest_hash,
        parsed_event_id, completed_event_id)
     VALUES ($1, $2, 'synthetic-data', 'completed', $3, $4, 1, 1, 0, 0, $5, $6, $7)`,
    [
      legacy.runId,
      legacyUpgradeOperationKey,
      '2026-10-10T00:00:00.000Z',
      '2026-10-10T00:00:01.000Z',
      legacy.manifestHash,
      legacy.parsedEventId,
      legacy.completedEventId,
    ],
  );
  await connection.query(
    `INSERT INTO collection.snapshot_observation
       (snapshot_id, run_id, content_hash, source_listing_id, source_url, observed_at)
     VALUES ($1, $2, $3, 'LEGACY-SP-0001',
             'https://synthetic.invalid/listings/LEGACY-SP-0001', $4)`,
    [legacy.snapshotId, legacy.runId, legacy.contentHash, '2026-10-10T00:00:00.500Z'],
  );
  return legacy;
}

async function verifyLegacyUpgrade(connection, legacy) {
  const rows = await connection.query(
    `SELECT run.status, run.checkpoint_ordinal, run.checkpoint_cursor, run.checkpointed_at,
            run.completed_at, run.manifest_hash, run.completed_event_id::text,
            observation.parsed_event_id::text
       FROM collection.collection_run AS run
       JOIN collection.snapshot_observation AS observation ON observation.run_id = run.run_id
      WHERE run.operation_key = $1`,
    [legacyUpgradeOperationKey],
  );
  assert(rows.length === 1, 'Migration 4003 did not preserve exactly one legacy observation.');
  assert(rows[0].status === 'completed', 'Migration 4003 changed the legacy terminal status.');
  assert(
    rows[0].checkpoint_ordinal === 0 &&
      rows[0].checkpoint_cursor === null &&
      rows[0].checkpointed_at === null,
    'Migration 4003 did not initialize the legacy checkpoint coherently.',
  );
  assert(
    rows[0].parsed_event_id === legacy.parsedEventId,
    'Migration 4003 did not backfill the parsed event ID onto the observation.',
  );
  assert(
    rows[0].completed_event_id === legacy.completedEventId &&
      rows[0].manifest_hash === legacy.manifestHash,
    'Migration 4003 changed legacy terminal identities.',
  );
  const oldColumn = await connection.query(
    `SELECT count(*)::integer AS count
       FROM information_schema.columns
      WHERE table_schema = 'collection'
        AND table_name = 'collection_run'
        AND column_name = 'parsed_event_id'`,
  );
  assert(
    oldColumn[0]?.count === 0,
    'Migration 4003 retained the singular run parsed-event column.',
  );
}

async function proveCheckpointContention(connection) {
  const firstUrl = new URL(databaseUrl);
  firstUrl.searchParams.set('application_name', 'rei-checkpoint-contender-one');
  const secondUrl = new URL(databaseUrl);
  secondUrl.searchParams.set('application_name', 'rei-checkpoint-contender-two');
  const firstConnection = new DatabaseConnection(firstUrl.toString(), () => {}, 30_000);
  const secondConnection = new DatabaseConnection(secondUrl.toString(), () => {}, 30_000);
  const firstRepository = new PostgresCollectionRunRepository(firstConnection);
  const secondRepository = new PostgresCollectionRunRepository(secondConnection);
  const firstTransactions = new PostgresTransactionRunner(firstConnection);
  const secondTransactions = new PostgresTransactionRunner(secondConnection);
  const runId = '0199c8f2-2394-7ba0-8f9e-286378779240';
  const observation = {
    snapshotId: '0199c8f2-2394-7ba0-8f9e-286378779241',
    parsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779242',
    outcome: 'parsed',
    changed: false,
    failureReason: null,
    sourceListingId: 'BRI-RACE-001',
    sourceUrl: 'https://brisa.synthetic.invalid/listings/BRI-RACE-001',
    observedAt: '2026-10-10T00:00:02.000Z',
    contentHash: `sha256:${'4'.repeat(64)}`,
    objectKey: `synthetic/sha256/${'4'.repeat(64)}.json`,
    byteLength: 64,
    mediaType: 'application/json',
  };
  const commit = {
    runId,
    expectedOrdinal: 0,
    expectedCursor: null,
    nextCursor: 'fixture:race:1',
    checkpointedAt: '2026-10-10T00:00:03.000Z',
    observations: [observation],
    exhausted: false,
    completedAt: null,
    manifestHash: null,
    completedEventId: null,
  };
  let announceFirstLock;
  const firstLocked = new Promise((resolve) => {
    announceFirstLock = resolve;
  });
  let releaseFirst;
  const mayCommit = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  try {
    await firstTransactions.runInTransaction((transaction) =>
      firstRepository.startOrLoad(transaction, {
        operationKey: checkpointRaceOperationKey,
        runId,
        sourceId: 'synthetic-portal-brisa',
        startedAt: '2026-10-10T00:00:01.000Z',
      }),
    );

    const first = firstTransactions.runInTransaction(async (transaction) => {
      await firstRepository.lockRunForPage(transaction, runId, 0, null);
      announceFirstLock();
      await mayCommit;
      return firstRepository.commitPage(transaction, commit);
    });
    await firstLocked;

    const second = secondTransactions.runInTransaction(async (transaction) => {
      await secondRepository.lockRunForPage(transaction, runId, 0, null);
      return secondRepository.commitPage(transaction, {
        ...commit,
        observations: [
          {
            ...observation,
            snapshotId: '0199c8f2-2394-7ba0-8f9e-286378779243',
            parsedEventId: '0199c8f2-2394-7ba0-8f9e-286378779244',
          },
        ],
      });
    });

    await waitFor('the second checkpoint contender to block on the row lock', async () => {
      const rows = await connection.query(
        `SELECT wait_event_type
           FROM pg_stat_activity
          WHERE application_name = 'rei-checkpoint-contender-two'
            AND wait_event_type = 'Lock'`,
      );
      return rows.length === 1;
    });
    releaseFirst();

    const [winner, loser] = await Promise.allSettled([first, second]);
    assert(
      winner.status === 'fulfilled' && winner.value.committed,
      'The first checkpoint contender did not commit.',
    );
    assert(
      loser.status === 'rejected' && loser.reason instanceof StaleCollectionCheckpointError,
      'The blocked checkpoint contender was not rejected as stale.',
    );
    const rows = await connection.query(
      `SELECT run.checkpoint_ordinal, run.observed_count,
              count(observation.snapshot_id)::integer AS observation_count,
              count(DISTINCT observation.source_listing_id)::integer AS identity_count
         FROM collection.collection_run AS run
         LEFT JOIN collection.snapshot_observation AS observation ON observation.run_id = run.run_id
        WHERE run.operation_key = $1
        GROUP BY run.run_id`,
      [checkpointRaceOperationKey],
    );
    assert(
      rows.length === 1 &&
        rows[0].checkpoint_ordinal === 1 &&
        rows[0].observed_count === 1 &&
        rows[0].observation_count === 1 &&
        rows[0].identity_count === 1,
      'Checkpoint contention produced a duplicate or skipped durable observation.',
    );
  } finally {
    releaseFirst?.();
    await Promise.allSettled([firstConnection.close(), secondConnection.close()]);
  }
}

async function main() {
  let connection;
  let primaryFailure;
  try {
    assert(
      new Set([postgresPort, rabbitPort, rabbitManagementPort, minioPort, minioConsolePort])
        .size === 5,
      'Campaign ports must be unique.',
    );
    assert(
      environment.COMPOSE_DISABLE_ENV_FILE === '1',
      'Compose environment-file loading was not disabled.',
    );
    await execute('docker', compose('up', '--detach', '--wait', 'postgres'), { timeout: 180_000 });
    await applyMigrationStage([
      '0001_platform_create_outbox.sql',
      '0002_platform_create_delivery_guarantees.sql',
      '4001_collection_create_collection_pipeline.sql',
      '4002_collection_expand_source_register.sql',
    ]);
    connection = new DatabaseConnection(databaseUrl.toString());
    const legacy = await seedLegacyCollectionRow(connection);
    await applyMigrationStage(['4003_collection_add_resumable_runs.sql']);
    await verifyLegacyUpgrade(connection, legacy);

    await execute(
      'docker',
      compose(
        'up',
        '--detach',
        '--build',
        '--wait',
        'postgres',
        'rabbitmq',
        'minio',
        'migrations',
        'worker',
      ),
      { timeout: 300_000 },
    );
    await proveCheckpointContention(connection);

    await execute(
      'docker',
      compose(
        'run',
        '--detach',
        '--name',
        commandContainer,
        'resumable-collection-command',
        sourceId,
        operationKey,
      ),
      { timeout: 120_000 },
    );
    const partial = await waitFor('checkpoint one before the forced crash', async () => {
      const snapshot = await operationSnapshot(connection);
      return snapshot?.run.checkpoint_ordinal === 1 ? snapshot : null;
    });
    assert(partial.run.status === 'running', 'The partial run was not running.');
    assert(
      partial.run.completed_event_id === null,
      'The partial run already had a completion event.',
    );
    assert(
      partial.observations.length === 1,
      'The durable prefix was not exactly one observation.',
    );
    assert(
      partial.observations[0]?.source_listing_id === 'AUR-BV-001',
      'The first stable identity was not committed.',
    );
    assert(
      partial.events.length === 1 && partial.events[0]?.event_type === 'collection.snapshot.parsed',
      'The partial prefix contained an unexpected outbox event.',
    );
    const originalRunId = partial.run.run_id;

    await execute('docker', ['kill', '--signal', 'KILL', commandContainer], { timeout: 30_000 });
    await execute('docker', ['rm', '--force', commandContainer], { timeout: 30_000 }).catch(
      () => undefined,
    );
    const afterKill = await operationSnapshot(connection);
    assert(
      afterKill?.run.run_id === originalRunId && afterKill.run.checkpoint_ordinal === 1,
      'SIGKILL changed the authoritative committed prefix.',
    );

    await runCommand(0);
    const completed = await waitFor('the resumed run and audit path to complete', async () => {
      const snapshot = await operationSnapshot(connection);
      return snapshot?.run.status === 'completed' && snapshot.audit === 4 && snapshot.inbox === 4
        ? snapshot
        : null;
    });
    assert(completed.run.run_id === originalRunId, 'Resume created a different run ID.');
    assert(completed.run.checkpoint_ordinal === 3, 'Resume did not advance exactly three pages.');
    assert(
      completed.run.observed_count === 3 && completed.run.parsed_count === 3,
      'Final run counts were not exact.',
    );
    assert(
      completed.run.manifest_hash === expectedManifestHash,
      'The final manifest was not canonical.',
    );
    assert(
      JSON.stringify(completed.observations.map((row) => row.source_listing_id)) ===
        JSON.stringify(expectedIdentities),
      'Resume duplicated, skipped, or reordered an observation identity.',
    );
    assert(
      new Set(completed.observations.map((row) => row.parsed_event_id)).size === 3,
      'Parsed event identities were not unique per observation.',
    );
    assert(
      completed.events.filter((row) => row.event_type === 'collection.snapshot.parsed').length ===
        3,
      'The final outbox did not contain exactly three parsed events.',
    );
    assert(
      completed.events.filter((row) => row.event_type === 'collection.run.completed').length === 1,
      'The final outbox did not contain exactly one completion event.',
    );

    const stableSnapshot = JSON.stringify(completed);
    const replayOutput = await runCommand(0);
    assert(replayOutput.stdout.length < 10_000, 'Replay output was unexpectedly unbounded.');
    assert(
      !replayOutput.stdout.includes(fixture.postgresPassword),
      'Replay output leaked a credential.',
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(
      JSON.stringify(await operationSnapshot(connection)) === stableSnapshot,
      'Completed replay mutated identifiers, counts, timestamps, events, inbox, or audit state.',
    );
  } catch (error) {
    primaryFailure = error;
    await execute('docker', compose('logs', '--no-color'), { timeout: 30_000 })
      .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
      .catch(() => undefined);
  }

  const cleanup = await Promise.allSettled([
    connection?.close() ?? Promise.resolve(),
    execute('docker', ['rm', '--force', commandContainer], { timeout: 30_000 }).catch(
      () => undefined,
    ),
    execute('docker', compose('down', '--volumes', '--remove-orphans'), { timeout: 120_000 }),
  ]);
  const cleanupFailure = cleanup.find((result) => result.status === 'rejected');
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailure?.status === 'rejected') throw cleanupFailure.reason;
  console.log('Resumable collection crash/restart integration passed.');
}

await main();
