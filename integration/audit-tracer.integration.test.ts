import amqp from 'amqplib';
import { expect, test, vi } from 'vitest';
import type { EventEnvelope, OutboxRow } from '../packages/application/dist/index.js';
import { isExternalFailure, RequestAuditTrace } from '../packages/application/dist/index.js';
import type { TraceContext } from '../packages/domain/dist/index.js';
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
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
test('audit-tracer preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const [
      postgresPort,
      apiPort,
      rabbitPort,
      managementPort,
      minioPort,
      minioConsolePort,
      aiPort,
      webPort,
      valkeyPort,
    ] = await allocatePorts(9);
    const composeProjectName = `rei-audit-${process.pid}-${Date.now()}`;
    const rabbitUser = 'rei_audit_fixture';
    const rabbitPassword = 'rei-audit-owned-fixture';
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const databaseConnectionUrl = new URL('postgres://127.0.0.1');
    databaseConnectionUrl.username = rabbitUser;
    databaseConnectionUrl.password = rabbitPassword;
    databaseConnectionUrl.port = String(postgresPort);
    databaseConnectionUrl.pathname = '/rei_audit_fixture';
    const databaseUrl = databaseConnectionUrl.toString();
    const rabbitMqUrl = `amqp://${rabbitUser}:${rabbitPassword}@127.0.0.1:${rabbitPort}/real-estate-intelligence`;
    const rabbitManagementUrl = `http://127.0.0.1:${managementPort}`;
    const environment = {
      ...process.env,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      COMPOSE_PROFILES: '',
      NODE_ENV: 'test',
      POSTGRES_DB: 'rei_audit_fixture',
      POSTGRES_USER: rabbitUser,
      POSTGRES_PASSWORD: rabbitPassword,
      POSTGRES_PORT: String(postgresPort),
      API_PORT: String(apiPort),
      RABBITMQ_USER: rabbitUser,
      RABBITMQ_PASSWORD: rabbitPassword,
      RABBITMQ_VHOST: 'real-estate-intelligence',
      RABBITMQ_PORT: String(rabbitPort),
      RABBITMQ_MANAGEMENT_PORT: String(managementPort),
      MINIO_ROOT_USER: rabbitUser,
      MINIO_ROOT_PASSWORD: rabbitPassword,
      MINIO_API_PORT: String(minioPort),
      MINIO_CONSOLE_PORT: String(minioConsolePort),
      AI_PORT: String(aiPort),
      WEB_PORT: String(webPort),
      VALKEY_PORT: String(valkeyPort),
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const execute = (file: string, args: string[], options = {}) =>
      command(file, args, { ...options, env: environment });
    const rabbitVhost = 'real-estate-intelligence';
    const legacyAuditQueue = 'audit.trace-requested.audit';
    const stableAuditQueue = 'audit.event-log';
    const auditDeadLetterQueue = `${stableAuditQueue}.dead-letter`;
    const requestTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const requestTraceparent = `00-${requestTraceId}-00f067aa0ba902b7-01`;
    const requestTracestate = 'integration=opaque';
    function composeArgs(...args: string[]) {
      return composeProjectName
        ? ['compose', '--project-name', composeProjectName, ...args]
        : ['compose', ...args];
    }
    async function waitFor<T>(
      description: string,
      probe: () => Promise<T> | T,
      timeoutMs = 60000,
      pollIntervalMs = 250,
    ) {
      let result: T | undefined;
      await vi.waitFor(
        async () => {
          result = await probe();
          expect(result, description).toBeTruthy();
        },
        { timeout: timeoutMs, interval: pollIntervalMs },
      );
      return result as NonNullable<T>;
    }
    async function postTrace() {
      const response = await requestHttp(`${apiUrl}/api/v1/audit/traces`, {
        method: 'POST',
        headers: {
          traceparent: requestTraceparent,
          tracestate: requestTracestate,
        },
        signal: AbortSignal.timeout(5000),
      });
      expect(
        response.status === 202,
        `Expected HTTP 202, received ${response.status}.`,
      ).toBeTruthy();
      const body = (await response.json()) as { eventId: string };
      expect(
        typeof body.eventId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            body.eventId,
          ),
        'The endpoint did not return a UUIDv7 event identifier.',
      ).toBeTruthy();
      return body.eventId;
    }
    async function waitForDeliveredEvent(connection: DatabaseConnection, eventId: string) {
      return waitFor('the tracer event to reach the audit log', async () => {
        const outboxRows = await connection.query<{
          event_id: string;
          event_type: string;
          event_version: number;
          aggregate_id: string;
          occurred_at: Date;
          trace_context: TraceContext | null;
          payload: unknown;
          published_at: Date;
        }>(
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
        const auditRows = await connection.query<{
          event_id: string;
          event_type: string;
          event_version: number;
          aggregate_id: string;
          occurred_at: Date;
          trace_context: TraceContext | null;
          payload: unknown;
        }>(
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
        const response = await requestHttp(`${rabbitManagementUrl}/api/queues/${vhost}/${queue}`, {
          headers: { authorization },
          signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) return false;
        const body = await response.json();
        return (
          (body as { messages_ready: number }).messages_ready === 0 &&
          (body as { messages_unacknowledged: number }).messages_unacknowledged === 0
        );
      });
    }
    function managementAuthorization() {
      return `Basic ${Buffer.from(`${rabbitUser}:${rabbitPassword}`).toString('base64')}`;
    }
    async function queueState(queueName: string | number | boolean) {
      const response = await requestHttp(
        `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}`,
        {
          headers: { authorization: managementAuthorization() },
          signal: AbortSignal.timeout(2000),
        },
      );
      expect(
        response.ok,
        `RabbitMQ queue inspection failed with HTTP ${response.status}.`,
      ).toBeTruthy();
      return response.json() as Promise<{
        type: string;
        messages_ready: number;
        messages_unacknowledged: number;
      }>;
    }
    async function queueExists(queueName: string | number | boolean) {
      const response = await requestHttp(
        `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}`,
        {
          headers: { authorization: managementAuthorization() },
          signal: AbortSignal.timeout(2000),
        },
      );
      if (response.status === 404) return false;
      expect(
        response.ok,
        `RabbitMQ queue inspection failed with HTTP ${response.status}.`,
      ).toBeTruthy();
      return true;
    }
    async function removeQueue(queueName: string | number | boolean) {
      const response = await requestHttp(
        `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}`,
        {
          method: 'DELETE',
          headers: { authorization: managementAuthorization() },
          signal: AbortSignal.timeout(2000),
        },
      );
      expect(
        response.status === 204 || response.status === 404,
        `RabbitMQ queue deletion failed with HTTP ${response.status}.`,
      ).toBeTruthy();
      await waitFor(`${queueName} to be absent`, async () => !(await queueExists(queueName)));
    }
    async function purgeQueue(queueName: string | number | boolean) {
      const response = await requestHttp(
        `${rabbitManagementUrl}/api/queues/${encodeURIComponent(rabbitVhost)}/${encodeURIComponent(queueName)}/contents`,
        {
          method: 'DELETE',
          headers: { authorization: managementAuthorization() },
          signal: AbortSignal.timeout(2000),
        },
      );
      expect(
        response.status === 204 || response.status === 404,
        `Queue purge failed with HTTP ${response.status}.`,
      ).toBeTruthy();
    }
    async function peekQueue(queueName: string | number | boolean) {
      const response = await requestHttp(
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
          signal: AbortSignal.timeout(2000),
        },
      );
      expect(response.ok, `Queue read failed with HTTP ${response.status}.`).toBeTruthy();
      return response.json() as Promise<
        Array<{
          payload: string;
          properties: { message_id: string; headers: Record<string, unknown> };
        }>
      >;
    }
    async function waitForAuditEvent(connection: DatabaseConnection, eventId: string) {
      return waitFor('the event to reach the audit log', async () => {
        const rows = await connection.query<{ event_id: string }>(
          'SELECT event_id::text FROM audit.event_log WHERE event_id = $1',
          [eventId],
        );
        return rows[0];
      });
    }
    async function createTraceEvent(
      connection: DatabaseConnection,
      traceContext: TraceContext | null = null,
    ) {
      const transactions = new PostgresTransactionRunner(connection);
      const identifiers = new PostgresUuidV7Generator(connection);
      let event: AuditTraceRequested;
      await transactions.runInTransaction(async (transaction) => {
        event = new AuditTraceRequested({
          eventId: await identifiers.generate(transaction),
          aggregateId: await identifiers.generate(transaction),
          occurredAt: new Date().toISOString(),
          traceContext,
        });
      });
      expect(event!, 'Tracer fixture was not created.').toBeTruthy();
      return event!;
    }
    async function publishConfirmedWithHeaders(
      event: EventEnvelope,
      headers: { traceparent: string },
    ) {
      const connection = await amqp.connect(rabbitMqUrl);
      {
        let cleanupPrimary1: unknown;
        let cleanupPrimaryThrown1 = false;
        try {
          const channel = await connection.createConfirmChannel();
          await channel.assertExchange('rei.events', 'topic', { durable: true });
          channel.publish('rei.events', event.type, Buffer.from(JSON.stringify(event)), {
            persistent: true,
            contentType: 'application/json',
            messageId: event.eventId,
            type: event.type,
            headers,
          });
          await channel.waitForConfirms();
          await channel.close();
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
              await cleanupAll(async () => {
                await connection.close();
              });
            },
          );
        }
      }
    }
    async function proveInvalidTraceCarriers(connection: DatabaseConnection) {
      await purgeQueue(auditDeadLetterQueue);
      const malformed = await createTraceEvent(connection);
      const mismatched = await createTraceEvent(connection, {
        traceparent: requestTraceparent,
        tracestate: requestTracestate,
      });
      await publishConfirmedWithHeaders(malformed, { traceparent: 'secret malformed carrier' });
      await publishConfirmedWithHeaders(mismatched, {
        traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-00f067aa0ba902b7-01',
      });
      await waitFor('invalid trace carriers to be dead-lettered', async () => {
        const state = await queueState(auditDeadLetterQueue);
        return state.messages_ready === 2 && state.messages_unacknowledged === 0;
      });
      for (const event of [malformed, mismatched]) {
        const inboxRows = await connection.query<{ count: number }>(
          `SELECT count(*)::integer AS count
         FROM platform.inbox
        WHERE consumer_name = $1 AND event_id = $2`,
          [stableAuditQueue, event!.eventId],
        );
        const auditRows = await connection.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
          [event!.eventId],
        );
        expect(
          inboxRows[0]?.count === 0,
          'An invalid trace carrier reached the inbox boundary.',
        ).toBeTruthy();
        expect(
          auditRows[0]?.count === 0,
          'An invalid trace carrier invoked the audit handler.',
        ).toBeTruthy();
      }
      const messages = await peekQueue(auditDeadLetterQueue);
      expect(
        messages.length === 2,
        'Invalid trace carrier dead letters were not retained.',
      ).toBeTruthy();
      expect(
        messages.every(
          ({ properties }) =>
            properties?.headers?.['x-rei-dead-letter-reason'] === 'invalid-envelope',
        ),
        'Invalid trace carriers did not use the sanitized envelope path.',
      ).toBeTruthy();
      expect(
        !JSON.stringify(messages.map(({ properties }) => properties?.headers)).includes(
          'secret malformed carrier',
        ),
        'A malformed raw trace header reached the dead-letter carrier.',
      ).toBeTruthy();
      await purgeQueue(auditDeadLetterQueue);
    }
    async function createTraceEventWithCommittedAuditEffect(connection: DatabaseConnection) {
      const event = await createTraceEvent(connection);
      await connection.query(
        `INSERT INTO audit.event_log
       (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event!.eventId,
          event!.type,
          event!.version,
          event!.aggregateId,
          event!.occurredAt,
          event!.traceContext,
          event!.payload,
        ],
      );
      return event!;
    }
    async function publishLegacyConfirmed(event: EventEnvelope) {
      const connection = await amqp.connect(rabbitMqUrl);
      {
        let cleanupPrimary2: unknown;
        let cleanupPrimaryThrown2 = false;
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
                await connection.close();
              });
            },
          );
        }
      }
    }
    async function legacyBindingExists() {
      const response = await requestHttp(
        `${rabbitManagementUrl}/api/bindings/${encodeURIComponent(rabbitVhost)}/e/${encodeURIComponent('rei.events')}/q/${encodeURIComponent(legacyAuditQueue)}`,
        {
          headers: { authorization: managementAuthorization() },
          signal: AbortSignal.timeout(2000),
        },
      );
      expect(
        response.ok,
        `RabbitMQ binding inspection failed with HTTP ${response.status}.`,
      ).toBeTruthy();
      const bindings = (await response.json()) as Array<{ routing_key: string }>;
      return bindings.some(({ routing_key }) => routing_key === 'audit.trace.requested');
    }
    async function proveRequestRollback(connection: DatabaseConnection) {
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
        await service.execute(null);
      } catch (error) {
        expect(
          error instanceof Error && error.message === 'forced rollback',
          'Rollback cause changed.',
        ).toBeTruthy();
      }
      expect(eventId, 'Rollback proof did not allocate an event identifier.').toBeTruthy();
      const outboxRows = await connection.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM platform.outbox WHERE event_id = $1',
        [eventId],
      );
      const auditRows = await connection.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
        [eventId],
      );
      expect(outboxRows[0]?.count === 0, 'Rolled-back outbox event still exists.').toBeTruthy();
      expect(auditRows[0]?.count === 0, 'Rolled-back audit event exists.').toBeTruthy();
    }
    async function proveConsumerRollback(connection: DatabaseConnection) {
      const transactions = new PostgresTransactionRunner(connection);
      const identifiers = new PostgresUuidV7Generator(connection);
      const inbox = new PostgresInbox(connection);
      const audit = new PostgresAuditEventLog(connection);
      let event: AuditTraceRequested;
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
        expect(
          error instanceof Error && error.message === 'forced effect failure',
          'Consumer rollback cause changed.',
        ).toBeTruthy();
      }
      expect(event!, 'Consumer rollback proof did not create an event.').toBeTruthy();
      const inboxRows = await connection.query<{ count: number }>(
        `SELECT count(*)::integer AS count
       FROM platform.inbox
      WHERE consumer_name = $1 AND event_id = $2`,
        ['audit.event-log', event!.eventId],
      );
      const auditRows = await connection.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
        [event!.eventId],
      );
      expect(
        inboxRows[0]?.count === 0,
        'Failed consumer transaction recorded its inbox key.',
      ).toBeTruthy();
      expect(
        auditRows[0]?.count === 0,
        'Failed consumer transaction recorded its audit effect.',
      ).toBeTruthy();
    }
    async function proveDuplicateSuppression(
      connection: DatabaseConnection,
      delivered: Awaited<ReturnType<typeof waitForDeliveredEvent>>,
    ) {
      const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5000 });
      {
        let cleanupPrimary3: unknown;
        let cleanupPrimaryThrown3 = false;
        try {
          const duplicate = new AuditTraceRequested({
            eventId: delivered.outbox.event_id,
            aggregateId: delivered.outbox.aggregate_id,
            occurredAt: delivered.outbox.occurred_at.toISOString(),
          });
          await publisher.publish(duplicate, AbortSignal.timeout(5000));
          await waitForQueueIdle();
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
              await cleanupAll(async () => {
                await publisher.close();
              });
            },
          );
        }
      }
      const inboxRows = await connection.query<{ count: number }>(
        `SELECT count(*)::integer AS count
       FROM platform.inbox
      WHERE consumer_name = $1 AND event_id = $2`,
        ['audit.event-log', delivered.outbox.event_id],
      );
      const auditRows = await connection.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
        [delivered.outbox.event_id],
      );
      expect(
        inboxRows[0]?.count === 1,
        'Duplicate delivery created more than one inbox key.',
      ).toBeTruthy();
      expect(
        auditRows[0]?.count === 1,
        'Duplicate delivery repeated the audit effect.',
      ).toBeTruthy();
    }
    async function proveBrokerRestartRecovery(connection: DatabaseConnection) {
      const { stdout: workerBefore } = await execute('docker', composeArgs('ps', '-q', 'worker'));
      expect(
        workerBefore.trim(),
        'Worker container was not running before the broker restart.',
      ).toBeTruthy();
      const outbox = new PostgresOutbox(connection);
      const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5000 });
      let workerPaused = false;
      {
        let cleanupPrimary4: unknown;
        let cleanupPrimaryThrown4 = false;
        try {
          await execute('docker', composeArgs('pause', 'worker'), { timeout: 30000 });
          workerPaused = true;
          const durableEvent = await appendSingleEvent(connection);
          const durableClaim = (await outbox.claimPending(1, 10000))[0];
          expect(
            durableClaim?.eventId === durableEvent!.eventId,
            'Durable restart event was not claimed.',
          ).toBeTruthy();
          await publisher.publish(durableClaim!, AbortSignal.timeout(5000));
          await outbox.markPublished(durableClaim!.eventId, durableClaim!.claimId);
          await publisher.close();
          await execute('docker', composeArgs('restart', 'rabbitmq'), { timeout: 60000 });
          await waitFor('RabbitMQ to become healthy after restart', async () => {
            try {
              await execute(
                'docker',
                composeArgs('exec', '-T', 'rabbitmq', 'rabbitmq-diagnostics', '-q', 'ping'),
                { timeout: 5000 },
              );
              return true;
            } catch {
              return false;
            }
          });
          await execute('docker', composeArgs('unpause', 'worker'), { timeout: 30000 });
          workerPaused = false;
          const { stdout: workerAfter } = await execute(
            'docker',
            composeArgs('ps', '-q', 'worker'),
          );
          expect(
            workerAfter.trim() === workerBefore.trim(),
            'Worker restarted with RabbitMQ.',
          ).toBeTruthy();
          await waitForDeliveredEvent(connection, durableEvent!.eventId);
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
                  await publisher.close();
                },
                async () => {
                  if (workerPaused) {
                    await execute('docker', composeArgs('unpause', 'worker'), {
                      timeout: 30000,
                    });
                  }
                },
              );
            },
          );
        }
      }
      const postRestartEventId = await postTrace();
      await waitForDeliveredEvent(connection, postRestartEventId);
    }
    async function startRabbitMq() {
      await execute('docker', composeArgs('start', 'rabbitmq'), { timeout: 45000 });
      await waitFor('RabbitMQ to become healthy', async () => {
        try {
          await execute(
            'docker',
            composeArgs('exec', '-T', 'rabbitmq', 'rabbitmq-diagnostics', '-q', 'ping'),
            { timeout: 5000 },
          );
          return true;
        } catch {
          return false;
        }
      });
    }
    async function proveBrokerOutageLeavesOutboxRecoverable(connection: DatabaseConnection) {
      let rabbitStopped = false;
      let workerStopped = false;
      let event: AuditTraceRequested;
      {
        let cleanupPrimary5: unknown;
        let cleanupPrimaryThrown5 = false;
        try {
          await execute('docker', composeArgs('stop', '--timeout', '30', 'rabbitmq'), {
            timeout: 45000,
          });
          rabbitStopped = true;
          event = await appendSingleEvent(connection);
          const claimed = await waitFor(
            'the outage event to be claimed by the relay',
            async () => {
              const rows = await connection.query<{ published_at: Date; claim_id: string }>(
                `SELECT published_at, claim_id::text
             FROM platform.outbox
            WHERE event_id = $1`,
                [event.eventId],
              );
              return rows[0]?.claim_id ? rows[0] : undefined;
            },
            60000,
            5,
          );
          expect(
            claimed.published_at === null,
            'Broker outage published the claimed outbox row.',
          ).toBeTruthy();
          await stopWorker();
          workerStopped = true;
          const rows = await waitFor(
            'the outage claim to be released during shutdown',
            async () => {
              const released = await connection.query<{ published_at: Date; claim_id: string }>(
                `SELECT published_at, claim_id::text
           FROM platform.outbox
          WHERE event_id = $1`,
                [event.eventId],
              );
              return released[0]?.claim_id === null ? released : undefined;
            },
          );
          expect(
            rows[0]?.published_at === null,
            'Broker outage falsely marked the outbox row published.',
          ).toBeTruthy();
          expect(
            rows[0]?.claim_id === null,
            'Broker outage left an unrecoverable outbox claim.',
          ).toBeTruthy();
          await startRabbitMq();
          rabbitStopped = false;
          await startWorker();
          workerStopped = false;
          expect(event, 'Broker outage fixture was not created.').toBeTruthy();
          const delivered = await waitForDeliveredEvent(connection, event!.eventId);
          expect(
            delivered.outbox.event_id === event!.eventId,
            'Recovered publication changed its event id.',
          ).toBeTruthy();
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
              await cleanupAll(
                async () => {
                  if (rabbitStopped) await startRabbitMq();
                },
                async () => {
                  if (workerStopped) await startWorker();
                },
              );
            },
          );
        }
      }
    }
    async function appendOrderedEvents(connection: DatabaseConnection) {
      const transactions = new PostgresTransactionRunner(connection);
      const identifiers = new PostgresUuidV7Generator(connection);
      const outbox = new PostgresOutbox(connection);
      let sequence:
        | {
            aggregateA: AuditTraceRequested['aggregateId'];
            aggregateB: AuditTraceRequested['aggregateId'];
            events: AuditTraceRequested[];
          }
        | undefined;
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
      return sequence!;
    }
    async function proveAggregateOrder(connection: DatabaseConnection) {
      const sequence = await appendOrderedEvents(connection);
      expect(sequence, 'Ordered event fixture was not created.').toBeTruthy();
      for (const event of sequence!.events) {
        await waitForDeliveredEvent(connection, event.eventId);
      }
      for (const aggregateId of [sequence!.aggregateA, sequence!.aggregateB]) {
        const expected = sequence!.events
          .filter((event) => event.aggregateId === aggregateId)
          .map((event) => event.eventId);
        const rows = await connection.query<{ event_id: string }>(
          `SELECT event_id::text
         FROM audit.event_log
        WHERE aggregate_id = $1
        ORDER BY appended_at, event_id`,
          [aggregateId],
        );
        expect(
          JSON.stringify(rows.map(({ event_id }) => event_id)) === JSON.stringify(expected),
          'Audit observations did not preserve relay order within an aggregate.',
        ).toBeTruthy();
      }
    }
    async function stopWorker() {
      await execute('docker', composeArgs('stop', '--timeout', '30', 'worker'), {
        timeout: 45000,
      });
    }
    async function startWorker() {
      await execute('docker', composeArgs('start', 'worker'), { timeout: 45000 });
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
    async function proveLegacyQueueUpgrade(connection: DatabaseConnection) {
      let workerStopped = false;
      {
        let cleanupPrimary7: unknown;
        let cleanupPrimaryThrown7 = false;
        try {
          await stopWorker();
          workerStopped = true;
          await removeQueue(stableAuditQueue);
          expect(
            !(await queueExists(stableAuditQueue)),
            'The stable audit queue still exists.',
          ).toBeTruthy();
          const backlogEvent = await createTraceEvent(connection);
          const committedEffectEvent = await createTraceEventWithCommittedAuditEffect(connection);
          await publishLegacyConfirmed(backlogEvent);
          await publishLegacyConfirmed(committedEffectEvent);
          await waitFor('the confirmed baseline queue backlog', async () => {
            const state = await queueState(legacyAuditQueue);
            return state.messages_ready === 2;
          });
          expect(
            !(await queueExists(stableAuditQueue)),
            'Seeding the baseline broker state recreated the stable audit queue.',
          ).toBeTruthy();
          const preUpgradeInbox = await connection.query<{ count: number }>(
            `SELECT count(*)::integer AS count
         FROM platform.inbox
        WHERE consumer_name = $1 AND event_id = $2`,
            [stableAuditQueue, committedEffectEvent!.eventId],
          );
          const preUpgradeAudit = await connection.query<{ count: number }>(
            'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
            [committedEffectEvent!.eventId],
          );
          expect(
            preUpgradeInbox[0]?.count === 0 && preUpgradeAudit[0]?.count === 1,
            'The commit-before-ack upgrade fixture was not isolated correctly.',
          ).toBeTruthy();
          await startWorker();
          workerStopped = false;
          await waitForAuditEvent(connection, backlogEvent!.eventId);
          await waitFor('the pre-upgrade effect delivery to record its inbox key', async () => {
            const rows = await connection.query<{ count: number }>(
              `SELECT count(*)::integer AS count
           FROM platform.inbox
          WHERE consumer_name = $1 AND event_id = $2`,
              [stableAuditQueue, committedEffectEvent!.eventId],
            );
            return rows[0]?.count === 1;
          });
          await waitFor('the baseline queue to drain', async () => {
            const state = await queueState(legacyAuditQueue);
            return state.messages_ready === 0 && state.messages_unacknowledged === 0;
          });
          expect(
            !(await legacyBindingExists()),
            'The baseline tracer binding remained active.',
          ).toBeTruthy();
          const futureEvent = await createTraceEvent(connection);
          const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5000 });
          {
            let cleanupPrimary6: unknown;
            let cleanupPrimaryThrown6 = false;
            try {
              await publisher.publish(futureEvent, AbortSignal.timeout(5000));
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
                    await publisher.close();
                  });
                },
              );
            }
          }
          await waitForAuditEvent(connection, futureEvent!.eventId);
          const legacyState = await queueState(legacyAuditQueue);
          expect(
            legacyState.messages_ready === 0 && legacyState.messages_unacknowledged === 0,
            'A post-upgrade event accumulated in the baseline queue.',
          ).toBeTruthy();
          for (const event of [backlogEvent, committedEffectEvent, futureEvent]) {
            const inboxRows = await connection.query<{ count: number }>(
              `SELECT count(*)::integer AS count
           FROM platform.inbox
          WHERE consumer_name = $1 AND event_id = $2`,
              [stableAuditQueue, event!.eventId],
            );
            const auditRows = await connection.query<{ count: number }>(
              'SELECT count(*)::integer AS count FROM audit.event_log WHERE event_id = $1',
              [event!.eventId],
            );
            expect(
              inboxRows[0]?.count === 1,
              'Legacy migration duplicated the inbox boundary.',
            ).toBeTruthy();
            expect(
              auditRows[0]?.count === 1,
              'Legacy migration duplicated the audit effect.',
            ).toBeTruthy();
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
              await cleanupAll(async () => {
                if (workerStopped) await startWorker();
              });
            },
          );
        }
      }
    }
    function ownedClaims(claimsByRelay: Array<readonly OutboxRow[]>) {
      return claimsByRelay.flatMap((claims, relayIndex) =>
        claims.map((event) => ({ event, relayIndex })),
      );
    }
    function assertClaimedExactly(
      claims: Array<{ event: OutboxRow; relayIndex: number }>,
      expectedEventIds: string[],
      description: string,
    ) {
      const actual = claims.map(({ event }) => event.eventId).sort();
      const expected = [...expectedEventIds].sort();
      expect(
        JSON.stringify(actual) === JSON.stringify(expected),
        `${description} did not claim the expected aggregate heads.`,
      ).toBeTruthy();
      expect(
        new Set(claims.map(({ event }) => event.claimId)).size === claims.length,
        `${description} reused a claim owner.`,
      ).toBeTruthy();
    }
    async function appendSingleEvent(connection: DatabaseConnection) {
      const transactions = new PostgresTransactionRunner(connection);
      const identifiers = new PostgresUuidV7Generator(connection);
      const outbox = new PostgresOutbox(connection);
      let event: AuditTraceRequested;
      await transactions.runInTransaction(async (transaction) => {
        event = new AuditTraceRequested({
          eventId: await identifiers.generate(transaction),
          aggregateId: await identifiers.generate(transaction),
          occurredAt: new Date().toISOString(),
        });
        await outbox.append(transaction, [event]);
      });
      expect(event!, 'Expired-claim fixture was not created.').toBeTruthy();
      return event!;
    }
    async function proveConcurrentRelayClaims(connection: DatabaseConnection) {
      const relays = [new PostgresOutbox(connection), new PostgresOutbox(connection)];
      const publishers = relays.map(
        () => new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5000 }),
      );
      let workerStopped = false;
      let eventsToObserve;
      {
        let cleanupPrimary8: unknown;
        let cleanupPrimaryThrown8 = false;
        try {
          await stopWorker();
          workerStopped = true;
          const sequence = await appendOrderedEvents(connection);
          expect(sequence, 'Concurrent relay fixture was not created.').toBeTruthy();
          const [aggregateAHead, aggregateBHead, aggregateATail, aggregateBTail] = sequence!.events;
          const initialClaims = ownedClaims(
            await Promise.all(relays.map((relay) => relay.claimPending(1, 5000))),
          );
          assertClaimedExactly(
            initialClaims,
            [aggregateAHead!.eventId, aggregateBHead!.eventId],
            'Initial concurrent relay round',
          );
          expect(
            new Set(initialClaims.map(({ event }) => event.aggregateId)).size === 2,
            'Concurrent relays leased two rows for one aggregate.',
          ).toBeTruthy();
          const failedHead = initialClaims.find(
            ({ event }) => event.eventId === aggregateAHead!.eventId,
          );
          const progressingHead = initialClaims.find(
            ({ event }) => event.eventId === aggregateBHead!.eventId,
          );
          expect(
            failedHead && progressingHead,
            'Concurrent relay ownership could not be identified.',
          ).toBeTruthy();
          const aborted = AbortSignal.abort(new Error('forced relay abort'));
          let abortObserved = false;
          try {
            await publishers![failedHead!.relayIndex]!.publish(failedHead!.event, aborted);
          } catch (error) {
            abortObserved = isExternalFailure(error) && error.kind === 'cancelled';
          }
          expect(abortObserved, 'Aborted relay publication unexpectedly succeeded.').toBeTruthy();
          await relays![failedHead!.relayIndex]!.releaseClaim(
            failedHead!.event.eventId,
            failedHead!.event.claimId,
          );
          await publishers![progressingHead!.relayIndex]!.publish(
            progressingHead!.event,
            AbortSignal.timeout(5000),
          );
          await relays![progressingHead!.relayIndex]!.markPublished(
            progressingHead!.event.eventId,
            progressingHead!.event.claimId,
          );
          const secondClaims = ownedClaims(
            await Promise.all(relays.map((relay) => relay.claimPending(1, 5000))),
          );
          assertClaimedExactly(
            secondClaims,
            [aggregateAHead!.eventId, aggregateBTail!.eventId],
            'Second concurrent relay round',
          );
          expect(
            secondClaims.every(({ event }) => event.eventId !== aggregateATail!.eventId),
            'A later same-aggregate event bypassed its unpublished head.',
          ).toBeTruthy();
          await Promise.all(
            secondClaims.map(async ({ event, relayIndex }) => {
              await publishers![relayIndex]!.publish(event, AbortSignal.timeout(5000));
              await relays![relayIndex]!.markPublished(event.eventId, event.claimId);
            }),
          );
          const finalClaims = await relays![0]!.claimPending(1, 5000);
          expect(
            finalClaims.length === 1 && finalClaims[0]?.eventId === aggregateATail!.eventId,
            'The later same-aggregate event did not become eligible after its head was published.',
          ).toBeTruthy();
          const aggregateATailClaim = finalClaims[0];
          await publishers![0]!.publish(aggregateATailClaim!, AbortSignal.timeout(5000));
          await relays![0]!.markPublished(
            aggregateATailClaim!.eventId,
            aggregateATailClaim!.claimId,
          );
          const expiringEvent = await appendSingleEvent(connection);
          const expiringClaim = (await relays![0]!.claimPending(1, 100))[0];
          expect(
            expiringClaim?.eventId === expiringEvent!.eventId,
            'Expiring relay claim was not acquired.',
          ).toBeTruthy();
          const recoveredClaim = await waitFor(
            'an expired relay claim to become eligible',
            async () => {
              const claim = (await relays![1]!.claimPending(1, 5000))[0];
              return claim?.eventId === expiringEvent!.eventId ? claim : undefined;
            },
          );
          expect(
            recoveredClaim.claimId !== expiringClaim!.claimId,
            'Expired relay claim retained its previous owner.',
          ).toBeTruthy();
          await publishers![1]!.publish(recoveredClaim, AbortSignal.timeout(5000));
          await relays![1]!.markPublished(recoveredClaim.eventId, recoveredClaim.claimId);
          eventsToObserve = [...sequence!.events, expiringEvent];
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
                  await cleanupAll(...publishers.map((publisher) => () => publisher.close()));
                },
                async () => {
                  if (workerStopped) await startWorker();
                },
              );
            },
          );
        }
      }
      expect(
        eventsToObserve,
        'Concurrent relay proof did not retain its event fixture.',
      ).toBeTruthy();
      for (const event of eventsToObserve) {
        await waitForDeliveredEvent(connection, event.eventId);
      }
    }
    async function provePoisonDeadLetter(connection: DatabaseConnection) {
      const event = await createTraceEvent(connection);
      const { id: conflictingAggregate } = (
        await connection.query<{ id: string }>('SELECT uuidv7()::text AS id')
      )[0]!;
      await connection.query(
        `INSERT INTO audit.event_log
       (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          event!.eventId,
          event!.type,
          event!.version,
          conflictingAggregate,
          event!.occurredAt,
          null,
          {},
        ],
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
      const publisher = new RabbitMqEventBroker({ url: rabbitMqUrl, operationTimeoutMs: 5000 });
      {
        let cleanupPrimary9: unknown;
        let cleanupPrimaryThrown9 = false;
        try {
          await publisher.publish(event, AbortSignal.timeout(5000));
          await waitFor('the poison event to reach dead-letter', async () => {
            const state = await queueState(auditDeadLetterQueue);
            return state.messages_ready === 1 && state.messages_unacknowledged === 0;
          });
          const deadLetterState = await queueState(auditDeadLetterQueue);
          expect(
            deadLetterState.type === 'classic',
            'Poison dead-letter queue was not classic.',
          ).toBeTruthy();
          await waitForQueueIdle();
          const messages = await waitFor('the poison dead letter to be readable', async () => {
            const available = await peekQueue(auditDeadLetterQueue);
            return available.length === 1 ? available : undefined;
          });
          expect(
            messages[0]?.properties?.headers?.['x-rei-delivery-attempt'] === 5,
            'Poison delivery did not preserve the fifth normal attempt.',
          ).toBeTruthy();
          const inbox = await connection.query<{ count: number }>(
            `SELECT count(*)::integer AS count FROM platform.inbox
        WHERE consumer_name = $1 AND event_id = $2`,
            [stableAuditQueue, event!.eventId],
          );
          const audit = await connection.query<{ aggregate_id: string }>(
            'SELECT aggregate_id::text FROM audit.event_log WHERE event_id = $1',
            [event!.eventId],
          );
          expect(inbox[0]?.count === 0, 'Poison delivery committed an inbox marker.').toBeTruthy();
          expect(
            audit[0]?.aggregate_id === conflictingAggregate,
            'Poison delivery altered the audit effect.',
          ).toBeTruthy();
          const attempts = await connection.query<{
            count: number;
            is_called: boolean;
          }>(`SELECT last_value::integer AS count, is_called
         FROM audit.integration_poison_attempt`);
          expect(
            attempts[0]?.is_called === true && attempts[0]?.count === 5,
            'Poison delivery did not invoke the audit effect exactly five times.',
          ).toBeTruthy();
        } catch (error) {
          cleanupPrimary9 = error;
          cleanupPrimaryThrown9 = true;
          throw error;
        } finally {
          await preserveCleanup(
            async () => {
              if (cleanupPrimaryThrown9) throw cleanupPrimary9;
            },
            async () => {
              await cleanupAll(
                async () => {
                  await publisher.close();
                },
                async () => {
                  await purgeQueue(auditDeadLetterQueue);
                },
                async () => {
                  await connection.query(
                    'DROP FUNCTION IF EXISTS audit.count_integration_poison_attempt() CASCADE',
                  );
                },
                async () => {
                  await connection.query(
                    'DROP SEQUENCE IF EXISTS audit.integration_poison_attempt',
                  );
                },
              );
            },
          );
        }
      }
    }
    async function proveAdapterRetrySurvivesRestart(connection: DatabaseConnection) {
      const queue = 'integration.retry-probe';
      const deadLetterQueue = `${queue}.dead-letter`;
      await removeQueue(queue);
      await removeQueue(deadLetterQueue);
      const trace = await createTraceEvent(connection);
      const event = { ...trace, type: 'integration.retry.probe' };
      let releaseInFlight!: () => void;
      let calls = 0;
      const first = new RabbitMqEventBroker({
        url: rabbitMqUrl,
        operationTimeoutMs: 250,
        deliveryLimit: 5,
        redeliveryDelayMs: 100,
      });
      {
        let cleanupPrimary11: unknown;
        let cleanupPrimaryThrown11 = false;
        try {
          await first.subscribe({ consumerName: queue, eventTypes: [event.type] }, async () => {
            calls += 1;
            if (calls === 1) throw new Error('normal retry transfer');
            await new Promise<void>((resolve) => (releaseInFlight = resolve));
          });
          await first.start();
          await first.publish(event, AbortSignal.timeout(5000));
          await waitFor('the adapter-produced retry to become in flight', async () => calls >= 2);
          await first.close();
          releaseInFlight?.();
          const resumed = new RabbitMqEventBroker({
            url: rabbitMqUrl,
            operationTimeoutMs: 5000,
            deliveryLimit: 5,
            redeliveryDelayMs: 100,
          });
          let resumedCalls = 0;
          {
            let cleanupPrimary10: unknown;
            let cleanupPrimaryThrown10 = false;
            try {
              await resumed.subscribe(
                { consumerName: queue, eventTypes: [event.type] },
                async () => {
                  resumedCalls += 1;
                  throw new Error('continue retry chain');
                },
              );
              await resumed.start();
              await waitFor('the restarted retry chain to dead-letter', async () => {
                const state = await queueState(deadLetterQueue);
                return state.messages_ready === 1 && state.messages_unacknowledged === 0;
              });
              const messages = await waitFor(
                'the restarted dead letter to be readable',
                async () => {
                  const available = await peekQueue(deadLetterQueue);
                  return available.length === 1 ? available : undefined;
                },
              );
              expect(
                messages[0]?.properties?.headers?.['x-rei-delivery-attempt'] === 5,
                'Restarted delivery lost its adapter-produced attempt count.',
              ).toBeTruthy();
              expect(
                resumedCalls === 4,
                'Restarted delivery did not resume from attempt two.',
              ).toBeTruthy();
            } catch (error) {
              cleanupPrimary10 = error;
              cleanupPrimaryThrown10 = true;
              throw error;
            } finally {
              await preserveCleanup(
                async () => {
                  if (cleanupPrimaryThrown10) throw cleanupPrimary10;
                },
                async () => {
                  await cleanupAll(async () => {
                    await resumed.close();
                  });
                },
              );
            }
          }
        } catch (error) {
          cleanupPrimary11 = error;
          cleanupPrimaryThrown11 = true;
          throw error;
        } finally {
          await preserveCleanup(
            async () => {
              if (cleanupPrimaryThrown11) throw cleanupPrimary11;
            },
            async () => {
              await cleanupAll(
                async () => {
                  releaseInFlight?.();
                },
                async () => {
                  await first.close();
                },
                async () => {
                  await removeQueue(queue);
                },
                async () => {
                  await removeQueue(deadLetterQueue);
                },
              );
            },
          );
        }
      }
    }
    async function proveActivePruningCancellation(connection: DatabaseConnection) {
      const marker = `rei-retention-cancel-${Date.now()}`;
      const controller = new AbortController();
      const active = connection.queryAbortable(
        `SELECT pg_sleep(30) /* ${marker} */`,
        [],
        controller.signal,
      );
      const backends = await waitFor('the live retention backend', async () => {
        const rows = await connection.query<{ pid: string }>(
          `SELECT pid FROM pg_stat_activity
        WHERE query LIKE $1 AND pid <> pg_backend_pid()`,
          [`%${marker}%`],
        );
        return rows.length > 0 ? rows : undefined;
      });
      const { pid } = backends[0]!;
      controller.abort(new Error('integration shutdown'));
      await active.then(
        () => {
          throw new Error('Cancelled maintenance query unexpectedly completed.');
        },
        (error: { message: string }) =>
          expect(
            error instanceof Error && error.message === 'integration shutdown',
            'Abort reason changed.',
          ).toBeTruthy(),
      );
      await waitFor('the cancelled retention backend to disappear', async () => {
        const rows = await connection.query('SELECT 1 FROM pg_stat_activity WHERE pid = $1', [pid]);
        return rows.length === 0;
      });
      const rows = await connection.query<{ value: number }>('SELECT 1 AS value');
      expect(
        rows[0]?.value === 1,
        'The pool was unusable after active-query cancellation.',
      ).toBeTruthy();
    }
    async function proveBoundedRetention(connection: DatabaseConnection) {
      const rows = await connection.query<{ id: string }>(
        `SELECT uuidv7()::text AS id FROM generate_series(1, 7)`,
      );
      const ids = rows.map(({ id }) => id);
      {
        let cleanupPrimary12: unknown;
        let cleanupPrimaryThrown12 = false;
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
          ] as const) {
            await connection.query(
              `INSERT INTO platform.inbox (consumer_name, event_id, received_at)
         VALUES ('integration.retention', $1, clock_timestamp() - ($2 * interval '1 day'))`,
              [eventId, age],
            );
          }
          const outbox = new PostgresOutbox(connection);
          const inbox = new PostgresInbox(connection);
          expect(
            (await outbox.prunePublished(7 * 86400000, 1, AbortSignal.timeout(5000))) === 1,
            'Outbox pruning did not honor batch one.',
          ).toBeTruthy();
          expect(
            (await inbox.pruneConsumed(30 * 86400000, 1, AbortSignal.timeout(5000))) === 1,
            'Inbox pruning did not honor batch one.',
          ).toBeTruthy();
          const survivingOutbox = await connection.query<{ id: string }>(
            'SELECT event_id::text AS id FROM platform.outbox WHERE event_id = ANY($1::uuid[])',
            [ids],
          );
          expect(
            !survivingOutbox.some(({ id }) => id === ids[0]),
            'Oldest published outbox row survived.',
          ).toBeTruthy();
          expect(
            survivingOutbox.some(({ id }) => id === ids[1]),
            'Pruning exceeded its outbox batch.',
          ).toBeTruthy();
          expect(
            survivingOutbox.some(({ id }) => id === ids[2]),
            'Fresh outbox row was pruned.',
          ).toBeTruthy();
          const protectedInbox = await connection.query<{ id: string }>(
            `SELECT event_id::text AS id FROM platform.inbox
        WHERE consumer_name = 'integration.retention' AND event_id = $1`,
            [ids[3]],
          );
          expect(
            protectedInbox.length === 1,
            'Unpublished outbox event did not protect its inbox marker.',
          ).toBeTruthy();
          const survivingInbox = await connection.query<{ id: string }>(
            `SELECT event_id::text AS id FROM platform.inbox
        WHERE consumer_name = 'integration.retention' AND event_id = ANY($1::uuid[])`,
            [[ids[4], ids[5], ids[6]]],
          );
          expect(
            !survivingInbox.some(({ id }) => id === ids[4]),
            'Oldest eligible inbox marker survived.',
          ).toBeTruthy();
          expect(
            survivingInbox.some(({ id }) => id === ids[6]),
            'Pruning exceeded its inbox batch.',
          ).toBeTruthy();
          expect(
            survivingInbox.some(({ id }) => id === ids[5]),
            'Fresh inbox marker was pruned.',
          ).toBeTruthy();
        } catch (error) {
          cleanupPrimary12 = error;
          cleanupPrimaryThrown12 = true;
          throw error;
        } finally {
          await preserveCleanup(
            async () => {
              if (cleanupPrimaryThrown12) throw cleanupPrimary12;
            },
            async () => {
              await cleanupAll(
                async () => {
                  await connection.query(
                    "DELETE FROM platform.inbox WHERE consumer_name = 'integration.retention'",
                  );
                },
                async () => {
                  await connection.query(
                    'DELETE FROM platform.outbox WHERE event_id = ANY($1::uuid[])',
                    [ids],
                  );
                },
              );
            },
          );
        }
      }
    }
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
        'api',
      ),
    );
    const connection = new DatabaseConnection(databaseUrl);
    {
      let cleanupPrimary13: unknown;
      let cleanupPrimaryThrown13 = false;
      try {
        const initialEventId = await postTrace();
        const delivered = await waitForDeliveredEvent(connection, initialEventId);
        expect(
          delivered.outbox.event_type === 'audit.trace.requested',
          'Unexpected outbox event type.',
        ).toBeTruthy();
        expect(
          delivered.audit.event_id === delivered.outbox.event_id,
          'Audit event ID differs.',
        ).toBeTruthy();
        expect(
          delivered.audit.aggregate_id === delivered.outbox.aggregate_id,
          'Audit aggregate differs.',
        ).toBeTruthy();
        expect(
          delivered.audit.occurred_at.getTime() === delivered.outbox.occurred_at.getTime(),
          'Audit occurrence time differs.',
        ).toBeTruthy();
        expect(
          delivered.outbox.trace_context !== null,
          'The request trace context was not stored.',
        ).toBeTruthy();
        expect(
          JSON.stringify(delivered.audit.trace_context) ===
            JSON.stringify(delivered.outbox.trace_context),
          'The audit effect changed the durable trace context.',
        ).toBeTruthy();
        expect(
          delivered!.outbox.trace_context!.traceparent.startsWith(`00-${requestTraceId}-`) &&
            delivered!.outbox.trace_context!.traceparent.endsWith('-01'),
          'The request trace identity or sampling flag changed.',
        ).toBeTruthy();
        expect(
          delivered!.outbox.trace_context!.tracestate === requestTracestate,
          'The request tracestate changed.',
        ).toBeTruthy();
        expect(
          JSON.stringify(delivered.outbox.payload) === '{}' &&
            JSON.stringify(delivered.audit.payload) === '{}',
          'Tracer payload changed during delivery.',
        ).toBeTruthy();
        await proveRequestRollback(connection);
        await proveConsumerRollback(connection);
        await proveDuplicateSuppression(connection, delivered);
        await proveInvalidTraceCarriers(connection);
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
      } catch (error) {
        cleanupPrimary13 = error;
        cleanupPrimaryThrown13 = true;
        throw error;
      } finally {
        await preserveCleanup(
          async () => {
            if (cleanupPrimaryThrown13) throw cleanupPrimary13;
          },
          async () => {
            await cleanupAll(async () => {
              await connection.close();
            });
          },
        );
      }
    }
  });
});
