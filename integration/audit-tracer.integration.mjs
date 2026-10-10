import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import amqp from 'amqplib';

import { isExternalFailure, RequestAuditTrace } from '../packages/application/dist/index.js';
import { AuditTraceRequested } from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresAuditEventLog,
  PostgresInbox,
  PostgresOutbox,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
} from '../packages/infrastructure/dist/index.js';

const execute = promisify(execFile);
const apiUrl = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:8200';
const databaseUrl =
  process.env.INTEGRATION_DATABASE_URL ??
  'postgres://realestate:realestate@127.0.0.1:5434/real_estate_intelligence';
const rabbitMqUrl =
  process.env.INTEGRATION_RABBITMQ_URL ??
  'amqp://realestate:realestate@127.0.0.1:5672/real-estate-intelligence';
const rabbitManagementUrl =
  process.env.INTEGRATION_RABBITMQ_MANAGEMENT_URL ?? 'http://127.0.0.1:15672';
const rabbitUser = process.env.INTEGRATION_RABBITMQ_USER ?? 'realestate';
const rabbitPassword = process.env.INTEGRATION_RABBITMQ_PASSWORD ?? 'realestate';
const composeProjectName = process.env.INTEGRATION_COMPOSE_PROJECT_NAME?.trim();
const rabbitVhost = 'real-estate-intelligence';
const legacyAuditQueue = 'audit.trace-requested.audit';
const stableAuditQueue = 'audit.event-log';
const auditDeadLetterQueue = `${stableAuditQueue}.dead-letter`;

function composeArgs(...args) {
  return composeProjectName
    ? ['compose', '--project-name', composeProjectName, ...args]
    : ['compose', ...args];
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function postTrace() {
  const response = await fetch(`${apiUrl}/api/v1/audit/traces`, {
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
  });
  assert(response.status === 202, `Expected HTTP 202, received ${response.status}.`);
  const body = await response.json();
  assert(
    typeof body.eventId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.eventId),
    'The endpoint did not return a UUIDv7 event identifier.',
  );
  return body.eventId;
}

async function waitForDeliveredEvent(connection, eventId) {
  return waitFor('the tracer event to reach the audit log', async () => {
    const outboxRows = await connection.query(
      `SELECT
         event_id::text,
         event_type,
         event_version,
         aggregate_id::text,
         occurred_at,
         trace_context,
         payload,
         published_at
       FROM platform.outbox
       WHERE event_id = $1`,
      [eventId],
    );
    const auditRows = await connection.query(
      `SELECT
         event_id::text,
         event_type,
         event_version,
         aggregate_id::text,
         occurred_at,
         trace_context,
         payload
       FROM audit.event_log
       WHERE event_id = $1`,
      [eventId],
    );
    if (outboxRows[0]?.published_at && auditRows[0]) {
      return { outbox: outboxRows[0], audit: auditRows[0] };
    }
    return undefined;
  });
}

async function waitForQueueIdle() {
  const vhost = encodeURIComponent(rabbitVhost);
  const queue = encodeURIComponent(stableAuditQueue);
  const authorization = `Basic ${Buffer.from(`${rabbitUser}:${rabbitPassword}`).toString('base64')}`;
  await waitFor('the audit consumer queue to settle', async () => {
    const response = await fetch(`${rabbitManagementUrl}/api/queues/${vhost}/${queue}`, {
      headers: { authorization },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body.messages_ready === 0 && body.messages_unacknowledged === 0;
  });
}

function managementAuthorization() {
  return `Basic ${Buffer.from(`${rabbitUser}:${rabbitPassword}`).toString('base64')}`;
}

async function queueState(queueName) {
  const response = await fetch(
    `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}`,
    {
      headers: { authorization: managementAuthorization() },
      signal: AbortSignal.timeout(2_000),
    },
  );
  assert(response.ok, `RabbitMQ queue inspection failed with HTTP ${response.status}.`);
  return response.json();
}

async function queueExists(queueName) {
  const response = await fetch(
    `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}`,
    {
      headers: { authorization: managementAuthorization() },
      signal: AbortSignal.timeout(2_000),
    },
  );
  if (response.status === 404) return false;
  assert(response.ok, `RabbitMQ queue inspection failed with HTTP ${response.status}.`);
  return true;
}

async function removeQueue(queueName) {
  const response = await fetch(
    `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}`,
    {
      method: 'DELETE',
      headers: { authorization: managementAuthorization() },
      signal: AbortSignal.timeout(2_000),
    },
  );
  assert(
    response.status === 204 || response.status === 404,
    `RabbitMQ queue deletion failed with HTTP ${response.status}.`,
  );
  await waitFor(`${queueName} to be absent`, async () => !(await queueExists(queueName)));
}

async function purgeQueue(queueName) {
  const response = await fetch(
    `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}/contents`,
    {
      method: 'DELETE',
      headers: { authorization: managementAuthorization() },
      signal: AbortSignal.timeout(2_000),
    },
  );
  assert(
    response.status === 204 || response.status === 404,
    `Queue purge failed with HTTP ${response.status}.`,
  );
}

async function peekQueue(queueName) {
  const response = await fetch(
    `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}/get`,
    {
      method: 'POST',
      headers: {
        authorization: managementAuthorization(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        count: 10,
        ackmode: 'ack_requeue_true',
        encoding: 'auto',
        truncate: 50000,
      }),
      signal: AbortSignal.timeout(2_000),
    },
  );
  assert(response.ok, `Queue read failed with HTTP ${response.status}.`);
  return response.json();
}

async function waitForAuditEvent(connection, eventId) {
  return waitFor('the event to reach the audit log', async () => {
    const rows = await connection.query(
      'SELECT event_id::text FROM audit.event_log WHERE event_id = $1',
      [eventId],
    );
    return rows[0];
  });
}

async function createTraceEvent(connection) {
  const transactions = new PostgresTransactionRunner(connection);
  const identifiers = new PostgresUuidV7Generator(connection);
  let event;
  await transactions.runInTransaction(async (transaction) => {
    event = new AuditTraceRequested({
      eventId: await identifiers.generate(transaction),
      aggregateId: await identifiers.generate(transaction),
      occurredAt: new Date().toISOString(),
    });
  });
  assert(event, 'Tracer fixture was not created.');
  return event;
}

async function createTraceEventWithCommittedAuditEffect(connection) {
  const event = await createTraceEvent(connection);
  await connection.query(
    `INSERT INTO audit.event_log
       (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.eventId,
      event.type,
      event.version,
      event.aggregateId,
      event.occurredAt,
      event.traceContext,
      event.payload,
    ],
  );
  return event;
}

async function publishLegacyConfirmed(event) {
  const connection = await amqp.connect(rabbitMqUrl);
  try {
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange('rei.events', 'topic', { durable: true });
    await channel.assertQueue(legacyAuditQueue, { durable: true });
    await channel.bindQueue(legacyAuditQueue, 'rei.events', 'audit.trace.requested');
    channel.publish('rei.events', event.type, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: 'application/json',
      messageId: event.eventId,
      type: event.type,
    });
    await channel.waitForConfirms();
    await channel.close();
  } finally {
    await connection.close();
  }
}

async function legacyBindingExists() {
  const response = await fetch(
    `${rabbitManagementUrl}/api/bindings/${encodeURIComponent(rabbitVhost)}/e/${encodeURIComponent('rei.events')}/q/${encodeURIComponent(legacyAuditQueue)}`,
    {
      headers: { authorization: managementAuthorization() },
      signal: AbortSignal.timeout(2_000),
    },
  );
  assert(response.ok, `RabbitMQ binding inspection failed with HTTP ${response.status}.`);
  const bindings = await response.json();
  return bindings.some(({ routing_key }) => routing_key === 'audit.trace.requested');
}

async function proveRequestRollback(connection) {
  const transactions = new PostgresTransactionRunner(connection);
  const identifiers = new PostgresUuidV7Generator(connection);
  const outbox = new PostgresOutbox(connection);
  let eventId;

  try {
    const service = new RequestAuditTrace(
      transactions,
      identifiers,
      { now: () => new Date().toISOString() },
      {
        append: async (transaction, events) => {
          eventId = events[0]?.eventId;
          await outbox.append(transaction, events);
          throw new Error('forced rollback');
        },
      },
    );
    await service.execute();
  } catch (error) {
    assert(
      error instanceof Error && error.message === 'forced rollback',
      'Rollback cause changed.',
    );
  }

  assert(eventId, 'Rollback proof did not allocate an event identifier.');
  const outboxRows = await connection.query(
    'SELECT count(*)::integer AS count FROM platform.outbox WHERE event_id = $1',
    [eventId],
  );
  const auditRows = await connection.query(
    'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
    [eventId],
  );
  assert(outboxRows[0]?.count === 0, 'Rolled-back outbox event still exists.');
  assert(auditRows[0]?.count === 0, 'Rolled-back audit event exists.');
}

async function proveConsumerRollback(connection) {
  const transactions = new PostgresTransactionRunner(connection);
  const identifiers = new PostgresUuidV7Generator(connection);
  const inbox = new PostgresInbox(connection);
  const audit = new PostgresAuditEventLog(connection);
  let event;

  try {
    await transactions.runInTransaction(async (transaction) => {
      const eventId = await identifiers.generate(transaction);
      event = new AuditTraceRequested({
        eventId,
        aggregateId: await identifiers.generate(transaction),
        occurredAt: new Date().toISOString(),
      });
      await inbox.record(transaction, 'audit.event-log', event.eventId);
      await audit.append(transaction, event);
      throw new Error('forced effect failure');
    });
  } catch (error) {
    assert(
      error instanceof Error && error.message === 'forced effect failure',
      'Consumer rollback cause changed.',
    );
  }

  assert(event, 'Consumer rollback proof did not create an event.');
  const inboxRows = await connection.query(
    `SELECT count(*)::integer AS count
       FROM platform.inbox
      WHERE consumer_name = $1 AND event_id = $2`,
    ['audit.event-log', event.eventId],
  );
  const auditRows = await connection.query(
    'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
    [event.eventId],
  );
  assert(inboxRows[0]?.count === 0, 'Failed consumer transaction recorded its inbox key.');
  assert(auditRows[0]?.count === 0, 'Failed consumer transaction recorded its audit effect.');
}

async function proveDuplicateSuppression(connection, delivered) {
  const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5_000 });
  try {
    const duplicate = new AuditTraceRequested({
      eventId: delivered.outbox.event_id,
      aggregateId: delivered.outbox.aggregate_id,
      occurredAt: delivered.outbox.occurred_at.toISOString(),
    });
    await publisher.publish(duplicate, AbortSignal.timeout(5_000));
    await waitForQueueIdle();
  } finally {
    await publisher.close();
  }

  const inboxRows = await connection.query(
    `SELECT count(*)::integer AS count
       FROM platform.inbox
      WHERE consumer_name = $1 AND event_id = $2`,
    ['audit.event-log', delivered.outbox.event_id],
  );
  const auditRows = await connection.query(
    'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
    [delivered.outbox.event_id],
  );
  assert(inboxRows[0]?.count === 1, 'Duplicate delivery created more than one inbox key.');
  assert(auditRows[0]?.count === 1, 'Duplicate delivery repeated the audit effect.');
}

async function proveBrokerRestartRecovery(connection) {
  const { stdout: workerBefore } = await execute('docker', composeArgs('ps', '-q', 'worker'));
  assert(workerBefore.trim(), 'Worker container was not running before the broker restart.');
  const outbox = new PostgresOutbox(connection);
  const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5_000 });
  let workerPaused = false;

  try {
    // Freeze the existing worker process so a confirmed persistent message remains queued while
    // RabbitMQ restarts. Unpausing the same container then proves topology restoration and durable
    // delivery without substituting a newly started worker process.
    await execute('docker', composeArgs('pause', 'worker'), { timeout: 30_000 });
    workerPaused = true;
    const durableEvent = await appendSingleEvent(connection);
    const durableClaim = (await outbox.claimPending(1, 10_000))[0];
    assert(
      durableClaim?.eventId === durableEvent.eventId,
      'Durable restart event was not claimed.',
    );
    await publisher.publish(durableClaim, AbortSignal.timeout(5_000));
    await outbox.markPublished(durableClaim.eventId, durableClaim.claimId);
    await publisher.close();

    await execute('docker', composeArgs('restart', 'rabbitmq'), { timeout: 60_000 });
    await waitFor('RabbitMQ to become healthy after restart', async () => {
      try {
        await execute(
          'docker',
          composeArgs('exec', '-T', 'rabbitmq', 'rabbitmq-diagnostics', '-q', 'ping'),
          { timeout: 5_000 },
        );
        return true;
      } catch {
        return false;
      }
    });

    await execute('docker', composeArgs('unpause', 'worker'), { timeout: 30_000 });
    workerPaused = false;
    const { stdout: workerAfter } = await execute('docker', composeArgs('ps', '-q', 'worker'));
    assert(workerAfter.trim() === workerBefore.trim(), 'Worker restarted with RabbitMQ.');
    await waitForDeliveredEvent(connection, durableEvent.eventId);
  } finally {
    await publisher.close().catch(() => undefined);
    if (workerPaused) {
      await execute('docker', composeArgs('unpause', 'worker'), { timeout: 30_000 }).catch(
        () => undefined,
      );
    }
  }

  const postRestartEventId = await postTrace();
  await waitForDeliveredEvent(connection, postRestartEventId);
}

async function startRabbitMq() {
  await execute('docker', composeArgs('start', 'rabbitmq'), { timeout: 45_000 });
  await waitFor('RabbitMQ to become healthy', async () => {
    try {
      await execute(
        'docker',
        composeArgs('exec', '-T', 'rabbitmq', 'rabbitmq-diagnostics', '-q', 'ping'),
        { timeout: 5_000 },
      );
      return true;
    } catch {
      return false;
    }
  });
}

async function proveBrokerOutageLeavesOutboxRecoverable(connection) {
  let rabbitStopped = false;
  let workerStopped = false;
  let event;
  try {
    await execute('docker', composeArgs('stop', '--timeout', '30', 'rabbitmq'), {
      timeout: 45_000,
    });
    rabbitStopped = true;
    event = await appendSingleEvent(connection);

    // Let the relay observe a real connection failure, then stop it through its normal shutdown
    // path so any active or queued policy work releases its claim before we inspect persistence.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await stopWorker();
    workerStopped = true;
    const rows = await connection.query(
      `SELECT published_at, claim_id::text
         FROM platform.outbox
        WHERE event_id = $1`,
      [event.eventId],
    );
    assert(
      rows[0]?.published_at === null,
      'Broker outage falsely marked the outbox row published.',
    );
    assert(rows[0]?.claim_id === null, 'Broker outage left an unrecoverable outbox claim.');

    await startRabbitMq();
    rabbitStopped = false;
    await startWorker();
    workerStopped = false;
    assert(event, 'Broker outage fixture was not created.');
    const delivered = await waitForDeliveredEvent(connection, event.eventId);
    assert(
      delivered.outbox.event_id === event.eventId,
      'Recovered publication changed its event id.',
    );
  } finally {
    if (rabbitStopped) await startRabbitMq().catch(() => undefined);
    if (workerStopped) await startWorker().catch(() => undefined);
  }
}

async function appendOrderedEvents(connection) {
  const transactions = new PostgresTransactionRunner(connection);
  const identifiers = new PostgresUuidV7Generator(connection);
  const outbox = new PostgresOutbox(connection);
  let sequence;

  await transactions.runInTransaction(async (transaction) => {
    const aggregateA = await identifiers.generate(transaction);
    const aggregateB = await identifiers.generate(transaction);
    const events = [];
    for (const aggregateId of [aggregateA, aggregateB, aggregateA, aggregateB]) {
      events.push(
        new AuditTraceRequested({
          eventId: await identifiers.generate(transaction),
          aggregateId,
          occurredAt: new Date().toISOString(),
        }),
      );
    }
    sequence = { aggregateA, aggregateB, events };
    await outbox.append(transaction, events);
  });
  return sequence;
}

async function proveAggregateOrder(connection) {
  const sequence = await appendOrderedEvents(connection);
  assert(sequence, 'Ordered event fixture was not created.');
  for (const event of sequence.events) {
    await waitForDeliveredEvent(connection, event.eventId);
  }

  for (const aggregateId of [sequence.aggregateA, sequence.aggregateB]) {
    const expected = sequence.events
      .filter((event) => event.aggregateId === aggregateId)
      .map((event) => event.eventId);
    const rows = await connection.query(
      `SELECT event_id::text
         FROM audit.event_log
        WHERE aggregate_id = $1
        ORDER BY appended_at, event_id`,
      [aggregateId],
    );
    assert(
      JSON.stringify(rows.map(({ event_id }) => event_id)) === JSON.stringify(expected),
      'Audit observations did not preserve relay order within an aggregate.',
    );
  }
}

async function stopWorker() {
  await execute('docker', composeArgs('stop', '--timeout', '30', 'worker'), { timeout: 45_000 });
}

async function startWorker() {
  await execute('docker', composeArgs('start', 'worker'), { timeout: 45_000 });
  await waitFor('the worker to become healthy', async () => {
    const { stdout: workerId } = await execute('docker', composeArgs('ps', '-q', 'worker'));
    if (!workerId.trim()) return false;
    const { stdout: status } = await execute('docker', [
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      workerId.trim(),
    ]);
    return status.trim() === 'healthy';
  });
}

async function proveLegacyQueueUpgrade(connection) {
  let workerStopped = false;
  try {
    await stopWorker();
    workerStopped = true;

    // Recreate a baseline-only broker state. Deleting the stable queue also removes its bindings,
    // so both confirmed fixtures below can initially exist only in the legacy durable queue.
    await removeQueue(stableAuditQueue);
    assert(!(await queueExists(stableAuditQueue)), 'The stable audit queue still exists.');

    const backlogEvent = await createTraceEvent(connection);
    const committedEffectEvent = await createTraceEventWithCommittedAuditEffect(connection);
    await publishLegacyConfirmed(backlogEvent);
    await publishLegacyConfirmed(committedEffectEvent);
    await waitFor('the confirmed baseline queue backlog', async () => {
      const state = await queueState(legacyAuditQueue);
      return state.messages_ready === 2;
    });
    assert(
      !(await queueExists(stableAuditQueue)),
      'Seeding the baseline broker state recreated the stable audit queue.',
    );
    const preUpgradeInbox = await connection.query(
      `SELECT count(*)::integer AS count
         FROM platform.inbox
        WHERE consumer_name = $1 AND event_id = $2`,
      [stableAuditQueue, committedEffectEvent.eventId],
    );
    const preUpgradeAudit = await connection.query(
      'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
      [committedEffectEvent.eventId],
    );
    assert(
      preUpgradeInbox[0]?.count === 0 && preUpgradeAudit[0]?.count === 1,
      'The commit-before-ack upgrade fixture was not isolated correctly.',
    );

    await startWorker();
    workerStopped = false;
    await waitForAuditEvent(connection, backlogEvent.eventId);
    await waitFor('the pre-upgrade effect delivery to record its inbox key', async () => {
      const rows = await connection.query(
        `SELECT count(*)::integer AS count
           FROM platform.inbox
          WHERE consumer_name = $1 AND event_id = $2`,
        [stableAuditQueue, committedEffectEvent.eventId],
      );
      return rows[0]?.count === 1;
    });
    await waitFor('the baseline queue to drain', async () => {
      const state = await queueState(legacyAuditQueue);
      return state.messages_ready === 0 && state.messages_unacknowledged === 0;
    });
    assert(!(await legacyBindingExists()), 'The baseline tracer binding remained active.');

    const futureEvent = await createTraceEvent(connection);
    const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5_000 });
    try {
      await publisher.publish(futureEvent, AbortSignal.timeout(5_000));
    } finally {
      await publisher.close();
    }
    await waitForAuditEvent(connection, futureEvent.eventId);
    const legacyState = await queueState(legacyAuditQueue);
    assert(
      legacyState.messages_ready === 0 && legacyState.messages_unacknowledged === 0,
      'A post-upgrade event accumulated in the baseline queue.',
    );

    for (const event of [backlogEvent, committedEffectEvent, futureEvent]) {
      const inboxRows = await connection.query(
        `SELECT count(*)::integer AS count
           FROM platform.inbox
          WHERE consumer_name = $1 AND event_id = $2`,
        [stableAuditQueue, event.eventId],
      );
      const auditRows = await connection.query(
        'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
        [event.eventId],
      );
      assert(inboxRows[0]?.count === 1, 'Legacy migration duplicated the inbox boundary.');
      assert(auditRows[0]?.count === 1, 'Legacy migration duplicated the audit effect.');
    }
  } finally {
    if (workerStopped) await startWorker();
  }
}

function ownedClaims(claimsByRelay) {
  return claimsByRelay.flatMap((claims, relayIndex) =>
    claims.map((event) => ({ event, relayIndex })),
  );
}

function assertClaimedExactly(claims, expectedEventIds, description) {
  const actual = claims.map(({ event }) => event.eventId).sort();
  const expected = [...expectedEventIds].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${description} did not claim the expected aggregate heads.`,
  );
  assert(
    new Set(claims.map(({ event }) => event.claimId)).size === claims.length,
    `${description} reused a claim owner.`,
  );
}

async function appendSingleEvent(connection) {
  const transactions = new PostgresTransactionRunner(connection);
  const identifiers = new PostgresUuidV7Generator(connection);
  const outbox = new PostgresOutbox(connection);
  let event;
  await transactions.runInTransaction(async (transaction) => {
    event = new AuditTraceRequested({
      eventId: await identifiers.generate(transaction),
      aggregateId: await identifiers.generate(transaction),
      occurredAt: new Date().toISOString(),
    });
    await outbox.append(transaction, [event]);
  });
  assert(event, 'Expired-claim fixture was not created.');
  return event;
}

async function proveConcurrentRelayClaims(connection) {
  const relays = [new PostgresOutbox(connection), new PostgresOutbox(connection)];
  const publishers = relays.map(
    () => new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5_000 }),
  );
  let workerStopped = false;
  let eventsToObserve;

  try {
    await stopWorker();
    workerStopped = true;

    const sequence = await appendOrderedEvents(connection);
    assert(sequence, 'Concurrent relay fixture was not created.');
    const [aggregateAHead, aggregateBHead, aggregateATail, aggregateBTail] = sequence.events;

    const initialClaims = ownedClaims(
      await Promise.all(relays.map((relay) => relay.claimPending(1, 5_000))),
    );
    assertClaimedExactly(
      initialClaims,
      [aggregateAHead.eventId, aggregateBHead.eventId],
      'Initial concurrent relay round',
    );
    assert(
      new Set(initialClaims.map(({ event }) => event.aggregateId)).size === 2,
      'Concurrent relays leased two rows for one aggregate.',
    );

    const failedHead = initialClaims.find(({ event }) => event.eventId === aggregateAHead.eventId);
    const progressingHead = initialClaims.find(
      ({ event }) => event.eventId === aggregateBHead.eventId,
    );
    assert(failedHead && progressingHead, 'Concurrent relay ownership could not be identified.');

    const aborted = AbortSignal.abort(new Error('forced relay abort'));
    let abortObserved = false;
    try {
      await publishers[failedHead.relayIndex].publish(failedHead.event, aborted);
    } catch (error) {
      abortObserved = isExternalFailure(error) && error.kind === 'cancelled';
    }
    assert(abortObserved, 'Aborted relay publication unexpectedly succeeded.');
    await relays[failedHead.relayIndex].releaseClaim(
      failedHead.event.eventId,
      failedHead.event.claimId,
    );

    await publishers[progressingHead.relayIndex].publish(
      progressingHead.event,
      AbortSignal.timeout(5_000),
    );
    await relays[progressingHead.relayIndex].markPublished(
      progressingHead.event.eventId,
      progressingHead.event.claimId,
    );

    const secondClaims = ownedClaims(
      await Promise.all(relays.map((relay) => relay.claimPending(1, 5_000))),
    );
    assertClaimedExactly(
      secondClaims,
      [aggregateAHead.eventId, aggregateBTail.eventId],
      'Second concurrent relay round',
    );
    assert(
      secondClaims.every(({ event }) => event.eventId !== aggregateATail.eventId),
      'A later same-aggregate event bypassed its unpublished head.',
    );

    await Promise.all(
      secondClaims.map(async ({ event, relayIndex }) => {
        await publishers[relayIndex].publish(event, AbortSignal.timeout(5_000));
        await relays[relayIndex].markPublished(event.eventId, event.claimId);
      }),
    );

    const finalClaims = await relays[0].claimPending(1, 5_000);
    assert(
      finalClaims.length === 1 && finalClaims[0]?.eventId === aggregateATail.eventId,
      'The later same-aggregate event did not become eligible after its head was published.',
    );
    const aggregateATailClaim = finalClaims[0];
    await publishers[0].publish(aggregateATailClaim, AbortSignal.timeout(5_000));
    await relays[0].markPublished(aggregateATailClaim.eventId, aggregateATailClaim.claimId);

    const expiringEvent = await appendSingleEvent(connection);
    const expiringClaim = (await relays[0].claimPending(1, 100))[0];
    assert(
      expiringClaim?.eventId === expiringEvent.eventId,
      'Expiring relay claim was not acquired.',
    );
    const recoveredClaim = await waitFor('an expired relay claim to become eligible', async () => {
      const claim = (await relays[1].claimPending(1, 5_000))[0];
      return claim?.eventId === expiringEvent.eventId ? claim : undefined;
    });
    assert(
      recoveredClaim.claimId !== expiringClaim.claimId,
      'Expired relay claim retained its previous owner.',
    );
    await publishers[1].publish(recoveredClaim, AbortSignal.timeout(5_000));
    await relays[1].markPublished(recoveredClaim.eventId, recoveredClaim.claimId);

    eventsToObserve = [...sequence.events, expiringEvent];
  } finally {
    await Promise.all(publishers.map((publisher) => publisher.close().catch(() => undefined)));
    if (workerStopped) await startWorker();
  }

  assert(eventsToObserve, 'Concurrent relay proof did not retain its event fixture.');
  for (const event of eventsToObserve) {
    await waitForDeliveredEvent(connection, event.eventId);
  }
}

async function provePoisonDeadLetter(connection) {
  const event = await createTraceEvent(connection);
  const [{ id: conflictingAggregate }] = await connection.query('SELECT uuidv7()::text AS id');
  await connection.query(
    `INSERT INTO audit.event_log
       (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [event.eventId, event.type, event.version, conflictingAggregate, event.occurredAt, null, {}],
  );
  await purgeQueue(auditDeadLetterQueue);
  await connection.query(
    'DROP FUNCTION IF EXISTS audit.count_integration_poison_attempt() CASCADE',
  );
  await connection.query('DROP SEQUENCE IF EXISTS audit.integration_poison_attempt');
  await connection.query('CREATE SEQUENCE audit.integration_poison_attempt');
  await connection.query(`
    CREATE FUNCTION audit.count_integration_poison_attempt()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM nextval('audit.integration_poison_attempt');
      RETURN NEW;
    END;
    $$
  `);
  await connection.query(`
    CREATE TRIGGER count_integration_poison_attempt
    BEFORE INSERT ON audit.event_log
    FOR EACH ROW
    EXECUTE FUNCTION audit.count_integration_poison_attempt()
  `);
  const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5_000 });
  try {
    await publisher.publish(event, AbortSignal.timeout(5_000));
    await waitFor('the poison event to reach dead-letter', async () => {
      const state = await queueState(auditDeadLetterQueue);
      return state.messages_ready === 1 && state.messages_unacknowledged === 0;
    });
    const deadLetterState = await queueState(auditDeadLetterQueue);
    assert(deadLetterState.type === 'classic', 'Poison dead-letter queue was not classic.');
    await waitForQueueIdle();
    const messages = await waitFor('the poison dead letter to be readable', async () => {
      const available = await peekQueue(auditDeadLetterQueue);
      return available.length === 1 ? available : undefined;
    });
    assert(
      messages[0]?.properties?.headers?.['x-rei-delivery-attempt'] === 5,
      'Poison delivery did not preserve the fifth normal attempt.',
    );
    const inbox = await connection.query(
      `SELECT count(*)::integer AS count FROM platform.inbox
        WHERE consumer_name = $1 AND event_id = $2`,
      [stableAuditQueue, event.eventId],
    );
    const audit = await connection.query(
      'SELECT aggregate_id::text FROM audit.event_log WHERE event_id = $1',
      [event.eventId],
    );
    assert(inbox[0]?.count === 0, 'Poison delivery committed an inbox marker.');
    assert(
      audit[0]?.aggregate_id === conflictingAggregate,
      'Poison delivery altered the audit effect.',
    );
    const attempts = await connection.query(
      `SELECT last_value::integer AS count, is_called
         FROM audit.integration_poison_attempt`,
    );
    assert(
      attempts[0]?.is_called === true && attempts[0]?.count === 5,
      'Poison delivery did not invoke the audit effect exactly five times.',
    );
  } finally {
    await publisher.close().catch(() => undefined);
    await purgeQueue(auditDeadLetterQueue);
    await connection.query(
      'DROP FUNCTION IF EXISTS audit.count_integration_poison_attempt() CASCADE',
    );
    await connection.query('DROP SEQUENCE IF EXISTS audit.integration_poison_attempt');
  }
}

async function proveAdapterRetrySurvivesRestart(connection) {
  const queue = 'integration.retry-probe';
  const deadLetterQueue = `${queue}.dead-letter`;
  await removeQueue(queue);
  await removeQueue(deadLetterQueue);
  const trace = await createTraceEvent(connection);
  const event = { ...trace, type: 'integration.retry.probe' };
  let releaseInFlight;
  let calls = 0;
  const first = new RabbitMqEventBroker({
    url: rabbitMqUrl,
    operationTimeoutMs: 250,
    deliveryLimit: 5,
    redeliveryDelayMs: 100,
  });
  try {
    await first.subscribe({ consumerName: queue, eventTypes: [event.type] }, async () => {
      calls += 1;
      if (calls === 1) throw new Error('normal retry transfer');
      await new Promise((resolve) => (releaseInFlight = resolve));
    });
    await first.start();
    await first.publish(event, AbortSignal.timeout(5_000));
    await waitFor('the adapter-produced retry to become in flight', async () => calls >= 2);
    await first.close();
    releaseInFlight?.();

    const resumed = new RabbitMqEventBroker({
      url: rabbitMqUrl,
      operationTimeoutMs: 5_000,
      deliveryLimit: 5,
      redeliveryDelayMs: 100,
    });
    let resumedCalls = 0;
    try {
      await resumed.subscribe({ consumerName: queue, eventTypes: [event.type] }, async () => {
        resumedCalls += 1;
        throw new Error('continue retry chain');
      });
      await resumed.start();
      await waitFor('the restarted retry chain to dead-letter', async () => {
        const state = await queueState(deadLetterQueue);
        return state.messages_ready === 1 && state.messages_unacknowledged === 0;
      });
      const messages = await waitFor('the restarted dead letter to be readable', async () => {
        const available = await peekQueue(deadLetterQueue);
        return available.length === 1 ? available : undefined;
      });
      assert(
        messages[0]?.properties?.headers?.['x-rei-delivery-attempt'] === 5,
        'Restarted delivery lost its adapter-produced attempt count.',
      );
      assert(resumedCalls === 4, 'Restarted delivery did not resume from attempt two.');
    } finally {
      await resumed.close().catch(() => undefined);
    }
  } finally {
    releaseInFlight?.();
    await first.close().catch(() => undefined);
    await removeQueue(queue);
    await removeQueue(deadLetterQueue);
  }
}

async function proveActivePruningCancellation(connection) {
  const marker = `rei-retention-cancel-${Date.now()}`;
  const controller = new AbortController();
  const active = connection.queryAbortable(
    `SELECT pg_sleep(30) /* ${marker} */`,
    [],
    controller.signal,
  );
  const [{ pid }] = await waitFor('the live retention backend', async () => {
    const rows = await connection.query(
      `SELECT pid FROM pg_stat_activity
        WHERE query LIKE $1 AND pid <> pg_backend_pid()`,
      [`%${marker}%`],
    );
    return rows.length > 0 ? rows : undefined;
  });
  controller.abort(new Error('integration shutdown'));
  await active.then(
    () => {
      throw new Error('Cancelled maintenance query unexpectedly completed.');
    },
    (error) =>
      assert(
        error instanceof Error && error.message === 'integration shutdown',
        'Abort reason changed.',
      ),
  );
  await waitFor('the cancelled retention backend to disappear', async () => {
    const rows = await connection.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [pid]);
    return rows.length === 0;
  });
  const rows = await connection.query('SELECT 1 AS value');
  assert(rows[0]?.value === 1, 'The pool was unusable after active-query cancellation.');
}

async function proveBoundedRetention(connection) {
  const rows = await connection.query(`SELECT uuidv7()::text AS id FROM generate_series(1, 7)`);
  const ids = rows.map(({ id }) => id);
  try {
    for (const [index, age] of [10, 8, 1].entries()) {
      await connection.query(
        `INSERT INTO platform.outbox
           (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload, published_at)
         VALUES ($1, 'integration.retention.probe', 1, $1, clock_timestamp(), NULL, '{}',
                 clock_timestamp() - ($2 * interval '1 day'))`,
        [ids[index], age],
      );
    }
    await connection.query(
      `INSERT INTO platform.outbox
         (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
       VALUES ($1, 'integration.retention.probe', 1, $1, clock_timestamp(), NULL, '{}')`,
      [ids[3]],
    );
    for (const [eventId, age] of [
      [ids[4], 40],
      [ids[6], 35],
      [ids[3], 40],
      [ids[5], 1],
    ]) {
      await connection.query(
        `INSERT INTO platform.inbox (consumer_name, event_id, received_at)
         VALUES ('integration.retention', $1, clock_timestamp() - ($2 * interval '1 day'))`,
        [eventId, age],
      );
    }

    const outbox = new PostgresOutbox(connection);
    const inbox = new PostgresInbox(connection);
    assert(
      (await outbox.prunePublished(7 * 86_400_000, 1, AbortSignal.timeout(5_000))) === 1,
      'Outbox pruning did not honor batch one.',
    );
    assert(
      (await inbox.pruneConsumed(30 * 86_400_000, 1, AbortSignal.timeout(5_000))) === 1,
      'Inbox pruning did not honor batch one.',
    );
    const survivingOutbox = await connection.query(
      'SELECT event_id::text AS id FROM platform.outbox WHERE event_id = ANY($1::uuid[])',
      [ids],
    );
    assert(
      !survivingOutbox.some(({ id }) => id === ids[0]),
      'Oldest published outbox row survived.',
    );
    assert(
      survivingOutbox.some(({ id }) => id === ids[1]),
      'Pruning exceeded its outbox batch.',
    );
    assert(
      survivingOutbox.some(({ id }) => id === ids[2]),
      'Fresh outbox row was pruned.',
    );
    const protectedInbox = await connection.query(
      `SELECT event_id::text AS id FROM platform.inbox
        WHERE consumer_name = 'integration.retention' AND event_id = $1`,
      [ids[3]],
    );
    assert(
      protectedInbox.length === 1,
      'Unpublished outbox event did not protect its inbox marker.',
    );
    const survivingInbox = await connection.query(
      `SELECT event_id::text AS id FROM platform.inbox
        WHERE consumer_name = 'integration.retention' AND event_id = ANY($1::uuid[])`,
      [[ids[4], ids[5], ids[6]]],
    );
    assert(
      !survivingInbox.some(({ id }) => id === ids[4]),
      'Oldest eligible inbox marker survived.',
    );
    assert(
      survivingInbox.some(({ id }) => id === ids[6]),
      'Pruning exceeded its inbox batch.',
    );
    assert(
      survivingInbox.some(({ id }) => id === ids[5]),
      'Fresh inbox marker was pruned.',
    );
  } finally {
    await connection.query(
      "DELETE FROM platform.inbox WHERE consumer_name = 'integration.retention'",
    );
    await connection.query('DELETE FROM platform.outbox WHERE event_id = ANY($1::uuid[])', [ids]);
  }
}

const connection = new DatabaseConnection(databaseUrl);
try {
  const initialEventId = await postTrace();
  const delivered = await waitForDeliveredEvent(connection, initialEventId);
  assert(delivered.outbox.event_type === 'audit.trace.requested', 'Unexpected outbox event type.');
  assert(delivered.audit.event_id === delivered.outbox.event_id, 'Audit event ID differs.');
  assert(
    delivered.audit.aggregate_id === delivered.outbox.aggregate_id,
    'Audit aggregate differs.',
  );
  assert(
    delivered.audit.occurred_at.getTime() === delivered.outbox.occurred_at.getTime(),
    'Audit occurrence time differs.',
  );
  assert(
    delivered.outbox.trace_context === null && delivered.audit.trace_context === null,
    'Trace slot is not null.',
  );
  assert(
    JSON.stringify(delivered.outbox.payload) === '{}' &&
      JSON.stringify(delivered.audit.payload) === '{}',
    'Tracer payload changed during delivery.',
  );

  await proveRequestRollback(connection);
  await proveConsumerRollback(connection);
  await proveDuplicateSuppression(connection, delivered);
  await proveLegacyQueueUpgrade(connection);
  await proveBrokerRestartRecovery(connection);
  await proveBrokerOutageLeavesOutboxRecoverable(connection);
  await proveAggregateOrder(connection);
  await proveConcurrentRelayClaims(connection);
  await provePoisonDeadLetter(connection);
  await proveAdapterRetrySurvivesRestart(connection);
  await proveActivePruningCancellation(connection);
  await proveBoundedRetention(connection);
  console.log('Audit delivery guarantees integration passed.');
} finally {
  await connection.close();
}
