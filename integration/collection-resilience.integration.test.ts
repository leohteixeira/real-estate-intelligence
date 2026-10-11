import { expect, test } from 'vitest';
import { rawSnapshotStoreResilienceSettings } from '../apps/worker/dist/collection/collection-resilience.settings.js';
import { ResilientListingSource } from '../apps/worker/dist/collection/resilient-listing-source.js';
import { ResilientRawSnapshotStore } from '../apps/worker/dist/collection/resilient-raw-snapshot-store.js';
import type {
  ListingSource,
  RawListingDocument,
  SourceRegisterRepository,
} from '../packages/application/dist/index.js';
import {
  CollectSourceRun,
  ConsumeCollectionRunRequest,
  EnableSource,
  ExternalFailure,
  ListingSourceAccessRefusal,
  type RawSnapshotStore,
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
import { coordinateSourceRegisterCleanup } from './source-register-cleanup.ts';
import { allocatePorts, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

test('collection-resilience preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const exec = command;
    const SOURCE = 'synthetic-portal-aurora';
    const clock = { now: () => new Date().toISOString() };
    const signal = () => AbortSignal.timeout(15_000);

    function services(
      connection: DatabaseConnection,
      source: (sources: SourceRegisterRepository) => ListingSource,
      store: RawSnapshotStore,
    ) {
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
      const compose = (...args: string[]) => [
        'compose',
        '--project-name',
        projectName,
        '--profile',
        'tools',
        ...args,
      ];
      const execute = (file: string, args: string[], extra = {}) =>
        exec(file, args, {
          cwd: new URL('..', import.meta.url),
          env: { ...environment, ...extra },
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        });
      let connection: DatabaseConnection;
      let broker: RabbitMqEventBroker;
      let snapshots: S3RawSnapshotStore;
      let primaryFailure: unknown;
      let primaryThrown = false;
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
          fetchPage: async (sourceId: string, cursor: string | null, attempt: AbortSignal) => {
            requests++;
            if (cursor !== null) throw new ListingSourceAccessRefusal('captcha');
            return fixtureSource.fetchPage(sourceId, cursor, attempt);
          },
          parse: async (document: RawListingDocument, attempt: AbortSignal) => {
            parses++;
            return fixtureSource.parse(document, attempt);
          },
        };
        const runtime = services(
          connection,
          (sources: SourceRegisterRepository) => new ResilientListingSource(scripted, sources),
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
        expect(claims.length === 1, 'Enabled fixture schedule was not claimed.').toBeTruthy();
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
              scheduledFor: claim!.scheduledFor,
              operationKey: claim!.operationKey,
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
        let resolveDelivery: () => void;
        let deliveryDone = new Promise<void>((resolve) => {
          resolveDelivery = resolve;
        });
        await broker.subscribe(
          { consumerName: 'collection.scheduled-run', eventTypes: ['collection.run.requested'] },
          async (message, delivery) => {
            const result = await consumed.execute(message, delivery.signal);
            expect(
              result.status === 'paused',
              'Scheduled refusal fabricated a completed result.',
            ).toBeTruthy();
            const durable = await runtime.runs.loadRunByOperationKey(claim!.operationKey, signal());
            const disposition = await connection.query<{ count: number }>(
              `SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name = 'collection.scheduled-run' AND event_id = $1`,
              [event.eventId],
            );
            const slot = await connection.query<{ in_flight_operation_key: string }>(
              `SELECT in_flight_operation_key FROM collection.collection_schedule WHERE source_id = $1`,
              [SOURCE],
            );
            expect(
              durable!.status === 'paused' &&
                disposition![0]!.count === 1 &&
                slot![0]!.in_flight_operation_key === null,
              'Handler returned before durable pause/inbox/slot disposition.',
            ).toBeTruthy();
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
        const paused = await runtime.runs.loadRunByOperationKey(claim!.operationKey, signal());
        expect(
          !held!.enabled && held!.hold!.reason === 'captcha',
          'Source hold did not persist.',
        ).toBeTruthy();
        expect(
          paused!.status === 'paused' &&
            paused!.checkpoint.ordinal === 1 &&
            paused!.counts.observed === 1,
          'Blocked run did not retain checkpoint one.',
        ).toBeTruthy();
        expect(
          paused!.completedAt === null &&
            paused!.completedEventId === null &&
            paused!.manifestHash === null,
          'Paused run carried terminal fields.',
        ).toBeTruthy();
        expect(
          requests === 2 && parses === 1,
          'Forbidden page was fetched again or parsed.',
        ).toBeTruthy();
        const artifacts = await connection.query<{ observations: number; completions: number }>(
          `SELECT
      (SELECT count(*)::integer FROM collection.snapshot_observation WHERE run_id = $1) AS observations,
      (SELECT count(*)::integer FROM platform.outbox WHERE event_type = 'collection.run.completed' AND aggregate_id = $1) AS completions`,
          [paused!.runId],
        );
        expect(
          artifacts![0]!.observations === 1 && artifacts![0]!.completions === 0,
          'Blocked page created artifacts or completion.',
        ).toBeTruthy();
        expect(
          (await new EnableSource(runtime.sources, clock).execute(SOURCE, signal())).status ===
            'refused',
          'Ordinary operator enable cleared a hold.',
        ).toBeTruthy();
        expect(
          (
            await runtime.transactions.runInTransaction((transaction) =>
              schedules.claimDue(transaction, '2027-01-01T00:00:00Z', 10),
            )
          ).length === 0,
          'Held source was scheduled.',
        ).toBeTruthy();
        deliveryDone = new Promise<void>((resolve) => {
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
        expect(
          delivered === 2 && requests === 2 && parses === 1,
          'Redelivery repeated source work.',
        ).toBeTruthy();

        const restart = await execute(
          process.execPath,
          ['integration/fixtures/collection-restart-probe.ts'],
          {
            RESILIENCE_FIXTURE_DATABASE_URL: databaseUrl.toString(),
            RESILIENCE_FIXTURE_OPERATION_KEY: claim!.operationKey,
          },
        );
        const restarted = JSON.parse(restart.stdout) as {
          refused: boolean;
          requests: number;
          status: string;
          ordinal: number;
        };
        expect(restarted.refused, 'Restart lost its canonical source hold.').toBe(true);
        expect(restarted.requests, 'Restart repeated a forbidden source request.').toBe(0);
        expect(
          restarted.status === 'paused' && restarted.ordinal === 1,
          'Restart lost the paused committed prefix.',
        ).toBe(true);
        const response = await requestHttp(`http://127.0.0.1:${apiPort}/api/v1/collection/sources`);
        const listed = (await response.json()) as { sources: { sourceId: string }[] };
        expect(
          response.ok &&
            listed.sources.every((source: { sourceId: string }) => source.sourceId !== SOURCE),
          'API exposed a held source.',
        ).toBeTruthy();

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
        expect(
          recovered.status === 'paused' &&
            recovered.runId === recoveringRun.runId &&
            requests === 2,
          'Hold/pause intermediate state was not recovered.',
        ).toBeTruthy();

        // Prepared-page race: commit a hold while the source bytes are already stored, before its transaction.
        const racingSource = 'synthetic-portal-brisa';
        let racingParses = 0;
        const racingRuntime = services(
          connection,
          (sources: SourceRegisterRepository) =>
            new ResilientListingSource(
              {
                fetchPage: (...args: Parameters<typeof fixtureSource.fetchPage>) =>
                  fixtureSource.fetchPage(...args),
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
        expect(
          raced.status === 'paused' && raced.observedCount === 0 && racingParses === 1,
          'Prepared page escaped a durable hold.',
        ).toBeTruthy();
        expect(
          (await racingRuntime.runs.loadRunByOperationKey('resilience-prepared-race'))!.checkpoint!
            .ordinal === 0,
          'Prepared race advanced checkpoint.',
        ).toBeTruthy();
        const racedArtifacts = await connection.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM collection.snapshot_observation WHERE run_id = $1`,
          [raced.runId],
        );
        expect(
          racedArtifacts![0]!.count === 0,
          'Prepared race persisted an observation.',
        ).toBeTruthy();

        // Review is explicit and ordinary enable still leaves the run paused until explicit resume.
        await runtime.sources.clearHoldAfterReview(SOURCE, clock.now(), signal());
        await runtime.sources.enableAtomically(SOURCE, clock.now(), signal());
        expect(
          (await runtime.runs.loadRunByOperationKey(claim!.operationKey))!.status! === 'paused',
          'Enable silently resumed the paused run.',
        ).toBeTruthy();
        const resumed = await runtime.transactions.runInTransaction((transaction) =>
          runtime.runs.resume(transaction, paused!.runId),
        );
        expect(
          resumed.runId === paused!.runId && resumed.checkpoint.ordinal === 1,
          'Explicit resume lost the prefix.',
        ).toBeTruthy();

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
          (sources: SourceRegisterRepository) =>
            new ResilientListingSource(
              {
                fetchPage: async (sourceId, cursor, attempt) => {
                  if (cursor !== null && !stopped) {
                    stopped = true;
                    await execute('docker', compose('stop', 'minio'));
                  }
                  return fixtureSource.fetchPage(sourceId, cursor, attempt);
                },
                parse: async (...args: Parameters<ListingSource['parse']>) => {
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
        expect(
          failed && outageParses === 1 && outageAttempts === 3,
          'Store outage did not preserve store-before-parse or retry budget.',
        ).toBeTruthy();
        const outageRun = await outageRuntime.runs.loadRunByOperationKey('resilience-store-down');
        expect(
          outageRun!.status === 'running' &&
            outageRun!.checkpoint.ordinal === 1 &&
            outageRun!.counts.observed === 1,
          'Store failure lost its committed prefix.',
        ).toBeTruthy();
        expect(
          (await outageRuntime.sources.findById(SOURCE))!.enabled!,
          'Storage failure held a healthy source.',
        ).toBeTruthy();
        await execute('docker', compose('up', '--detach', '--wait', 'minio'));
        const recovery = services(
          connection,
          (sources: SourceRegisterRepository) => new ResilientListingSource(fixtureSource, sources),
          new ResilientRawSnapshotStore(snapshots),
        );
        expect(
          (await recovery.collector.execute(SOURCE, 'resilience-store-down', null, signal()))
            .status === 'completed',
          'Store failure could not redeliver.',
        ).toBeTruthy();
      } catch (error) {
        primaryFailure = error;
        primaryThrown = true;
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
        primaryThrown,
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
    await main();
  });
});
