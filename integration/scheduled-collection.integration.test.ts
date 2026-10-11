import { expect, test, vi } from 'vitest';
import {
  DatabaseConnection,
  PostgresCollectionScheduleRepository,
  PostgresTransactionRunner,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
test('scheduled-collection preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const exec = command;
    const projectName = `rei-scheduled-${process.pid}`;
    const sourceId = 'synthetic-portal-aurora';
    const expectedIdentities = ['AUR-BV-001', 'AUR-PN-001', 'AUR-SN-001'];
    const [postgresPort, rabbitPort, rabbitManagementPort, minioPort, minioConsolePort] =
      await allocatePorts(5);
    const fixture = {
      database: 'rei_scheduled_fixture',
      user: 'rei_scheduled_fixture',
      postgresPassword: 'rei-scheduled-postgres-fixture',
      rabbitPassword: 'rei-scheduled-rabbit-fixture',
      rabbitVhost: 'rei-scheduled-fixture',
      minioPassword: 'rei-scheduled-minio-fixture',
    };
    const environment = {
      ...process.env,
      COMPOSE_FILE: 'compose.yaml',
      COMPOSE_PROJECT_NAME: projectName,
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
      OBJECT_STORE_BUCKET: 'rei-scheduled-fixture',
      WORKER_OPERATION_TIMEOUT_MS: '5000',
      WORKER_INTERVAL_MS: '30000',
      OUTBOX_RELAY_INTERVAL_MS: '250',
      OUTBOX_RELAY_BATCH_SIZE: '25',
      OUTBOX_CLAIM_LEASE_MS: '130000',
      RABBITMQ_RECONNECT_INTERVAL_MS: '250',
      SHUTDOWN_TIMEOUT_MS: '15000',
      EVENT_DELIVERY_LIMIT: '5',
      EVENT_REDELIVERY_DELAY_MS: '250',
      EVENT_HANDLER_TIMEOUT_MS: '30000',
      BROKER_DRAIN_TIMEOUT_MS: '5000',
      COLLECTION_SCHEDULE_INTERVAL_MS: '250',
      COLLECTION_SCHEDULE_BATCH_SIZE: '10',
      COLLECTION_CONCURRENCY: '2',
      COLLECTION_RUN_TIMEOUT_MS: '25000',
      SYNTHETIC_PAGE_DELAY_MS: '0',
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
    function compose(...args: string[]) {
      return ['compose', '--project-name', projectName, ...args];
    }
    async function execute(
      file: string,
      args: string[],
      options: import('./support/fixture.ts').CommandOptions & {
        environment?: Record<string, string | undefined>;
      } = {},
    ) {
      return exec(file, args, {
        cwd: new URL('..', import.meta.url),
        env: { ...environment, ...options.environment },
        timeout: options.timeout ?? 120000,
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    async function waitFor<T>(description: string, probe: () => Promise<T> | T, timeoutMs = 90000) {
      let result: T | undefined;
      await vi.waitFor(
        async () => {
          result = await probe();
          expect(result, description).toBeTruthy();
        },
        { timeout: timeoutMs, interval: 200 },
      );
      return result as NonNullable<T>;
    }
    async function armSchedule(connection: DatabaseConnection) {
      await connection.query(
        `UPDATE collection.collection_schedule
        SET enabled = true,
            next_run_at = clock_timestamp() - interval '1 second',
            in_flight_operation_key = NULL,
            in_flight_scheduled_for = NULL,
            updated_at = clock_timestamp()
      WHERE source_id = $1`,
        [sourceId],
      );
    }
    async function proveConcurrentScheduleClaim(connection: DatabaseConnection) {
      const contenderConnection = new DatabaseConnection(databaseUrl.toString());
      {
        let cleanupPrimary1: unknown;
        let cleanupPrimaryThrown1 = false;
        try {
          await armSchedule(connection);
          const now = new Date().toISOString();
          const ownerRepository = new PostgresCollectionScheduleRepository(connection);
          const contenderRepository = new PostgresCollectionScheduleRepository(contenderConnection);
          const ownerTransactions = new PostgresTransactionRunner(connection);
          const contenderTransactions = new PostgresTransactionRunner(contenderConnection);
          const claims = await Promise.all([
            ownerTransactions.runInTransaction((transaction) =>
              ownerRepository.claimDue(transaction, now, 1),
            ),
            contenderTransactions.runInTransaction((transaction) =>
              contenderRepository.claimDue(transaction, now, 1),
            ),
          ]);
          expect(
            claims[0].length + claims[1].length === 1,
            'Concurrent schedule pollers did not claim exactly one logical due slot.',
          ).toBeTruthy();
          expect(
            [...claims[0], ...claims[1]][0]?.sourceId === sourceId,
            'Concurrent schedule claim returned the wrong source.',
          ).toBeTruthy();
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
                await contenderConnection.close();
              });
            },
          );
        }
      }
    }
    async function requestedOperation(
      connection: DatabaseConnection,
      previousKey: string | null = null,
    ) {
      const rows = await connection.query<{ operation_key: string }>(
        `SELECT payload->>'operationKey' AS operation_key
       FROM platform.outbox
      WHERE event_type = 'collection.run.requested'
        AND payload->>'sourceId' = $1
        AND ($2::text IS NULL OR payload->>'operationKey' <> $2)
      ORDER BY occurred_at DESC, event_id DESC
      LIMIT 1`,
        [sourceId, previousKey],
      );
      return rows[0]?.operation_key ?? null;
    }
    async function operationSnapshot(connection: DatabaseConnection, operationKey: string) {
      const runs = await connection.query<{
        run_id: string;
        status: string;
        checkpoint_ordinal: number;
        observed_count: number;
        parsed_count: number;
        changed_count: number;
        suppressed_count: number;
        failed_count: number;
        completed_event_id: string;
      }>(
        `SELECT run_id::text, status, checkpoint_ordinal, observed_count, parsed_count,
            changed_count, suppressed_count, failed_count, completed_event_id::text
       FROM collection.collection_run
      WHERE operation_key = $1`,
        [operationKey],
      );
      if (!runs[0]) return null;
      const run = runs[0];
      const [observations, events, requests, schedule, consumed] = await Promise.all([
        connection.query<{
          source_listing_id: string;
          parsed_event_id: string;
          outcome: string;
          changed: boolean;
          failure_reason: string;
        }>(
          `SELECT source_listing_id, parsed_event_id::text, outcome, changed, failure_reason
         FROM collection.snapshot_observation
        WHERE run_id = $1
        ORDER BY source_listing_id`,
          [run.run_id],
        ),
        connection.query<{ event_id: string; event_type: string }>(
          `SELECT event_id::text, event_type
         FROM platform.outbox
        WHERE aggregate_id = $1
           OR aggregate_id IN (
             SELECT snapshot_id FROM collection.snapshot_observation WHERE run_id = $1
           )
        ORDER BY event_id`,
          [run.run_id],
        ),
        connection.query<{ event_id: string }>(
          `SELECT event_id::text
         FROM platform.outbox
        WHERE event_type = 'collection.run.requested'
          AND payload->>'operationKey' = $1`,
          [operationKey],
        ),
        connection.query<{ next_run_at: Date; in_flight_operation_key: string }>(
          `SELECT next_run_at, in_flight_operation_key
         FROM collection.collection_schedule
        WHERE source_id = $1`,
          [sourceId],
        ),
        connection.query<{ count: number }>(
          `SELECT count(*)::integer AS count
         FROM platform.inbox
        WHERE consumer_name = 'collection.scheduled-run'
          AND event_id IN (
            SELECT event_id FROM platform.outbox
             WHERE event_type = 'collection.run.requested'
               AND payload->>'operationKey' = $1
          )`,
          [operationKey],
        ),
      ]);
      return {
        run,
        observations,
        events,
        requestCount: requests.length,
        schedule: schedule[0],
        consumedCount: consumed[0]?.count ?? 0,
      };
    }
    function assertCompleted(
      snapshot: Awaited<ReturnType<typeof operationSnapshot>>,
      operationKey: string,
    ) {
      expect(
        snapshot?.run.status === 'completed',
        `${operationKey} did not complete.`,
      ).toBeTruthy();
      expect(
        snapshot!.run.checkpoint_ordinal === 3 &&
          snapshot!.run.observed_count === 3 &&
          snapshot!.run.parsed_count === 3 &&
          snapshot!.run.changed_count === 0 &&
          snapshot!.run.suppressed_count === 0 &&
          snapshot!.run.failed_count === 0,
        `${operationKey} has incorrect terminal counts.`,
      ).toBeTruthy();
      expect(
        JSON.stringify(snapshot!.observations.map(({ source_listing_id }) => source_listing_id)) ===
          JSON.stringify(expectedIdentities),
        `${operationKey} duplicated or skipped a fixture identity.`,
      ).toBeTruthy();
      expect(
        snapshot!.observations.every(
          ({ parsed_event_id, outcome, changed, failure_reason }) =>
            parsed_event_id !== null &&
            outcome === 'parsed' &&
            changed === false &&
            failure_reason === null,
        ),
        `${operationKey} stored an incoherent observation outcome.`,
      ).toBeTruthy();
      expect(
        snapshot!.events.filter(({ event_type }) => event_type === 'collection.snapshot.parsed')
          .length === 3 &&
          snapshot!.events.filter(({ event_type }) => event_type === 'collection.run.completed')
            .length === 1,
        `${operationKey} did not create exactly three parsed events and one completion event.`,
      ).toBeTruthy();
      expect(
        snapshot!.requestCount === 1,
        `${operationKey} has duplicate request commands.`,
      ).toBeTruthy();
      expect(
        snapshot!.consumedCount === 1,
        `${operationKey} was not consumed exactly once.`,
      ).toBeTruthy();
      expect(
        snapshot!.schedule!.in_flight_operation_key === null &&
          new Date(snapshot!.schedule!.next_run_at).getTime() > Date.now(),
        `${operationKey} did not clear its slot or advance its next run.`,
      ).toBeTruthy();
    }
    async function startWorker(delayMs: number) {
      await execute('docker', compose('up', '--detach', '--build', '--wait', 'worker'), {
        timeout: 180000,
        environment: { SYNTHETIC_PAGE_DELAY_MS: String(delayMs) },
      });
    }
    async function main() {
      let connection: DatabaseConnection;
      {
        let cleanupPrimary2: unknown;
        let cleanupPrimaryThrown2 = false;
        try {
          try {
            expect(
              new Set([postgresPort, rabbitPort, rabbitManagementPort, minioPort, minioConsolePort])
                .size === 5,
              'Campaign ports must be unique.',
            ).toBeTruthy();
            expect(
              environment.COMPOSE_DISABLE_ENV_FILE === '1',
              'Compose environment-file loading was not disabled.',
            ).toBeTruthy();
            await execute(
              'docker',
              compose('up', '--detach', '--build', 'postgres', 'rabbitmq', 'minio', 'migrations'),
              { timeout: 300000 },
            );
            await execute('docker', compose('wait', 'migrations'), { timeout: 180000 });
            connection = new DatabaseConnection(databaseUrl.toString());
            await connection.query(
              `UPDATE collection.source_register
          SET enabled = true,
              enabled_at = clock_timestamp()
        WHERE source_id = $1`,
              [sourceId],
            );
            await proveConcurrentScheduleClaim(connection);
            await startWorker(0);
            await armSchedule(connection);
            const firstKey = await waitFor('the first durable schedule request', () =>
              requestedOperation(connection),
            );
            const first = await waitFor('the first scheduled run to complete', async () => {
              const snapshot = await operationSnapshot(connection, firstKey!);
              return snapshot?.run.status === 'completed' ? snapshot : null;
            });
            assertCompleted(first, firstKey!);
            await execute('docker', compose('stop', '--timeout', '20', 'worker'), {
              timeout: 60000,
            });
            await armSchedule(connection);
            await startWorker(5000);
            const secondKey = await waitFor('the delayed durable schedule request', () =>
              requestedOperation(connection, firstKey!),
            );
            const partial = await waitFor('checkpoint one before SIGTERM', async () => {
              const snapshot = await operationSnapshot(connection, secondKey!);
              return snapshot?.run.checkpoint_ordinal === 1 ? snapshot : null;
            });
            expect(
              partial.run.status === 'running',
              'The delayed run was not running at checkpoint one.',
            ).toBeTruthy();
            expect(
              partial.observations.length === 1,
              'The delayed run did not have one durable observation.',
            ).toBeTruthy();
            expect(
              partial.events.filter(({ event_type }) => event_type === 'collection.run.completed')
                .length === 0,
              'The delayed run completed before SIGTERM.',
            ).toBeTruthy();
            const originalRunId = partial.run.run_id;
            const { stdout: workerContainerOutput } = await execute(
              'docker',
              compose('ps', '--quiet', 'worker'),
              { timeout: 30000 },
            );
            const workerContainer = workerContainerOutput.trim();
            expect(
              workerContainer.length > 0,
              'The worker container could not be resolved.',
            ).toBeTruthy();
            const shutdownStartedAt = Date.now();
            await execute('docker', ['kill', '--signal', 'TERM', workerContainer], {
              timeout: 30000,
            });
            const { stdout: waitOutput } = await execute('docker', ['wait', workerContainer], {
              timeout: 30000,
            });
            expect(
              waitOutput.trim() === '0',
              'The worker did not exit cleanly after SIGTERM.',
            ).toBeTruthy();
            expect(
              Date.now() - shutdownStartedAt < 20000,
              'The worker exceeded its shutdown deadline.',
            ).toBeTruthy();
            const afterShutdown = await operationSnapshot(connection, secondKey!);
            expect(
              afterShutdown?.run.run_id === originalRunId &&
                afterShutdown.run.status === 'running' &&
                afterShutdown.run.checkpoint_ordinal === 1 &&
                afterShutdown.observations.length === 1 &&
                afterShutdown.consumedCount === 0 &&
                afterShutdown!.schedule!.in_flight_operation_key === secondKey,
              'SIGTERM changed the committed prefix, acknowledged delivery, or cleared the slot.',
            ).toBeTruthy();
            await startWorker(0);
            const resumed = await waitFor('the redelivered scheduled run to resume', async () => {
              const snapshot = await operationSnapshot(connection, secondKey!);
              return snapshot?.run.status === 'completed' ? snapshot : null;
            });
            expect(
              resumed.run.run_id === originalRunId,
              'Redelivery created a different run ID.',
            ).toBeTruthy();
            assertCompleted(resumed, secondKey!);
          } catch (error) {
            await execute('docker', compose('logs', '--no-color'), { timeout: 30000 })
              .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
              .catch(() => undefined);
            throw error;
          }
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
              await cleanupAll(
                async () => {
                  await connection?.close();
                },
                async () => {
                  await execute('docker', compose('down', '--volumes', '--remove-orphans'), {
                    timeout: 120000,
                  });
                },
              );
            },
          );
        }
      }
      console.log('Scheduled collection and SIGTERM/restart integration passed.');
    }
    await main();
  });
});
