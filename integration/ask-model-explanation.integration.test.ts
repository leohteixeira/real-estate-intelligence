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
  parseModelExplanation,
  parseModelExplanationResponse,
  parseStructuredExecutionEvidence,
  parsePriceToolReceipt,
  type ExplainedExecutionRequest,
  type StructuredExecutionRequest,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  askDispatchProof,
  askDigest,
  PostgresAskRunRepository,
  PostgresTransactionRunner,
  PostgresOutbox,
  PostgresGraphCheckpointRepository,
} from '../packages/infrastructure/dist/index.js';
import { explanationFacts, AskRunRequested } from '../packages/domain/dist/index.js';
import { AskRunService, PricePerSquareMeterService } from '../packages/application/dist/index.js';
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
  expect(await response.json()).toEqual({ generations: 0 });
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
    ANTHROPIC_API_KEY: '',
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
test.each(['approved', 'retry', 'invented', 'refusal', 'authentication', 'usage'] as const)(
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
              ['approved', 'retry'].includes(scenario) ? 'completed' : 'failed',
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
        // One 224-token reservation per provider request; only a transient failure adds a second.
        expect(attempts[0]).toEqual(
          scenario === 'retry' ? { total: 448, count: 2 } : { total: 224, count: 1 },
        );
        expect(
          await context.database.query<{ route: string; model: string; purpose: string }>(
            "SELECT DISTINCT document->>'route' AS route,document->>'model' AS model,document->>'purpose' AS purpose FROM ask.model_attempt WHERE run_id=$1",
            [run.id],
          ),
        ).toEqual([
          { route: 'anthropic-direct', model: 'claude-haiku-5-5', purpose: 'explanation' },
        ]);
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
          expect(run.explanation).toMatchObject({
            model: 'claude-haiku-5-5',
            route: 'anthropic-direct',
            privacyEvidenceId: null,
          });
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
    const reserve = (
      request: ExplainedExecutionRequest,
      maxOutputTokens = 200,
      provider: Record<string, string> = {},
    ) =>
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
          model: 'claude-haiku-5-5',
          route: 'anthropic-direct',
          maxOutputTokens,
          ...provider,
        },
      });
    // The retired gateway vocabulary and mixed shapes can no longer reserve budget.
    const retired: Record<string, string>[] = [
      { model: 'anthropic/claude-haiku-5.5', route: 'vercel-ai-gateway' },
      { model: 'deepseek/deepseek-v4-flash-0731', route: 'vercel-ai-gateway' },
      { purpose: 'privacy-probe', model: 'anthropic/claude-haiku-5.5', route: 'vercel-ai-gateway' },
      { purpose: 'privacy-probe' },
      { model: 'anthropic/claude-haiku-5.5' },
      { route: 'vercel-ai-gateway' },
    ];
    for (const provider of retired) expect((await reserve(input, 16, provider)).status).toBe(400);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
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
test('real cancelled request accepts no output and is not retried', async () =>
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
    ).toEqual([{ model: 'claude-haiku-5-5', purpose: 'explanation', total: 224 }]);
    expect(
      await context.database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.model_explanation WHERE run_id=$1',
        [input.runId],
      ),
    ).toEqual([{ count: 0 }]);
    expect((await snapshot(context, input.runId)).state).toBe('running');
  }));
test('real caller cancellation during generation retains conservative spend without retry', async () =>
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
        ).toEqual([{ total: 224, count: 1 }]),
      { timeout: 3000, interval: 25 },
    );
    await vi.waitFor(
      async () => {
        const response = await requestHttp(`${context.ai}/fixture/model-attempts`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ generations: 1 });
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
    ).toEqual([{ model: 'claude-haiku-5-5', purpose: 'explanation' }]);
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
    ).toEqual([{ total: 224 }]);
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
          model: 'claude-haiku-5-5',
          route: 'anthropic-direct',
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
    expect(budget).toEqual([{ total: 224, count: 1 }]);
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
      // Seed only genuine pre-6005 columns; current admission requires migration 6006.
      const allocation = (
        await database.query<{
          id: string;
          thread_id: string;
          event_id: string;
          execution_id: string;
          at: Date;
        }>(
          'SELECT uuidv7()::text AS id,uuidv7()::text AS thread_id,uuidv7()::text AS event_id,uuidv7()::text AS execution_id,clock_timestamp() AS at',
        )
      )[0]!;
      const at = allocation.at.toISOString();
      const inputs = { priceMinorUnits: 78500000, currency: 'BRL' as const, areaSquareMeters: 68 };
      const queued = parseAskLiveRun({
        basis: 'structured-price-v1',
        id: allocation.id,
        threadId: allocation.thread_id,
        principalId: null,
        question: 'Historical native graph',
        locale: 'en',
        placeId: null,
        createdAt: at,
        updatedAt: at,
        state: 'queued',
        originalInputs: inputs,
        decision: null,
        result: null,
        terminal: null,
        steps: [],
      });
      const running = parseAskLiveRun({
        ...queued,
        state: 'running',
        decision: {
          source: 'fixed-structured-v1',
          intent: 'price_per_square_meter',
          decidedAt: at,
        },
        steps: [{ sequence: 1, phase: 'calculating', at }],
      });
      const creationKey = askDigest(secret());
      const fingerprint = askDigest(
        JSON.stringify([
          queued.basis,
          null,
          null,
          queued.question,
          queued.locale,
          inputs.priceMinorUnits,
          inputs.currency,
          inputs.areaSquareMeters,
        ]),
      );
      const toolGrant = secret(),
        checkpointGrant = secret();
      historical = {
        version: 1,
        eventId: allocation.event_id,
        runId: queued.id,
        threadId: queued.threadId,
        executionId: allocation.execution_id,
        step: 'structured-price-v1',
        query: queued.question,
        locale: queued.locale,
        inputs,
        toolGrant,
        checkpointGrant,
      };
      const requested = new AskRunRequested(
        {
          version: 1,
          eventId: allocation.event_id,
          runId: queued.id,
          threadId: queued.threadId,
        },
        at,
      );
      const seed = await database.leaseClient();
      try {
        await seed.query('BEGIN');
        await seed.query(
          'INSERT INTO ask.thread(id,authority_digest,preparation_key) VALUES($1,$2,$3)',
          [queued.threadId, askDigest(capability), creationKey],
        );
        await seed.query(
          "INSERT INTO ask.run(id,thread_id,creation_key,request_fingerprint,requested_event_id,state,price_minor_units,area_square_meters,document,admitted_at,queue_expires_at,execution_id,claim_expires_at,grant_digest,checkpoint_grant_digest) VALUES($1,$2,$3,$4,$5,'running',$6,$7,$8,$9::timestamptz,$9::timestamptz+interval '120 seconds',$10,clock_timestamp()+interval '30 seconds',$11,$12)",
          [
            queued.id,
            queued.threadId,
            creationKey,
            fingerprint,
            allocation.event_id,
            inputs.priceMinorUnits,
            inputs.areaSquareMeters,
            running,
            at,
            allocation.execution_id,
            askDigest(toolGrant),
            askDigest(checkpointGrant),
          ],
        );
        for (const [index, run] of [queued, running].entries()) {
          const sequence = index + 1;
          await seed.query('INSERT INTO ask.run_event(run_id,sequence,document) VALUES($1,$2,$3)', [
            run.id,
            sequence,
            parseAskLiveEvent({
              version: 1,
              id: `${run.id}:v1:${sequence}`,
              runId: run.id,
              sequence,
              event: 'ask.progress',
              terminal: false,
              run,
            }),
          ]);
        }
        await seed.query(
          "INSERT INTO platform.idempotency_key(scope,idempotency_key,request_fingerprint,result_reference,expires_at) VALUES('ask.structured-create',$1,$2,$3,clock_timestamp()+interval '24 hours')",
          [creationKey, fingerprint, queued.id],
        );
        await seed.query(
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
        await seed.query('COMMIT');
      } catch (error) {
        await seed.query('ROLLBACK');
        throw error;
      } finally {
        seed.release();
      }
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

test('gateway-era evidence written before 6010 survives the direct-provider migration and stays readable beside direct runs', async () => {
  const upgrade = '6010_ask_anthropic_direct';
  let historical: { runId: string; threadId: string; document: unknown } | undefined;
  let before: unknown;
  // Every retained byte of the historical run, in the tables whose predicates 6010 rewrites.
  const retained = (database: DatabaseConnection, runId: string) =>
    database.query<{ run: unknown; events: unknown; attempts: unknown; explanation: unknown }>(
      `SELECT (SELECT to_jsonb(r) - 'updated_at' FROM ask.run r WHERE r.id=$1) AS run,
        (SELECT jsonb_agg(e.document ORDER BY e.sequence) FROM ask.run_event e WHERE e.run_id=$1) AS events,
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id) FROM ask.model_attempt a WHERE a.run_id=$1) AS attempts,
        (SELECT to_jsonb(m) FROM ask.model_explanation m WHERE m.run_id=$1) AS explanation`,
      [runId],
    );
  await owned(
    'approved',
    async (context) => {
      if (!historical) throw new Error('Historical gateway run required.');
      const headers = { Authorization: `Bearer ${context.capability}` };
      expect(
        await context.database.query<{ version: string }>(
          'SELECT version FROM schema_migrations WHERE version=$1',
          [upgrade],
        ),
      ).toEqual([{ version: upgrade }]);
      // The migration revalidated these rows under the widened predicates and rewrote nothing.
      expect(await retained(context.database, historical.runId)).toEqual(before);
      const old = await snapshot(context, historical.runId);
      expect(old).toEqual(historical.document);
      if (old.basis !== 'text-price-explanation-v1') throw new Error('Explained run required.');
      expect(old.explanation).toMatchObject({
        model: 'anthropic/claude-haiku-5.5',
        route: 'vercel-ai-gateway',
        privacyEvidenceId: 'historical-privacy-evidence-0001',
      });
      const stream = await requestHttp(`${context.api}/api/v1/runs/${old.id}/events`, { headers });
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
      expect(events.at(-1)?.run).toEqual(old);
      // A direct run in the same thread is written with the new vocabulary beside the old one.
      const next = await create(context, 'en', historical.threadId);
      await context.fixture.up(['worker']);
      await vi.waitFor(
        async () => expect((await snapshot(context, next.accepted.runId)).state).toBe('completed'),
        { timeout: 30000, interval: 100 },
      );
      const direct = await snapshot(context, next.accepted.runId);
      if (direct.basis !== 'text-price-explanation-v1') throw new Error('Explained run required.');
      expect(direct.explanation).toMatchObject({
        model: 'claude-haiku-5-5',
        route: 'anthropic-direct',
        privacyEvidenceId: null,
      });
      const thread = await requestHttp(`${context.api}/api/v1/threads/${historical.threadId}`, {
        headers,
      });
      expect(thread.status).toBe(200);
      expect(parseAskLiveThread(await thread.json()).runs.map((run) => run.id)).toEqual([
        old.id,
        direct.id,
      ]);
      expect(
        await context.database.query<{
          relation: string;
          route: string;
          model: string;
          purpose: string | null;
          evidence: string | null;
        }>(
          `SELECT 'attempt' AS relation,document->>'route' AS route,document->>'model' AS model,document->>'purpose' AS purpose,NULL AS evidence FROM ask.model_attempt
           UNION ALL SELECT 'explanation',document->>'route',document->>'model',NULL,document->>'privacyEvidenceId' FROM ask.model_explanation
           UNION ALL SELECT 'run',document->'explanation'->>'route',document->'explanation'->>'model',NULL,document->'explanation'->>'privacyEvidenceId' FROM ask.run
           ORDER BY 1,2,4`,
        ),
      ).toEqual([
        {
          relation: 'attempt',
          route: 'anthropic-direct',
          model: 'claude-haiku-5-5',
          purpose: 'explanation',
          evidence: null,
        },
        {
          relation: 'attempt',
          route: 'vercel-ai-gateway',
          model: 'anthropic/claude-haiku-5.5',
          purpose: 'explanation',
          evidence: null,
        },
        {
          relation: 'attempt',
          route: 'vercel-ai-gateway',
          model: 'anthropic/claude-haiku-5.5',
          purpose: 'privacy-probe',
          evidence: null,
        },
        {
          relation: 'explanation',
          route: 'anthropic-direct',
          model: 'claude-haiku-5-5',
          purpose: null,
          evidence: null,
        },
        {
          relation: 'explanation',
          route: 'vercel-ai-gateway',
          model: 'anthropic/claude-haiku-5.5',
          purpose: null,
          evidence: 'historical-privacy-evidence-0001',
        },
        {
          relation: 'run',
          route: 'anthropic-direct',
          model: 'claude-haiku-5-5',
          purpose: null,
          evidence: null,
        },
        {
          relation: 'run',
          route: 'vercel-ai-gateway',
          model: 'anthropic/claude-haiku-5.5',
          purpose: null,
          evidence: 'historical-privacy-evidence-0001',
        },
      ]);
      // With the immutability triggers out of the way, the CHECK predicates alone decide. Each
      // statement runs in its own rolled-back transaction, so no retained byte changes.
      const attempt = async (statement: string, parameters: unknown[]) => {
        const client = await context.database.leaseClient();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL session_replication_role = replica');
          await client.query(statement, parameters);
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      };
      const patchEvidence = (relation: 'model_attempt' | 'model_explanation') =>
        `UPDATE ask.${relation} SET document=document || $2::jsonb WHERE run_id=$1`;
      const patchRun =
        "UPDATE ask.run SET document=jsonb_set(document,'{explanation}',(document->'explanation') || $2::jsonb) WHERE id=$1";
      // Control: an identity rewrite passes, so a refusal below comes from a predicate.
      for (const runId of [old.id, direct.id]) {
        await attempt(patchEvidence('model_attempt'), [runId, '{}']);
        await attempt(patchEvidence('model_explanation'), [runId, '{}']);
        await attempt(patchRun, [runId, '{}']);
      }
      for (const [statement, runId, patch] of [
        [patchEvidence('model_attempt'), direct.id, { purpose: 'privacy-probe' }],
        [patchEvidence('model_attempt'), direct.id, { model: 'anthropic/claude-haiku-5.5' }],
        [patchEvidence('model_attempt'), direct.id, { route: 'another-route' }],
        [patchEvidence('model_attempt'), old.id, { model: 'claude-haiku-5-5' }],
        [
          patchEvidence('model_explanation'),
          direct.id,
          { privacyEvidenceId: 'invented-evidence-1' },
        ],
        [patchEvidence('model_explanation'), direct.id, { model: 'anthropic/claude-haiku-5.5' }],
        [patchEvidence('model_explanation'), old.id, { model: 'claude-haiku-5-5' }],
        [patchEvidence('model_explanation'), old.id, { route: 'another-route' }],
        [patchRun, direct.id, { privacyEvidenceId: 'invented-evidence-1' }],
        [patchRun, direct.id, { model: 'anthropic/claude-haiku-5.5' }],
        [patchRun, old.id, { route: 'another-route' }],
      ] as const)
        await expect(attempt(statement, [runId, JSON.stringify(patch)])).rejects.toThrow(
          /check constraint/,
        );
      expect(await retained(context.database, historical.runId)).toEqual(before);
    },
    async (database, capability) => {
      await database.query(
        'CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const files = (await readdir(new URL('../migrations/', import.meta.url)))
        .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
        .sort();
      expect(files).toContain(`${upgrade}.sql`);
      for (const file of files.filter((file) => file < '6010')) {
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
      // Admission, claim, tool receipt and terminal commit go through the real persistence code on
      // the pre-6010 schema. Only the two model evidence inserts are issued here, because the
      // current repository can no longer write the retired vocabulary; they are the repository's
      // own statements with the gateway documents, under the live fences and 6009 predicates.
      const market = new PricePerSquareMeterService();
      const facade = new AskRunService(
        new PostgresAskRunRepository(
          database,
          new PostgresTransactionRunner(database),
          new PostgresOutbox(database),
        ),
        market,
      );
      const admitted = await facade.createText(
        {
          mode: 'text-price-explanation-v1',
          threadId: null,
          placeId: null,
          locale: 'en',
          query: 'What is the price per square meter for BRL 785,000.00 and 68 square meters?',
        },
        capability,
        secret(),
        { visitorDigest: 'a'.repeat(64) },
      );
      if (admitted.kind !== 'accepted') throw new Error('Expected historical admission.');
      const run = admitted.run;
      const event = (
        await database.query<{ event_id: string }>(
          'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
          [run.id],
        )
      )[0]!;
      const identity = {
        version: 1 as const,
        eventId: event.event_id,
        runId: run.id,
        threadId: run.threadId,
      };
      const claimed = await facade.claim(identity);
      if (claimed.disposition !== 'claimed' || claimed.input.step !== 'text-price-explanation-v1')
        throw new Error('Expected historical explained claim.');
      const input = claimed.input;
      const receipt = await facade.tool(
        {
          ...identity,
          executionId: input.executionId,
          operation: 'price-per-square-meter',
          inputs: input.inputs,
        },
        input.toolGrant,
        (at) => market.pricePerSquareMeter(input.inputs, at),
      );
      const reserve = async (purpose: 'privacy-probe' | 'explanation', maxOutputTokens: number) => {
        const row = (
          await database.query<{ id: string; total: number }>(
            'SELECT uuidv7()::text AS id,(SELECT COALESCE(sum(max_output_tokens),0)::integer FROM ask.model_attempt WHERE run_id=$1)+$2::integer AS total',
            [run.id, maxOutputTokens],
          )
        )[0]!;
        const response = parseModelExplanationResponse({
          operation: 'reserve',
          reservation: {
            reservationId: row.id,
            attemptKey: secret(),
            purpose,
            model: 'anthropic/claude-haiku-5.5',
            route: 'vercel-ai-gateway',
            maxOutputTokens,
            reservedTotal: row.total,
          },
        });
        if (response.operation !== 'reserve') throw new Error('Expected reservation.');
        await database.query(
          'INSERT INTO ask.model_attempt(run_id,id,attempt_key,execution_id,max_output_tokens,document) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            run.id,
            response.reservation.reservationId,
            response.reservation.attemptKey,
            input.executionId,
            maxOutputTokens,
            response.reservation,
          ],
        );
        return response.reservation;
      };
      await reserve('privacy-probe', 16);
      const reservation = await reserve('explanation', 224);
      const explanation = parseModelExplanation({
        ...identity,
        explanationId: reservation.reservationId,
        toolReceiptId: receipt.receiptId,
        reservationId: reservation.reservationId,
        authorship: 'model-written',
        promptVersion: 'price-explanation-prompt-v1',
        grammarVersion: 'price-explanation-facts-v1',
        locale: 'en',
        text: explanationFacts(receipt, 'en').join(' '),
        model: 'anthropic/claude-haiku-5.5',
        route: 'vercel-ai-gateway',
        privacyEvidenceId: 'historical-privacy-evidence-0001',
        outputTokens: 64,
        acceptedAt: new Date().toISOString(),
      });
      await database.query(
        'INSERT INTO ask.model_explanation(run_id,id,tool_receipt_id,reservation_id,document) VALUES ($1,$2,$3,$4,$5)',
        [
          run.id,
          explanation.explanationId,
          receipt.receiptId,
          reservation.reservationId,
          explanation,
        ],
      );
      // The 6009 predicates still refuse the direct vocabulary: this is the pre-upgrade schema.
      await expect(
        database.query(
          'INSERT INTO ask.model_attempt(run_id,id,attempt_key,execution_id,max_output_tokens,document) VALUES ($1,uuidv7(),$2,$3,16,$4)',
          [
            run.id,
            secret(),
            input.executionId,
            { purpose: 'explanation', model: 'claude-haiku-5-5', route: 'anthropic-direct' },
          ],
        ),
      ).rejects.toThrow();
      const completed = await facade.complete({
        ...identity,
        executionId: input.executionId,
        evidence: parseExplainedExecutionEvidence({
          ...identity,
          executionId: input.executionId,
          step: 'text-price-explanation-v1',
          outcome: 'price-calculated',
          visitedNodes: ['validatedInputs', 'priceTool', 'modelExplanation'],
          receipt,
          explanation,
        }),
        failure: null,
      });
      expect(completed.state).toBe('completed');
      historical = { runId: run.id, threadId: run.threadId, document: completed };
      before = await retained(database, run.id);
      expect(before).toEqual([
        expect.objectContaining({
          explanation: expect.objectContaining({ document: explanation }),
        }),
      ]);
    },
  );
});
