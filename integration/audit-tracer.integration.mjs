import { RequestAuditTrace } from '../packages/application/dist/index.js';
import {
  DatabaseConnection,
  PostgresOutbox,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
} from '../packages/infrastructure/dist/index.js';

const apiUrl = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:8200';
const databaseUrl =
  process.env.INTEGRATION_DATABASE_URL ??
  'postgres://realestate:realestate@127.0.0.1:5434/real_estate_intelligence';
const deadline = Date.now() + 30_000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForDeliveredEvent(connection, eventId) {
  while (Date.now() < deadline) {
    const [outboxRows, auditRows] = await Promise.all([
      connection.query(
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
      ),
      connection.query(
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
      ),
    ]);
    if (outboxRows[0]?.published_at && auditRows[0]) {
      return { outbox: outboxRows[0], audit: auditRows[0] };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the tracer event to reach the audit log.');
}

async function proveRollback(connection) {
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
  const [outboxRows, auditRows] = await Promise.all([
    connection.query('SELECT count(*)::integer AS count FROM platform.outbox WHERE event_id = $1', [
      eventId,
    ]),
    connection.query('SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1', [
      eventId,
    ]),
  ]);
  assert(outboxRows[0]?.count === 0, 'Rolled-back outbox event still exists.');
  assert(auditRows[0]?.count === 0, 'Rolled-back audit event exists.');
}

const connection = new DatabaseConnection(databaseUrl);
try {
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

  const { outbox, audit } = await waitForDeliveredEvent(connection, body.eventId);
  assert(outbox.event_type === 'audit.trace.requested', 'Unexpected outbox event type.');
  assert(audit.event_id === outbox.event_id, 'Audit event identifier differs from the outbox.');
  assert(audit.event_type === outbox.event_type, 'Audit event type differs from the outbox.');
  assert(
    audit.event_version === outbox.event_version,
    'Audit event version differs from the outbox.',
  );
  assert(audit.aggregate_id === outbox.aggregate_id, 'Audit aggregate differs from the outbox.');
  assert(
    audit.occurred_at.getTime() === outbox.occurred_at.getTime(),
    'Audit occurrence time differs from the outbox.',
  );
  assert(outbox.trace_context === null && audit.trace_context === null, 'Trace slot is not null.');
  assert(
    JSON.stringify(outbox.payload) === '{}' && JSON.stringify(audit.payload) === '{}',
    'Tracer payload changed during delivery.',
  );

  await proveRollback(connection);
  console.log('Audit tracer integration passed.');
} finally {
  await connection.close();
}
