import { randomBytes, randomUUID } from 'node:crypto';
import { execa } from 'execa';
import { expect, test, vi } from 'vitest';
import {
  parseAskClaim,
  parseAskLiveEvent,
  parseAskLiveRun,
  parseAskLiveThread,
  parseAskRequestedIdentity,
  parsePriceToolReceipt,
  parseStructuredAskAccepted,
  parseStructuredExecutionEvidence,
  type AskLiveEvent,
  type StructuredAskCreate,
} from '../packages/contracts/dist/index.js';
import {
  askDigest,
  askDispatchProof,
  DatabaseConnection,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';

const requestBody: StructuredAskCreate = {
  mode: 'structured-price-v1',
  threadId: null,
  placeId: null,
  query: 'private-synthetic-price-question',
  locale: 'pt-BR',
  inputs: { priceMinorUnits: 78_500_000, currency: 'BRL', areaSquareMeters: 68 },
};
const secret = () => randomBytes(32).toString('base64url');

/** Decode transport framing, then admit every envelope through its closed public schema. */
function frames(text: string): AskLiveEvent[] {
  return text
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim() && !block.startsWith(':'))
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      const frame = parseAskLiveEvent(JSON.parse(data));
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

test('Ask structured tracer E2E: real graph/tool, atomic SQL, fenced claims, durable SSE and safe failure', async () => {
  const [
    postgresPort,
    apiPort,
    aiPort,
    rabbitPort,
    rabbitManagementPort,
    minioPort,
    minioConsolePort,
  ] = await allocatePorts(7);
  const token = secret(),
    dispatchSecret = secret(),
    capability = secret(),
    key = secret();
  const traceId = randomBytes(16).toString('hex');
  const traceparent = `00-${traceId}-${randomBytes(8).toString('hex')}-01`;
  const fixture = new ComposeFixture(`rei-ask-price-${randomUUID()}`, {
    POSTGRES_PORT: String(postgresPort),
    API_PORT: String(apiPort),
    AI_PORT: String(aiPort),
    RABBITMQ_PORT: String(rabbitPort),
    RABBITMQ_MANAGEMENT_PORT: String(rabbitManagementPort),
    MINIO_API_PORT: String(minioPort),
    MINIO_CONSOLE_PORT: String(minioConsolePort),
    POSTGRES_USER: 'rei_ask_price',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_ask_price',
    RABBITMQ_USER: 'rei_ask_price',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_ask_price',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: token,
    ASK_DISPATCH_SECRET: dispatchSecret,
    SNAPSHOT_ENCRYPTION_KEY_ID: 'ask-price-fixture-v1',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  const foreign = await inventory();
  let connection: DatabaseConnection | undefined;
  let assertionsCompleted = false;
  await preserveCleanup(
    async () => {
      await fixture.up(['--build', 'postgres', 'migrations', 'api', 'ai', 'rabbitmq', 'minio']);
      const compose = ['compose', '--file', 'compose.yaml', '--project-name', fixture.project];
      const command = (args: string[]) =>
        fixture.execute('docker', [...compose, ...args], {
          env: fixture.environment,
          timeout: 240_000,
        });
      // Build before opening a finite-deadline HTTP subscription; only the worker remains stopped.
      await command(['build', 'worker']);
      const url = new URL(`postgres://127.0.0.1:${postgresPort}/rei_ask_price`);
      url.username = fixture.environment.POSTGRES_USER!;
      url.password = fixture.environment.POSTGRES_PASSWORD!;
      const database = (connection = new DatabaseConnection(url.toString()));
      const api = `http://127.0.0.1:${apiPort}`,
        ai = `http://127.0.0.1:${aiPort}`;
      const headers = { Authorization: `Bearer ${capability}` };
      const post = (body: object, idempotencyKey = secret(), authority = capability) =>
        requestHttp(`${api}/api/v1/runs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authority}`,
            'Idempotency-Key': idempotencyKey,
            traceparent,
          },
          body,
        });
      async function create(body: StructuredAskCreate, idempotencyKey = secret()) {
        const response = await post(body, idempotencyKey);
        expect(response.status).toBe(202);
        return parseStructuredAskAccepted(await response.json());
      }
      async function snapshot(runId: string) {
        const response = await requestHttp(`${api}/api/v1/runs/${runId}`, { headers });
        expect(response.status).toBe(200);
        return parseAskLiveRun(await response.json());
      }
      async function identity(runId: string) {
        const rows = await database.query<{ event_id: string; thread_id: string }>(
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
      async function claim(runId: string) {
        const requested = await identity(runId);
        const response = await requestHttp(`${api}/api/v1/internal/ask/runs/${runId}/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatchSecret, requested)}` },
          body: requested,
        });
        expect(response.status).toBe(200);
        return parseAskClaim(await response.json());
      }
      async function claimed(runId: string) {
        const result = await claim(runId);
        if (result.disposition !== 'claimed') throw new Error('Expected a fresh claim.');
        return result;
      }
      async function execute(
        input: Extract<ReturnType<typeof parseAskClaim>, { disposition: 'claimed' }>['input'],
      ) {
        const response = await requestHttp(`${ai}/internal/v1/runs/execute`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: input,
        });
        expect(response.status).toBe(200);
        return parseStructuredExecutionEvidence(await response.json());
      }
      async function complete(evidence: ReturnType<typeof parseStructuredExecutionEvidence>) {
        return requestHttp(`${api}/api/v1/internal/ask/runs/${evidence.runId}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatchSecret, evidence)}` },
          body: {
            version: 1,
            eventId: evidence.eventId,
            runId: evidence.runId,
            threadId: evidence.threadId,
            executionId: evidence.executionId,
            evidence,
            failure: null,
          },
        });
      }
      async function counts(runId: string) {
        return database.query<{
          events: number;
          receipts: number;
          inbox: number;
          terminal_outbox: number;
        }>(
          `SELECT (SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1) AS events,
          (SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS receipts,
          (SELECT count(*)::integer FROM platform.inbox WHERE event_id=(SELECT requested_event_id FROM ask.run WHERE id=$1) AND consumer_name='ask.structured-run') AS inbox,
          (SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type IN ('ask.run.completed','ask.run.failed')) AS terminal_outbox`,
          [runId],
        );
      }
      async function expire(runId: string) {
        await database.query(
          "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
          [runId],
        );
      }
      async function inject(target: 'creation' | 'terminal' | 'inbox') {
        const table = target === 'inbox' ? 'platform.inbox' : 'platform.outbox';
        const condition =
          target === 'creation'
            ? "NEW.event_type='ask.run.requested'"
            : target === 'terminal'
              ? "NEW.event_type IN ('ask.run.completed','ask.run.failed')"
              : "NEW.consumer_name='ask.structured-run'";
        await database.query(
          `CREATE FUNCTION public.ask_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'private-synthetic-ask-fault'; END IF; RETURN NEW; END $$`,
        );
        await database.query(
          `CREATE TRIGGER ask_fixture_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.ask_fixture_fault()`,
        );
        return async () => {
          await database.query(`DROP TRIGGER ask_fixture_fault ON ${table}`);
          await database.query('DROP FUNCTION public.ask_fixture_fault()');
        };
      }

      expect(
        await (await requestHttp(`${api}/api/v1/ask/structured-capabilities`)).json(),
      ).toStrictEqual({
        mode: 'structured-price-v1',
        available: true,
        intent: 'price_per_square_meter',
      });
      for (const query of ['?unknown=value', '?mode=structured-price-v1', '?query=x&query=y']) {
        expect(
          (await requestHttp(`${api}/api/v1/ask/structured-capabilities${query}`)).status,
        ).toBe(400);
        const rejectedKey = secret();
        expect(
          (
            await requestHttp(`${api}/api/v1/runs${query}`, {
              method: 'POST',
              headers: { ...headers, 'Idempotency-Key': rejectedKey },
              body: requestBody,
            })
          ).status,
        ).toBe(400);
        expect(
          await database.query<{ count: number }>(
            'SELECT count(*)::integer AS count FROM ask.thread WHERE preparation_key=$1',
            [askDigest(rejectedKey)],
          ),
        ).toStrictEqual([{ count: 0 }]);
      }
      for (const body of [
        { ...requestBody, extra: 'private' },
        { ...requestBody, mode: 'text-only' },
        { ...requestBody, inputs: { ...requestBody.inputs, areaSquareMeters: 0 } },
        { ...requestBody, inputs: { ...requestBody.inputs, areaSquareMeters: Number.MIN_VALUE } },
        { ...requestBody, inputs: { ...requestBody.inputs, currency: 'USD' } },
        {
          ...requestBody,
          inputs: { ...requestBody.inputs, priceMinorUnits: Number.MAX_SAFE_INTEGER + 1 },
        },
      ])
        expect((await post(body)).status).toBe(400);
      expect((await post(requestBody, secret(), 'ask-fixture-v1-queued')).status).toBe(401);
      expect(
        (await requestHttp(`${api}/api/v1/runs`, { method: 'POST', body: requestBody })).status,
      ).toBe(401);

      const accepted = await create(requestBody, key);
      const golden = await snapshot(accepted.runId);
      expect(golden.state).toBe('queued');
      expect(golden.result).toBeNull();
      const requestedOutbox = await database.query<{
        event_type: string;
        payload: unknown;
        trace_parent: string | null;
      }>(
        "SELECT event_type,payload,trace_context->>'traceparent' AS trace_parent FROM platform.outbox WHERE aggregate_id=$1",
        [golden.id],
      );
      expect(requestedOutbox).toHaveLength(1);
      expect(requestedOutbox[0]?.event_type).toBe('ask.run.requested');
      expect(requestedOutbox[0]?.payload).toStrictEqual({
        runId: golden.id,
        threadId: golden.threadId,
      });
      expect(requestedOutbox[0]?.trace_parent).toMatch(
        new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`),
      );
      expect(await counts(golden.id)).toStrictEqual([
        { events: 1, receipts: 0, inbox: 0, terminal_outbox: 0 },
      ]);
      const concurrent = await Promise.all(
        Array.from({ length: 4 }, () => create(requestBody, key)),
      );
      expect(concurrent).toEqual(Array(4).fill(accepted));
      expect(
        (await post({ ...requestBody, query: 'changed synthetic question' }, key)).status,
      ).toBe(409);
      expect((await post(requestBody, key, secret())).status).toBe(403);
      for (const path of [`runs/${golden.id}`, `threads/${golden.threadId}`]) {
        expect(
          (
            await requestHttp(`${api}/api/v1/${path}`, {
              headers: { Authorization: `Bearer ${secret()}` },
            })
          ).status,
        ).toBe(403);
      }
      const wrongOwner = await post(
        { ...requestBody, threadId: golden.threadId },
        secret(),
        secret(),
      );
      expect(wrongOwner.status).toBe(403);
      const existingThreadKey = secret();
      const existingThreadBody = { ...requestBody, threadId: golden.threadId };
      const existingThreadRun = await create(existingThreadBody, existingThreadKey);
      const threadsBeforeReplay = await database.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM ask.thread',
      );
      expect((await post(requestBody, existingThreadKey, secret())).status).toBe(403);
      expect((await post(requestBody, existingThreadKey)).status).toBe(409);
      expect(
        (
          await post(
            { ...existingThreadBody, query: 'changed existing-thread question' },
            existingThreadKey,
          )
        ).status,
      ).toBe(409);
      expect(await create(existingThreadBody, existingThreadKey)).toStrictEqual(existingThreadRun);
      expect(
        await database.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM ask.thread',
        ),
      ).toStrictEqual(threadsBeforeReplay);
      expect(
        await database.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM ask.thread WHERE preparation_key=$1',
          [askDigest(existingThreadKey)],
        ),
      ).toStrictEqual([{ count: 0 }]);
      const goldenIdentity = await identity(golden.id);
      expect(
        (
          await requestHttp(`${api}/api/v1/internal/ask/runs/${golden.id}/claim`, {
            method: 'POST',
            headers,
            body: goldenIdentity,
          })
        ).status,
      ).toBe(403);
      const otherEvent = await database.query<{ id: string }>('SELECT uuidv7()::text AS id');
      const foreignIdentity = { ...goldenIdentity, eventId: otherEvent[0]!.id };
      expect(
        (
          await requestHttp(`${api}/api/v1/internal/ask/runs/${golden.id}/claim`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${askDispatchProof(dispatchSecret, foreignIdentity)}`,
            },
            body: foreignIdentity,
          })
        ).status,
      ).toBe(403);

      // Creation transaction rolls back every accepted-run effect, while its prepared thread is recoverable.
      const rollbackKey = secret();
      const removeCreationFault = await inject('creation');
      await preserveCleanup(async () => {
        const response = await post(requestBody, rollbackKey);
        expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toContain('private-synthetic-ask-fault');
        expect(
          await database.query<{ count: number }>(
            'SELECT count(*)::integer AS count FROM ask.run WHERE creation_key=$1',
            [askDigest(rollbackKey)],
          ),
        ).toStrictEqual([{ count: 0 }]);
        expect(
          await database.query<{ count: number }>(
            "SELECT count(*)::integer AS count FROM platform.idempotency_key WHERE scope='ask.structured-create' AND idempotency_key=$1",
            [askDigest(rollbackKey)],
          ),
        ).toStrictEqual([{ count: 0 }]);
      }, removeCreationFault);
      const prepared = await database.query<{ id: string }>(
        'SELECT id::text FROM ask.thread WHERE preparation_key=$1',
        [askDigest(rollbackKey)],
      );
      const recovered = await create(requestBody, rollbackKey);
      expect(recovered.threadId).toBe(prepared[0]!.id);
      const recoveredClaim = await claimed(recovered.runId);
      const sameThread = await create({ ...requestBody, threadId: recovered.threadId });
      expect((await claim(sameThread.runId)).disposition).toBe('busy');
      expect((await claim(recovered.runId)).disposition).toBe('busy');
      const requested = recoveredClaim.identity;
      const toolRequest = {
        ...requested,
        executionId: recoveredClaim.input.executionId,
        operation: 'price-per-square-meter',
        inputs: requestBody.inputs,
      };
      const tool = (body: object, grant: string) =>
        requestHttp(`${api}/api/v1/ask/runs/${requested.runId}/tools/price-per-square-meter`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${grant}` },
          body,
        });
      expect((await tool(toolRequest, capability)).status).toBe(403);
      expect(
        (
          await tool(
            { ...toolRequest, inputs: { ...requestBody.inputs, priceMinorUnits: 1 } },
            recoveredClaim.input.toolGrant,
          )
        ).status,
      ).toBe(403);
      const firstEvidence = await execute(recoveredClaim.input);
      expect(firstEvidence.visitedNodes).toEqual(['fixedDecision', 'priceTool']);
      expect(firstEvidence.receipt.provenance).toBe('market-domain-v1');
      expect(firstEvidence.receipt.result.minorUnits).toBe(1_154_412);
      await expire(recovered.runId);
      const replacement = await claimed(recovered.runId);
      expect(replacement.input.executionId).not.toBe(recoveredClaim.input.executionId);
      expect((await tool(toolRequest, recoveredClaim.input.toolGrant)).status).toBe(403);
      expect((await complete(firstEvidence)).status).toBe(403);
      const evidence = await execute(replacement.input);
      expect(evidence.receipt.receiptId).toBe(firstEvidence.receipt.receiptId);
      expect(evidence.receipt.result).toStrictEqual(firstEvidence.receipt.result);
      expect(
        (
          await complete({
            ...evidence,
            receipt: {
              ...evidence.receipt,
              result: { ...evidence.receipt.result, minorUnits: 1 },
            },
          })
        ).status,
      ).toBe(403);
      for (const target of ['terminal', 'inbox'] as const) {
        const before = await counts(recovered.runId),
          beforeRun = await snapshot(recovered.runId);
        const remove = await inject(target);
        await preserveCleanup(async () => {
          const response = await complete(evidence);
          expect(response.status).toBe(503);
          expect(await snapshot(recovered.runId)).toStrictEqual(beforeRun);
          expect(await counts(recovered.runId)).toStrictEqual(before);
        }, remove);
      }
      const committed = await complete(evidence);
      expect(committed.status).toBe(200);
      const committedResult = parseAskLiveRun(await committed.json()).result;
      if (committedResult?.kind !== 'price_per_square_meter')
        throw new Error('Expected price result.');
      expect(committedResult.minorUnits).toBe(1_154_412);
      expect(await counts(recovered.runId)).toStrictEqual([
        { events: 3, receipts: 1, inbox: 1, terminal_outbox: 1 },
      ]);
      expect((await complete(evidence)).status).toBe(200);
      expect((await claim(recovered.runId)).disposition).toBe('terminal');

      // SQL rejects missing JSON fields as well as contradictions; NULL never bypasses admission.
      for (const statement of [
        "UPDATE ask.run SET document=document-'state' WHERE id=$1",
        "UPDATE ask.run SET document=jsonb_set(document,'{terminal}','null') WHERE id=$1",
        "UPDATE ask.run_event SET document=document-'runId' WHERE run_id=$1",
        "UPDATE ask.tool_receipt SET document=document-'receiptId' WHERE run_id=$1",
      ])
        await expect(database.query(statement, [recovered.runId])).rejects.toThrow();

      // Stay below HTTP admission's body bound while exceeding the former dispatch response cap.
      const largeBody = {
        ...requestBody,
        query: '\u0001'.repeat(16000),
        placeId: 'a'.repeat(4500),
      };
      expect(Buffer.byteLength(JSON.stringify(largeBody))).toBeLessThan(100 * 1024);
      const large = await create(largeBody);
      const disconnected = new AbortController();
      const abandoned = requestHttp(`${api}/api/v1/runs/${golden.id}/events`, {
        headers,
        signal: disconnected.signal,
      });
      const disconnectReason = new Error('Controlled subscriber disconnect.');
      const stopped = expect(abandoned).rejects.toBe(disconnectReason);
      // The expectation is installed before abort; a reconnect must replay the same durable queued frame.
      disconnected.abort(disconnectReason);
      await stopped;
      const following = requestHttp(`${api}/api/v1/runs/${golden.id}/events`, { headers });
      // Observe a rejection immediately while startup runs; preserve it when awaiting below.
      const observed = following.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await fixture.up(['worker']);
      const followed = await observed;
      if ('error' in followed) throw followed.error;
      const stream = followed.value;
      expect(stream.status).toBe(200);
      expect(stream.headers.get('content-type')).toContain('text/event-stream');
      const events = frames(await stream.text());
      expect(events.map((event) => event.run.state)).toEqual(['queued', 'running', 'completed']);
      expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
      expect(events.filter((event) => event.terminal)).toHaveLength(1);
      const terminal = events.at(-1)!;
      expect(terminal.event).toBe('ask.completed');
      if (terminal.run.result?.kind !== 'price_per_square_meter')
        throw new Error('Expected price result.');
      expect(terminal.run.result?.minorUnits).toBe(1_154_412);
      expect(terminal.run.result?.inputs).toStrictEqual(requestBody.inputs);
      expect(
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
          terminal.run.result!.minorUnits / 100,
        ),
      ).toContain('11.544,12');
      expect(await snapshot(golden.id)).toStrictEqual(terminal.run);
      for (const event of events) {
        const replay = await requestHttp(`${api}/api/v1/runs/${golden.id}/events`, {
          headers: { ...headers, 'Last-Event-ID': event.id },
        });
        expect(replay.status).toBe(200);
        expect(frames(await replay.text())).toStrictEqual(
          events.filter((later) => later.sequence > event.sequence),
        );
      }
      await vi.waitFor(
        async () => expect((await snapshot(existingThreadRun.runId)).state).toBe('completed'),
        { timeout: 40_000, interval: 100 },
      );
      const existingThreadTerminal = await snapshot(existingThreadRun.runId);
      if (existingThreadTerminal.result?.kind !== 'price_per_square_meter')
        throw new Error('Expected price result.');
      expect(existingThreadTerminal.result?.minorUnits).toBe(1_154_412);
      expect(existingThreadTerminal.originalInputs).toStrictEqual(requestBody.inputs);
      expect(existingThreadTerminal.result?.inputs).toStrictEqual(requestBody.inputs);
      expect(await counts(existingThreadRun.runId)).toStrictEqual([
        { events: 3, receipts: 1, inbox: 1, terminal_outbox: 1 },
      ]);
      const existingThreadReceipt = await database.query<{ document: unknown }>(
        'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
        [existingThreadRun.runId],
      );
      const retainedReceipt = parsePriceToolReceipt(existingThreadReceipt[0]!.document);
      expect(retainedReceipt.provenance).toBe('market-domain-v1');
      expect(retainedReceipt.inputs).toStrictEqual(requestBody.inputs);
      expect(retainedReceipt.result).toStrictEqual(existingThreadTerminal.result);
      expect(Date.parse(golden.createdAt)).toBeLessThan(
        Date.parse(existingThreadTerminal.createdAt),
      );
      const threadResponse = await requestHttp(`${api}/api/v1/threads/${golden.threadId}`, {
        headers,
      });
      expect(parseAskLiveThread(await threadResponse.json()).runs).toStrictEqual([
        terminal.run,
        existingThreadTerminal,
      ]);
      for (const [authority, cursor, status] of [
        [secret(), '', 403],
        [capability, `${golden.id}:v1:99`, 400],
        [capability, `${golden.id}:v2:1`, 400],
        [capability, `${recovered.runId}:v1:1`, 400],
      ] as const) {
        const refused = await requestHttp(`${api}/api/v1/runs/${golden.id}/events`, {
          headers: {
            Authorization: `Bearer ${authority}`,
            ...(cursor ? { 'Last-Event-ID': cursor } : {}),
          },
        });
        expect(refused.status).toBe(status);
        expect(refused.headers.get('content-type')).toContain('application/json');
      }
      await vi.waitFor(
        async () =>
          expect(await counts(golden.id)).toStrictEqual([
            { events: 3, receipts: 1, inbox: 1, terminal_outbox: 1 },
          ]),
        { timeout: 15_000, interval: 100 },
      );
      const storedReceipt = await database.query<{ document: unknown }>(
        'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
        [golden.id],
      );
      expect(parsePriceToolReceipt(storedReceipt[0]!.document).result).toStrictEqual(
        terminal.run.result,
      );
      const terminalTrace = await database.query<{ trace_parent: string | null }>(
        "SELECT trace_context->>'traceparent' AS trace_parent FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.completed'",
        [golden.id],
      );
      expect(terminalTrace[0]?.trace_parent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
      await vi.waitFor(async () => expect((await snapshot(large.runId)).state).toBe('completed'), {
        timeout: 20_000,
        interval: 100,
      });
      const largeTerminal = await snapshot(large.runId);
      expect(largeTerminal.question).toBe(largeBody.query);
      expect(largeTerminal.placeId).toBe(largeBody.placeId);
      expect(Buffer.byteLength(JSON.stringify(largeTerminal))).toBeGreaterThan(100000);
      if (largeTerminal.result?.kind !== 'price_per_square_meter')
        throw new Error('Expected price result.');
      expect(largeTerminal.result?.minorUnits).toBe(1_154_412);
      expect(await counts(large.runId)).toStrictEqual([
        { events: 3, receipts: 1, inbox: 1, terminal_outbox: 1 },
      ]);

      // Retained run identity remains authoritative after temporary delivery/idempotency records expire.
      await command(['stop', 'worker', 'ai']);
      const original = await identity(golden.id);
      await database.query(
        "DELETE FROM platform.inbox WHERE event_id=$1 AND consumer_name='ask.structured-run'",
        [original.eventId],
      );
      await database.query('DELETE FROM platform.outbox WHERE event_id=$1', [original.eventId]);
      await database.query(
        "DELETE FROM platform.idempotency_key WHERE scope='ask.structured-create' AND idempotency_key=$1",
        [askDigest(key)],
      );
      expect(await create(requestBody, key)).toStrictEqual(accepted);
      await database.query(
        `INSERT INTO platform.outbox(event_id,event_type,event_version,aggregate_id,occurred_at,payload)
      VALUES ($1,'ask.run.requested',1,$2,$3,$4)`,
        [
          original.eventId,
          golden.id,
          golden.createdAt,
          { runId: golden.id, threadId: golden.threadId },
        ],
      );
      const largeIdentity = await identity(large.runId);
      await database.query(
        "DELETE FROM platform.inbox WHERE event_id=$1 AND consumer_name='ask.structured-run'",
        [largeIdentity.eventId],
      );
      await database.query('DELETE FROM platform.outbox WHERE event_id=$1', [
        largeIdentity.eventId,
      ]);
      await database.query(
        `INSERT INTO platform.outbox(event_id,event_type,event_version,aggregate_id,occurred_at,payload)
        VALUES ($1,'ask.run.requested',1,$2,$3,$4)`,
        [
          largeIdentity.eventId,
          large.runId,
          largeTerminal.createdAt,
          { runId: large.runId, threadId: large.threadId },
        ],
      );
      await fixture.up(['worker']);
      await vi.waitFor(
        async () =>
          expect(await counts(golden.id)).toStrictEqual([
            { events: 3, receipts: 1, inbox: 1, terminal_outbox: 1 },
          ]),
        { timeout: 20_000, interval: 100 },
      );
      await vi.waitFor(
        async () =>
          expect(await counts(large.runId)).toStrictEqual([
            { events: 3, receipts: 1, inbox: 1, terminal_outbox: 1 },
          ]),
        { timeout: 20_000, interval: 100 },
      );
      expect(await snapshot(large.runId)).toStrictEqual(largeTerminal);
      expect(await snapshot(golden.id)).toStrictEqual(terminal.run);
      await command(['restart', 'api']);
      await vi.waitFor(async () => expect((await requestHttp(`${api}/ready`)).status).toBe(200), {
        timeout: 30_000,
        interval: 200,
      });
      const restarted = await requestHttp(`${api}/api/v1/runs/${golden.id}/events`, { headers });
      expect(frames(await restarted.text())).toStrictEqual(events);

      // Transport outage leaves a recoverable claim and no fabricated terminal effects.
      const failed = await create({
        ...requestBody,
        query: 'private-synthetic-failure-question',
      });
      await vi.waitFor(async () => expect((await snapshot(failed.runId)).state).toBe('running'), {
        timeout: 20000,
        interval: 100,
      });
      expect((await snapshot(failed.runId)).result).toBeNull();
      expect(await counts(failed.runId)).toStrictEqual([
        { events: 2, receipts: 0, inbox: 0, terminal_outbox: 0 },
      ]);
      await fixture.up(['ai']);
      await expire(failed.runId);
      await vi.waitFor(async () => expect((await snapshot(failed.runId)).state).toBe('completed'), {
        timeout: 60000,
        interval: 200,
      });
      expect(await counts(failed.runId)).toStrictEqual([
        { events: 3, receipts: 1, inbox: 1, terminal_outbox: 1 },
      ]);
      // Definitive authentication refusal remains a safe failed business terminal.
      await fixture.up(['worker'], { ...fixture.environment, AI_INTERNAL_TOKEN: secret() });
      const rejected = await create({
        ...requestBody,
        query: 'Synthetic definitive authentication refusal',
      });
      await vi.waitFor(async () => expect((await snapshot(rejected.runId)).state).toBe('failed'), {
        timeout: 30000,
        interval: 200,
      });
      expect((await snapshot(rejected.runId)).result).toBeNull();
      expect((await snapshot(rejected.runId)).terminal?.reason).toBe('execution_unavailable');
      expect(await counts(rejected.runId)).toStrictEqual([
        { events: 3, receipts: 0, inbox: 1, terminal_outbox: 1 },
      ]);
      await fixture.up(['worker'], { ...fixture.environment, AI_INTERNAL_TOKEN: token });
      const isolation = await command([
        'exec',
        '-T',
        'ai',
        'node',
        '-e',
        "let infrastructure=false;try{require.resolve('@rei/infrastructure');infrastructure=true}catch{};console.log(JSON.stringify({infrastructure,credentials:['DATABASE_URL','RABBITMQ_URL','OBJECT_STORE_ACCESS_KEY_ID','OBJECT_STORE_SECRET_ACCESS_KEY','ASK_DISPATCH_SECRET'].some(key=>Boolean(process.env[key]))}))",
      ]);
      const isolationEvidence: unknown = JSON.parse(isolation.stdout);
      expect(isolationEvidence).toStrictEqual({ infrastructure: false, credentials: false });
      const logs = await command(['logs', '--no-color', 'api', 'worker', 'ai']);
      for (const privateValue of [
        token,
        dispatchSecret,
        capability,
        key,
        requestBody.query,
        'private-synthetic-failure-question',
        replacement.input.toolGrant,
      ]) {
        expect(logs.stdout).not.toContain(privateValue);
        expect(logs.stderr ?? '').not.toContain(privateValue);
      }
      const authorityRows = await database.query<{
        authority_digest: string;
        preparation_key: string;
      }>('SELECT authority_digest,preparation_key FROM ask.thread WHERE id=$1', [golden.threadId]);
      expect(authorityRows).toStrictEqual([
        { authority_digest: askDigest(capability), preparation_key: askDigest(key) },
      ]);
      assertionsCompleted = true;
    },
    async () =>
      cleanupAll(
        async () => {
          if (!assertionsCompleted) await captureAskDiagnostics(fixture, connection);
        },
        async () => connection?.close(),
        () => fixture.down(),
        async () => {
          const after = await inventory();
          expect(after.containers).toEqual(expect.arrayContaining(foreign.containers));
          expect(after.volumes).toEqual(expect.arrayContaining(foreign.volumes));
        },
      ),
  );
});
