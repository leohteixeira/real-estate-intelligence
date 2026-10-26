import { randomBytes, randomUUID } from 'node:crypto';
import { execa } from 'execa';
import amqp from 'amqplib';
import { readFile, readdir } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { getContainerRuntimeClient, getReaper } from 'testcontainers';
import {
  parseAskClaim,
  parseAskLiveRun,
  parseAskLiveEvent,
  parseAskRequestedIdentity,
  parseStructuredAskAccepted,
  parseTextAskAccepted,
  parseRunExecutionEvidence,
  parseCheckpointResponse,
  parsePriceToolReceipt,
  type PriceExecutionRequest,
  type StructuredAskCreate,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  PostgresTransactionRunner,
  PostgresGraphCheckpointRepository,
  PostgresAskRunRepository,
  PostgresOutbox,
  askDigest,
  askDispatchProof,
} from '../packages/infrastructure/dist/index.js';
import { PricePerSquareMeterService } from '../packages/application/dist/index.js';
import {
  AskRunRequested,
  ASK_STRUCTURED_CONSUMER,
  ASK_RUN_REQUESTED_TYPE,
} from '../packages/domain/dist/index.js';
import { allocatePorts, ComposeFixture, preserveCleanup, cleanupAll } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';

const secret = () => randomBytes(32).toString('base64url');
const body: StructuredAskCreate = {
  mode: 'structured-price-v1',
  threadId: null,
  placeId: null,
  query: 'Synthetic checkpoint recovery',
  locale: 'en',
  inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
};
type Context = {
  fixture: ComposeFixture;
  database: DatabaseConnection;
  api: string;
  ai: string;
  token: string;
  dispatch: string;
  capability: string;
  command: (args: string[]) => Promise<{ stdout: string; stderr?: string }>;
};
async function owned(work: (context: Context) => Promise<void>, legacy = false) {
  await getReaper(await getContainerRuntimeClient());
  const [postgres, api, ai, rabbit, management, minio, consolePort] = await allocatePorts(7);
  const token = secret(),
    dispatch = secret(),
    capability = secret();
  const fixture = new ComposeFixture(`rei-ask-checkpoints-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    API_PORT: String(api),
    AI_PORT: String(ai),
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    MINIO_API_PORT: String(minio),
    MINIO_CONSOLE_PORT: String(consolePort),
    POSTGRES_USER: 'rei_checkpoints',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_checkpoints',
    RABBITMQ_USER: 'rei_checkpoints',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_checkpoints',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: token,
    ASK_DISPATCH_SECRET: dispatch,
    SNAPSHOT_ENCRYPTION_KEY_ID: 'checkpoint-fixture-v1',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  const inventory = async () => ({
    containers: (await execa('docker', ['ps', '--all', '--format', '{{.ID}}'])).stdout
      .split('\n')
      .filter(Boolean)
      .sort(),
    volumes: (await execa('docker', ['volume', 'ls', '--format', '{{.Name}}'])).stdout
      .split('\n')
      .filter(Boolean)
      .sort(),
  });
  const foreign = await inventory();
  // Compare stable resource metadata, never container environment or volume contents.
  const foreignMetadata = async () => ({
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
            '{{.Name}} {{.Driver}} {{.Mountpoint}} {{json .Labels}} {{.Scope}}',
            ...foreign.volumes,
          ])
        ).stdout
      : '',
  });
  const foreignBefore = await foreignMetadata();
  let database: DatabaseConnection | undefined;
  await preserveCleanup(
    async () => {
      await fixture.up(
        legacy
          ? ['postgres']
          : ['--build', 'postgres', 'migrations', 'api', 'ai', 'rabbitmq', 'minio'],
      );
      const url = new URL(`postgres://127.0.0.1:${postgres}/rei_checkpoints`);
      url.username = fixture.environment.POSTGRES_USER!;
      url.password = fixture.environment.POSTGRES_PASSWORD!;
      database = new DatabaseConnection(url.toString());
      const command = (args: string[]) =>
        fixture.execute(
          'docker',
          ['compose', '--file', 'compose.yaml', '--project-name', fixture.project, ...args],
          { env: fixture.environment, timeout: 240000 },
        );
      if (!legacy) await command(['build', 'worker']);
      await work({
        fixture,
        database,
        api: `http://127.0.0.1:${api}`,
        ai: `http://127.0.0.1:${ai}`,
        token,
        dispatch,
        capability,
        command,
      });
    },
    () =>
      cleanupAll(
        async () => {
          await captureAskDiagnostics(fixture, database);
        },
        async () => database?.close(),
        () => fixture.down(),
        async () => {
          const after = await inventory();
          expect(after.containers).toEqual(expect.arrayContaining(foreign.containers));
          expect(after.volumes).toEqual(expect.arrayContaining(foreign.volumes));
          expect(await foreignMetadata()).toEqual(foreignBefore);
          expect(
            (
              await execa('docker', [
                'ps',
                '--all',
                '--filter',
                `label=com.docker.compose.project=${fixture.project}`,
                '--format',
                '{{.ID}}',
              ])
            ).stdout,
          ).toBe('');
          expect(
            (
              await execa('docker', [
                'volume',
                'ls',
                '--filter',
                `label=com.docker.compose.project=${fixture.project}`,
                '--format',
                '{{.Name}}',
              ])
            ).stdout,
          ).toBe('');
        },
      ),
  );
}
async function create(context: Context, request: object = body) {
  const response = await requestHttp(`${context.api}/api/v1/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${context.capability}`, 'Idempotency-Key': secret() },
    body: request,
  });
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
async function claim(context: Context, runId: string): Promise<PriceExecutionRequest> {
  const rows = await context.database.query<{ event_id: string; thread_id: string }>(
    'SELECT requested_event_id::text AS event_id,thread_id::text FROM ask.run WHERE id=$1',
    [runId],
  );
  const identity = parseAskRequestedIdentity({
    version: 1,
    eventId: rows[0]!.event_id,
    runId,
    threadId: rows[0]!.thread_id,
  });
  const response = await requestHttp(`${context.api}/api/v1/internal/ask/runs/${runId}/claim`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${askDispatchProof(context.dispatch, identity)}` },
    body: identity,
  });
  expect(response.status).toBe(200);
  const result = parseAskClaim(await response.json());
  if (result.disposition !== 'claimed') throw new Error('Price claim required.');
  return result.input;
}
async function expire(context: Context, runId: string) {
  await context.database.query(
    "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [runId],
  );
}
async function complete(context: Context, evidence: ReturnType<typeof parseRunExecutionEvidence>) {
  if (evidence.step === 'foundation') throw new Error('Price evidence required.');
  const response = await requestHttp(
    `${context.api}/api/v1/internal/ask/runs/${evidence.runId}/complete`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${askDispatchProof(context.dispatch, evidence)}` },
      body: {
        version: 1,
        eventId: evidence.eventId,
        runId: evidence.runId,
        threadId: evidence.threadId,
        executionId: evidence.executionId,
        evidence,
        failure: null,
      },
    },
  );
  expect(response.status).toBe(200);
}
async function probe(context: Context, input: PriceExecutionRequest, mode: 'pause' | 'resume') {
  const result = await execa(
    'node',
    ['integration/fixtures/ask-checkpoint-resume-probe.ts', mode],
    {
      input: JSON.stringify(input),
      env: { ASK_CHECKPOINT_FIXTURE_API: context.api },
      timeout: 20000,
      maxBuffer: 131072,
    },
  );
  return JSON.parse(result.stdout) as unknown;
}

test.each(['api', 'worker', 'ai'] as const)(
  'committed decision survives real %s SIGKILL with one receipt and terminal SSE',
  async (service) =>
    owned(async (context) => {
      const barrier = await context.database.leaseClient();
      await barrier.query('SELECT pg_advisory_lock(6003001)');
      await context.database.query(
        'CREATE FUNCTION public.checkpoint_tool_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(6003001); RETURN NEW; END $$',
      );
      await context.database.query(
        'CREATE TRIGGER checkpoint_tool_barrier BEFORE INSERT ON ask.tool_receipt FOR EACH ROW EXECUTE FUNCTION public.checkpoint_tool_barrier()',
      );
      await preserveCleanup(
        async () => {
          await context.fixture.up(['worker']);
          const accepted = await create(context);
          await vi.waitFor(
            async () => {
              const rows = await context.database.query<{ count: number }>(
                `SELECT count(*)::integer AS count FROM ask.graph_checkpoint WHERE run_id=$1 AND convert_from(checkpoint_bytes,'UTF8')::jsonb #> '{channel_values,visitedNodes}'='["fixedDecision"]'::jsonb`,
                [accepted.runId],
              );
              expect(rows[0]!.count).toBe(1);
              const waiting = await context.database.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE 'INSERT INTO ask.tool_receipt%'",
              );
              expect(waiting[0]!.count).toBeGreaterThan(0);
            },
            { timeout: 30000, interval: 100 },
          );
          const identityBefore = await context.database.query<{
            requested_event_id: string;
            request_fingerprint: string;
            execution_id: string;
          }>(
            'SELECT requested_event_id::text,request_fingerprint,execution_id::text FROM ask.run WHERE id=$1',
            [accepted.runId],
          );
          const target = await context.fixture.execute(
            'docker',
            [
              'ps',
              '--all',
              '--filter',
              `label=com.docker.compose.project=${context.fixture.project}`,
              '--filter',
              `label=com.docker.compose.service=${service}`,
              '--format',
              '{{.ID}}',
            ],
            { timeout: 10000 },
          );
          expect(target.stdout).toMatch(/^[0-9a-f]{12,64}$/);
          // The API's offline HTTP interval cannot be fenced with a PostgreSQL lock.
          // Resolve ownership before signaling, then start precisely that container promptly.
          const recoveryFence =
            service === 'api'
              ? undefined
              : barrier.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [
                  `ask:${accepted.threadId}`,
                ]);
          const restartStartedAt = Date.now();
          await context.fixture.execute('docker', ['kill', '--signal', 'KILL', target.stdout], {
            timeout: 10000,
          });
          const restart = async () => {
            await Promise.all([
              context.fixture.execute('docker', ['start', target.stdout], { timeout: 10000 }),
              expire(context, accepted.runId),
            ]);
            await recoveryFence;
            if (service === 'api') await barrier.query('SELECT pg_advisory_unlock(6003001)');
            await vi.waitFor(
              async () => {
                expect((await requestHttp(`${context.api}/ready`)).status).toBe(200);
                expect((await requestHttp(`${context.ai}/health`)).status).toBe(200);
              },
              { timeout: 30000, interval: 100 },
            );
            process.stderr.write(
              `${JSON.stringify({
                checkpointRestart: {
                  service,
                  killToReadyMs: Date.now() - restartStartedAt,
                },
              })}\n`,
            );
            if (service !== 'api') {
              await barrier.query('SELECT pg_advisory_unlock(6003001)');
              await barrier.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
                `ask:${accepted.threadId}`,
              ]);
            }
          };
          if (service === 'api') {
            // ADR 0025/0026 bounds genuine outage retries. Observe exhaustion, then explicitly
            // recover the same retained message; do not assume API boot fits that finite budget.
            const url = new URL('amqp://127.0.0.1/real-estate-intelligence');
            url.port = context.fixture.environment.RABBITMQ_PORT!;
            url.username = context.fixture.environment.RABBITMQ_USER!;
            url.password = context.fixture.environment.RABBITMQ_PASSWORD!;
            const connection = await amqp.connect(url.toString());
            await preserveCleanup(
              async () => {
                const channel = await connection.createConfirmChannel();
                await preserveCleanup(
                  async () => {
                    const deadLetter = `${ASK_STRUCTURED_CONSUMER}.dead-letter`;
                    await vi.waitFor(
                      async () =>
                        expect((await channel.checkQueue(deadLetter)).messageCount).toBe(1),
                      { timeout: 30000, interval: 100 },
                    );
                    const message = await channel.get(deadLetter, { noAck: false });
                    if (!message) throw new Error('Expected original bounded-outage message.');
                    expect(JSON.parse(message.content.toString())).toMatchObject({
                      eventId: identityBefore[0]!.requested_event_id,
                      aggregateId: accepted.runId,
                      type: ASK_RUN_REQUESTED_TYPE,
                      payload: { runId: accepted.runId, threadId: accepted.threadId },
                    });
                    expect(message.properties.headers).toMatchObject({
                      'x-rei-delivery-attempt': 5,
                      'x-rei-dead-letter-reason': 'delivery-limit',
                    });
                    expect(
                      await context.database.query<{ state: string; receipts: number }>(
                        'SELECT state,(SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS receipts FROM ask.run WHERE id=$1',
                        [accepted.runId],
                      ),
                    ).toEqual([{ state: 'running', receipts: 0 }]);
                    await restart();
                    let returned = false;
                    channel.on('return', () => {
                      returned = true;
                    });
                    channel.publish('', ASK_STRUCTURED_CONSUMER, message.content, {
                      ...message.properties,
                      mandatory: true,
                      persistent: true,
                    });
                    await channel.waitForConfirms();
                    expect(returned).toBe(false);
                    channel.ack(message);
                    expect((await channel.checkQueue(deadLetter)).messageCount).toBe(0);
                    process.stderr.write(
                      `${JSON.stringify({ checkpointOperatorRecovery: { service, attempt: 5 } })}\n`,
                    );
                  },
                  () => channel.close(),
                );
              },
              () => connection.close(),
            );
          } else {
            await restart();
          }
          await vi.waitFor(
            async () => expect((await snapshot(context, accepted.runId)).state).toBe('completed'),
            { timeout: 90000, interval: 200 },
          );
          const run = await snapshot(context, accepted.runId);
          expect(run.threadId).toBe(accepted.threadId);
          if (run.result?.kind !== 'price_per_square_meter')
            throw new Error('Expected price result.');
          expect(run.result.minorUnits).toBe(1154412);
          const identityAfter = await context.database.query<{
            requested_event_id: string;
            request_fingerprint: string;
            execution_id: string;
            receipt_execution_id: string;
          }>(
            "SELECT requested_event_id::text,request_fingerprint,execution_id::text,(SELECT document->>'executionId' FROM ask.tool_receipt WHERE run_id=$1) AS receipt_execution_id FROM ask.run WHERE id=$1",
            [accepted.runId],
          );
          expect(identityAfter[0]!.requested_event_id).toBe(identityBefore[0]!.requested_event_id);
          expect(identityAfter[0]!.request_fingerprint).toBe(
            identityBefore[0]!.request_fingerprint,
          );
          expect(identityAfter[0]!.execution_id).not.toBe(identityBefore[0]!.execution_id);
          expect(identityAfter[0]!.receipt_execution_id).toBe(identityAfter[0]!.execution_id);
          const rows = await context.database.query<{
            receipts: number;
            terminal: number;
            inbox: number;
            decisions: number;
            outbox: number;
          }>(
            `SELECT (SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS receipts,(SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1 AND document->>'event'='ask.completed') AS terminal,(SELECT count(*)::integer FROM platform.inbox WHERE event_id=(SELECT requested_event_id FROM ask.run WHERE id=$1) AND consumer_name='ask.structured-run') AS inbox,(SELECT count(*)::integer FROM ask.graph_checkpoint WHERE run_id=$1 AND convert_from(checkpoint_bytes,'UTF8')::jsonb #> '{channel_values,visitedNodes}'='["fixedDecision"]'::jsonb) AS decisions,(SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.completed') AS outbox`,
            [run.id],
          );
          expect(rows).toEqual([{ receipts: 1, terminal: 1, inbox: 1, decisions: 1, outbox: 1 }]);
          const response = await requestHttp(`${context.api}/api/v1/runs/${run.id}/events`, {
            headers: { Authorization: `Bearer ${context.capability}` },
          });
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toContain('text/event-stream');
          const frames = (await response.text())
            .split(/\r?\n\r?\n/)
            .filter((item) => item.split(/\r?\n/).some((line) => line.startsWith('data:')))
            .map((item) => {
              const lines = item.split(/\r?\n/),
                frame = parseAskLiveEvent(
                  JSON.parse(lines.find((line) => line.startsWith('data:'))!.slice(5)),
                );
              expect(
                lines
                  .find((line) => line.startsWith('id:'))
                  ?.slice(3)
                  .trim(),
              ).toBe(frame.id);
              return frame;
            });
          expect(frames.map((frame) => frame.sequence)).toEqual([1, 2, 3]);
          expect(frames.map((frame) => frame.event)).toEqual([
            'ask.progress',
            'ask.progress',
            'ask.completed',
          ]);
          expect(frames.at(-1)?.run).toEqual(run);
          const logs = await context.command(['logs', '--no-color', 'api', 'worker', 'ai']);
          for (const value of [body.query, context.token, context.dispatch, context.capability])
            expect(`${logs.stdout}\n${logs.stderr ?? ''}`.includes(value)).toBe(false);
        },
        () =>
          cleanupAll(
            async () => {
              await barrier.query('SELECT pg_advisory_unlock_all()');
              barrier.release();
            },
            async () =>
              context.database.query('DROP TRIGGER checkpoint_tool_barrier ON ask.tool_receipt'),
            async () => context.database.query('DROP FUNCTION public.checkpoint_tool_barrier()'),
          ),
      );
    }),
);

test('real checkpoint RPC fences scope, concurrent forks, rollback and disconnected SQL', async () =>
  owned(async (context) => {
    const accepted = await create(context),
      input = await claim(context, accepted.runId);
    const address = {
      version: 1 as const,
      eventId: input.eventId,
      runId: input.runId,
      threadId: input.threadId,
      executionId: input.executionId,
      graphVersion: 'price-v1' as const,
      namespace: '',
    };
    const rpc = (request: object, grant = input.checkpointGrant, signal?: AbortSignal) =>
      requestHttp(`${context.api}/api/v1/ask/runs/${input.runId}/checkpoints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${grant}` },
        body: request,
        ...(signal ? { signal } : {}),
      });
    const checkpointId = '0199bd4a-1111-7111-8111-111111111110';
    const root = {
      ...address,
      operation: 'put' as const,
      checkpointId,
      parentId: null,
      checkpoint: { type: 'json' as const, base64: 'e30=' },
      metadata: { type: 'json' as const, base64: 'e30=' },
    };
    expect((await rpc(root)).status).toBe(200);
    const children = await Promise.all(
      ['0199bd4a-1111-7111-8111-111111111111', '0199bd4a-1111-7111-8111-111111111112'].map((id) =>
        rpc({ ...root, checkpointId: id, parentId: checkpointId }),
      ),
    );
    expect(children.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(
      (
        await rpc({
          ...root,
          checkpointId: '0199bd4a-1111-7111-8111-111111111113',
          parentId: checkpointId,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await rpc({
          ...address,
          operation: 'get',
          checkpointId: '0199bd4a-1111-7111-8111-111111111114',
        })
      ).status,
    ).toBe(403);
    const listed = parseCheckpointResponse(
      await (await rpc({ ...address, operation: 'list', beforeId: null, limit: 20 })).json(),
    );
    if (listed.operation !== 'list') throw new Error('List required.');
    expect(listed.records).toHaveLength(2);
    const previous = parseCheckpointResponse(
      await (
        await rpc({
          ...address,
          operation: 'list',
          beforeId: listed.records[0]!.checkpointId,
          limit: 1,
        })
      ).json(),
    );
    if (previous.operation !== 'list') throw new Error('List required.');
    expect(previous.records.map((record) => record.checkpointId)).toEqual([checkpointId]);
    // Sequence is bigint in PostgreSQL but text on the wire. Cross 9 -> 10 explicitly:
    // sorting the projected sequence::text used to select an older head and reject lineage.
    const chain: string[] = [listed.records[0]!.checkpointId, checkpointId];
    for (let index = 20; index < 30; index++) {
      const nextId = `0199bd4a-1111-7111-8111-${String(index).padStart(12, '0')}`;
      expect((await rpc({ ...root, checkpointId: nextId, parentId: chain[0] })).status).toBe(200);
      chain.unshift(nextId);
    }
    const numericSequences = await context.database.query<{ sequence: number }>(
      'SELECT sequence::integer FROM ask.graph_checkpoint WHERE run_id=$1 ORDER BY ask.graph_checkpoint.sequence',
      [input.runId],
    );
    expect(numericSequences.map((row) => row.sequence)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    const newest = parseCheckpointResponse(
      await (await rpc({ ...address, operation: 'get', checkpointId: null })).json(),
    );
    if (newest.operation !== 'get' || !newest.record) throw new Error('Newest tuple required.');
    expect(newest.record.checkpointId).toBe(chain[0]);
    const numericList = parseCheckpointResponse(
      await (await rpc({ ...address, operation: 'list', beforeId: null, limit: 20 })).json(),
    );
    if (numericList.operation !== 'list') throw new Error('Numeric list required.');
    expect(numericList.records.map((record) => record.checkpointId)).toEqual(chain);
    const numericPage = parseCheckpointResponse(
      await (await rpc({ ...address, operation: 'list', beforeId: chain[0], limit: 3 })).json(),
    );
    if (numericPage.operation !== 'list') throw new Error('Numeric page required.');
    expect(numericPage.records.map((record) => record.checkpointId)).toEqual(chain.slice(1, 4));
    const writes = {
      ...address,
      operation: 'put-writes' as const,
      checkpointId,
      taskId: 'fixture',
      writes: [{ index: 0, channel: 'input', value: { type: 'json' as const, base64: 'e30=' } }],
    };
    expect((await rpc(writes)).status).toBe(200);
    expect(
      (
        await rpc({
          ...writes,
          writes: [
            { index: 1, channel: 'input', value: { type: 'json', base64: 'e30=' } },
            { index: 0, channel: 'input', value: { type: 'json', base64: 'W10=' } },
          ],
        })
      ).status,
    ).toBe(409);
    const retained = parseCheckpointResponse(
      await (await rpc({ ...address, operation: 'get', checkpointId })).json(),
    );
    if (retained.operation !== 'get' || !retained.record) throw new Error('Tuple required.');
    expect(retained.record.pendingWrites.map((write) => write.index)).toEqual([0]);
    for (const base64 of ['e30=', 'W10='])
      expect(
        (
          await rpc({
            ...writes,
            writes: [{ index: -1, channel: '__error__', value: { type: 'json', base64 } }],
          })
        ).status,
      ).toBe(200);
    const oversized = { type: 'bytes', base64: Buffer.alloc(256 * 1024).toString('base64') };
    for (let index = 2; index < 4; index++)
      expect(
        (await rpc({ ...writes, writes: [{ index, channel: 'input', value: oversized }] })).status,
      ).toBe(200);
    expect(
      (await rpc({ ...writes, writes: [{ index: 4, channel: 'input', value: oversized }] })).status,
    ).toBe(400);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.graph_pending_write WHERE run_id=$1 AND write_index=4',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
    const other = await create(context),
      otherInput = await claim(context, other.runId);
    expect(
      (await rpc({ ...address, operation: 'get', checkpointId: null }, otherInput.checkpointGrant))
        .status,
    ).toBe(403);
    expect(
      (await rpc({ ...address, threadId: other.threadId, operation: 'get', checkpointId: null }))
        .status,
    ).toBe(403);
    const crossRun = await requestHttp(
      `${context.api}/api/v1/ask/runs/${other.runId}/checkpoints`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.checkpointGrant}` },
        body: {
          ...address,
          eventId: otherInput.eventId,
          runId: other.runId,
          threadId: other.threadId,
          executionId: otherInput.executionId,
          operation: 'get',
          checkpointId: null,
        },
      },
    );
    expect(crossRun.status).toBe(403);
    const lock = await context.database.leaseClient();
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [`ask:${input.threadId}`]);
    await preserveCleanup(
      async () => {
        const controller = new AbortController();
        const pending = rpc(
          { ...root, namespace: 'cancelled' },
          input.checkpointGrant,
          controller.signal,
        ).then(
          () => false,
          () => true,
        );
        const blocked = () =>
          context.database.query<{ count: number }>(
            "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE 'SELECT pg_advisory_xact_lock(hashtextextended%'",
          );
        await vi.waitFor(async () => expect((await blocked())[0]!.count).toBe(1), {
          timeout: 5000,
          interval: 50,
        });
        controller.abort(new Error('Synthetic disconnect.'));
        expect(await pending).toBe(true);
        // Destroying pg's socket aborts the transaction, but a PostgreSQL lock-wait may
        // observe that socket only when its unchanged 5-second statement bound expires.
        // Assert actual backend disappearance before releasing the lock, not HTTP abort alone.
        await vi.waitFor(async () => expect((await blocked())[0]!.count).toBe(0), {
          timeout: 7500,
          interval: 50,
        });
      },
      () =>
        cleanupAll(async () => {
          await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [
            `ask:${input.threadId}`,
          ]);
          lock.release();
        }),
    );
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.graph_checkpoint WHERE run_id=$1 AND namespace=$2',
        [input.runId, 'cancelled'],
      ),
    ).toEqual([{ count: 0 }]);
    // At the fixed 30-day boundary, even an otherwise current claim cannot read/reset lineage.
    await context.database.query(
      "WITH instant AS (SELECT clock_timestamp()-interval '30 days' AS at) UPDATE ask.run SET graph_started_at=instant.at,graph_expires_at=instant.at+interval '30 days' FROM instant WHERE id=$1",
      [input.runId],
    );
    expect((await rpc({ ...address, operation: 'get', checkpointId: null })).status).toBe(403);
    const broken = await create(context),
      brokenInput = await claim(context, broken.runId);
    await probe(context, brokenInput, 'pause');
    await context.database.query(
      "UPDATE ask.graph_checkpoint SET checkpoint_bytes=convert_to('{}','UTF8') WHERE run_id=$1 AND sequence=(SELECT max(sequence) FROM ask.graph_checkpoint WHERE run_id=$1)",
      [broken.runId],
    );
    const rejected = await requestHttp(`${context.ai}/internal/v1/runs/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${context.token}` },
      body: brokenInput,
    });
    expect(rejected.status).toBe(400);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.tool_receipt WHERE run_id=$1',
        [broken.runId],
      ),
    ).toEqual([{ count: 0 }]);
    expect((await snapshot(context, broken.runId)).result).toBeNull();
  }));

test('fresh Node saver pause/reclaim, scoped replay and fixed-horizon retention preserve business history', async () =>
  owned(async (context) => {
    const accepted = await create(context),
      input = await claim(context, accepted.runId);
    const address = {
      version: 1 as const,
      eventId: input.eventId,
      runId: input.runId,
      threadId: input.threadId,
      executionId: input.executionId,
      graphVersion: 'price-v1' as const,
      namespace: '',
    };
    const rpc = (request: object, grant = input.checkpointGrant) =>
      requestHttp(`${context.api}/api/v1/ask/runs/${input.runId}/checkpoints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${grant}` },
        body: request,
      });
    const get = { ...address, operation: 'get', checkpointId: null };
    expect(parseCheckpointResponse(await (await rpc(get)).json())).toEqual({
      operation: 'get',
      record: null,
    });
    for (const grant of [input.toolGrant, context.capability, context.dispatch])
      expect((await rpc(get, grant)).status).toBe(403);
    expect(
      (
        await requestHttp(
          `${context.api}/api/v1/ask/runs/${input.runId}/tools/price-per-square-meter`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${input.checkpointGrant}` },
            body: {
              version: 1,
              eventId: input.eventId,
              runId: input.runId,
              threadId: input.threadId,
              executionId: input.executionId,
              operation: 'price-per-square-meter',
              inputs: input.inputs,
            },
          },
        )
      ).status,
    ).toBe(403);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.tool_receipt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
    expect(await probe(context, input, 'pause')).toEqual({
      next: ['priceTool'],
      visitedNodes: ['fixedDecision'],
    });
    const saved = parseCheckpointResponse(await (await rpc(get)).json());
    if (saved.operation !== 'get' || !saved.record) throw new Error('Saved tuple required.');
    expect((await rpc({ ...get, runId: '0199bd4a-1111-7111-8111-111111111111' })).status).toBe(400);
    const scoped = {
      ...address,
      namespace: 'fixture',
      operation: 'put' as const,
      checkpointId: saved.record.checkpointId,
      parentId: null,
      checkpoint: { type: 'json' as const, base64: 'e30=' },
      metadata: { type: 'json' as const, base64: 'e30=' },
    };
    expect((await rpc(scoped)).status).toBe(200);
    expect((await rpc(scoped)).status).toBe(200);
    expect((await rpc({ ...scoped, checkpoint: { type: 'json', base64: 'W10=' } })).status).toBe(
      409,
    );
    const writes = {
      ...address,
      namespace: 'fixture',
      operation: 'put-writes' as const,
      checkpointId: scoped.checkpointId,
      taskId: 'task',
      writes: [{ index: 0, channel: 'input', value: { type: 'json', base64: 'e30=' } }],
    };
    expect((await rpc(writes)).status).toBe(200);
    expect((await rpc(writes)).status).toBe(200);
    expect(
      (
        await rpc({
          ...writes,
          writes: [{ index: 0, channel: 'input', value: { type: 'json', base64: 'W10=' } }],
        })
      ).status,
    ).toBe(409);
    await context.command(['restart', 'api', 'ai']);
    await vi.waitFor(
      async () => expect((await requestHttp(`${context.api}/ready`)).status).toBe(200),
      { timeout: 30000, interval: 100 },
    );
    await expire(context, input.runId);
    const replacement = await claim(context, input.runId);
    expect(replacement.checkpointGrant).not.toBe(input.checkpointGrant);
    expect(replacement.toolGrant).not.toBe(input.toolGrant);
    expect((await rpc(get)).status).toBe(403);
    const firstEvidence = parseRunExecutionEvidence(await probe(context, replacement, 'resume'));
    if (firstEvidence.step === 'routed-text-v1') throw new Error('Historical evidence required.');
    expect(firstEvidence.visitedNodes).toEqual(['fixedDecision', 'priceTool']);
    await expire(context, input.runId);
    const finalClaim = await claim(context, input.runId);
    const evidence = parseRunExecutionEvidence(await probe(context, finalClaim, 'resume'));
    if (
      firstEvidence.step === 'foundation' ||
      evidence.step === 'foundation' ||
      evidence.step === 'routed-text-v1'
    )
      throw new Error('Price evidence required.');
    expect(evidence.receipt.receiptId).toBe(firstEvidence.receipt.receiptId);
    expect(evidence.receipt.result).toEqual(firstEvidence.receipt.result);
    expect(evidence.receipt.executionId).toBe(finalClaim.executionId);
    await complete(context, evidence);
    const gap = await create(context),
      gapInput = await claim(context, gap.runId);
    await context.database.query(
      "CREATE FUNCTION public.checkpoint_effect_gap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF convert_from(NEW.checkpoint_bytes,'UTF8')::jsonb #> '{channel_values,receipt}' IS NOT NULL THEN RAISE EXCEPTION 'synthetic_checkpoint_gap'; END IF; RETURN NEW; END $$",
    );
    await context.database.query(
      'CREATE TRIGGER checkpoint_effect_gap BEFORE INSERT ON ask.graph_checkpoint FOR EACH ROW EXECUTE FUNCTION public.checkpoint_effect_gap()',
    );
    await preserveCleanup(
      async () => {
        const response = await requestHttp(`${context.ai}/internal/v1/runs/execute`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${context.token}` },
          body: gapInput,
        });
        expect(response.status).toBe(503);
        expect(
          await context.database.query<{ count: number }>(
            'SELECT count(*)::integer AS count FROM ask.tool_receipt WHERE run_id=$1',
            [gap.runId],
          ),
        ).toEqual([{ count: 1 }]);
        expect((await snapshot(context, gap.runId)).terminal).toBeNull();
      },
      () =>
        cleanupAll(
          async () =>
            context.database.query('DROP TRIGGER checkpoint_effect_gap ON ask.graph_checkpoint'),
          async () => context.database.query('DROP FUNCTION public.checkpoint_effect_gap()'),
        ),
    );
    await expire(context, gap.runId);
    const gapReplacement = await claim(context, gap.runId);
    const gapEvidence = parseRunExecutionEvidence(await probe(context, gapReplacement, 'resume'));
    if (gapEvidence.step === 'routed-text-v1') throw new Error('Historical evidence required.');
    expect(gapEvidence.visitedNodes).toEqual(['fixedDecision', 'priceTool']);
    await complete(context, gapEvidence);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.tool_receipt WHERE run_id=$1',
        [gap.runId],
      ),
    ).toEqual([{ count: 1 }]);
    const before = await context.database.query<{ run: string; events: string; receipts: string }>(
      "SELECT md5(document::text) AS run,(SELECT md5(string_agg(document::text,',' ORDER BY id)) FROM ask.run_event WHERE run_id=$1) AS events,(SELECT md5(string_agg(document::text,',' ORDER BY id)) FROM ask.tool_receipt WHERE run_id=$1) AS receipts FROM ask.run WHERE id=$1",
      [input.runId],
    );
    await context.database.query(
      "WITH instant AS (SELECT clock_timestamp()-interval '30 days 1 second' AS at) UPDATE ask.run SET graph_started_at=instant.at,graph_expires_at=instant.at+interval '30 days' FROM instant WHERE id=$1",
      [input.runId],
    );
    const repository = new PostgresGraphCheckpointRepository(
      context.database,
      new PostgresTransactionRunner(context.database),
    );
    const waitForPruned = async (runId: string) =>
      vi.waitFor(
        async () => {
          expect(
            await context.database.query<{ pruned: boolean }>(
              'SELECT graph_pruned_at IS NOT NULL AS pruned FROM ask.run WHERE id=$1',
              [runId],
            ),
          ).toEqual([{ pruned: true }]);
        },
        { timeout: 75000, interval: 200 },
      );
    // The production API owns the unchanged 60-second job. Observe its persisted result
    // rather than adding an HTTP pruning seam or substituting a manually invoked job.
    await waitForPruned(input.runId);
    expect(await repository.prune(50, AbortSignal.timeout(5000))).toBe(0);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.graph_checkpoint WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
    expect(
      await context.database.query<{ run: string; events: string; receipts: string }>(
        "SELECT md5(document::text) AS run,(SELECT md5(string_agg(document::text,',' ORDER BY id)) FROM ask.run_event WHERE run_id=$1) AS events,(SELECT md5(string_agg(document::text,',' ORDER BY id)) FROM ask.tool_receipt WHERE run_id=$1) AS receipts FROM ask.run WHERE id=$1",
        [input.runId],
      ),
    ).toEqual(before);
    const long = await create(context, { ...body, query: '\\"'.repeat(8000) });
    const longInput = await claim(context, long.runId);
    await complete(context, parseRunExecutionEvidence(await probe(context, longInput, 'resume')));
    const textResponse = await requestHttp(`${context.api}/api/v1/runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${context.capability}`, 'Idempotency-Key': secret() },
      body: {
        mode: 'text-price-v1',
        threadId: long.threadId,
        placeId: null,
        locale: 'en',
        query:
          'What is the price per square meter for BRL 785,000.00 and 68 square meters? ' +
          '🌇'.repeat(7000),
      },
    });
    expect(textResponse.status).toBe(202);
    const text = parseTextAskAccepted(await textResponse.json());
    const textInput = await claim(context, text.runId);
    await complete(context, parseRunExecutionEvidence(await probe(context, textInput, 'resume')));
    expect(text.threadId).toBe(long.threadId);
    const decoded = await context.database.query<{ value: string }>(
      "SELECT convert_from(checkpoint_bytes,'UTF8') || convert_from(metadata_bytes,'UTF8') AS value FROM ask.graph_checkpoint UNION ALL SELECT convert_from(value_bytes,'UTF8') AS value FROM ask.graph_pending_write",
    );
    const serialized = decoded.map((row) => row.value).join('');
    const logs = await context.command(['logs', '--no-color', 'api', 'ai']);
    for (const value of [
      input.toolGrant,
      input.checkpointGrant,
      replacement.toolGrant,
      replacement.checkpointGrant,
      finalClaim.toolGrant,
      finalClaim.checkpointGrant,
      textInput.toolGrant,
      textInput.checkpointGrant,
    ]) {
      expect(serialized.includes(value)).toBe(false);
      expect(`${logs.stdout}\n${logs.stderr ?? ''}`.includes(value)).toBe(false);
    }
    const active = await create(context),
      activeInput = await claim(context, active.runId);
    await probe(context, activeInput, 'pause');
    const activeRows = await context.database.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM ask.graph_checkpoint WHERE run_id=$1',
      [active.runId],
    );
    for (let turn = 0; turn < 9; turn++) {
      const acceptedTurn = await create(context, {
        ...body,
        threadId: input.threadId,
        query: `Retained terminal turn ${turn}`,
      });
      if (turn === 8) {
        await context.database.query(
          "WITH observed AS MATERIALIZED (SELECT clock_timestamp()-interval '121 seconds' AS at) UPDATE ask.run SET admitted_at=observed.at,queue_expires_at=observed.at+interval '120 seconds' FROM observed WHERE id=$1",
          [acceptedTurn.runId],
        );
        await vi.waitFor(
          async () => expect((await snapshot(context, acceptedTurn.runId)).state).toBe('expired'),
          { timeout: 10000, interval: 100 },
        );
      } else {
        const turnInput = await claim(context, acceptedTurn.runId);
        await complete(
          context,
          parseRunExecutionEvidence(await probe(context, turnInput, 'resume')),
        );
      }
      if (turn === 7) expect(await repository.prune(50, AbortSignal.timeout(5000))).toBe(0);
    }
    await vi.waitFor(
      async () =>
        expect(
          await context.database.query<{ count: number }>(
            'SELECT count(DISTINCT c.run_id)::integer AS count FROM ask.graph_checkpoint c JOIN ask.run r ON r.id=c.run_id WHERE r.thread_id=$1',
            [input.threadId],
          ),
        ).toEqual([{ count: 7 }]),
      { timeout: 75000, interval: 200 },
    );
    expect(await repository.prune(50, AbortSignal.timeout(5000))).toBe(0);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(DISTINCT c.run_id)::integer AS count FROM ask.graph_checkpoint c JOIN ask.run r ON r.id=c.run_id WHERE r.thread_id=$1',
        [input.threadId],
      ),
    ).toEqual([{ count: 7 }]);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.graph_checkpoint WHERE run_id=$1',
        [active.runId],
      ),
    ).toEqual(activeRows);
    await context.database.query(
      "WITH instant AS (SELECT clock_timestamp()-interval '30 days 1 second' AS at) UPDATE ask.run SET graph_started_at=instant.at,graph_expires_at=instant.at+interval '30 days' FROM instant WHERE id=$1",
      [active.runId],
    );
    await waitForPruned(active.runId);
    expect(await repository.prune(50, AbortSignal.timeout(5000))).toBe(0);
    await expire(context, active.runId);
    const prunedClaim = await claim(context, active.runId);
    const prunedRead = await requestHttp(
      `${context.api}/api/v1/ask/runs/${active.runId}/checkpoints`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${prunedClaim.checkpointGrant}` },
        body: {
          ...address,
          eventId: prunedClaim.eventId,
          runId: active.runId,
          threadId: active.threadId,
          executionId: prunedClaim.executionId,
          operation: 'get',
          checkpointId: null,
        },
      },
    );
    expect(prunedRead.status).toBe(403);
    expect((await snapshot(context, active.runId)).result).toBeNull();
  }));

test('cancelled checkpoint turns retain only the latest eight and age older completed turns', async () =>
  owned(async (context) => {
    const files = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
      .sort();
    for (const file of files)
      await context.database.query(
        await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'),
      );
    const transactions = new PostgresTransactionRunner(context.database);
    const runs = new PostgresAskRunRepository(
      context.database,
      transactions,
      new PostgresOutbox(context.database),
    );
    const checkpoints = new PostgresGraphCheckpointRepository(context.database, transactions);
    const signal = AbortSignal.timeout(30000);
    const claimRun = async (run: ReturnType<typeof parseAskLiveRun>) => {
      const rows = await context.database.query<{ event_id: string }>(
        'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
        [run.id],
      );
      const claim = await runs.claim({
        version: 1,
        eventId: rows[0]!.event_id,
        runId: run.id,
        threadId: run.threadId,
      });
      if (claim.disposition !== 'claimed') throw new Error('Expected executable retained turn.');
      return claim.input;
    };
    const saveCheckpoint = async (
      input: Awaited<ReturnType<typeof claimRun>>,
      graphVersion: 'price-v1' | 'intent-routing-v1',
    ) => {
      const rows = await context.database.query<{ id: string }>('SELECT uuidv7()::text AS id');
      await checkpoints.execute(
        {
          version: 1,
          eventId: input.eventId,
          runId: input.runId,
          threadId: input.threadId,
          executionId: input.executionId,
          graphVersion,
          namespace: '',
          operation: 'put',
          checkpointId: rows[0]!.id,
          parentId: null,
          checkpoint: { type: 'json', base64: 'e30=' },
          metadata: { type: 'json', base64: 'e30=' },
        },
        input.checkpointGrant,
        signal,
      );
    };
    const completed = await runs.create(body, context.capability, secret());
    const first = await claimRun(completed);
    if (first.step !== 'structured-price-v1') throw new Error('Expected historical price turn.');
    await saveCheckpoint(first, 'price-v1');
    const market = new PricePerSquareMeterService();
    const receipt = await runs.tool(
      {
        version: 1,
        eventId: first.eventId,
        runId: first.runId,
        threadId: first.threadId,
        executionId: first.executionId,
        inputs: first.inputs,
        operation: 'price-per-square-meter',
      },
      first.toolGrant,
      (at) => market.pricePerSquareMeter(first.inputs, at),
    );
    await runs.complete({
      version: 1,
      eventId: first.eventId,
      runId: first.runId,
      threadId: first.threadId,
      executionId: first.executionId,
      evidence: {
        version: 1,
        eventId: first.eventId,
        runId: first.runId,
        threadId: first.threadId,
        executionId: first.executionId,
        step: 'structured-price-v1',
        outcome: 'price-calculated',
        visitedNodes: ['fixedDecision', 'priceTool'],
        receipt,
      },
      failure: null,
    });
    const cancelled: string[] = [];
    const history = () =>
      context.database.query<{
        id: string;
        document: string;
        events: string;
        decisions: string | null;
        tools: string | null;
      }>(
        "SELECT r.id::text,md5(r.document::text) AS document,(SELECT md5(string_agg(document::text,',' ORDER BY sequence)) FROM ask.run_event WHERE run_id=r.id) AS events,(SELECT md5(document::text) FROM ask.decision_receipt WHERE run_id=r.id) AS decisions,(SELECT md5(document::text) FROM ask.tool_receipt WHERE run_id=r.id) AS tools FROM ask.run r WHERE r.thread_id=$1 ORDER BY r.id",
        [completed.threadId],
      );
    for (let turn = 0; turn < 9; turn++) {
      const proposed = await runs.create(
        { ...body, mode: 'routed-text-v1', threadId: completed.threadId },
        context.capability,
        secret(),
      );
      const input = await claimRun(proposed);
      const address = {
        version: 1 as const,
        eventId: input.eventId,
        runId: input.runId,
        threadId: input.threadId,
        executionId: input.executionId,
      };
      const reservation = await runs.executeDecision(
        { ...address, operation: 'reserve', attemptKey: secret() },
        input.checkpointGrant,
        signal,
      );
      if (reservation.operation !== 'reserve') throw new Error('Expected decision reservation.');
      const accepted = await runs.executeDecision(
        {
          ...address,
          operation: 'accept',
          reservationId: reservation.reservationId,
          decision: {
            intent: 'price_per_square_meter',
            probability: 0.84,
            probabilities: {
              price_per_square_meter: 0.84,
              listing_search: 0.16,
              property_history: 0,
              region_statistics: 0,
              comparables: 0,
              unsupported: 0,
            },
            source: 'heuristic-v1',
            degraded: true,
            taxonomyVersion: 'ask-intents-v1',
            privacyEvidenceId: null,
          },
        },
        input.checkpointGrant,
        signal,
      );
      if (accepted.operation !== 'accept') throw new Error('Expected retained decision.');
      await saveCheckpoint(input, 'intent-routing-v1');
      await runs.complete({
        ...address,
        evidence: {
          ...address,
          step: 'routed-text-v1',
          outcome: 'awaiting-confirmation',
          decisionReceiptId: accepted.decision.receiptId,
        },
        failure: null,
      });
      expect(
        (await runs.refuse(input.runId, accepted.decision.receiptId, context.capability)).state,
      ).toBe('cancelled');
      cancelled.push(input.runId);
      const before = await history();
      expect(await checkpoints.prune(50, signal)).toBe(turn < 7 ? 0 : 1);
      expect(await history()).toEqual(before);
      expect(
        await context.database.query<{ id: string }>(
          'SELECT run_id::text AS id FROM ask.graph_checkpoint WHERE run_id=ANY($1::uuid[]) ORDER BY run_id',
          [[completed.id, ...cancelled]],
        ),
      ).toEqual(
        (turn < 7 ? [completed.id, ...cancelled] : cancelled.slice(-8))
          .sort()
          .map((id) => ({ id })),
      );
    }
    expect(
      await context.database.query<{ id: string }>(
        'SELECT id::text FROM ask.run WHERE thread_id=$1 AND graph_pruned_at IS NOT NULL ORDER BY id',
        [completed.threadId],
      ),
    ).toEqual([completed.id, cancelled[0]!].sort().map((id) => ({ id })));
    expect(await checkpoints.prune(50, signal)).toBe(0);
  }, true));

test('6003 upgrades a genuine populated 6002 structured/text baseline without rewriting history', async () =>
  owned(async (context) => {
    await context.database.query(
      'CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const files = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
      .sort();
    const apply = async (file: string) => {
      const client = await context.database.leaseClient();
      try {
        await client.query('BEGIN');
        await client.query(
          await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'),
        );
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [
          file.replace(/\.sql$/, ''),
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    for (const file of files.filter((file) => file < '6003')) await apply(file);
    expect(
      await context.database.query<{ present: boolean }>(
        "SELECT to_regclass('ask.graph_checkpoint') IS NOT NULL AS present",
      ),
    ).toEqual([{ present: false }]);
    const market = new PricePerSquareMeterService();
    const replays: {
      request:
        | StructuredAskCreate
        | (Omit<StructuredAskCreate, 'mode'> & { mode: 'text-price-v1' });
      key: string;
      run: ReturnType<typeof parseAskLiveRun>;
    }[] = [];
    let threadId: string | null = null;
    for (let position = 0; position < 12; position++) {
      const mode = position % 2 === 0 ? 'structured-price-v1' : 'text-price-v1';
      const query =
        mode === 'text-price-v1'
          ? 'What is the price per square meter for BRL 785,000.00 and 68 square meters?'
          : 'Historical structured synthetic question';
      const extraction = market.extractPriceInputs(query, 'en');
      if (mode === 'text-price-v1' && extraction.kind !== 'extracted')
        throw new Error('Historical text admission required.');
      const historicalRequest: (typeof replays)[number]['request'] = {
        ...body,
        mode,
        threadId,
        query,
      };
      // Seed the genuine historical schema explicitly. Current production repositories require
      // 6004 and must never detect or fall back to a historical shape.
      const key = secret();
      const allocated = await context.database.query<{
        id: string;
        thread_id: string;
        event_id: string;
        at: Date;
      }>(
        'SELECT uuidv7()::text AS id,uuidv7()::text AS thread_id,uuidv7()::text AS event_id,clock_timestamp() AS at',
      );
      const allocation = allocated[0]!;
      const creationKey = askDigest(key);
      if (!threadId)
        await context.database.query(
          'INSERT INTO ask.thread(id,authority_digest,preparation_key) VALUES($1,$2,$3)',
          [allocation.thread_id, askDigest(context.capability), creationKey],
        );
      const atCreated = allocation.at.toISOString();
      const run = parseAskLiveRun({
        basis: mode,
        id: allocation.id,
        threadId: threadId ?? allocation.thread_id,
        principalId: null,
        question: query,
        locale: body.locale,
        placeId: body.placeId,
        createdAt: atCreated,
        updatedAt: atCreated,
        state: 'queued',
        originalInputs: body.inputs,
        decision: null,
        result: null,
        terminal: null,
        steps: [],
      });
      const fingerprint = askDigest(
        JSON.stringify([
          mode,
          historicalRequest.threadId,
          body.placeId,
          query,
          body.locale,
          body.inputs.priceMinorUnits,
          body.inputs.currency,
          body.inputs.areaSquareMeters,
        ]),
      );
      const historical = await context.database.leaseClient();
      let committed = false;
      await preserveCleanup(
        async () => {
          // SQL seeding intentionally uses only 6002 columns and one native transaction.
          await historical.query('BEGIN');
          await historical.query(
            "INSERT INTO ask.run(id,thread_id,creation_key,request_fingerprint,requested_event_id,state,price_minor_units,area_square_meters,document) VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8)",
            [
              run.id,
              run.threadId,
              creationKey,
              fingerprint,
              allocation.event_id,
              body.inputs.priceMinorUnits,
              body.inputs.areaSquareMeters,
              run,
            ],
          );
          await historical.query(
            'INSERT INTO ask.run_event(run_id,sequence,document) VALUES($1,1,$2)',
            [
              run.id,
              parseAskLiveEvent({
                version: 1,
                id: `${run.id}:v1:1`,
                runId: run.id,
                sequence: 1,
                event: 'ask.progress',
                terminal: false,
                run,
              }),
            ],
          );
          await historical.query(
            "INSERT INTO platform.idempotency_key(scope,idempotency_key,request_fingerprint,result_reference,expires_at) VALUES('ask.structured-create',$1,$2,$3,clock_timestamp()+interval '24 hours')",
            [creationKey, fingerprint, run.id],
          );
          const requested = new AskRunRequested(
            { version: 1, eventId: allocation.event_id, runId: run.id, threadId: run.threadId },
            atCreated,
          );
          await historical.query(
            'INSERT INTO platform.outbox(event_id,event_type,event_version,aggregate_id,occurred_at,trace_context,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [
              requested.eventId,
              requested.type,
              requested.version,
              requested.aggregateId,
              requested.occurredAt,
              requested.traceContext,
              requested.payload,
            ],
          );
          await historical.query('COMMIT');
          committed = true;
        },
        () =>
          cleanupAll(
            async () => {
              if (!committed) await historical.query('ROLLBACK');
            },
            async () => historical.release(),
          ),
      );
      threadId = run.threadId;
      // Historical rows are fixture data, not recovery results. The real 6002 constraints and
      // closed public parsers admit both complete timelines and deterministic Market receipts.
      const ids = await context.database.query<{
        event_id: string;
        execution_id: string;
        receipt_id: string;
      }>(
        'SELECT requested_event_id::text AS event_id,uuidv7()::text AS execution_id,uuidv7()::text AS receipt_id FROM ask.run WHERE id=$1',
        [run.id],
      );
      const idsRow = ids[0]!,
        at = new Date().toISOString();
      const running = parseAskLiveRun({
        ...run,
        state: 'running',
        updatedAt: at,
        decision: {
          source: mode === 'text-price-v1' ? 'validated-text-v1' : 'fixed-structured-v1',
          intent: 'price_per_square_meter',
          decidedAt: at,
        },
        steps: [{ sequence: 1, phase: 'calculating', at }],
      });
      const receipt = parsePriceToolReceipt({
        version: 1,
        eventId: idsRow.event_id,
        runId: run.id,
        threadId: run.threadId,
        executionId: idsRow.execution_id,
        operation: 'price-per-square-meter',
        inputs: body.inputs,
        receiptId: idsRow.receipt_id,
        provenance: 'market-domain-v1',
        result: market.pricePerSquareMeter(body.inputs, at),
      });
      const completed = parseAskLiveRun({
        ...running,
        state: 'completed',
        result: receipt.result,
        terminal: { state: 'completed', reason: null, at },
        steps: [...running.steps, { sequence: 2, phase: 'completed', at }],
      });
      const client = await context.database.leaseClient();
      try {
        await client.query('BEGIN');
        await client.query(
          "UPDATE ask.run SET state='completed',execution_id=$2,claim_expires_at=clock_timestamp()+interval '30 seconds',grant_digest=$3,document=$4 WHERE id=$1",
          [run.id, idsRow.execution_id, askDigest(secret()), completed],
        );
        for (const [sequence, document] of [
          [2, running],
          [3, completed],
        ] as const)
          await client.query(
            'INSERT INTO ask.run_event(run_id,sequence,document) VALUES($1,$2,$3)',
            [
              run.id,
              sequence,
              parseAskLiveEvent({
                version: 1,
                id: `${run.id}:v1:${sequence}`,
                runId: run.id,
                sequence,
                event: sequence === 3 ? 'ask.completed' : 'ask.progress',
                terminal: sequence === 3,
                run: document,
              }),
            ],
          );
        await client.query('INSERT INTO ask.tool_receipt(run_id,id,document) VALUES($1,$2,$3)', [
          run.id,
          receipt.receiptId,
          receipt,
        ]);
        await client.query(
          "INSERT INTO platform.inbox(event_id,consumer_name) VALUES($1,'ask.structured-run')",
          [idsRow.event_id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      replays.push({ request: historicalRequest, key, run: completed });
    }
    const history = () =>
      context.database.query<{
        runs: string;
        events: string;
        receipts: string;
        outbox: string;
        inbox: string;
        idempotency: string;
      }>(
        "SELECT (SELECT md5(string_agg((to_jsonb(r)-ARRAY['checkpoint_grant_digest','graph_started_at','graph_expires_at','graph_pruned_at','admission_sequence','admitted_at','queue_expires_at'])::text,'' ORDER BY id)) FROM ask.run r) AS runs,(SELECT md5(string_agg(document::text,'' ORDER BY run_id,sequence)) FROM ask.run_event) AS events,(SELECT md5(string_agg(document::text,'' ORDER BY run_id)) FROM ask.tool_receipt) AS receipts,(SELECT md5(string_agg(row_to_json(o)::text,'' ORDER BY event_id)) FROM platform.outbox o) AS outbox,(SELECT md5(string_agg(row_to_json(i)::text,'' ORDER BY event_id)) FROM platform.inbox i) AS inbox,(SELECT md5(string_agg(row_to_json(k)::text,'' ORDER BY idempotency_key)) FROM platform.idempotency_key k) AS idempotency",
      );
    const constraints = () =>
      context.database.query<{ name: string; definition: string }>(
        "SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('ask.run'::regclass,'ask.run_event'::regclass,'ask.tool_receipt'::regclass,'ask.thread'::regclass) AND conname<>'run_graph_horizon_matches' AND conname NOT LIKE '%checkpoint_grant_digest%' ORDER BY conname",
      );
    const before = await history(),
      oldConstraints = await constraints();
    await apply('6003_ask_graph_checkpoints.sql');
    expect(await history()).toEqual(before);
    expect(await constraints()).toEqual(oldConstraints);
    await apply('6004_ask_ordered_delivery.sql');
    expect(await history()).toEqual(before);
    await apply('6005_ask_model_explanations.sql');
    expect(await history()).toEqual(before);
    expect(
      await context.database.query<{ sequence: string; lifetime: number }>(
        'SELECT admission_sequence::text AS sequence,EXTRACT(epoch FROM queue_expires_at-admitted_at)::integer AS lifetime FROM ask.run ORDER BY ask.run.admission_sequence',
      ),
    ).toEqual(
      Array.from({ length: 12 }, (_, index) => ({ sequence: String(index + 1), lifetime: 120 })),
    );
    const repository = new PostgresAskRunRepository(
      context.database,
      new PostgresTransactionRunner(context.database),
      new PostgresOutbox(context.database),
    );
    for (const replay of replays)
      expect(await repository.create(replay.request, context.capability, replay.key)).toEqual(
        replay.run,
      );
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.thread WHERE principal_id IS NOT NULL',
      ),
    ).toEqual([{ count: 0 }]);
    await expect(
      context.database.query('UPDATE ask.run SET document=document || \'{"extra":true}\'::jsonb'),
    ).rejects.toThrow();
    expect(await history()).toEqual(before);
    await context.fixture.up(['--build', 'migrations', 'api', 'ai', 'rabbitmq', 'minio', 'worker']);
    const threadResponse = await requestHttp(`${context.api}/api/v1/threads/${threadId}`, {
      headers: { Authorization: `Bearer ${context.capability}` },
    });
    expect(threadResponse.status).toBe(200);
    const retained = await repository.thread(threadId!, context.capability);
    expect(retained?.basis).toBe('mixed-price-v1');
    expect(retained?.runs).toHaveLength(12);
    expect(retained?.runs.map((run) => run.id)).toEqual(replays.map((replay) => replay.run.id));
    for (const run of retained!.runs) {
      const replay = await requestHttp(`${context.api}/api/v1/runs/${run.id}/events`, {
        headers: { Authorization: `Bearer ${context.capability}` },
      });
      expect(replay.status).toBe(200);
      expect((await replay.text()).split('data:').length - 1).toBe(3);
    }
    const next = await create(context, { ...body, threadId });
    await vi.waitFor(
      async () => expect((await snapshot(context, next.runId)).state).toBe('completed'),
      { timeout: 30000, interval: 100 },
    );
    expect(await repository.run(retained!.runs[0]!.id, context.capability)).toEqual(
      retained!.runs[0],
    );
  }, true));
