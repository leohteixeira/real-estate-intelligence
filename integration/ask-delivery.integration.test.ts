import { randomBytes, randomUUID } from 'node:crypto';
import { execa } from 'execa';
import amqp from 'amqplib';
import { getContainerRuntimeClient, getReaper } from 'testcontainers';
import { expect, test, vi } from 'vitest';
import {
  parseAskClaim,
  parseAskLiveEvent,
  parseAskLiveRun,
  parseAskLiveThread,
  parseAskPendingLimit,
  parseAskRequestedIdentity,
  parseStructuredAskAccepted,
  parseStructuredExecutionEvidence,
  type StructuredAskCreate,
} from '../packages/contracts/dist/index.js';
import { ASK_STRUCTURED_CONSUMER, ASK_RUN_REQUESTED_TYPE } from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresAskRunRepository,
  PostgresOutbox,
  PostgresTransactionRunner,
  RabbitMqEventBroker,
  askDispatchProof,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, ComposeFixture, preserveCleanup, cleanupAll } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';

const secret = () => randomBytes(32).toString('base64url');
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const body: StructuredAskCreate = {
  mode: 'structured-price-v1',
  threadId: null,
  placeId: null,
  query: 'Synthetic ordered delivery price',
  locale: 'en',
  inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
};
type Accepted = ReturnType<typeof parseStructuredAskAccepted>;
type Context = {
  fixture: ComposeFixture;
  database: DatabaseConnection;
  api: string;
  ai: string;
  capability: string;
  token: string;
  dispatch: string;
  rabbitUrl: string;
  command: (args: string[]) => Promise<{ stdout: string }>;
};
async function inventory() {
  const [containers, volumes] = await Promise.all([
    execa('docker', ['ps', '--all', '--format', '{{.ID}}']),
    execa('docker', ['volume', 'ls', '--format', '{{.Name}}']),
  ]);
  return {
    containers: containers.stdout.split('\n').filter(Boolean).sort(),
    volumes: volumes.stdout.split('\n').filter(Boolean).sort(),
  };
}
async function owned(prefetch: number | undefined, work: (context: Context) => Promise<void>) {
  // Bootstrap the native harness before recording foreign inventory: Ryuk belongs to
  // Testcontainers, not to this Compose project, and remains alive across its fixtures.
  await getReaper(await getContainerRuntimeClient());
  const [postgres, api, ai, rabbit, management, minio, consolePort] = await allocatePorts(7);
  const capability = secret(),
    token = secret(),
    dispatch = secret();
  const fixture = new ComposeFixture(`rei-ask-delivery-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    API_PORT: String(api),
    AI_PORT: String(ai),
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    MINIO_API_PORT: String(minio),
    MINIO_CONSOLE_PORT: String(consolePort),
    POSTGRES_USER: 'rei_delivery',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_delivery',
    RABBITMQ_USER: 'rei_delivery',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_delivery',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: token,
    ASK_DISPATCH_SECRET: dispatch,
    SNAPSHOT_ENCRYPTION_KEY_ID: 'delivery-fixture-v1',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    ...(prefetch === undefined ? {} : { COLLECTION_CONCURRENCY: String(prefetch) }),
  });
  const foreign = await inventory();
  const metadata = async () => ({
    containers: foreign.containers.length
      ? (
          await execa('docker', [
            'inspect',
            '--format',
            '{{.Id}} {{.Name}} {{json .Config.Labels}} {{json .Mounts}}',
            ...foreign.containers,
          ])
        ).stdout
      : '',
    volumes: foreign.volumes.length
      ? (
          await execa('docker', [
            'volume',
            'inspect',
            '--format',
            '{{.Name}} {{json .Labels}} {{.Driver}} {{.Mountpoint}}',
            ...foreign.volumes,
          ])
        ).stdout
      : '',
  });
  const foreignMetadata = await metadata();
  let database: DatabaseConnection | undefined;
  let completed = false;
  let phase = 'compose-startup';
  await preserveCleanup(
    async () => {
      try {
        await fixture.up(['--build', 'postgres', 'migrations', 'api', 'ai', 'rabbitmq', 'minio']);
        const command = (args: string[]) =>
          fixture.execute(
            'docker',
            ['compose', '--file', 'compose.yaml', '--project-name', fixture.project, ...args],
            { env: fixture.environment, timeout: 240000 },
          );
        phase = 'worker-build';
        await command(['build', 'worker']);
        // Compose's ping checks the Erlang runtime, not completed Rabbit application
        // startup. Await that distinct prerequisite once, before opening AMQP or
        // issuing any public mutation; never retry POSTs or delivery assertions.
        phase = 'rabbit-application-readiness';
        await command([
          'exec',
          '-T',
          'rabbitmq',
          'su-exec',
          'rabbitmq',
          'rabbitmqctl',
          '--timeout',
          '30',
          'await_startup',
        ]);
        const sql = new URL(`postgres://127.0.0.1:${postgres}/rei_delivery`);
        sql.username = fixture.environment.POSTGRES_USER!;
        sql.password = fixture.environment.POSTGRES_PASSWORD!;
        database = new DatabaseConnection(sql.toString());
        const broker = new URL(`amqp://127.0.0.1:${rabbit}/real-estate-intelligence`);
        broker.username = fixture.environment.RABBITMQ_USER!;
        broker.password = fixture.environment.RABBITMQ_PASSWORD!;
        const topology = new RabbitMqEventBroker({
          url: broker.toString(),
          operationTimeoutMs: 5000,
        });
        await preserveCleanup(
          async () => {
            phase = 'production-topology';
            await topology.subscribe(
              { consumerName: ASK_STRUCTURED_CONSUMER, eventTypes: [ASK_RUN_REQUESTED_TYPE] },
              async () => undefined,
            );
            await topology.start();
          },
          () => topology.close(),
        );
        phase = 'public-delivery-campaign';
        await work({
          fixture,
          database,
          api: `http://127.0.0.1:${api}`,
          ai: `http://127.0.0.1:${ai}`,
          capability,
          token,
          dispatch,
          rabbitUrl: broker.toString(),
          command,
        });
        completed = true;
      } catch (error) {
        process.stderr.write(`${JSON.stringify({ askFixturePhase: phase })}\n`);
        throw error;
      }
    },
    async () => {
      if (!completed && database)
        await captureAskDiagnostics(fixture, database).catch(() => undefined);
      await cleanupAll(
        () => database?.close() ?? Promise.resolve(),
        () => fixture.down(),
      );
      expect(await inventory()).toEqual(foreign);
      expect(await metadata()).toEqual(foreignMetadata);
    },
  );
}
function post(context: Context, request = body, key = secret(), capability = context.capability) {
  return requestHttp(`${context.api}/api/v1/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${capability}`, 'Idempotency-Key': key },
    body: request,
  });
}
async function create(context: Context, request = body, key = secret()): Promise<Accepted> {
  const response = await post(context, request, key);
  expect(response.status).toBe(202);
  return parseStructuredAskAccepted(await response.json());
}
async function snapshot(context: Context, runId: string) {
  const response = await requestHttp(`${context.api}/api/v1/runs/${runId}`, {
    headers: { Authorization: `Bearer ${context.capability}` },
  });
  expect(response.status).toBe(200);
  return parseAskLiveRun(await response.json());
}
async function identity(context: Context, runId: string) {
  const rows = await context.database.query<{ event_id: string; thread_id: string }>(
    'SELECT requested_event_id::text AS event_id,thread_id::text FROM ask.run WHERE id=$1',
    [runId],
  );
  return parseAskRequestedIdentity({
    version: 1,
    eventId: rows[0]!.event_id,
    runId,
    threadId: rows[0]!.thread_id,
  });
}
async function claim(context: Context, runId: string) {
  const requested = await identity(context, runId);
  const response = await requestHttp(`${context.api}/api/v1/internal/ask/runs/${runId}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${askDispatchProof(context.dispatch, requested)}` },
    body: requested,
  });
  expect(response.status).toBe(200);
  return parseAskClaim(await response.json());
}
async function holdRequested(context: Context, runs: readonly Accepted[]) {
  for (const run of runs) {
    const requested = await identity(context, run.runId);
    await context.database.query(
      'UPDATE platform.outbox SET published_at=clock_timestamp() WHERE event_id=$1 AND aggregate_id=$2 AND event_type=$3',
      [requested.eventId, run.runId, ASK_RUN_REQUESTED_TYPE],
    );
  }
}
async function publish(context: Context, runs: readonly Accepted[], attempt = 1) {
  const outbox = new PostgresOutbox(context.database),
    transactions = new PostgresTransactionRunner(context.database);
  const events = await Promise.all(
    runs.map((run) =>
      transactions.runInTransaction(async (transaction) => {
        const event = await outbox.find(transaction, run.runId, ASK_RUN_REQUESTED_TYPE);
        if (!event) throw new Error('Expected original retained requested envelope.');
        return event;
      }),
    ),
  );
  if (attempt === 1) {
    const broker = new RabbitMqEventBroker({ url: context.rabbitUrl, operationTimeoutMs: 5000 });
    await preserveCleanup(
      async () => {
        for (const event of events) await broker.publish(event, AbortSignal.timeout(5000));
      },
      () => broker.close(),
    );
    return;
  }
  // Only the delivery-attempt header is fault-injected on these exact original owned envelopes.
  const connection = await amqp.connect(context.rabbitUrl);
  const channel = await connection.createConfirmChannel();
  let returned = false;
  channel.on('return', () => {
    returned = true;
  });
  await preserveCleanup(
    async () => {
      for (const event of events) {
        channel.publish('', ASK_STRUCTURED_CONSUMER, Buffer.from(JSON.stringify(event)), {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          headers: { ...event.traceContext, 'x-rei-delivery-attempt': attempt },
        });
        await channel.waitForConfirms();
        expect(returned).toBe(false);
      }
    },
    () =>
      cleanupAll(
        () => channel.close(),
        () => connection.close(),
      ),
  );
}
async function age(context: Context, runId: string, seconds = 121) {
  await context.database.query(
    "WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS at) UPDATE ask.run SET admitted_at=observed.at-($2 * interval '1 second'),queue_expires_at=observed.at-($2 * interval '1 second')+interval '120 seconds' FROM observed WHERE id=$1 AND state='queued'",
    [runId, seconds],
  );
}
async function terminalFrames(context: Context, runId: string, after = 0) {
  const response = await requestHttp(`${context.api}/api/v1/runs/${runId}/events`, {
    headers: {
      Authorization: `Bearer ${context.capability}`,
      ...(after ? { 'Last-Event-ID': `${runId}:v1:${after}` } : {}),
    },
  });
  expect(response.status).toBe(200);
  return (await response.text())
    .split(/\r?\n\r?\n/)
    .filter((block) => block.includes('data:'))
    .map((block) =>
      parseAskLiveEvent(
        JSON.parse(
          block
            .split(/\r?\n/)
            .find((line) => line.startsWith('data:'))!
            .slice(5)
            .trim(),
        ),
      ),
    );
}
async function counts(context: Context, threadId: string) {
  return context.database.query<{
    runs: number;
    events: number;
    outbox: number;
    reservations: number;
  }>(
    'SELECT (SELECT count(*)::integer FROM ask.run WHERE thread_id=$1) AS runs,(SELECT count(*)::integer FROM ask.run_event WHERE run_id IN (SELECT id FROM ask.run WHERE thread_id=$1)) AS events,(SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id IN (SELECT id FROM ask.run WHERE thread_id=$1)) AS outbox,(SELECT count(*)::integer FROM platform.idempotency_key WHERE result_reference IN (SELECT id::text FROM ask.run WHERE thread_id=$1)) AS reservations',
    [threadId],
  );
}
async function durableEffects(context: Context, runId: string) {
  return context.database.query<{
    events: number;
    receipts: number;
    checkpoints: number;
    writes: number;
    terminals: number;
  }>(
    "SELECT (SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1) AS events,(SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS receipts,(SELECT count(*)::integer FROM ask.graph_checkpoint WHERE run_id=$1) AS checkpoints,(SELECT count(*)::integer FROM ask.graph_pending_write WHERE run_id=$1) AS writes,(SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type <> 'ask.run.requested') AS terminals",
    [runId],
  );
}

test('ordered Ask delivery: public capacity/replay, SQL expiry, independent default-prefetch progress and retained recovery', async () =>
  owned(undefined, async (context) => {
    const key = secret(),
      first = await create(context, body, key),
      request = { ...body, threadId: first.threadId };
    const raced = await Promise.all([
      post(context, request),
      post(context, request),
      post(context, request),
    ]);
    expect(raced.map((response) => response.status).sort()).toEqual([202, 202, 429]);
    const refusal = raced.find((response) => response.status === 429)!;
    expect(parseAskPendingLimit(await refusal.json())).toEqual({
      code: 'thread_pending_limit',
      limit: 3,
    });
    expect(await counts(context, first.threadId)).toEqual([
      { runs: 3, events: 3, outbox: 3, reservations: 3 },
    ]);
    const beforeReplay = await counts(context, first.threadId);
    expect(parseStructuredAskAccepted(await (await post(context, body, key)).json())).toEqual(
      first,
    );
    expect((await post(context, { ...body, query: 'Changed' }, key)).status).toBe(409);
    expect((await post(context, request, secret(), secret())).status).toBe(403);
    expect(await counts(context, first.threadId)).toEqual(beforeReplay);
    const threadResponse = await requestHttp(`${context.api}/api/v1/threads/${first.threadId}`, {
      headers: { Authorization: `Bearer ${context.capability}` },
    });
    const thread = parseAskLiveThread(await threadResponse.json());
    const pending = thread.runs.map((run) => ({ ...first, runId: run.id }));
    await holdRequested(context, pending);
    expect(
      await context.database.query<{ lifetime: number }>(
        'SELECT EXTRACT(epoch FROM queue_expires_at-admitted_at)::integer AS lifetime FROM ask.run WHERE thread_id=$1',
        [first.threadId],
      ),
    ).toEqual([{ lifetime: 120 }, { lifetime: 120 }, { lifetime: 120 }]);
    // Inclusive SQL deadline, autonomous maintenance, truthful SSE and terminal replay after inbox
    // pruning. No worker is running and no graph or receipt may be created.
    await age(context, first.runId);
    await vi.waitFor(
      async () => expect((await snapshot(context, first.runId)).state).toBe('expired'),
      { timeout: 10000, interval: 100 },
    );
    const expired = await snapshot(context, first.runId),
      frames = await terminalFrames(context, first.runId);
    expect(expired.decision).toBeNull();
    expect(expired.result).toBeNull();
    expect(expired.steps).toEqual([{ sequence: 1, phase: 'expired', at: expired.updatedAt }]);
    expect(frames.map((frame) => frame.sequence)).toEqual([1, 2]);
    expect(frames[1]!.event).toBe('ask.expired');
    const expiredIdentity = await identity(context, first.runId);
    await context.database.query('DELETE FROM platform.inbox WHERE event_id=$1', [
      expiredIdentity.eventId,
    ]);
    expect((await claim(context, first.runId)).disposition).toBe('terminal');
    expect(await terminalFrames(context, first.runId, 1)).toEqual([frames[1]]);
    expect(
      await context.database.query<{
        executions: number;
        receipts: number;
        checkpoints: number;
        terminals: number;
        inbox: number;
      }>(
        "SELECT (SELECT count(*)::integer FROM ask.run WHERE id=$1 AND execution_id IS NOT NULL) AS executions,(SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS receipts,(SELECT count(*)::integer FROM ask.graph_checkpoint WHERE run_id=$1) AS checkpoints,(SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.expired') AS terminals,(SELECT count(*)::integer FROM platform.inbox WHERE event_id=$2) AS inbox",
        [first.runId, expiredIdentity.eventId],
      ),
    ).toEqual([{ executions: 0, receipts: 0, checkpoints: 0, terminals: 1, inbox: 1 }]);
    await context.command(['restart', 'api']);
    await vi.waitFor(async () => expect(await snapshot(context, first.runId)).toEqual(expired), {
      timeout: 30000,
      interval: 200,
    });
    for (const run of pending.slice(1)) await age(context, run.runId);
    await vi.waitFor(
      async () =>
        expect(
          (
            await context.database.query<{ count: number }>(
              "SELECT count(*)::integer AS count FROM ask.run WHERE thread_id=$1 AND state='expired'",
              [first.threadId],
            )
          )[0]!.count,
        ).toBe(3),
      { timeout: 10000, interval: 100 },
    );

    const a1 = await create(context),
      a2 = await create(context, { ...body, threadId: a1.threadId }),
      a3 = await create(context, { ...body, threadId: a1.threadId }),
      b1 = await create(context);
    await holdRequested(context, [a1, a2, a3, b1]);
    // Capture actual source-tail transfers in Rabbit's owned trace exchange. The worker still uses
    // its unchanged production subscription/prefetch; the observer consumes only trace copies.
    const traceConnection = await amqp.connect(context.rabbitUrl),
      traceChannel = await traceConnection.createChannel();
    const traceQueue = `rei-delivery-trace-${randomUUID()}`;
    await traceChannel.assertQueue(traceQueue, { exclusive: true, autoDelete: true });
    await traceChannel.bindQueue(traceQueue, 'amq.rabbitmq.trace', 'publish.#');
    const observed = new Map<string, number>();
    await traceChannel.consume(traceQueue, (message) => {
      if (!message) return;
      const envelope: unknown = JSON.parse(message.content.toString());
      if (
        typeof envelope === 'object' &&
        envelope !== null &&
        'eventId' in envelope &&
        typeof envelope.eventId === 'string'
      )
        observed.set(envelope.eventId, (observed.get(envelope.eventId) ?? 0) + 1);
      traceChannel.ack(message);
    });
    await preserveCleanup(
      async () => {
        await context.command([
          'exec',
          '-T',
          'rabbitmq',
          'rabbitmqctl',
          'trace_on',
          '-p',
          'real-estate-intelligence',
        ]);
        await publish(context, [a3, a2], 3);
        await context.fixture.up(['worker']);
        await publish(context, [b1]);
        await vi.waitFor(
          async () => expect((await snapshot(context, b1.runId)).state).toBe('completed'),
          { timeout: 30000, interval: 100 },
        );
        expect((await snapshot(context, a1.runId)).state).toBe('queued');
        expect((await snapshot(context, a2.runId)).state).toBe('queued');
        expect((await snapshot(context, a3.runId)).state).toBe('queued');
        const a2Identity = await identity(context, a2.runId),
          a3Identity = await identity(context, a3.runId);
        await vi.waitFor(
          () => {
            expect(observed.get(a2Identity.eventId) ?? 0).toBeGreaterThan(6);
            expect(observed.get(a3Identity.eventId) ?? 0).toBeGreaterThan(6);
          },
          { timeout: 20000, interval: 200 },
        );
        await context.command(['stop', 'worker']);
        const waiting = [];
        for (let index = 0; index < 2; index++) {
          const message = await traceChannel.get(ASK_STRUCTURED_CONSUMER, { noAck: false });
          if (!message) throw new Error('Expected deferred source command.');
          waiting.push(message);
          expect(message.properties.headers).toMatchObject({
            'x-rei-delivery-attempt': 3,
            'x-rei-dead-letter-reason': 'admission-deferred',
          });
        }
        for (const message of waiting) traceChannel.nack(message, false, true);
        expect(
          (await traceChannel.checkQueue(`${ASK_STRUCTURED_CONSUMER}.dead-letter`)).messageCount,
        ).toBe(0);
        await publish(context, [a1]);
        await context.fixture.up(['worker']);
        await vi.waitFor(
          async () => expect((await snapshot(context, a3.runId)).state).toBe('completed'),
          { timeout: 30000, interval: 100 },
        );
        const order = await context.database.query<{ id: string }>(
          'SELECT id::text FROM ask.run WHERE thread_id=$1 ORDER BY admission_sequence',
          [a1.threadId],
        );
        expect(order.map((row) => row.id)).toEqual([a1.runId, a2.runId, a3.runId]);
        const executions = await context.database.query<{ id: string; at: string }>(
          "SELECT id::text,document->'decision'->>'decidedAt' AS at FROM ask.run WHERE thread_id=$1 ORDER BY admission_sequence",
          [a1.threadId],
        );
        expect(executions.map((row) => row.at)).toEqual(
          [...executions.map((row) => row.at)].sort(),
        );
        for (const run of [a1, a2, a3, b1]) {
          const result = (await terminalFrames(context, run.runId)).at(-1)?.run.result;
          if (result?.kind !== 'price_per_square_meter') throw new Error('Expected price result.');
          expect(result.minorUnits).toBe(1154412);
        }
      },
      () =>
        cleanupAll(
          () => traceChannel.close(),
          () => traceConnection.close(),
        ),
    );
    await context.command(['stop', 'worker']);
    const recoverKey = secret(),
      recover = await create(context, body, recoverKey),
      successor = await create(context, { ...body, threadId: recover.threadId });
    await holdRequested(context, [recover, successor]);
    const oldClaim = await claim(context, recover.runId);
    if (oldClaim.disposition !== 'claimed') throw new Error('Expected retained recovery claim.');
    const evidenceResponse = await requestHttp(`${context.ai}/internal/v1/runs/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${context.token}` },
      body: oldClaim.input,
    });
    expect(evidenceResponse.status).toBe(200);
    const evidence = parseStructuredExecutionEvidence(await evidenceResponse.json());
    expect(evidence.receipt.result.minorUnits).toBe(1154412);
    const receiptBefore = await context.database.query<{ id: string }>(
      'SELECT id::text FROM ask.tool_receipt WHERE run_id=$1',
      [recover.runId],
    );
    expect(
      (
        await context.database.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM ask.graph_checkpoint WHERE run_id=$1',
          [recover.runId],
        )
      )[0]!.count,
    ).toBeGreaterThan(0);
    const third = await create(context, { ...body, threadId: recover.threadId });
    await holdRequested(context, [third]);
    const capacityBefore = await counts(context, recover.threadId);
    expect((await post(context, { ...body, threadId: recover.threadId })).status).toBe(429);
    expect(
      parseStructuredAskAccepted(await (await post(context, body, recoverKey)).json()),
    ).toEqual(recover);
    expect(await counts(context, recover.threadId)).toEqual(capacityBefore);
    await context.database.query(
      "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [recover.runId],
    );
    expect((await claim(context, successor.runId)).disposition).toBe('busy');
    await publish(context, [third, successor, recover]);
    await context.fixture.up(['worker']);
    await vi.waitFor(
      async () => expect((await snapshot(context, third.runId)).state).toBe('completed'),
      { timeout: 30000, interval: 100 },
    );
    expect(
      await context.database.query<{ id: string }>(
        'SELECT id::text FROM ask.tool_receipt WHERE run_id=$1',
        [recover.runId],
      ),
    ).toEqual(receiptBefore);
    const oldTool = await requestHttp(
      `${context.api}/api/v1/ask/runs/${recover.runId}/tools/price-per-square-meter`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${oldClaim.input.toolGrant}` },
        body: {
          ...oldClaim.identity,
          executionId: oldClaim.input.executionId,
          operation: 'price-per-square-meter',
          inputs: body.inputs,
        },
      },
    );
    expect(oldTool.status).toBe(403);
    // Business-owned creation and delivery fences survive pruning of temporary platform rows.
    await context.command(['stop', 'worker']);
    const recoveredBefore = await durableEffects(context, recover.runId);
    expect(recoveredBefore[0]).toMatchObject({ receipts: 1, terminals: 1 });
    const requested = await identity(context, recover.runId);
    await context.database.query(
      'DELETE FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2',
      [ASK_STRUCTURED_CONSUMER, requested.eventId],
    );
    await context.database.query('DELETE FROM platform.idempotency_key WHERE result_reference=$1', [
      recover.runId,
    ]);
    expect(
      parseStructuredAskAccepted(await (await post(context, body, recoverKey)).json()),
    ).toEqual(recover);
    expect(await durableEffects(context, recover.runId)).toEqual(recoveredBefore);
    await publish(context, [recover]);
    await context.fixture.up(['worker']);
    await vi.waitFor(
      async () =>
        expect(
          await context.database.query<{ count: number }>(
            'SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name=$1 AND event_id=$2',
            [ASK_STRUCTURED_CONSUMER, requested.eventId],
          ),
        ).toEqual([{ count: 1 }]),
      { timeout: 10000, interval: 100 },
    );
    expect(await durableEffects(context, recover.runId)).toEqual(recoveredBefore);
    expect((await snapshot(context, recover.runId)).state).toBe('completed');
  }));

test('reverse Ask delivery also progresses with production prefetch set to one', async () =>
  owned(1, async (context) => {
    const a1 = await create(context),
      a2 = await create(context, { ...body, threadId: a1.threadId }),
      a3 = await create(context, { ...body, threadId: a1.threadId }),
      b1 = await create(context);
    await holdRequested(context, [a1, a2, a3, b1]);
    await publish(context, [a3, a2, b1]);
    await context.fixture.up(['worker']);
    await vi.waitFor(
      async () => expect((await snapshot(context, b1.runId)).state).toBe('completed'),
      { timeout: 30000, interval: 100 },
    );
    expect((await snapshot(context, a2.runId)).state).toBe('queued');
    await publish(context, [a1]);
    await vi.waitFor(
      async () => expect((await snapshot(context, a3.runId)).state).toBe('completed'),
      { timeout: 30000, interval: 100 },
    );
    for (const run of [a1, a2, a3])
      expect((await terminalFrames(context, run.runId)).at(-1)?.event).toBe('ask.completed');
  }));

test('queued expiry skips busy threads and atomically rolls back outbox/inbox faults and cancelled SQL', async () =>
  owned(undefined, async (context) => {
    const busy = await create(context),
      unrelated = await create(context);
    await holdRequested(context, [busy, unrelated]);
    const lock = await context.database.leaseClient();
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [`ask:${busy.threadId}`]);
    await preserveCleanup(
      async () => {
        await age(context, busy.runId);
        await age(context, unrelated.runId);
        await vi.waitFor(
          async () => expect((await snapshot(context, unrelated.runId)).state).toBe('expired'),
          { timeout: 10000, interval: 100 },
        );
        expect((await snapshot(context, busy.runId)).state).toBe('queued');
      },
      async () => {
        await lock.query('SELECT pg_advisory_unlock_all()');
        lock.release();
      },
    );
    await vi.waitFor(
      async () => expect((await snapshot(context, busy.runId)).state).toBe('expired'),
      { timeout: 10000, interval: 100 },
    );

    // Stop the autonomous process only while faulting the exact owned aggregate; exercise its
    // actual repository and transaction adapter against the same real PostgreSQL database.
    const faulted = await create(context),
      beforeDeadline = await create(context),
      atDeadline = await create(context, { ...body, threadId: beforeDeadline.threadId });
    await holdRequested(context, [faulted, beforeDeadline, atDeadline]);
    await context.command(['stop', 'api']);
    await age(context, faulted.runId);
    const repository = new PostgresAskRunRepository(
      context.database,
      new PostgresTransactionRunner(context.database),
      new PostgresOutbox(context.database),
    );
    await age(context, beforeDeadline.runId, 119);
    expect(
      await context.database.query<{ before: boolean }>(
        'SELECT queue_expires_at>clock_timestamp() AS before FROM ask.run WHERE id=$1',
        [beforeDeadline.runId],
      ),
    ).toEqual([{ before: true }]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    try {
      const result = await repository.claim(await identity(context, beforeDeadline.runId));
      expect(result.disposition).toBe('claimed');
    } finally {
      vi.useRealTimers();
    }
    // One SQL clock is both the admission observation and exact inclusive deadline.
    expect(
      await context.database.query<{ boundary: boolean }>(
        "WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS at) UPDATE ask.run SET admitted_at=observed.at-interval '120 seconds',queue_expires_at=observed.at FROM observed WHERE id=$1 RETURNING queue_expires_at=observed.at AS boundary",
        [atDeadline.runId],
      ),
    ).toEqual([{ boundary: true }]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    try {
      const terminal = await repository.claim(await identity(context, atDeadline.runId));
      expect(terminal.disposition).toBe('terminal');
      if (terminal.disposition !== 'terminal') throw new Error('Expected inclusive SQL expiry.');
      expect(terminal.run.state).toBe('expired');
      expect(terminal.run.updatedAt.startsWith('2030')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    // Past its lifetime a claimed run is left alone only while that claim is live. Keep the claim
    // live for the whole fault section below, independently of how long the faults take.
    await context.database.query(
      "WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS at) UPDATE ask.run SET admitted_at=observed.at-interval '121 seconds',queue_expires_at=observed.at-interval '1 second',claim_expires_at=observed.at+interval '10 minutes' FROM observed WHERE id=$1 AND state='running'",
      [beforeDeadline.runId],
    );
    expect(
      await context.database.query<{ overdue: boolean }>(
        'SELECT queue_expires_at<=clock_timestamp() AS overdue FROM ask.run WHERE id=$1',
        [beforeDeadline.runId],
      ),
    ).toEqual([{ overdue: true }]);
    expect(
      (
        await context.database.query<{ state: string }>('SELECT state FROM ask.run WHERE id=$1', [
          beforeDeadline.runId,
        ])
      )[0]!.state,
    ).toBe('running');
    for (const table of ['platform.outbox', 'platform.inbox']) {
      const requested = await identity(context, faulted.runId);
      const condition =
        table === 'platform.outbox'
          ? `NEW.aggregate_id='${faulted.runId}'::uuid AND NEW.event_type='ask.run.expired'`
          : `NEW.event_id='${requested.eventId}'::uuid`;
      await context.database.query(
        `CREATE FUNCTION public.delivery_expiry_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'Synthetic owned expiry fault'; END IF; RETURN NEW; END $$`,
      );
      await context.database.query(
        `CREATE TRIGGER delivery_expiry_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.delivery_expiry_fault()`,
      );
      await preserveCleanup(
        async () => {
          await expect(repository.expireQueued(100)).rejects.toMatchObject({ kind: 'unavailable' });
          expect(
            await context.database.query<{
              state: string;
              events: number;
              terminals: number;
              inbox: number;
            }>(
              "SELECT state,(SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1) AS events,(SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.expired') AS terminals,(SELECT count(*)::integer FROM platform.inbox WHERE event_id=$2) AS inbox FROM ask.run WHERE id=$1",
              [faulted.runId, requested.eventId],
            ),
          ).toEqual([{ state: 'queued', events: 1, terminals: 0, inbox: 0 }]);
        },
        async () => {
          await context.database.query(`DROP TRIGGER delivery_expiry_fault ON ${table}`);
          await context.database.query('DROP FUNCTION public.delivery_expiry_fault()');
        },
      );
    }
    const barrier = await context.database.leaseClient();
    await barrier.query('SELECT pg_advisory_lock(6004001)');
    await context.database.query(
      `CREATE FUNCTION public.delivery_expiry_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${faulted.runId}'::uuid AND NEW.state='expired' THEN PERFORM pg_advisory_xact_lock(6004001); END IF; RETURN NEW; END $$`,
    );
    await context.database.query(
      'CREATE TRIGGER delivery_expiry_barrier BEFORE UPDATE ON ask.run FOR EACH ROW EXECUTE FUNCTION public.delivery_expiry_barrier()',
    );
    await preserveCleanup(
      async () => {
        const controller = new AbortController(),
          reason = new Error('Synthetic maintenance shutdown');
        const pending = repository
          .expireQueued(100, controller.signal)
          .catch((error: unknown) => error);
        const blocked = () =>
          context.database.query<{ count: number }>(
            "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE 'UPDATE ask.run SET state=''expired''%'",
          );
        await vi.waitFor(async () => expect((await blocked())[0]!.count).toBe(1), {
          timeout: 5000,
          interval: 50,
        });
        controller.abort(reason);
        expect(await pending).toBe(reason);
        await vi.waitFor(async () => expect((await blocked())[0]!.count).toBe(0), {
          timeout: 7500,
          interval: 50,
        });
      },
      async () => {
        await barrier.query('SELECT pg_advisory_unlock_all()');
        barrier.release();
        await context.database.query('DROP TRIGGER delivery_expiry_barrier ON ask.run');
        await context.database.query('DROP FUNCTION public.delivery_expiry_barrier()');
      },
    );
    expect(
      (
        await context.database.query<{ state: string }>('SELECT state FROM ask.run WHERE id=$1', [
          faulted.runId,
        ])
      )[0]!.state,
    ).toBe('queued');
    expect(await repository.expireQueued(100)).toBe(1);
    expect(await repository.expireQueued(100)).toBe(0);
    expect((await repository.run(beforeDeadline.runId, context.capability))?.state).toBe('running');
    // Once the claim lapses, the overdue run ends as one honest failure instead of staying
    // "running" forever: one terminal frame, one outbox event, one inbox marker, no result.
    await context.database.query(
      "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND state='running'",
      [beforeDeadline.runId],
    );
    expect(await repository.expireQueued(100)).toBe(1);
    expect(await repository.expireQueued(100)).toBe(0);
    const overdue = await repository.run(beforeDeadline.runId, context.capability);
    expect(overdue?.state).toBe('failed');
    expect(overdue?.terminal?.reason).toBe('execution_unavailable');
    expect(overdue?.result).toBeNull();
    expect(overdue?.steps.at(-1)?.phase).toBe('failed');
    expect(
      await context.database.query<{ frames: number; terminals: number; inbox: number }>(
        "SELECT (SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1 AND document->'terminal'='true'::jsonb) AS frames,(SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.failed') AS terminals,(SELECT count(*)::integer FROM platform.inbox WHERE consumer_name=$2 AND event_id=$3) AS inbox",
        [
          beforeDeadline.runId,
          ASK_STRUCTURED_CONSUMER,
          (await identity(context, beforeDeadline.runId)).eventId,
        ],
      ),
    ).toEqual([{ frames: 1, terminals: 1, inbox: 1 }]);
    // Redelivery of the original request finds the terminal and issues no authority.
    expect(
      (await repository.claim(await identity(context, beforeDeadline.runId))).disposition,
    ).toBe('terminal');
    await context.fixture.up(['api']);
    expect((await snapshot(context, faulted.runId)).state).toBe('expired');
    expect((await terminalFrames(context, faulted.runId)).map((frame) => frame.sequence)).toEqual([
      1, 2,
    ]);
  }));

test('five genuine run-scoped failures reach the durable DLQ while other threads progress', async () =>
  owned(undefined, async (context) => {
    const failed = await create(context),
      successor = await create(context, { ...body, threadId: failed.threadId }),
      independent = await create(context);
    await holdRequested(context, [failed, successor, independent]);
    await context.database.query(
      `CREATE FUNCTION public.delivery_executor_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id='${failed.runId}'::uuid THEN RAISE EXCEPTION 'Synthetic owned executor fault'; END IF; RETURN NEW; END $$`,
    );
    await context.database.query(
      'CREATE TRIGGER delivery_executor_fault BEFORE INSERT ON ask.tool_receipt FOR EACH ROW EXECUTE FUNCTION public.delivery_executor_fault()',
    );
    const connection = await amqp.connect(context.rabbitUrl),
      channel = await connection.createChannel();
    const trace = await connection.createChannel(),
      queue = `rei-dlq-trace-${randomUUID()}`;
    await trace.assertQueue(queue, { exclusive: true, autoDelete: true });
    await trace.bindQueue(queue, 'amq.rabbitmq.trace', 'publish.#');
    const requested = await identity(context, failed.runId),
      retries = new Set<number>(),
      deferrals = new Map<number, number>();
    await trace.consume(queue, (message) => {
      if (!message) return;
      const event: unknown = JSON.parse(message.content.toString()),
        properties: unknown = message.properties.headers?.properties;
      if (
        record(event) &&
        event.eventId === requested.eventId &&
        record(properties) &&
        record(properties.headers)
      ) {
        const attempt = properties.headers['x-rei-delivery-attempt'],
          reason = properties.headers['x-rei-dead-letter-reason'];
        if (typeof attempt === 'number' && reason === 'handler-retry') retries.add(attempt);
        if (typeof attempt === 'number' && reason === 'admission-deferred')
          deferrals.set(attempt, (deferrals.get(attempt) ?? 0) + 1);
      }
      trace.ack(message);
    });
    await preserveCleanup(
      async () => {
        await context.command([
          'exec',
          '-T',
          'rabbitmq',
          'rabbitmqctl',
          'trace_on',
          '-p',
          'real-estate-intelligence',
        ]);
        await publish(context, [failed, successor, independent]);
        await context.fixture.up(['worker']);
        await vi.waitFor(
          async () => expect((await snapshot(context, independent.runId)).state).toBe('completed'),
          { timeout: 30000, interval: 100 },
        );
        await vi.waitFor(
          async () => expect((await snapshot(context, failed.runId)).state).toBe('running'),
          { timeout: 30000, interval: 100 },
        );
        // Observe actual handler failures through confirmed transfers before aging the exact
        // failed claim. Never revoke authority while its executor is still performing I/O.
        await vi.waitFor(() => expect(retries.has(2)).toBe(true), {
          timeout: 30000,
          interval: 100,
        });
        await vi.waitFor(() => expect(deferrals.get(2) ?? 0).toBeGreaterThan(5), {
          timeout: 20000,
          interval: 100,
        });
        for (const nextAttempt of [3, 4, 5]) {
          await context.database.query(
            "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND state='running'",
            [failed.runId],
          );
          await vi.waitFor(() => expect(retries.has(nextAttempt)).toBe(true), {
            timeout: 30000,
            interval: 100,
          });
        }
        await context.database.query(
          "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND state='running'",
          [failed.runId],
        );
        await vi.waitFor(
          async () =>
            expect(
              (await channel.checkQueue(`${ASK_STRUCTURED_CONSUMER}.dead-letter`)).messageCount,
            ).toBe(1),
          { timeout: 30000, interval: 100 },
        );
        await context.command(['stop', 'worker']);
        const message = await channel.get(`${ASK_STRUCTURED_CONSUMER}.dead-letter`, {
          noAck: false,
        });
        if (!message) throw new Error('Expected durable owned failed command.');
        expect(JSON.parse(message.content.toString())).toMatchObject({
          eventId: requested.eventId,
          aggregateId: failed.runId,
          type: ASK_RUN_REQUESTED_TYPE,
        });
        expect(message.properties.headers).toMatchObject({
          'x-rei-delivery-attempt': 5,
          'x-rei-dead-letter-reason': 'delivery-limit',
        });
        channel.nack(message, false, true);
        expect((await snapshot(context, failed.runId)).state).toBe('running');
        expect((await snapshot(context, failed.runId)).result).toBeNull();
        expect((await claim(context, successor.runId)).disposition).toBe('busy');
        await age(context, successor.runId);
        await vi.waitFor(
          async () => expect((await snapshot(context, successor.runId)).state).toBe('expired'),
          { timeout: 10000, interval: 100 },
        );
        expect((await snapshot(context, failed.runId)).state).toBe('running');
        expect(
          (
            await context.database.query<{ count: number }>(
              'SELECT count(*)::integer AS count FROM ask.tool_receipt WHERE run_id=$1',
              [failed.runId],
            )
          )[0]!.count,
        ).toBe(0);
        await context.fixture.up(['worker']);
        expect(
          (await channel.checkQueue(`${ASK_STRUCTURED_CONSUMER}.dead-letter`)).messageCount,
        ).toBe(1);
        // The dead letter is still not replayed, but its run no longer stays "running" forever:
        // past the run lifetime and with no live claim, API maintenance ends it as failed.
        await context.database.query(
          "WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS at) UPDATE ask.run SET admitted_at=observed.at-interval '121 seconds',queue_expires_at=observed.at-interval '1 second',claim_expires_at=observed.at-interval '1 second' FROM observed WHERE id=$1 AND state='running'",
          [failed.runId],
        );
        await vi.waitFor(
          async () => expect((await snapshot(context, failed.runId)).state).toBe('failed'),
          { timeout: 10000, interval: 100 },
        );
        const ended = await snapshot(context, failed.runId);
        expect(ended.terminal?.reason).toBe('execution_unavailable');
        expect(ended.result).toBeNull();
        expect((await terminalFrames(context, failed.runId)).at(-1)?.event).toBe('ask.failed');
        expect(
          (await channel.checkQueue(`${ASK_STRUCTURED_CONSUMER}.dead-letter`)).messageCount,
        ).toBe(1);
      },
      () =>
        cleanupAll(
          () => trace.close(),
          () => channel.close(),
          () => connection.close(),
          async () => {
            await context.database.query(
              'DROP TRIGGER delivery_executor_fault ON ask.tool_receipt',
            );
            await context.database.query('DROP FUNCTION public.delivery_executor_fault()');
          },
        ),
    );
  }));
