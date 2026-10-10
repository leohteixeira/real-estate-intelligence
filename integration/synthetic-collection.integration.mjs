import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import {
  DatabaseConnection,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
} from '../packages/infrastructure/dist/index.js';

const executeFile = promisify(execFile);
const fixture = Object.freeze({
  postgres: Object.freeze({
    database: 'rei_collection_fixture',
    user: 'rei_collection_fixture',
    password: 'rei-collection-postgres-fixture',
  }),
  rabbitMq: Object.freeze({
    user: 'rei_collection_fixture',
    password: 'rei-collection-rabbit-fixture',
    vhost: 'rei-collection-fixture',
  }),
  objectStore: Object.freeze({
    region: 'us-east-1',
    bucket: 'rei-collection-fixture',
    accessKeyId: 'rei_collection_fixture',
    secretAccessKey: 'rei-collection-minio-fixture',
  }),
});

const portSpecifications = Object.freeze([
  ['postgres', 'INTEGRATION_COLLECTION_POSTGRES_PORT'],
  ['rabbitMq', 'INTEGRATION_COLLECTION_RABBIT_PORT'],
  ['rabbitMqManagement', 'INTEGRATION_COLLECTION_RABBIT_MANAGEMENT_PORT'],
  ['minio', 'INTEGRATION_COLLECTION_MINIO_PORT'],
  ['minioConsole', 'INTEGRATION_COLLECTION_MINIO_CONSOLE_PORT'],
  ['api'],
  ['ai'],
  ['web'],
  ['valkey'],
]);

function parsePortOverride(name, value) {
  if (value === undefined) return 0;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be an integer between 1024 and 65535.`);
  }
  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1024 and 65535.`);
  }
  return port;
}

async function listenOnAvailablePort(server, requestedPort, description) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      reject(
        new Error(`${description} must identify a currently available local port.`, {
          cause: error,
        }),
      );
    };
    server.once('error', handleError);
    server.listen({ host: '127.0.0.1', port: requestedPort, exclusive: true }, () => {
      server.off('error', handleError);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error(`Could not determine the reserved port for ${description}.`));
        return;
      }
      resolve(address.port);
    });
  });
}

async function allocateCampaignPorts(environment) {
  const reservations = [];
  const ports = {};
  try {
    for (const [key, overrideName] of portSpecifications) {
      const server = createServer();
      server.unref();
      reservations.push(server);
      const requestedPort = overrideName
        ? parsePortOverride(overrideName, environment[overrideName])
        : 0;
      ports[key] = await listenOnAvailablePort(
        server,
        requestedPort,
        overrideName ?? `${key} campaign port`,
      );
    }
    return Object.freeze(ports);
  } finally {
    await Promise.allSettled(
      reservations.map(
        (server) =>
          new Promise((resolve) => {
            if (!server.listening) {
              resolve();
              return;
            }
            server.close(() => resolve());
          }),
      ),
    );
  }
}

function validatedProjectName(value) {
  const projectName = value ?? `rei-collection-${process.pid}`;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(projectName)) {
    throw new Error(
      'INTEGRATION_COLLECTION_COMPOSE_PROJECT_NAME must contain only lowercase letters, digits, hyphens, and underscores.',
    );
  }
  return projectName;
}

function credentialUrl({ scheme, username, password, hostname, port, path }) {
  return `${scheme}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostname}:${port}/${encodeURIComponent(path)}`;
}

const projectName = validatedProjectName(process.env.INTEGRATION_COLLECTION_COMPOSE_PROJECT_NAME);
const ports = await allocateCampaignPorts(process.env);
const databaseUrl = credentialUrl({
  scheme: 'postgres',
  username: fixture.postgres.user,
  password: fixture.postgres.password,
  hostname: '127.0.0.1',
  port: ports.postgres,
  path: fixture.postgres.database,
});
const rabbitMqUrl = credentialUrl({
  scheme: 'amqp',
  username: fixture.rabbitMq.user,
  password: fixture.rabbitMq.password,
  hostname: '127.0.0.1',
  port: ports.rabbitMq,
  path: fixture.rabbitMq.vhost,
});
const rabbitManagementUrl = `http://127.0.0.1:${ports.rabbitMqManagement}`;
const collectionQueue = 'audit.collection-events';
const operationOne = 'integration-operation-1';
const operationTwo = 'integration-operation-2';
const expectedContentHash = `sha256:${createHash('sha256')
  .update(SYNTHETIC_LISTING_BYTES)
  .digest('hex')}`;
const expectedManifestHash = `sha256:${createHash('sha256')
  .update('["SYN-SP-0001"]', 'utf8')
  .digest('hex')}`;

const composeEnvironment = {
  ...process.env,
  COMPOSE_FILE: 'compose.yaml',
  COMPOSE_PROJECT_NAME: projectName,
  COMPOSE_PROFILES: 'tools',
  COMPOSE_ENV_FILES: '',
  COMPOSE_DISABLE_ENV_FILE: '1',
  NODE_ENV: 'test',
  POSTGRES_DB: fixture.postgres.database,
  POSTGRES_USER: fixture.postgres.user,
  POSTGRES_PASSWORD: fixture.postgres.password,
  POSTGRES_PORT: String(ports.postgres),
  RABBITMQ_USER: fixture.rabbitMq.user,
  RABBITMQ_PASSWORD: fixture.rabbitMq.password,
  RABBITMQ_VHOST: fixture.rabbitMq.vhost,
  RABBITMQ_PORT: String(ports.rabbitMq),
  RABBITMQ_MANAGEMENT_PORT: String(ports.rabbitMqManagement),
  MINIO_ROOT_USER: fixture.objectStore.accessKeyId,
  MINIO_ROOT_PASSWORD: fixture.objectStore.secretAccessKey,
  MINIO_API_PORT: String(ports.minio),
  MINIO_CONSOLE_PORT: String(ports.minioConsole),
  OBJECT_STORE_REGION: fixture.objectStore.region,
  OBJECT_STORE_BUCKET: fixture.objectStore.bucket,
  API_PORT: String(ports.api),
  AI_PORT: String(ports.ai),
  WEB_PORT: String(ports.web),
  VALKEY_PORT: String(ports.valkey),
  WORKER_INTERVAL_MS: '30000',
  OUTBOX_RELAY_INTERVAL_MS: '1000',
  OUTBOX_RELAY_BATCH_SIZE: '25',
  OUTBOX_CLAIM_LEASE_MS: '130000',
  RABBITMQ_RECONNECT_INTERVAL_MS: '1000',
  WORKER_OPERATION_TIMEOUT_MS: '5000',
  COLLECTION_DEADLINE_MS: '30000',
  SHUTDOWN_TIMEOUT_MS: '15000',
  EVENT_DELIVERY_LIMIT: '5',
  EVENT_REDELIVERY_DELAY_MS: '1000',
  OUTBOX_RETENTION_MS: '604800000',
  INBOX_RETENTION_MS: '2592000000',
  DELIVERY_RETENTION_INTERVAL_MS: '300000',
  DELIVERY_RETENTION_BATCH_SIZE: '1000',
  OTEL_EXPORTER_OTLP_ENDPOINT: '',
};

function composeArgs(...args) {
  return ['compose', '--project-name', projectName, '--profile', 'tools', ...args];
}

async function execute(file, args, options = {}) {
  return executeFile(file, args, {
    cwd: new URL('..', import.meta.url),
    env: composeEnvironment,
    timeout: options.timeout ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertHermeticCampaign() {
  const expectedEnvironment = {
    COMPOSE_FILE: 'compose.yaml',
    COMPOSE_PROJECT_NAME: projectName,
    COMPOSE_PROFILES: 'tools',
    COMPOSE_ENV_FILES: '',
    COMPOSE_DISABLE_ENV_FILE: '1',
    NODE_ENV: 'test',
    POSTGRES_DB: fixture.postgres.database,
    POSTGRES_USER: fixture.postgres.user,
    POSTGRES_PASSWORD: fixture.postgres.password,
    POSTGRES_PORT: String(ports.postgres),
    RABBITMQ_USER: fixture.rabbitMq.user,
    RABBITMQ_PASSWORD: fixture.rabbitMq.password,
    RABBITMQ_VHOST: fixture.rabbitMq.vhost,
    RABBITMQ_PORT: String(ports.rabbitMq),
    RABBITMQ_MANAGEMENT_PORT: String(ports.rabbitMqManagement),
    MINIO_ROOT_USER: fixture.objectStore.accessKeyId,
    MINIO_ROOT_PASSWORD: fixture.objectStore.secretAccessKey,
    MINIO_API_PORT: String(ports.minio),
    MINIO_CONSOLE_PORT: String(ports.minioConsole),
    OBJECT_STORE_REGION: fixture.objectStore.region,
    OBJECT_STORE_BUCKET: fixture.objectStore.bucket,
    API_PORT: String(ports.api),
    AI_PORT: String(ports.ai),
    WEB_PORT: String(ports.web),
    VALKEY_PORT: String(ports.valkey),
  };
  for (const [name, value] of Object.entries(expectedEnvironment)) {
    assert(
      composeEnvironment[name] === value,
      `Compose campaign input ${name} was not derived from the integration fixture.`,
    );
  }

  const campaignPorts = Object.values(ports);
  assert(
    campaignPorts.every((port) => Number.isSafeInteger(port) && port >= 1024 && port <= 65_535),
    'A campaign port was outside the validated unprivileged TCP port range.',
  );
  assert(
    new Set(campaignPorts).size === campaignPorts.length,
    'The integration campaign assigned the same host port to multiple services.',
  );
}

async function waitFor(description, probe, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await probe();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const suffix = lastError instanceof Error ? ` (${lastError.name})` : '';
  throw new Error(`Timed out waiting for ${description}${suffix}.`);
}

async function runCollection(operationKey) {
  await execute('docker', composeArgs('run', '--rm', 'collection-command', operationKey), {
    timeout: 120_000,
  });
}

async function queueDrained() {
  const authorization = `Basic ${Buffer.from(
    `${fixture.rabbitMq.user}:${fixture.rabbitMq.password}`,
  ).toString('base64')}`;
  const response = await fetch(
    `${rabbitManagementUrl}/api/queues/${encodeURIComponent(fixture.rabbitMq.vhost)}/${encodeURIComponent(collectionQueue)}`,
    { headers: { authorization }, signal: AbortSignal.timeout(2_000) },
  );
  if (!response.ok) return false;
  const body = await response.json();
  return body.messages_ready === 0 && body.messages_unacknowledged === 0;
}

async function waitForAuditCount(connection, expected) {
  await waitFor(`${expected} collection events in the audit log`, async () => {
    const rows = await connection.query(
      `SELECT count(*)::integer AS count
         FROM audit.event_log
        WHERE event_type IN ('collection.snapshot.parsed', 'collection.run.completed')`,
    );
    return rows[0]?.count === expected;
  });
}

async function counts(connection) {
  const [runs, objects, observations, outbox, inbox, audit] = await Promise.all([
    connection.query('SELECT count(*)::integer AS count FROM collection.collection_run'),
    connection.query('SELECT count(*)::integer AS count FROM collection.raw_object'),
    connection.query('SELECT count(*)::integer AS count FROM collection.snapshot_observation'),
    connection.query(
      `SELECT count(*)::integer AS count FROM platform.outbox
        WHERE event_type IN ('collection.snapshot.parsed', 'collection.run.completed')`,
    ),
    connection.query(
      'SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name = $1',
      [collectionQueue],
    ),
    connection.query(
      `SELECT count(*)::integer AS count FROM audit.event_log
        WHERE event_type IN ('collection.snapshot.parsed', 'collection.run.completed')`,
    ),
  ]);
  return {
    runs: runs[0]?.count,
    objects: objects[0]?.count,
    observations: observations[0]?.count,
    outbox: outbox[0]?.count,
    inbox: inbox[0]?.count,
    audit: audit[0]?.count,
  };
}

async function eventRows(connection) {
  return connection.query(
    `SELECT event_id::text, event_type, event_version, aggregate_id::text,
            occurred_at, trace_context, payload
       FROM platform.outbox
      WHERE event_type IN ('collection.snapshot.parsed', 'collection.run.completed')
      ORDER BY event_id`,
  );
}

async function readObjectFromMinio(objectKey) {
  const store = new S3RawSnapshotStore({
    endpoint: `http://127.0.0.1:${ports.minio}`,
    region: fixture.objectStore.region,
    bucket: fixture.objectStore.bucket,
    accessKeyId: fixture.objectStore.accessKeyId,
    secretAccessKey: fixture.objectStore.secretAccessKey,
  });
  try {
    return Buffer.from(await store.read(objectKey, AbortSignal.timeout(5_000)));
  } finally {
    store.destroy();
  }
}

async function main() {
  let connection;
  let failed = false;
  try {
    assertHermeticCampaign();
    await execute(
      'docker',
      composeArgs(
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
      { timeout: 240_000 },
    );
    connection = new DatabaseConnection(databaseUrl);

    await runCollection(operationOne);
    await waitForAuditCount(connection, 2);
    const firstCounts = await counts(connection);
    assert(
      JSON.stringify(firstCounts) ===
        JSON.stringify({ runs: 1, objects: 1, observations: 1, outbox: 2, inbox: 2, audit: 2 }),
      `Unexpected first-run counts: ${JSON.stringify(firstCounts)}`,
    );
    const firstEvents = await eventRows(connection);
    assert(firstEvents.length === 2, 'The first run did not create exactly two events.');
    assert(
      firstEvents.every((event) => event.trace_context?.traceparent),
      'A collection event did not retain the operation trace context.',
    );
    assert(
      firstEvents[0].trace_context.traceparent === firstEvents[1].trace_context.traceparent,
      'Collection events did not retain the same operation span context.',
    );

    const metadata = await connection.query(
      `SELECT object.content_hash, object.object_key, run.manifest_hash
         FROM collection.raw_object AS object
         JOIN collection.snapshot_observation AS observation
           ON observation.content_hash = object.content_hash
         JOIN collection.collection_run AS run ON run.run_id = observation.run_id
        WHERE run.operation_key = $1`,
      [operationOne],
    );
    assert(
      metadata[0]?.content_hash === expectedContentHash,
      'The raw object content hash was not derived from the exact fetched bytes.',
    );
    assert(
      metadata[0]?.manifest_hash === expectedManifestHash,
      'The run manifest hash was not derived from the canonical source-listing ID manifest.',
    );
    assert(
      metadata[0]?.manifest_hash !== metadata[0]?.content_hash,
      'The run manifest hash was incorrectly conflated with the raw object content hash.',
    );
    const parsedEvent = firstEvents.find(
      (event) => event.event_type === 'collection.snapshot.parsed',
    );
    const completedEvent = firstEvents.find(
      (event) => event.event_type === 'collection.run.completed',
    );
    assert(
      parsedEvent?.payload?.snapshot?.contentHash === expectedContentHash,
      'The parsed event did not retain the raw object content hash.',
    );
    assert(
      completedEvent?.payload?.manifestHash === expectedManifestHash,
      'The completed event did not retain the canonical source-listing ID manifest hash.',
    );
    const rawBytes = await readObjectFromMinio(metadata[0]?.object_key);
    assert(
      rawBytes.equals(Buffer.from(SYNTHETIC_LISTING_BYTES)),
      'MinIO did not return the exact fetched synthetic bytes.',
    );

    await runCollection(operationOne);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(
      JSON.stringify(await counts(connection)) === JSON.stringify(firstCounts),
      'Operation-key replay changed persisted counts.',
    );
    assert(
      JSON.stringify((await eventRows(connection)).map(({ event_id }) => event_id)) ===
        JSON.stringify(firstEvents.map(({ event_id }) => event_id)),
      'Operation-key replay changed event identifiers.',
    );

    await runCollection(operationTwo);
    await waitForAuditCount(connection, 4);
    const secondCounts = await counts(connection);
    assert(
      JSON.stringify(secondCounts) ===
        JSON.stringify({ runs: 2, objects: 1, observations: 2, outbox: 4, inbox: 4, audit: 4 }),
      `Unexpected second-run counts: ${JSON.stringify(secondCounts)}`,
    );

    const beforeRedelivery = await eventRows(connection);
    const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5_000 });
    try {
      for (const row of beforeRedelivery) {
        await publisher.publish(
          {
            eventId: row.event_id,
            type: row.event_type,
            version: row.event_version,
            aggregateId: row.aggregate_id,
            occurredAt: row.occurred_at.toISOString(),
            traceContext: row.trace_context,
            payload: row.payload,
          },
          AbortSignal.timeout(5_000),
        );
      }
    } finally {
      await publisher.close();
    }
    await waitFor('the durable collection consumer queue to drain', queueDrained);
    assert(
      JSON.stringify(await counts(connection)) === JSON.stringify(secondCounts),
      'Redelivery repeated a collection audit effect or inbox marker.',
    );

    console.log('Synthetic collection integration passed.');
  } catch (error) {
    failed = true;
    await execute('docker', composeArgs('logs', '--no-color'), { timeout: 30_000 })
      .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
      .catch(() => undefined);
    throw error;
  } finally {
    await connection?.close().catch(() => undefined);
    await execute('docker', composeArgs('down', '--volumes', '--remove-orphans'), {
      timeout: 120_000,
    }).catch(() => undefined);
    if (failed) process.exitCode = 1;
  }
}

await main();
