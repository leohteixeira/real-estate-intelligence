import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import { getContainerRuntimeClient, getReaper } from 'testcontainers';
import { DatabaseConnection, askDispatchProof } from '../packages/infrastructure/dist/index.js';
import {
  parseAskLiveRun,
  parseAskLiveEvent,
  parseAskClaim,
  parseRoutedExplainedAskAccepted,
  parseRoutedExecutionEvidence,
  type AskLiveRun,
  type RoutedExplainedAskLiveRun,
  type RoutedExplainedExecutionInput,
} from '../packages/contracts/dist/index.js';
import { allocatePorts, ComposeFixture, preserveCleanup, cleanupAll } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
const secret = () => randomBytes(32).toString('base64url');
const inputs = { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 };
const query = 'What is the price per square meter for BRL 785,000.00 and 68 square meters?';
const sentinels = [
  'rei-private-query-sentinel',
  'rei-private-provider-response-sentinel',
  'rei-private-provider-key-sentinel',
  'rei-private-url-query-sentinel',
  'rei-private-sql-error-sentinel',
];
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid OTLP object.');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid OTLP array.');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid OTLP string.');
  return value;
}
function attributes(value: unknown): Record<string, string | number | boolean> {
  return Object.fromEntries(
    array(value ?? []).map((entry) => {
      const item = object(entry),
        scalar = object(item.value);
      const found = scalar.stringValue ?? scalar.doubleValue ?? scalar.intValue ?? scalar.boolValue;
      if (!['string', 'number', 'boolean'].includes(typeof found))
        throw new Error('Invalid OTLP scalar.');
      return [text(item.key), found as string | number | boolean];
    }),
  );
}
interface ExportSpan {
  id: string;
  parent: string | undefined;
  trace: string;
  name: string;
  startedAtMs: number;
  service: string;
  attrs: Record<string, string | number | boolean>;
  status: number;
  events: unknown[];
}
function spans(payload: unknown): ExportSpan[] {
  return array(payload).flatMap((batch) =>
    array(object(batch).resourceSpans).flatMap((resource) => {
      const item = object(resource),
        service = text(attributes(object(item.resource).attributes)['service.name']);
      return array(item.scopeSpans).flatMap((scope) =>
        array(object(scope).spans).map((span) => {
          const found = object(span);
          return {
            id: text(found.spanId),
            parent: found.parentSpanId === undefined ? undefined : text(found.parentSpanId),
            trace: text(found.traceId),
            name: text(found.name),
            startedAtMs: Number(found.startTimeUnixNano) / 1_000_000,
            service,
            attrs: attributes(found.attributes),
            status: found.status === undefined ? 0 : Number(object(found.status).code ?? 0),
            events: array(found.events ?? []),
          };
        }),
      );
    }),
  );
}
function combined(run: AskLiveRun): RoutedExplainedAskLiveRun {
  if (run.basis !== 'routed-text-explanation-v1') throw new Error('Expected combined run.');
  return run;
}
function assertChain(exported: ExportSpan[], traceId: string, runId: string) {
  const chain = exported.filter((span) => span.trace === traceId);
  const byId = new Map(chain.map((span) => [span.id, span]));
  function ancestor(child: ExportSpan, name: string, service?: string): ExportSpan {
    let current: ExportSpan | undefined = child;
    for (let depth = 0; depth < chain.length; depth++) {
      current = current.parent ? byId.get(current.parent) : undefined;
      if (!current) break;
      if (current.name === name && (!service || current.service === service)) return current;
    }
    throw new Error(`Missing exported ancestor ${name} for ${child.name}.`);
  }
  const run = chain.find(
    (span) => span.name === 'ask.run' && span.attrs['rei.ask.run_id'] === runId,
  );
  expect(run).toBeDefined();
  if (!run) throw new Error('Missing run.');
  expect(run.attrs).toMatchObject({ 'rei.ask.outcome': 'price-calculated' });
  expect(Number(run.attrs['rei.ask.queue_duration_ms'])).toBeGreaterThanOrEqual(0);
  expect(Number(run.attrs['rei.ask.total_duration_ms'])).toBeGreaterThanOrEqual(
    Number(run.attrs['rei.ask.queue_duration_ms']),
  );
  const consume = ancestor(run, 'messaging.consume', 'real-estate-intelligence-worker');
  const publish = ancestor(consume, 'outbox.publish', 'real-estate-intelligence-worker');
  ancestor(publish, 'http.request', 'real-estate-intelligence-api');
  for (const name of ['typedDecision', 'confidenceGate', 'executeIntent', 'modelExplanation']) {
    const node = chain.find(
      (span) => span.name === `ask.graph.${name}` && span.attrs['rei.ask.run_id'] === runId,
    );
    expect(node).toBeDefined();
    if (node) expect(ancestor(node, 'ask.run').id).toBe(run.id);
  }
  for (const name of ['ask.decision', 'ask.tool', 'ask.checkpoint']) {
    const found = chain.filter(
      (span) => span.name === name && span.attrs['rei.ask.run_id'] === runId,
    );
    expect(found.length).toBeGreaterThan(0);
    for (const span of found) {
      expect(ancestor(span, 'ask.run').id).toBe(run.id);
      expect(span.attrs['rei.operation.result']).toBe('succeeded');
      if (name === 'ask.tool') expect(span.attrs['rei.ask.tool']).toBe('price-per-square-meter');
      if (name === 'ask.checkpoint')
        expect(['get', 'list', 'put', 'put-writes']).toContain(
          span.attrs['rei.ask.checkpoint_operation'],
        );
    }
  }
  const gate = chain.find(
    (span) => span.name === 'ask.graph.confidenceGate' && span.attrs['rei.ask.run_id'] === runId,
  )!;
  expect(gate.attrs).toMatchObject({
    'rei.ask.intent': 'price_per_square_meter',
    'rei.ask.confidence': 0.85,
    'rei.ask.decision_source': 'gateway-jev-v1',
    'rei.ask.degraded': false,
    'rei.ask.confirmed': false,
  });
  expect(gate.events.some((event) => object(event).name === 'ask.graph.transition')).toBe(true);
  const physical = chain.filter((span) =>
    ['ask.decision.attempt', 'ask.model.attempt'].includes(span.name),
  );
  expect(physical.filter((span) => span.name === 'ask.decision.attempt')).toHaveLength(2);
  expect(physical.filter((span) => span.name === 'ask.model.attempt')).toHaveLength(2);
  for (const attempt of physical) {
    expect(attempt.attrs).toMatchObject({
      'rei.ai.provider': 'vercel-ai-gateway',
      'rei.ai.route': 'vercel-ai-gateway',
      'rei.ai.cost': 'unavailable',
    });
    expect(Number(attempt.attrs['rei.ai.duration_ms'])).toBeGreaterThanOrEqual(0);
    expect(attempt.attrs['rei.ai.model']).toBe(
      attempt.name === 'ask.decision.attempt' ? 'typesafe-ai/jev' : 'anthropic/claude-haiku-5.5',
    );
    if (attempt.name === 'ask.decision.attempt') {
      ancestor(attempt, 'ask.decision');
      expect(attempt.attrs['rei.ai.usage']).toBe('unavailable');
    } else {
      ancestor(attempt, 'ask.graph.modelExplanation');
      expect(attempt.attrs['rei.ai.usage']).toBe('available');
      expect(Number(attempt.attrs['rei.ai.output_tokens'])).toBeGreaterThan(0);
    }
  }
}

test('one private exported trace covers native combined runs, confirmation, recovery and historical partitions', async () => {
  await getReaper(await getContainerRuntimeClient());
  const [postgres, apiPort, aiPort, rabbit, management, minio, consolePort, capturePort] =
    await allocatePorts(8);
  const token = secret(),
    dispatch = secret(),
    capability = secret();
  const fixture = new ComposeFixture(`rei-trace-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    API_PORT: String(apiPort),
    AI_PORT: String(aiPort),
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    MINIO_API_PORT: String(minio),
    MINIO_CONSOLE_PORT: String(consolePort),
    POSTGRES_USER: 'rei_trace',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_trace',
    RABBITMQ_USER: 'rei_trace',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_trace',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: token,
    AI_GATEWAY_API_KEY: '',
    ASK_DISPATCH_SECRET: dispatch,
    SNAPSHOT_ENCRYPTION_KEY_ID: 'trace-fixture-v1',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://trace-capture:4318',
  });
  const api = `http://127.0.0.1:${apiPort}`,
    ai = `http://127.0.0.1:${aiPort}`,
    capture = `http://127.0.0.1:${capturePort}`;
  const command = (args: string[]) =>
    fixture.execute(
      'docker',
      ['compose', '--file', 'compose.yaml', '--project-name', fixture.project, ...args],
      { cwd: root, env: fixture.environment, timeout: 240000 },
    );
  const owned = new Set<string>();
  let database: DatabaseConnection | undefined;
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
  const health = async () => {
    await vi.waitFor(async () => expect((await requestHttp(`${api}/health`)).status).toBe(200), {
      timeout: 30000,
      interval: 100,
    });
    await vi.waitFor(async () => expect((await requestHttp(`${ai}/health`)).status).toBe(200), {
      timeout: 30000,
      interval: 100,
    });
  };
  const read = async (id: string) => {
    const response = await requestHttp(`${api}/api/v1/runs/${id}`, {
      headers: { Authorization: `Bearer ${capability}` },
    });
    expect(response.status).toBe(200);
    return parseAskLiveRun(await response.json());
  };
  const wait = async (id: string, state: AskLiveRun['state']) => {
    await vi.waitFor(async () => expect((await read(id)).state).toBe(state), {
      timeout: 40000,
      interval: 100,
    });
    return read(id);
  };
  const create = async (
    mode = 'routed-text-explanation-v1',
    locale: 'en' | 'pt-BR' = 'en',
    suffix = '',
  ) => {
    const trace = randomBytes(16).toString('hex');
    const body = {
      mode,
      threadId: null,
      placeId: null,
      locale,
      query:
        (locale === 'en'
          ? query
          : 'Qual é o preço por metro quadrado de um imóvel de R$ 785.000,00 com 68 m²?') + suffix,
      ...(mode === 'structured-price-v1' ? { inputs } : {}),
    };
    const response = await requestHttp(`${api}/api/v1/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${capability}`,
        'Idempotency-Key': secret(),
        traceparent: `00-${trace}-${randomBytes(8).toString('hex')}-01`,
      },
      body,
    });
    expect(response.status).toBe(202);
    const accepted = object(await response.json());
    if (mode === 'routed-text-explanation-v1') parseRoutedExplainedAskAccepted(accepted);
    const id = text(accepted.runId);
    return { id, trace };
  };
  await preserveCleanup(
    async () => {
      for (const service of ['migrations', 'api', 'ai', 'worker'])
        await fixture.execute('docker', [
          'image',
          'tag',
          `rei-intent-images-${service}`,
          `${fixture.project}-${service}`,
        ]);
      await fixture.up(['postgres', 'rabbitmq', 'minio']);
      const url = new URL(`postgres://127.0.0.1:${postgres}/rei_trace`);
      url.username = fixture.environment.POSTGRES_USER!;
      url.password = fixture.environment.POSTGRES_PASSWORD!;
      database = new DatabaseConnection(url.toString());
      const db = database;
      await db.query(
        'CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const files = (await readdir(new URL('../migrations/', import.meta.url)))
        .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
        .sort();
      for (const file of files.filter((file) => file < '6008')) {
        await db.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
        await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [file.slice(0, -4)]);
      }
      const collector = `${fixture.project}-capture`;
      await fixture.execute('docker', [
        'run',
        '--detach',
        '--name',
        collector,
        '--label',
        `com.docker.compose.project=${fixture.project}`,
        '--network',
        `${fixture.project}_default`,
        '--network-alias',
        'trace-capture',
        '--publish',
        `${capturePort}:4318`,
        '--volume',
        `${root}:/source:ro`,
        '--entrypoint',
        'node',
        `${fixture.project}-ai`,
        '/source/integration/fixtures/ask-trace-capture.ts',
      ]);
      owned.add(collector);
      await vi.waitFor(
        async () => expect((await requestHttp(`${capture}/fixture/export`)).status).toBe(200),
        { timeout: 30000, interval: 100 },
      );
      await command(['up', '--detach', '--no-deps', 'api']);
      const scripted = `${fixture.project}-scripted-ai`;
      await command([
        'run',
        '--detach',
        '--no-deps',
        '--use-aliases',
        '--name',
        scripted,
        '--publish',
        `${aiPort}:4111`,
        '--volume',
        `${root}:/source:ro`,
        // Resolve preload and AppModule from the same dist and shutdown bridge instance.
        '--workdir',
        '/source/apps/ai',
        '--entrypoint',
        'node',
        'ai',
        '-r',
        './dist/otel.js',
        '/source/integration/fixtures/ask-trace-fixture-bootstrap.ts',
      ]);
      owned.add(scripted);
      await health();
      await command(['up', '--detach', '--no-deps', 'worker']);
      const historical: string[] = [];
      for (const mode of ['structured-price-v1', 'text-price-v1', 'text-price-explanation-v1']) {
        const old = await create(mode);
        await wait(old.id, 'completed');
        historical.push(old.id);
      }
      const oldRouted = await create('routed-text-v1', 'en', ' uncertain');
      await wait(oldRouted.id, 'awaiting_confirmation');
      historical.push(oldRouted.id);
      await command(['stop', 'worker']);
      const digest = () =>
        db.query<{ rows: string }>(
          `SELECT md5((SELECT string_agg(to_jsonb(r)::text,'' ORDER BY id) FROM ask.run r WHERE id=ANY($1::uuid[])) ||
      (SELECT string_agg(to_jsonb(e)::text,'' ORDER BY run_id,sequence) FROM ask.run_event e WHERE run_id=ANY($1::uuid[])) ||
      (SELECT string_agg(to_jsonb(c)::text,'' ORDER BY run_id,sequence) FROM ask.graph_checkpoint c WHERE run_id=ANY($1::uuid[])) ||
      (SELECT string_agg(to_jsonb(w)::text,'' ORDER BY run_id,checkpoint_id,task_id,write_index) FROM ask.graph_pending_write w WHERE run_id=ANY($1::uuid[])) ||
      (SELECT string_agg(to_jsonb(t)::text,'' ORDER BY run_id) FROM ask.tool_receipt t WHERE run_id=ANY($1::uuid[])) ||
      (SELECT string_agg(to_jsonb(m)::text,'' ORDER BY run_id) FROM ask.model_explanation m WHERE run_id=ANY($1::uuid[]))) AS rows`,
          [historical],
        );
      const before = await digest();
      expect(before[0]?.rows).toMatch(/^[a-f0-9]{32}$/);
      await fixture.up(['migrations']);
      expect(await digest()).toEqual(before);
      expect(
        await db.query<{ graph_version: string }>(
          'SELECT DISTINCT graph_version FROM ask.graph_checkpoint ORDER BY graph_version',
        ),
      ).toEqual([
        { graph_version: 'intent-routing-v1' },
        { graph_version: 'price-explanation-v1' },
        { graph_version: 'price-v1' },
      ]);
      const oldPaused = await read(oldRouted.id);
      if (oldPaused.basis !== 'routed-text-v1' || !oldPaused.decision)
        throw new Error('Expected old pause.');
      const confirm = async (id: string, receiptId: string) => {
        const response = await requestHttp(`${api}/api/v1/runs/${id}/confirm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${capability}` },
          body: {
            runId: id,
            decisionReceiptId: receiptId,
            inputs: { ...inputs, areaSquareMeters: 100 },
          },
        });
        expect(response.status).toBe(200);
      };
      await confirm(oldRouted.id, oldPaused.decision.receiptId);
      await command(['start', 'worker']);
      expect(await wait(oldRouted.id, 'completed')).toMatchObject({
        basis: 'routed-text-v1',
        result: { minorUnits: 785000 },
      });
      const native: Array<{ id: string; trace: string }> = [];
      for (const locale of ['en', 'pt-BR'] as const) {
        const created = await create(
          'routed-text-explanation-v1',
          locale,
          ' rei-private-query-sentinel',
        );
        native.push(created);
        const completed = combined(await wait(created.id, 'completed'));
        expect(completed).toMatchObject({
          result: { minorUnits: 1154412, inputs },
          explanation: { authorship: 'model-written', locale },
        });
        expect(completed.explanation?.text).not.toContain('rei-private-query-sentinel');
        const stream = await requestHttp(`${api}/api/v1/runs/${created.id}/events`, {
          headers: { Authorization: `Bearer ${capability}` },
        });
        expect(stream.status).toBe(200);
        const events = (await stream.text())
          .split(/\r?\n\r?\n/)
          .filter((block) => block.trim() && !block.startsWith(':'))
          .map((block) =>
            parseAskLiveEvent(
              JSON.parse(
                block
                  .split(/\r?\n/)
                  .filter((line) => line.startsWith('data:'))
                  .map((line) => line.slice(5))
                  .join('\n'),
              ),
            ),
          );
        expect(events.at(-1)?.run).toStrictEqual(completed);
        expect(events.filter((event) => event.terminal)).toHaveLength(1);
      }
      const low = await create('routed-text-explanation-v1', 'en', ' uncertain');
      const paused = combined(await wait(low.id, 'awaiting_confirmation'));
      expect(paused.explanation).toBeNull();
      await command(['stop', 'worker']);
      await command(['restart', 'api']);
      await fixture.execute('docker', ['restart', scripted]);
      await health();
      expect(await read(low.id)).toEqual(paused);
      await confirm(low.id, paused.decision!.receiptId);
      const queuedResume = await read(low.id);
      expect(queuedResume.state).toBe('queued');
      await command(['start', 'worker']);
      const resumed = combined(await wait(low.id, 'completed'));
      expect(resumed).toMatchObject({
        decision: paused.decision,
        result: { minorUnits: 785000, inputs: { areaSquareMeters: 100 } },
        explanation: { authorship: 'model-written' },
      });
      expect(await (await requestHttp(`${ai}/fixture/attempts`)).json()).toEqual({
        decisionProbes: 0,
        decisions: 0,
        probes: 1,
        generations: 1,
      });
      const unavailable = await create('routed-text-explanation-v1', 'en', ' listing search');
      const unavailableRun = combined(await wait(unavailable.id, 'completed'));
      expect(unavailableRun).toMatchObject({
        result: { kind: 'unavailable_intent', intent: 'listing_search' },
        explanation: null,
      });
      expect(
        await db.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
          [unavailable.id],
        ),
      ).toEqual([{ count: 0 }]);
      await command(['stop', 'worker']);
      const recovery = await create();
      const identityRow = (
        await db.query<{ event_id: string; thread_id: string }>(
          'SELECT requested_event_id::text AS event_id,thread_id::text FROM ask.run WHERE id=$1',
          [recovery.id],
        )
      )[0]!;
      const identity = {
        version: 1 as const,
        runId: recovery.id,
        threadId: identityRow.thread_id,
        eventId: identityRow.event_id,
      };
      const claim = async (): Promise<RoutedExplainedExecutionInput> => {
        const response = await requestHttp(`${api}/api/v1/internal/ask/runs/${recovery.id}/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatch, identity)}` },
          body: identity,
        });
        expect(response.status).toBe(200);
        const found = parseAskClaim(await response.json());
        if (found.disposition !== 'claimed' || found.input.step !== 'routed-text-explanation-v1')
          throw new Error('Expected combined claim.');
        return found.input;
      };
      const first = await claim();
      sentinels.push(
        first.toolGrant,
        first.checkpointGrant,
        token,
        dispatch,
        capability,
        url.toString(),
      );
      const execute = (input: RoutedExplainedExecutionInput) =>
        requestHttp(`${ai}/internal/v1/runs/execute`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            traceparent: `00-${recovery.trace}-${randomBytes(8).toString('hex')}-01`,
          },
          body: input,
        });
      await db.query(`CREATE FUNCTION ask.fixture_reject_accepted_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS (SELECT 1 FROM ask.model_explanation WHERE run_id=NEW.run_id) THEN RAISE EXCEPTION 'rei-private-sql-error-sentinel'; END IF;
      RETURN NEW; END $$; CREATE TRIGGER fixture_reject_accepted_checkpoint BEFORE INSERT ON ask.graph_checkpoint FOR EACH ROW EXECUTE FUNCTION ask.fixture_reject_accepted_checkpoint()`);
      expect((await execute(first)).status).toBe(503);
      const accepted = await db.query<{ document: unknown }>(
        'SELECT document FROM ask.model_explanation WHERE run_id=$1',
        [recovery.id],
      );
      expect(accepted).toHaveLength(1);
      const budget = () =>
        db.query<{ total: number; count: number }>(
          'SELECT sum(max_output_tokens)::integer AS total,count(*)::integer AS count FROM ask.model_attempt WHERE run_id=$1',
          [recovery.id],
        );
      expect(await budget()).toEqual([{ total: 240, count: 2 }]);
      await db.query(
        'DROP TRIGGER fixture_reject_accepted_checkpoint ON ask.graph_checkpoint; DROP FUNCTION ask.fixture_reject_accepted_checkpoint()',
      );
      await fixture.execute('docker', ['restart', scripted]);
      await health();
      await db.query(
        "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [recovery.id],
      );
      const replacement = await claim();
      expect(replacement.executionId).not.toBe(first.executionId);
      expect(replacement.queueDurationMs).toBe(0);
      const checkpoint = (input: RoutedExplainedExecutionInput, graphVersion: string) =>
        requestHttp(`${api}/api/v1/ask/runs/${recovery.id}/checkpoints`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${input.checkpointGrant}` },
          body: {
            ...identity,
            executionId: input.executionId,
            graphVersion,
            namespace: '',
            operation: 'get',
            checkpointId: null,
          },
        });
      expect((await checkpoint(replacement, 'intent-routing-v1')).status).toBe(403);
      expect((await checkpoint(first, 'intent-price-explanation-v1')).status).toBe(403);
      const reserve = await requestHttp(
        `${api}/api/v1/internal/ask/runs/${recovery.id}/model-explanation`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${first.checkpointGrant}` },
          body: {
            ...identity,
            executionId: first.executionId,
            operation: 'reserve',
            attemptKey: secret(),
            purpose: 'explanation',
            model: 'anthropic/claude-haiku-5.5',
            route: 'vercel-ai-gateway',
            maxOutputTokens: 224,
          },
        },
      );
      expect(reserve.status).toBe(403);
      const recoveredResponse = await execute(replacement);
      expect(recoveredResponse.status).toBe(200);
      const recovered = parseRoutedExecutionEvidence(await recoveredResponse.json());
      if (
        recovered.step !== 'routed-text-explanation-v1' ||
        recovered.outcome !== 'price-calculated'
      )
        throw new Error('Expected recovered explanation.');
      expect(recovered.explanation).toEqual(accepted[0]!.document);
      expect(recovered.receipt.executionId).toBe(replacement.executionId);
      expect(await budget()).toEqual([{ total: 240, count: 2 }]);
      expect(await (await requestHttp(`${ai}/fixture/attempts`)).json()).toEqual({
        decisionProbes: 0,
        decisions: 0,
        probes: 0,
        generations: 0,
      });
      const complete = (executionId: string) =>
        requestHttp(`${api}/api/v1/internal/ask/runs/${recovery.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatch, identity)}` },
          body: {
            ...identity,
            executionId,
            evidence: { ...recovered, executionId, receipt: { ...recovered.receipt, executionId } },
            failure: null,
          },
        });
      expect((await complete(first.executionId)).status).toBe(403);
      for (let replay = 0; replay < 2; replay++)
        expect((await complete(replacement.executionId)).status).toBe(200);
      expect(
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.completed'",
          [recovery.id],
        ),
      ).toEqual([{ count: 1 }]);
      const cancelled = await create();
      const cancelledRow = (
        await db.query<{ event_id: string; thread_id: string }>(
          'SELECT requested_event_id::text AS event_id,thread_id::text FROM ask.run WHERE id=$1',
          [cancelled.id],
        )
      )[0]!;
      const cancelledIdentity = {
        version: 1 as const,
        runId: cancelled.id,
        threadId: cancelledRow.thread_id,
        eventId: cancelledRow.event_id,
      };
      const cancellationClaim = await requestHttp(
        `${api}/api/v1/internal/ask/runs/${cancelled.id}/claim`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatch, cancelledIdentity)}` },
          body: cancelledIdentity,
        },
      );
      expect(cancellationClaim.status).toBe(200);
      const claimedCancelled = parseAskClaim(await cancellationClaim.json());
      if (claimedCancelled.disposition !== 'claimed')
        throw new Error('Expected claim before cancellation.');
      expect(
        (
          await requestHttp(`${api}/api/v1/runs/${cancelled.id}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${capability}` },
            body: { reason: 'visitor_cancelled' },
          })
        ).status,
      ).toBe(200);
      for (const route of ['model-explanation', 'checkpoint']) {
        const response = await requestHttp(
          `${api}/api/v1/${route === 'checkpoint' ? 'ask' : 'internal/ask'}/runs/${cancelled.id}/${route === 'checkpoint' ? 'checkpoints' : route}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${claimedCancelled.input.checkpointGrant}` },
            body:
              route === 'checkpoint'
                ? {
                    ...cancelledIdentity,
                    executionId: claimedCancelled.input.executionId,
                    graphVersion: 'intent-price-explanation-v1',
                    namespace: '',
                    operation: 'get',
                    checkpointId: null,
                  }
                : {
                    ...cancelledIdentity,
                    executionId: claimedCancelled.input.executionId,
                    operation: 'reserve',
                    attemptKey: secret(),
                    purpose: 'explanation',
                    model: 'anthropic/claude-haiku-5.5',
                    route: 'vercel-ai-gateway',
                    maxOutputTokens: 224,
                  },
          },
        );
        expect(response.status).toBe(403);
      }
      expect(
        (
          await requestHttp(`${api}/api/v1/internal/ask/runs/${cancelled.id}/complete`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${askDispatchProof(dispatch, cancelledIdentity)}`,
            },
            body: {
              ...cancelledIdentity,
              executionId: claimedCancelled.input.executionId,
              evidence: null,
              failure: 'execution_unavailable',
            },
          })
        ).status,
      ).toBe(403);
      // Invalid new-mode terminal writes must fail without modifying retained bytes.
      await expect(
        db.query(
          "UPDATE ask.run SET document=jsonb_set(document,'{explanation}','null'::jsonb) WHERE id=$1",
          [recovery.id],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "UPDATE ask.run SET document=jsonb_set(document,'{basis}','\"routed-text-v1\"'::jsonb) WHERE id=$1",
          [recovery.id],
        ),
      ).rejects.toThrow();
      expect(
        (await requestHttp(`${api}/health?secret=rei-private-url-query-sentinel`)).status,
      ).toBeGreaterThanOrEqual(200);
      // SDK shutdown is the bounded final flush for all three native processes.
      await command(['stop', 'api']);
      await fixture.execute('docker', ['stop', '--time', '20', scripted]);
      const exportedResponse = await requestHttp(`${capture}/fixture/export`);
      expect(exportedResponse.status).toBe(200);
      const payload = await exportedResponse.json(),
        exported = spans(payload);
      for (const run of native) assertChain(exported, run.trace, run.id);
      const lowSpans = exported.filter((span) => span.trace === low.trace);
      const resumedSpan = lowSpans.find(
        (span) => span.name === 'ask.run' && span.attrs['rei.ask.outcome'] === 'price-calculated',
      );
      expect(resumedSpan).toBeDefined();
      if (!resumedSpan) throw new Error('Missing resumed run span.');
      const resumedQueueMs = Number(resumedSpan.attrs['rei.ask.queue_duration_ms']);
      expect(resumedQueueMs).toBeGreaterThanOrEqual(0);
      expect(resumedQueueMs).toBeLessThanOrEqual(
        Math.ceil(resumedSpan.startedAtMs - Date.parse(queuedResume.updatedAt)),
      );
      expect(resumedQueueMs).toBeLessThan(
        resumedSpan.startedAtMs - Date.parse(queuedResume.createdAt),
      );
      expect(
        exported.find(
          (span) =>
            span.trace === recovery.trace &&
            span.name === 'ask.run' &&
            span.attrs['rei.ask.outcome'] === 'price-calculated',
        )?.attrs['rei.ask.queue_duration_ms'],
      ).toBe(0);
      expect(lowSpans.filter((span) => span.name === 'ask.decision.attempt')).toHaveLength(2);
      expect(
        lowSpans.some(
          (span) =>
            span.name === 'ask.graph.confidenceGate' && span.attrs['rei.ask.confirmed'] === true,
        ),
      ).toBe(true);
      expect(
        lowSpans.filter(
          (span) =>
            span.name === 'ask.model.attempt' &&
            span.attrs['rei.ai.attempt.purpose'] === 'explanation',
        ),
      ).toHaveLength(1);
      expect(
        exported.filter(
          (span) => span.trace === unavailable.trace && span.name === 'ask.model.attempt',
        ),
      ).toEqual([]);
      expect(
        exported.some(
          (span) =>
            span.trace === recovery.trace &&
            span.service === 'real-estate-intelligence-api' &&
            span.status === 2,
        ),
      ).toBe(true);
      expect(
        exported.some(
          (span) =>
            span.trace === recovery.trace && span.name === 'ask.checkpoint' && span.status === 2,
        ),
      ).toBe(true);
      const serialized = JSON.stringify(payload);
      for (const sentinel of sentinels) expect(serialized.includes(sentinel)).toBe(false);
      for (const value of [
        query,
        resumed.question,
        resumed.explanation!.text,
        recovered.explanation.text,
      ])
        expect(serialized.includes(value)).toBe(false);
      expect(new Set(exported.map((span) => span.service))).toEqual(
        new Set([
          'real-estate-intelligence-api',
          'real-estate-intelligence-worker',
          'real-estate-intelligence-ai',
        ]),
      );
    },
    () =>
      cleanupAll(
        async () => captureAskDiagnostics(fixture, database),
        async () => database?.close(),
        async () => {
          for (const name of [...owned].reverse()) {
            expect(
              (
                await fixture.execute('docker', [
                  'inspect',
                  '--format',
                  '{{index .Config.Labels "com.docker.compose.project"}}',
                  name,
                ])
              ).stdout.trim(),
            ).toBe(fixture.project);
            await fixture.execute('docker', ['rm', '--force', name]);
          }
        },
        () => fixture.down(),
        async () => expect(await inventory()).toEqual(foreign),
      ),
  );
});
