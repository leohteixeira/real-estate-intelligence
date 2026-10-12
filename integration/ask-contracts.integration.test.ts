import { randomBytes, randomUUID } from 'node:crypto';
import { execa } from 'execa';
import { expect, test } from 'vitest';
import {
  parseAskAccepted,
  parseAskAvailability,
  parseAskCancelRequest,
  parseAskCommandHeaders,
  parseAskConfirmRequest,
  parseAskCreateRequest,
  parseAskFixtureCatalogue,
  parseAskProgressEvent,
  parseAskQuotaRejection,
  parseAskRun,
  parseAskThread,
  type AskProgressEvent,
} from '../packages/contracts/dist/index.js';
import { DatabaseConnection } from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

/** Transport framing only; every JSON envelope is admitted by the public contract parser. */
function parseFrames(text: string): AskProgressEvent[] {
  expect(text).not.toMatch(/event: error|private|Bearer|capability/);
  return text
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      const frame = parseAskProgressEvent(JSON.parse(data));
      expect(
        lines
          .find((line) => line.startsWith('id:'))
          ?.slice(3)
          .trim(),
      ).toBe(frame.id);
      expect(
        lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim(),
      ).toBe(frame.event);
      return frame;
    });
}
async function inventory() {
  const containers = await execa('docker', ['ps', '--all', '--format', '{{.ID}}']);
  const volumes = await execa('docker', ['volume', 'ls', '--format', '{{.Name}}']);
  return {
    containers: containers.stdout.split('\n').filter(Boolean).sort(),
    volumes: volumes.stdout.split('\n').filter(Boolean).sort(),
  };
}
async function databaseState(connection: DatabaseConnection) {
  const tables = await connection.query<{ table_schema: string; table_name: string }>(
    "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('properties','collection','platform','locations','market','ask','comparables','identity','audit','alerts','public') AND table_type='BASE TABLE' ORDER BY table_schema,table_name",
  );
  const result = [];
  for (const { table_schema: schema, table_name: table } of tables) {
    expect(schema).toMatch(/^[a-z_]+$/);
    expect(table).toMatch(/^[a-z_]+$/);
    const rows = await connection.query<{ count: number; digest: string }>(
      `SELECT count(*)::integer AS count,md5(COALESCE(string_agg(to_jsonb(record)::text,'' ORDER BY to_jsonb(record)::text),'')) AS digest FROM "${schema}"."${table}" record`,
    );
    result.push({ schema, table, ...rows[0] });
  }
  return result;
}
async function withAskFixture(work: (base: string) => Promise<void>): Promise<void> {
  const [postgresPort, apiPort] = await allocatePorts(2);
  const project = `rei-ask-${randomUUID()}`;
  const settings = {
    POSTGRES_PORT: String(postgresPort),
    API_PORT: String(apiPort),
    POSTGRES_USER: 'rei_ask_fixture',
    POSTGRES_PASSWORD: 'rei-ask-controlled-fixture',
    POSTGRES_DB: 'rei_ask_fixture',
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  const fixture = new ComposeFixture(project, settings);
  const foreign = await inventory();
  let connection: DatabaseConnection | undefined;
  await preserveCleanup(
    async () => {
      await fixture.up(['--build', 'postgres', 'migrations', 'api']);
      const url = new URL(`postgres://127.0.0.1:${postgresPort}/${settings.POSTGRES_DB}`);
      url.username = settings.POSTGRES_USER;
      url.password = settings.POSTGRES_PASSWORD;
      connection = new DatabaseConnection(url.toString());
      const before = await databaseState(connection);
      expect(before.filter((table) => table.schema === 'ask').map((table) => table.table)).toEqual([
        'graph_checkpoint',
        'graph_pending_write',
        'model_attempt',
        'model_explanation',
        'run',
        'run_event',
        'thread',
        'tool_receipt',
      ]);
      expect(
        before.filter((table) => table.schema === 'ask').every((table) => table.count === 0),
      ).toBe(true);
      expect(
        before.find((table) => table.schema === 'platform' && table.table === 'outbox')?.count,
      ).toBe(0);
      await work(`http://127.0.0.1:${apiPort}`);
      expect(
        await databaseState(connection),
        'Ask fixture journeys changed persisted state',
      ).toStrictEqual(before);
    },
    () =>
      cleanupAll(
        async () => connection?.close(),
        () => fixture.down(),
        async () => {
          const after = await inventory();
          // Testcontainers may own its reaper while the process lives; every foreign resource survives.
          expect(after.containers).toEqual(expect.arrayContaining(foreign.containers));
          expect(after.volumes).toEqual(expect.arrayContaining(foreign.volumes));
        },
      ),
  );
}

test('Ask contracts: seven production API SSE journeys, authority, replay and zero SQL changes', async () => {
  await withAskFixture(async (base) => {
    const availability = await requestHttp(`${base}/api/v1/ask/capabilities`);
    expect(availability.status).toBe(200);
    expect(parseAskAvailability(await availability.json())).toMatchObject({
      basis: 'prepared-ask-example',
      mode: 'prepared-fixtures',
      commandHandlers: false,
      metadata: { liveExecution: false, durableReplay: false, synthetic: true },
    });
    const response = await requestHttp(`${base}/api/v1/ask/fixtures`);
    expect(response.status).toBe(200);
    const catalogue = parseAskFixtureCatalogue(await response.json());
    expect(catalogue.items.map((item) => item.state)).toEqual([
      'queued',
      'running',
      'awaiting_confirmation',
      'completed',
      'failed',
      'cancelled',
      'expired',
    ]);
    for (const item of catalogue.items) {
      const headers = { Authorization: `Bearer ${item.grant.capability}` };
      const runResponse = await requestHttp(`${base}/api/v1/runs/${item.runId}`, { headers });
      expect(runResponse.status).toBe(200);
      const snapshot = parseAskRun(await runResponse.json());
      expect(snapshot.state).toBe(item.state);
      const threadResponse = await requestHttp(`${base}/api/v1/threads/${item.threadId}`, {
        headers,
      });
      expect(threadResponse.status).toBe(200);
      const thread = parseAskThread(await threadResponse.json());
      expect(thread.runs).toHaveLength(2);
      expect(thread.runs[1]).toStrictEqual(snapshot);
      expect(thread.runs[0]?.result?.kind).toBe('unavailable_intent');
      const stream = await requestHttp(`${base}/api/v1/runs/${item.runId}/events`, { headers });
      expect(stream.status).toBe(200);
      expect(stream.headers.get('content-type')).toContain('text/event-stream');
      expect(stream.headers.get('cache-control')).toContain('no-cache');
      const frames = parseFrames(await stream.text());
      expect(frames[0]?.run).toStrictEqual(snapshot);
      expect(frames.filter((frame) => frame.terminal)).toHaveLength(1);
      expect(frames.at(-1)?.terminal).toBe(true);
      expect(frames.map((frame) => frame.sequence)).toEqual(frames.map((_, index) => index + 1));
      const states =
        item.state === 'queued'
          ? ['queued', 'running', 'completed']
          : item.state === 'running'
            ? ['running', 'completed']
            : item.state === 'awaiting_confirmation'
              ? ['awaiting_confirmation', 'running', 'completed']
              : [item.state];
      expect(frames.map((frame) => frame.run.state)).toEqual(states);
      expect(frames.at(-1)?.event).toBe(`ask.${states.at(-1)}`);
      for (const frame of frames) {
        const replay = await requestHttp(`${base}/api/v1/runs/${item.runId}/events`, {
          headers: { ...headers, 'Last-Event-ID': frame.id },
        });
        expect(replay.status).toBe(200);
        expect(parseFrames(await replay.text())).toStrictEqual(
          frames.filter((later) => later.sequence > frame.sequence),
        );
      }
      if (item.state === 'awaiting_confirmation') {
        expect(snapshot.decision).toMatchObject({ degraded: true, requiresConfirmation: true });
        expect(snapshot.decision?.confidence).toBeLessThan(0.85);
        expect(snapshot.result).toBeNull();
        expect(snapshot.confirmation).toBeNull();
        const completed = frames.at(-1)!.run;
        expect(completed.originalInputs).toStrictEqual(snapshot.originalInputs);
        expect(completed.confirmation?.inputs).toEqual({
          priceMinorUnits: 81000000,
          currency: 'BRL',
          areaSquareMeters: 90,
        });
        expect(completed.result).toMatchObject({
          kind: 'price_per_square_meter',
          minorUnits: 900000,
          areaUnit: 'm2',
          inputs: completed.confirmation?.inputs,
        });
      }
      Reflect.set(snapshot.originalInputs ?? snapshot, 'priceMinorUnits', 1);
      Reflect.set(thread.runs[0]!, 'question', 'caller mutation');
      Reflect.set(frames[0]!.run.metadata, 'asOf', 'caller mutation');
      const reread = parseAskRun(
        await (await requestHttp(`${base}/api/v1/runs/${item.runId}`, { headers })).json(),
      );
      expect(reread.originalInputs?.priceMinorUnits).toBe(80000000);
      expect(
        parseAskThread(
          await (await requestHttp(`${base}/api/v1/threads/${item.threadId}`, { headers })).json(),
        ).runs[0]?.question,
      ).not.toBe('caller mutation');
      expect(
        parseFrames(
          await (await requestHttp(`${base}/api/v1/runs/${item.runId}/events`, { headers })).text(),
        )[0]?.run.metadata.asOf,
      ).toBe(catalogue.metadata.asOf);
    }
    const fixture = catalogue.items[0]!,
      headers = { Authorization: `Bearer ${fixture.grant.capability}` };
    async function refused(
      path: string,
      status: number,
      requestHeaders: Record<string, string> = {},
    ) {
      const response = await requestHttp(`${base}${path}`, {
        headers: { ...requestHeaders, 'x-request-id': 'client-controlled' },
      });
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toContain('application/json');
      const requestId = response.headers.get('x-request-id');
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      const errors: Record<number, { code: string; message: string }> = {
        400: { code: 'bad_request', message: 'The request could not be processed.' },
        401: { code: 'unauthorized', message: 'Authentication is required.' },
        403: { code: 'forbidden', message: 'The requested operation is not permitted.' },
        404: { code: 'not_found', message: 'The requested resource was not found.' },
      };
      expect(await response.json()).toStrictEqual({ error: { ...errors[status], requestId } });
    }
    for (const path of [
      `/runs/${fixture.runId}`,
      `/runs/${fixture.runId}/events`,
      `/threads/${fixture.threadId}`,
    ]) {
      await refused(`/api/v1${path}`, 401);
      for (const authorization of [
        'Bearer short',
        'Basic private',
        'Bearer ask-fixture-v1-queued, Bearer private',
      ])
        await refused(`/api/v1${path}`, 401, { Authorization: authorization });
      await refused(`/api/v1${path}`, 403, { Authorization: 'Bearer wrong-fixture-capability' });
      await refused(`/api/v1${path}`, 403, {
        Authorization: `Bearer ${catalogue.items[1]!.grant.capability}`,
      });
      await refused(path, 404, headers);
      for (const query of [
        '?x=1',
        '?x[y]=1',
        '?x=1&x=2',
        '?capability=private',
        '?__proto__[private]=1',
      ])
        await refused(`/api/v1${path}${query}`, 400, headers);
    }
    for (const path of ['/ask/capabilities', '/ask/fixtures']) {
      await refused(path, 404);
      await refused(`/api/v1${path}?x=1`, 400);
    }
    for (const id of ['bad', fixture.runId.toUpperCase(), fixture.runId.replace('7000', '4000')])
      await refused(`/api/v1/runs/${id}`, 400, headers);
    for (const cursor of [
      '',
      `${catalogue.items[1]!.runId}:v1:1`,
      `${fixture.runId}:v1:0`,
      `${fixture.runId}:v1:01`,
      `${fixture.runId}:v2:1`,
      `${fixture.runId}:v1:999`,
    ])
      await refused(`/api/v1/runs/${fixture.runId}/events`, 400, {
        ...headers,
        'Last-Event-ID': cursor,
      });
    for (const path of [`/runs/${fixture.runId}/confirm`, `/runs/${fixture.runId}/cancel`]) {
      const response = await requestHttp(`${base}/api/v1${path}`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': fixture.runId },
        body: { query: 'private caller question' },
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
      expect(JSON.stringify(await response.json())).not.toContain('private caller question');
    }
    const disabled = await requestHttp(`${base}/api/v1/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${randomBytes(32).toString('base64url')}`,
        'Idempotency-Key': randomUUID(),
      },
      body: {
        mode: 'structured-price-v1',
        threadId: null,
        placeId: null,
        query: 'private caller question',
        locale: 'en',
        inputs: { priceMinorUnits: 78500000, currency: 'BRL', areaSquareMeters: 68 },
      },
    });
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toMatchObject({ error: { code: 'service_unavailable' } });
    const fixtureCannotCreate = await requestHttp(`${base}/api/v1/runs`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      body: { query: 'private caller question' },
    });
    expect(fixtureCannotCreate.status).toBe(401);
    const create = {
      threadId: null,
      placeId: null,
      query: 'Synthetic future question',
      locale: 'en',
    };
    expect(parseAskCreateRequest(create)).toEqual(create);
    expect(parseAskCommandHeaders({ idempotencyKey: fixture.runId }).idempotencyKey).toBe(
      fixture.runId,
    );
    expect(
      parseAskConfirmRequest({
        intent: 'price_per_square_meter',
        inputs: { priceMinorUnits: 81000000, currency: 'BRL', areaSquareMeters: 90 },
      }).intent,
    ).toBe('price_per_square_meter');
    expect(parseAskCancelRequest({ reason: 'visitor_cancelled' }).reason).toBe('visitor_cancelled');
    expect(
      parseAskAccepted({
        runId: fixture.runId,
        threadId: fixture.threadId,
        capability: fixture.grant.capability,
        state: 'queued',
      }).state,
    ).toBe('queued');
    for (const scope of ['visitor', 'global'])
      expect(
        parseAskQuotaRejection({
          code: 'quota_exceeded',
          scope,
          reopensAt: '2026-10-12T00:00:00.000Z',
        }).scope,
      ).toBe(scope);
    expect(() => parseAskCreateRequest({ ...create, query: ' '.repeat(100) })).toThrow(TypeError);
  });
});

test('Ask API E2E: catalogue grant opens a full thread and an edited-confirmation terminal preview', async () => {
  await withAskFixture(async (base) => {
    const catalogue = parseAskFixtureCatalogue(
      await (await requestHttp(`${base}/api/v1/ask/fixtures`)).json(),
    );
    const selected = catalogue.items.find((item) => item.state === 'awaiting_confirmation')!;
    const headers = { Authorization: `Bearer ${selected.grant.capability}` };
    const thread = parseAskThread(
      await (await requestHttp(`${base}/api/v1/threads/${selected.threadId}`, { headers })).json(),
    );
    const run = parseAskRun(
      await (await requestHttp(`${base}/api/v1/runs/${selected.runId}`, { headers })).json(),
    );
    expect(thread.runs.map((entry) => entry.state)).toEqual(['completed', 'awaiting_confirmation']);
    expect(thread.runs[1]).toEqual(run);
    const frames = parseFrames(
      await (await requestHttp(`${base}/api/v1/runs/${selected.runId}/events`, { headers })).text(),
    );
    const terminal = frames.at(-1)!;
    expect(terminal.event).toBe('ask.completed');
    expect(terminal.terminal).toBe(true);
    expect(terminal.run.confirmation?.source).toBe('recorded-synthetic');
    expect(terminal.run.confirmation?.inputs).not.toEqual(run.originalInputs);
    const fresh = parseAskRun(
      await (await requestHttp(`${base}/api/v1/runs/${selected.runId}`, { headers })).json(),
    );
    expect(fresh).toStrictEqual(run);
    expect(fresh.confirmation).toBeNull();
    expect(fresh.metadata.durableReplay).toBe(false);
  });
});
