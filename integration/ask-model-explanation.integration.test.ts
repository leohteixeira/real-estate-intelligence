import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { getContainerRuntimeClient, getReaper } from 'testcontainers';
import {
  parseAskLiveRun,
  parseAskLiveThread,
  parseAskLiveEvent,
  parseAskClaim,
  parseAskRequestedIdentity,
  parseExplainedAskAccepted,
  parseExplainedAskRefused,
  parseExplainedExecutionEvidence,
  parseModelExplanationResponse,
  parseStructuredExecutionEvidence,
  parsePriceToolReceipt,
  type ExplainedExecutionRequest,
  type StructuredExecutionRequest,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  askDispatchProof,
  PostgresAskRunRepository,
  PostgresTransactionRunner,
  PostgresOutbox,
  PostgresGraphCheckpointRepository,
} from '../packages/infrastructure/dist/index.js';
import { explanationFacts } from '../packages/domain/dist/index.js';
import { PricePerSquareMeterService } from '../packages/application/dist/index.js';
import { compilePriceGraph } from '../apps/ai/dist/graph/price-per-square-meter.graph.js';
import {
  durablePriceInput,
  RemoteCheckpointSaver,
} from '../apps/ai/dist/graph/remote-checkpoint-saver.js';
import { allocatePorts, ComposeFixture, preserveCleanup, cleanupAll } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';

const secret = () => randomBytes(32).toString('base64url');
const root = fileURLToPath(new URL('..', import.meta.url));
type FixtureContext = {
  fixture: ComposeFixture;
  database: DatabaseConnection;
  api: string;
  ai: string;
  token: string;
  dispatch: string;
  capability: string;
  command: (args: string[]) => Promise<{ stdout: string }>;
};
async function restartOwnedModelProcess(context: FixtureContext) {
  const name = `${context.fixture.project}-scripted-ai`;
  const label = await context.fixture.execute('docker', [
    'inspect',
    '--format',
    '{{index .Config.Labels "com.docker.compose.project"}}',
    name,
  ]);
  expect(label.stdout.trim()).toBe(context.fixture.project);
  await context.fixture.execute('docker', ['restart', name]);
  await vi.waitFor(
    async () => expect((await requestHttp(`${context.ai}/health`)).status).toBe(200),
    { timeout: 30000, interval: 100 },
  );
}
async function expectNoModelCalls(context: FixtureContext) {
  const response = await requestHttp(`${context.ai}/fixture/model-attempts`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ probes: 0, generations: 0 });
}
async function owned(
  scenario: string,
  work: (context: FixtureContext) => Promise<void>,
  prepare?: (database: DatabaseConnection, capability: string) => Promise<void>,
) {
  await getReaper(await getContainerRuntimeClient());
  const [postgres, api, ai, rabbit, management, minio, consolePort] = await allocatePorts(7);
  const token = secret(),
    dispatch = secret(),
    capability = secret();
  const fixture = new ComposeFixture(`rei-model-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    API_PORT: String(api),
    AI_PORT: String(ai),
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    MINIO_API_PORT: String(minio),
    MINIO_CONSOLE_PORT: String(consolePort),
    POSTGRES_USER: 'rei_model',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_model',
    RABBITMQ_USER: 'rei_model',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_model',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: token,
    AI_GATEWAY_API_KEY: '',
    ASK_DISPATCH_SECRET: dispatch,
    SNAPSHOT_ENCRYPTION_KEY_ID: 'model-fixture-v1',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  let database: DatabaseConnection | undefined;
  let scriptedStarted = false;
  const inventory = async () => ({
    containers: (await fixture.execute('docker', ['ps', '--all', '--format', '{{.ID}}'])).stdout
      .split('\n')
      .filter(Boolean)
      .sort(),
    volumes: (await fixture.execute('docker', ['volume', 'ls', '--format', '{{.Name}}'])).stdout
      .split('\n')
      .filter(Boolean)
      .sort(),
  });
  const foreign = await inventory();
  const foreignMetadata = async () => ({
    containers: foreign.containers.length
      ? (
          await fixture.execute('docker', [
            'inspect',
            '--format',
            '{{.Id}} {{.Name}} {{json .Config.Labels}} {{json .Mounts}}',
            ...foreign.containers,
          ])
        ).stdout
      : '',
    volumes: foreign.volumes.length
      ? (
          await fixture.execute('docker', [
            'volume',
            'inspect',
            '--format',
            '{{.Name}} {{.Driver}} {{.Mountpoint}} {{json .Labels}} {{.Scope}}',
            ...foreign.volumes,
          ])
        ).stdout
      : '',
  });
  const beforeMetadata = await foreignMetadata();
  const command = (args: string[]) =>
    fixture.execute(
      'docker',
      ['compose', '--file', 'compose.yaml', '--project-name', fixture.project, ...args],
      { cwd: root, env: fixture.environment, timeout: 240000 },
    );
  const connect = () => {
    const url = new URL(`postgres://127.0.0.1:${postgres}/rei_model`);
    url.username = fixture.environment.POSTGRES_USER!;
    url.password = fixture.environment.POSTGRES_PASSWORD!;
    return new DatabaseConnection(url.toString());
  };
  await preserveCleanup(
    async () => {
      if (prepare) {
        await fixture.up(['postgres']);
        database = connect();
        await prepare(database, capability);
      }
      await fixture.up(['--build', 'postgres', 'migrations', 'api', 'rabbitmq', 'minio']);
      await command(['build', 'ai', 'worker']);
      // Production image + production graph, with only the explicit model port replaced inside AI.
      await command([
        'run',
        '--detach',
        '--no-deps',
        '--use-aliases',
        '--name',
        `${fixture.project}-scripted-ai`,
        '--publish',
        `${ai}:4111`,
        '--volume',
        `${root}:/source:ro`,
        '--entrypoint',
        'node',
        'ai',
        '/source/integration/fixtures/ask-model-fixture-bootstrap.ts',
        scenario,
      ]);
      scriptedStarted = true;
      await vi.waitFor(
        async () => expect((await requestHttp(`http://127.0.0.1:${ai}/health`)).status).toBe(200),
        { timeout: 30000, interval: 100 },
      );
      database ??= connect();
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
        async () => captureAskDiagnostics(fixture, database),
        async () => database?.close(),
        async () => {
          if (!scriptedStarted) return;
          const label = await fixture.execute('docker', [
            'inspect',
            '--format',
            '{{index .Config.Labels "com.docker.compose.project"}}',
            `${fixture.project}-scripted-ai`,
          ]);
          expect(label.stdout.trim()).toBe(fixture.project);
          await fixture.execute('docker', ['rm', '--force', `${fixture.project}-scripted-ai`]);
        },
        () => fixture.down(),
        async () => {
          expect(await inventory()).toEqual(foreign);
          expect(await foreignMetadata()).toEqual(beforeMetadata);
        },
      ),
  );
}
async function create(
  context: FixtureContext,
  locale: 'en' | 'pt-BR' = 'en',
  threadId: string | null = null,
  key = secret(),
) {
  const body = {
    mode: 'text-price-explanation-v1',
    threadId,
    placeId: null,
    locale,
    query:
      locale === 'en'
        ? 'What is the price per square meter for BRL 785,000.00 and 68 square meters?'
        : 'Qual é o preço por metro quadrado de um imóvel de R$ 785.000,00 com 68 m²?',
  };
  const response = await requestHttp(`${context.api}/api/v1/runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${context.capability}`, 'Idempotency-Key': key },
    body,
  });
  expect(response.status).toBe(202);
  return { accepted: parseExplainedAskAccepted(await response.json()), body, key };
}
async function snapshot(context: FixtureContext, runId: string) {
  const response = await requestHttp(`${context.api}/api/v1/runs/${runId}`, {
    headers: { Authorization: `Bearer ${context.capability}` },
  });
  expect(response.status).toBe(200);
  return parseAskLiveRun(await response.json());
}
async function claim(context: FixtureContext, runId: string): Promise<ExplainedExecutionRequest> {
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
  if (result.disposition !== 'claimed' || result.input.step !== 'text-price-explanation-v1')
    throw new Error('Explained claim required.');
  return result.input;
}
test.each(['approved', 'fallback', 'invented', 'privacy', 'authentication', 'usage'] as const)(
  'real PG/API/worker/AI explained campaign: %s',
  async (scenario) =>
    owned(scenario, async (context) => {
      const headers = { Authorization: `Bearer ${context.capability}` };
      const refused = await requestHttp(`${context.api}/api/v1/runs`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': secret() },
        body: {
          mode: 'text-price-explanation-v1',
          threadId: null,
          placeId: null,
          locale: 'en',
          query: 'Price 10',
        },
      });
      expect(refused.status).toBe(422);
      expect(parseExplainedAskRefused(await refused.json()).reason).toBe('missing_area');
      const oversized = await requestHttp(`${context.api}/api/v1/runs`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': secret() },
        body: {
          mode: 'text-price-explanation-v1',
          threadId: null,
          placeId: null,
          locale: 'en',
          query: 'x'.repeat(16001),
        },
      });
      expect(oversized.status).toBe(400);
      expect(
        await context.database.query<{ runs: number; receipts: number; attempts: number }>(
          'SELECT (SELECT count(*)::integer FROM ask.run) AS runs,(SELECT count(*)::integer FROM ask.tool_receipt) AS receipts,(SELECT count(*)::integer FROM ask.model_attempt) AS attempts',
        ),
      ).toEqual([{ runs: 0, receipts: 0, attempts: 0 }]);
      const pt = await create(context, 'pt-BR'),
        en = await create(context, 'en', pt.accepted.threadId);
      const replay = await requestHttp(`${context.api}/api/v1/runs`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': pt.key },
        body: pt.body,
      });
      expect(replay.status).toBe(202);
      expect(parseExplainedAskAccepted(await replay.json())).toEqual(pt.accepted);
      const conflict = await requestHttp(`${context.api}/api/v1/runs`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': pt.key },
        body: { ...pt.body, query: pt.body.query.replace('785.000', '786.000') },
      });
      expect(conflict.status).toBe(409);
      await context.fixture.up(['worker']);
      for (const accepted of [pt.accepted, en.accepted]) {
        await vi.waitFor(
          async () =>
            expect((await snapshot(context, accepted.runId)).state).toBe(
              ['approved', 'fallback'].includes(scenario) ? 'completed' : 'failed',
            ),
          { timeout: 30000, interval: 100 },
        );
        const run = await snapshot(context, accepted.runId);
        if (run.basis !== 'text-price-explanation-v1') throw new Error('Explained run required.');
        const attempts = await context.database.query<{ total: number; count: number }>(
          'SELECT COALESCE(sum(max_output_tokens),0)::integer AS total,count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
          [run.id],
        );
        expect(attempts[0]!.total).toBeLessThanOrEqual(1000);
        expect(attempts[0]).toEqual({
          total:
            scenario === 'fallback' ? 256 : ['approved', 'invented'].includes(scenario) ? 240 : 16,
          count: scenario === 'fallback' ? 3 : ['approved', 'invented'].includes(scenario) ? 2 : 1,
        });
        const receipts = await context.database.query<{ document: unknown }>(
          'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
          [run.id],
        );
        expect(receipts).toHaveLength(1);
        const receipt = parsePriceToolReceipt(receipts[0]!.document);
        expect(receipt.inputs).toEqual({
          priceMinorUnits: 78500000,
          currency: 'BRL',
          areaSquareMeters: 68,
        });
        expect(receipt.result.minorUnits).toBe(1154412);
        const artifacts = await context.database.query<{ document: unknown }>(
          'SELECT document FROM ask.model_explanation WHERE run_id=$1',
          [run.id],
        );
        if (run.state === 'completed') {
          const evidence = await requestHttp(`${context.ai}/internal/v1/runs/execute`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${context.token}` },
            body: {},
          });
          expect(evidence.status).toBe(400);
          expect(run.result?.minorUnits).toBe(1154412);
          expect(artifacts).toEqual([{ document: run.explanation }]);
          expect(run.explanation?.authorship).toBe('model-written');
          expect(run.explanation?.model).toBe(
            scenario === 'fallback'
              ? 'deepseek/deepseek-v4-flash-0731'
              : 'anthropic/claude-haiku-5.5',
          );
          expect(run.explanation?.text).toBe(
            [...explanationFacts(receipt, run.locale)].reverse().join(' '),
          );
        } else {
          expect(artifacts).toEqual([]);
          expect(run.explanation).toBeNull();
          expect(run.result).toBeNull();
        }
        const stream = await requestHttp(`${context.api}/api/v1/runs/${run.id}/events`, {
          headers,
        });
        expect(stream.status).toBe(200);
        const events = (await stream.text())
          .split(/\r?\n\r?\n/)
          .filter((part) => part.trim() && !part.startsWith(':'))
          .map((part) =>
            parseAskLiveEvent(
              JSON.parse(
                part
                  .split(/\r?\n/)
                  .find((line) => line.startsWith('data:'))!
                  .slice(5),
              ),
            ),
          );
        expect(events.filter((event) => event.terminal)).toHaveLength(1);
        expect(events.at(-1)?.run).toEqual(run);
        const terminal = await context.database.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM platform.outbox WHERE aggregate_id=$1 AND event_type IN ('ask.run.completed','ask.run.failed')",
          [run.id],
        );
        expect(terminal[0]!.count).toBe(1);
      }
      const thread = await requestHttp(`${context.api}/api/v1/threads/${pt.accepted.threadId}`, {
        headers,
      });
      expect(thread.status).toBe(200);
      expect(parseAskLiveThread(await thread.json()).runs).toHaveLength(2);
    }),
);
test('real concurrent SQL reservations preserve 1,000-token budget across reclaim and wrong graph partitions', async () =>
  owned('approved', async (context) => {
    const created = await create(context),
      input = await claim(context, created.accepted.runId);
    const reserve = (request: ExplainedExecutionRequest, maxOutputTokens = 200) =>
      requestHttp(`${context.api}/api/v1/internal/ask/runs/${request.runId}/model-explanation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${request.checkpointGrant}` },
        body: {
          version: 1,
          eventId: request.eventId,
          runId: request.runId,
          threadId: request.threadId,
          executionId: request.executionId,
          operation: 'reserve',
          attemptKey: secret(),
          purpose: 'explanation',
          model: 'anthropic/claude-haiku-5.5',
          route: 'vercel-ai-gateway',
          maxOutputTokens,
        },
      });
    const results = await Promise.all(Array.from({ length: 6 }, () => reserve(input)));
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 200, 200, 200, 200, 400,
    ]);
    for (const response of results.filter((response) => response.status === 200))
      expect(parseModelExplanationResponse(await response.json()).operation).toBe('reserve');
    expect(
      await context.database.query<{ total: number; count: number }>(
        'SELECT sum(max_output_tokens)::integer AS total,count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ total: 1000, count: 5 }]);
    const wrong = await requestHttp(`${context.api}/api/v1/ask/runs/${input.runId}/checkpoints`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.checkpointGrant}` },
      body: {
        version: 1,
        eventId: input.eventId,
        runId: input.runId,
        threadId: input.threadId,
        executionId: input.executionId,
        graphVersion: 'price-v1',
        namespace: '',
        operation: 'get',
        checkpointId: null,
      },
    });
    expect(wrong.status).toBe(403);
    await context.database.query(
      "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [input.runId],
    );
    const replacement = await claim(context, input.runId);
    expect((await reserve(input, 16)).status).toBe(403);
    expect((await reserve(replacement, 16)).status).toBe(400);
    expect(
      await context.database.query<{ total: number }>(
        'SELECT sum(max_output_tokens)::integer AS total FROM ask.model_attempt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ total: 1000 }]);
    expect(
      await context.database.query<{
        receipts: number;
        explanations: number;
        checkpoints: number;
        terminal: number;
      }>(
        `SELECT (SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS receipts,(SELECT count(*)::integer FROM ask.model_explanation WHERE run_id=$1) AS explanations,(SELECT count(*)::integer FROM ask.graph_checkpoint WHERE run_id=$1) AS checkpoints,(SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1 AND document->>'terminal'='true') AS terminal`,
        [input.runId],
      ),
    ).toEqual([{ receipts: 0, explanations: 0, checkpoints: 0, terminal: 0 }]);
  }));
test('explained admission preserves three pending, SQL FIFO and honest queue expiry without model effects', async () =>
  owned('approved', async (context) => {
    const first = await create(context),
      second = await create(context, 'en', first.accepted.threadId),
      third = await create(context, 'pt-BR', first.accepted.threadId);
    const capacity = await requestHttp(`${context.api}/api/v1/runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${context.capability}`, 'Idempotency-Key': secret() },
      body: { ...first.body, threadId: first.accepted.threadId },
    });
    expect(capacity.status).toBe(429);
    expect(await capacity.json()).toEqual({ code: 'thread_pending_limit', limit: 3 });
    const rows = await context.database.query<{ event_id: string }>(
      'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
      [second.accepted.runId],
    );
    const identity = {
      version: 1 as const,
      eventId: rows[0]!.event_id,
      runId: second.accepted.runId,
      threadId: first.accepted.threadId,
    };
    const blocked = await requestHttp(
      `${context.api}/api/v1/internal/ask/runs/${identity.runId}/claim`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${askDispatchProof(context.dispatch, identity)}` },
        body: identity,
      },
    );
    expect(blocked.status).toBe(200);
    expect(parseAskClaim(await blocked.json()).disposition).toBe('busy');
    const input = await claim(context, first.accepted.runId);
    const foreign = await requestHttp(
      `${context.api}/api/v1/internal/ask/runs/${identity.runId}/model-explanation`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.checkpointGrant}` },
        body: { ...identity, executionId: input.executionId, operation: 'get' },
      },
    );
    expect(foreign.status).toBe(403);
    await context.database.query(
      "WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS at) UPDATE ask.run SET admitted_at=observed.at-interval '121 seconds',queue_expires_at=observed.at-interval '1 second' FROM observed WHERE thread_id=$1 AND state='queued'",
      [input.threadId],
    );
    const repository = new PostgresAskRunRepository(
      context.database,
      new PostgresTransactionRunner(context.database),
      new PostgresOutbox(context.database),
    );
    await repository.expireQueued(100);
    for (const accepted of [second.accepted, third.accepted]) {
      const run = await snapshot(context, accepted.runId);
      expect(run.state).toBe('expired');
      expect(run.terminal?.reason).toBe('queue_expired');
      expect(run.result).toBeNull();
      if (run.basis !== 'text-price-explanation-v1') throw new Error('Explained run required.');
      expect(run.explanation).toBeNull();
      expect(run.decision).toBeNull();
      expect(run.steps).toEqual([{ sequence: 1, phase: 'expired', at: run.updatedAt }]);
    }
    expect(
      await context.database.query<{ attempts: number; receipts: number; checkpoints: number }>(
        'SELECT (SELECT count(*)::integer FROM ask.model_attempt) AS attempts,(SELECT count(*)::integer FROM ask.tool_receipt) AS receipts,(SELECT count(*)::integer FROM ask.graph_checkpoint) AS checkpoints',
      ),
    ).toEqual([{ attempts: 0, receipts: 0, checkpoints: 0 }]);
    expect(
      await context.database.query<{ lifetime: number }>(
        'SELECT EXTRACT(epoch FROM queue_expires_at-admitted_at)::integer AS lifetime FROM ask.run WHERE thread_id=$1',
        [input.threadId],
      ),
    ).toEqual([{ lifetime: 120 }, { lifetime: 120 }, { lifetime: 120 }]);
  }));
test('real cancelled probe neither generates user facts nor retries or falls back', async () =>
  owned('cancelled', async (context) => {
    const created = await create(context),
      input = await claim(context, created.accepted.runId);
    const request = {
      method: 'POST' as const,
      headers: { Authorization: `Bearer ${context.token}` },
      body: input,
    };
    await expect(
      requestHttp(`${context.ai}/internal/v1/runs/execute`, {
        ...request,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
    const response = await requestHttp(`${context.ai}/internal/v1/runs/execute`, request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'unavailable' });
    expect(
      await context.database.query<{ model: string; purpose: string; total: number }>(
        "SELECT document->>'model' AS model,document->>'purpose' AS purpose,max_output_tokens AS total FROM ask.model_attempt WHERE run_id=$1",
        [input.runId],
      ),
    ).toEqual([{ model: 'anthropic/claude-haiku-5.5', purpose: 'privacy-probe', total: 16 }]);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.model_explanation WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
    expect((await snapshot(context, input.runId)).state).toBe('running');
  }));
test('real caller cancellation during generation retains conservative spend without retry or fallback', async () =>
  owned('wait-generation', async (context) => {
    const created = await create(context),
      input = await claim(context, created.accepted.runId),
      cancellation = new AbortController();
    const executed = requestHttp(`${context.ai}/internal/v1/runs/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${context.token}` },
      body: input,
      signal: cancellation.signal,
    }).then(
      () => 'response',
      () => 'aborted',
    );
    await vi.waitFor(
      async () =>
        expect(
          await context.database.query<{ total: number; count: number }>(
            'SELECT COALESCE(sum(max_output_tokens),0)::integer AS total,count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
            [input.runId],
          ),
        ).toEqual([{ total: 240, count: 2 }]),
      { timeout: 3000, interval: 25 },
    );
    await vi.waitFor(
      async () => {
        const response = await requestHttp(`${context.ai}/fixture/model-attempts`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ probes: 1, generations: 1 });
      },
      { timeout: 3000, interval: 25 },
    );
    cancellation.abort();
    expect(await executed).toBe('aborted');
    expect(
      await context.database.query<{ model: string; purpose: string }>(
        "SELECT document->>'model' AS model,document->>'purpose' AS purpose FROM ask.model_attempt WHERE run_id=$1 ORDER BY created_at,id",
        [input.runId],
      ),
    ).toEqual([
      { model: 'anthropic/claude-haiku-5.5', purpose: 'privacy-probe' },
      { model: 'anthropic/claude-haiku-5.5', purpose: 'explanation' },
    ]);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.model_explanation WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
    await context.database.query(
      "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [input.runId],
    );
    expect((await claim(context, input.runId)).executionId).not.toBe(input.executionId);
    expect(
      await context.database.query<{ total: number }>(
        'SELECT sum(max_output_tokens)::integer AS total FROM ask.model_attempt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ total: 240 }]);
  }));
test('completed graph before terminal commit reuses accepted explanation on fresh claim and fences reservations', async () =>
  owned('approved', async (context) => {
    const created = await create(context),
      input = await claim(context, created.accepted.runId);
    const execute = async (request: ExplainedExecutionRequest) => {
      const response = await requestHttp(`${context.ai}/internal/v1/runs/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${context.token}` },
        body: request,
      });
      expect(response.status).toBe(200);
      return parseExplainedExecutionEvidence(await response.json());
    };
    const first = await execute(input);
    expect(first.visitedNodes).toEqual(['validatedInputs', 'priceTool', 'modelExplanation']);
    expect(first.explanation.text).toBe(
      [...explanationFacts(first.receipt, input.locale)].reverse().join(' '),
    );
    const budget = await context.database.query<{ total: number }>(
      'SELECT sum(max_output_tokens)::integer AS total FROM ask.model_attempt WHERE run_id=$1',
      [input.runId],
    );
    await restartOwnedModelProcess(context);
    await context.database.query(
      "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [input.runId],
    );
    const replacement = await claim(context, input.runId),
      recovered = await execute(replacement);
    expect(replacement.executionId).not.toBe(input.executionId);
    expect(recovered.receipt.receiptId).toBe(first.receipt.receiptId);
    expect(recovered.receipt.executionId).toBe(replacement.executionId);
    expect(recovered.explanation).toEqual(first.explanation);
    await expectNoModelCalls(context);
    expect(
      await context.database.query<{ total: number }>(
        'SELECT sum(max_output_tokens)::integer AS total FROM ask.model_attempt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual(budget);
    const forged = await requestHttp(
      `${context.api}/api/v1/internal/ask/runs/${input.runId}/model-explanation`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.checkpointGrant}` },
        body: {
          version: 1,
          eventId: input.eventId,
          runId: input.runId,
          threadId: input.threadId,
          executionId: input.executionId,
          operation: 'reserve',
          attemptKey: secret(),
          purpose: 'explanation',
          model: 'anthropic/claude-haiku-5.5',
          route: 'vercel-ai-gateway',
          maxOutputTokens: 1000,
        },
      },
    );
    expect(forged.status).toBe(403);
    const get = await requestHttp(
      `${context.api}/api/v1/internal/ask/runs/${input.runId}/model-explanation`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${replacement.checkpointGrant}` },
        body: {
          version: 1,
          eventId: replacement.eventId,
          runId: replacement.runId,
          threadId: replacement.threadId,
          executionId: replacement.executionId,
          operation: 'get',
        },
      },
    );
    expect(get.status).toBe(200);
    expect(parseModelExplanationResponse(await get.json())).toEqual({
      operation: 'get',
      explanation: first.explanation,
    });
    const complete = {
      version: 1,
      eventId: replacement.eventId,
      runId: replacement.runId,
      threadId: replacement.threadId,
      executionId: replacement.executionId,
      evidence: recovered,
      failure: null,
    };
    for (let replay = 0; replay < 2; replay++) {
      const response = await requestHttp(
        `${context.api}/api/v1/internal/ask/runs/${input.runId}/complete`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(context.dispatch, replacement)}` },
          body: complete,
        },
      );
      expect(response.status).toBe(200);
      expect(parseAskLiveRun(await response.json()).state).toBe('completed');
    }
  }));

test('accepted artifact survives a real PostgreSQL checkpoint ACK failure and fresh execution', async () =>
  owned('approved', async (context) => {
    const created = await create(context),
      input = await claim(context, created.accepted.runId);
    // Fail the first durable checkpoint after API acceptance, not the model or the acceptance transaction.
    await context.database
      .query(`CREATE FUNCTION ask.fixture_reject_accepted_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM ask.model_explanation WHERE run_id=NEW.run_id) THEN
        RAISE EXCEPTION 'fixture checkpoint ACK unavailable';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fixture_reject_accepted_checkpoint BEFORE INSERT ON ask.graph_checkpoint
      FOR EACH ROW EXECUTE FUNCTION ask.fixture_reject_accepted_checkpoint()`);
    const execute = (request: ExplainedExecutionRequest) =>
      requestHttp(`${context.ai}/internal/v1/runs/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${context.token}` },
        body: request,
      });
    expect((await execute(input)).status).toBe(503);
    const accepted = await context.database.query<{ document: unknown }>(
      'SELECT document FROM ask.model_explanation WHERE run_id=$1',
      [input.runId],
    );
    expect(accepted).toHaveLength(1);
    const budget = await context.database.query<{ total: number; count: number }>(
      'SELECT sum(max_output_tokens)::integer AS total,count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
      [input.runId],
    );
    expect(budget).toEqual([{ total: 240, count: 2 }]);
    await context.database.query(
      'DROP TRIGGER fixture_reject_accepted_checkpoint ON ask.graph_checkpoint; DROP FUNCTION ask.fixture_reject_accepted_checkpoint()',
    );
    await restartOwnedModelProcess(context);
    await context.database.query(
      "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [input.runId],
    );
    const replacement = await claim(context, input.runId),
      response = await execute(replacement);
    expect(response.status).toBe(200);
    const evidence = parseExplainedExecutionEvidence(await response.json());
    expect(evidence.explanation).toEqual(accepted[0]!.document);
    expect(evidence.receipt.executionId).toBe(replacement.executionId);
    expect(evidence.visitedNodes).toEqual(['validatedInputs', 'priceTool', 'modelExplanation']);
    await expectNoModelCalls(context);
    expect(
      await context.database.query<{ total: number; count: number }>(
        'SELECT sum(max_output_tokens)::integer AS total,count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual(budget);
    const complete = await requestHttp(
      `${context.api}/api/v1/internal/ask/runs/${input.runId}/complete`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${askDispatchProof(context.dispatch, replacement)}` },
        body: {
          version: 1,
          eventId: replacement.eventId,
          runId: replacement.runId,
          threadId: replacement.threadId,
          executionId: replacement.executionId,
          evidence,
          failure: null,
        },
      },
    );
    expect(complete.status).toBe(200);
    expect(parseAskLiveRun(await complete.json()).state).toBe('completed');
    expect(
      await context.database.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.completed'",
        [input.runId],
      ),
    ).toEqual([{ count: 1 }]);
  }));

test('genuine populated pre-6005 graph bytes survive upgrade, old recovery and an explained run in the historical thread', async () => {
  let historical: StructuredExecutionRequest | undefined;
  let before: { checkpoints: string; pending: string; history: string }[] = [];
  const digest = (database: DatabaseConnection) =>
    database.query<{ checkpoints: string; pending: string; history: string }>(`SELECT
    (SELECT md5(string_agg(to_jsonb(c)::text,'' ORDER BY sequence)) FROM ask.graph_checkpoint c) AS checkpoints,
    (SELECT md5(string_agg(to_jsonb(w)::text,'' ORDER BY checkpoint_id,task_id,write_index)) FROM ask.graph_pending_write w) AS pending,
    (SELECT md5(string_agg(document::text,'' ORDER BY id)) FROM ask.run) AS history`);
  await owned(
    'approved',
    async (context) => {
      if (!historical) throw new Error('Historical execution required.');
      expect(await digest(context.database)).toEqual(before);
      await context.database.query(
        "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [historical.runId],
      );
      const response = await requestHttp(
        `${context.api}/api/v1/internal/ask/runs/${historical.runId}/claim`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(context.dispatch, historical)}` },
          body: {
            version: 1,
            eventId: historical.eventId,
            runId: historical.runId,
            threadId: historical.threadId,
          },
        },
      );
      expect(response.status).toBe(200);
      const reclaimed = parseAskClaim(await response.json());
      if (reclaimed.disposition !== 'claimed' || reclaimed.input.step !== 'structured-price-v1')
        throw new Error('Historical structured claim required.');
      const execution = await requestHttp(`${context.ai}/internal/v1/runs/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${context.token}` },
        body: reclaimed.input,
      });
      expect(execution.status).toBe(200);
      const evidence = parseStructuredExecutionEvidence(await execution.json());
      expect(evidence.visitedNodes).toEqual(['fixedDecision', 'priceTool']);
      expect('explanation' in evidence).toBe(false);
      expect((await digest(context.database))[0]!.checkpoints).toBe(before[0]!.checkpoints);
      expect((await digest(context.database))[0]!.pending).toBe(before[0]!.pending);
      const complete = await requestHttp(
        `${context.api}/api/v1/internal/ask/runs/${historical.runId}/complete`,
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
      expect(complete.status).toBe(200);
      const retained = parseAskLiveRun(await complete.json());
      expect('explanation' in retained).toBe(false);
      const next = await create(context, 'en', historical.threadId);
      await context.fixture.up(['worker']);
      await vi.waitFor(
        async () => expect((await snapshot(context, next.accepted.runId)).state).toBe('completed'),
        { timeout: 30000, interval: 100 },
      );
      expect(await snapshot(context, historical.runId)).toEqual(retained);
      const thread = await requestHttp(`${context.api}/api/v1/threads/${historical.threadId}`, {
        headers: { Authorization: `Bearer ${context.capability}` },
      });
      expect(thread.status).toBe(200);
      const mixed = parseAskLiveThread(await thread.json());
      expect(mixed.basis).toBe('mixed-price-v1');
      expect(mixed.runs.map((run) => run.id)).toEqual([historical.runId, next.accepted.runId]);
      expect(
        await context.database.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
          [historical.runId],
        ),
      ).toEqual([{ count: 0 }]);
    },
    async (database, capability) => {
      await database.query(
        'CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const files = (await readdir(new URL('../migrations/', import.meta.url)))
        .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
        .sort();
      for (const file of files.filter((file) => file < '6005')) {
        const client = await database.leaseClient();
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
      }
      expect(
        await database.query<{ present: boolean }>(
          "SELECT to_regclass('ask.model_explanation') IS NOT NULL AS present",
        ),
      ).toEqual([{ present: false }]);
      const repository = new PostgresAskRunRepository(
        database,
        new PostgresTransactionRunner(database),
        new PostgresOutbox(database),
      );
      const run = await repository.create(
        {
          mode: 'structured-price-v1',
          threadId: null,
          placeId: null,
          locale: 'en',
          query: 'Historical native graph',
          inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
        },
        capability,
        secret(),
      );
      const rows = await database.query<{ event_id: string }>(
        'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
        [run.id],
      );
      const claimed = await repository.claim({
        version: 1,
        eventId: rows[0]!.event_id,
        runId: run.id,
        threadId: run.threadId,
      });
      if (claimed.disposition !== 'claimed' || claimed.input.step !== 'structured-price-v1')
        throw new Error('Historical claim required.');
      historical = claimed.input;
      const market = new PricePerSquareMeterService(),
        checkpoints = new PostgresGraphCheckpointRepository(
          database,
          new PostgresTransactionRunner(database),
        );
      const signal = AbortSignal.timeout(15000),
        deadlineAt = Date.now() + 10000;
      const saver = new RemoteCheckpointSaver(
        historical,
        {
          execute: (request, grant, cancellation) =>
            checkpoints.execute(request, grant, cancellation),
        },
        signal,
        deadlineAt,
      );
      const graph = compilePriceGraph(
        {
          calculate: (request, grant, cancellation) =>
            repository.tool(
              request,
              grant,
              (at) => market.pricePerSquareMeter(request.inputs, at),
              cancellation,
            ),
        },
        {
          executionId: historical.executionId,
          toolGrant: historical.toolGrant,
          signal,
          deadlineAt,
        },
        saver,
      );
      await graph.invoke(
        { input: durablePriceInput(historical) },
        { configurable: { thread_id: historical.threadId }, durability: 'sync' },
      );
      before = await digest(database);
      expect(before[0]!.checkpoints).toMatch(/^[a-f0-9]{32}$/);
      expect(before[0]!.pending).toMatch(/^[a-f0-9]{32}$/);
    },
  );
});
