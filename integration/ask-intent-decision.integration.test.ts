import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import request from 'supertest';
import { getContainerRuntimeClient, getReaper } from 'testcontainers';
import { AskRunService, PricePerSquareMeterService } from '../packages/application/dist/index.js';
import {
  DatabaseConnection,
  PostgresAskRunRepository,
  PostgresTransactionRunner,
  PostgresOutbox,
  askDispatchProof,
} from '../packages/infrastructure/dist/index.js';
import {
  askIntents,
  parseAskLiveRun,
  parseRoutedAskAccepted,
  type AskLiveEvent,
  parseAskClaim,
  parseAskCompletion,
  parseIntentDecision,
  parseAskLiveEvent,
  type AskLiveRun,
  type RoutedAskLiveRun,
} from '../packages/contracts/dist/index.js';
import { allocatePorts, ComposeFixture, cleanupAll, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';
const secret = () => randomBytes(32).toString('base64url');
const root = fileURLToPath(new URL('..', import.meta.url));
const golden = 'What is the price per square meter for BRL 785,000.00 and 68 square meters?';
const inputs = { priceMinorUnits: 78500000, currency: 'BRL' as const, areaSquareMeters: 68 };
function routed(run: AskLiveRun): RoutedAskLiveRun {
  if (run.basis !== 'routed-text-v1') throw new Error('Expected routed run.');
  return run;
}

function streamFrames(text: string): AskLiveEvent[] {
  return text
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim() && !block.startsWith(':'))
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const frame = parseAskLiveEvent(
        JSON.parse(
          lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        ),
      );
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
/** Abort only after the parser observed a complete server frame, never on a timer. */
async function observeAndDisconnect(
  api: string,
  id: string,
  capability: string,
  after?: string,
): Promise<readonly AskLiveEvent[]> {
  const frames: AskLiveEvent[] = [];
  await new Promise<void>((resolve, reject) => {
    let observed = false,
      buffer = '';
    const pending = request(api)
      .get(`/api/v1/runs/${id}/events`)
      .set('Authorization', `Bearer ${capability}`)
      // Let the custom parser own completion; unbuffered requests finish at headers.
      .buffer(true)
      .timeout({ response: 15000, deadline: 30000 });
    if (after) pending.set('Last-Event-ID', after);
    pending.parse((response, done) => {
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        if (observed) return;
        try {
          expect(response.statusCode).toBe(200);
          buffer += chunk;
          let separator = /\r?\n\r?\n/.exec(buffer);
          while (separator && !frames.length) {
            const complete = buffer.slice(0, separator.index + separator[0].length);
            buffer = buffer.slice(complete.length);
            frames.push(...streamFrames(complete));
            separator = /\r?\n\r?\n/.exec(buffer);
          }
          if (!frames.length) return;
          observed = true;
          pending.abort();
          resolve();
        } catch (error) {
          pending.abort();
          reject(error);
        }
      });
      response.on('error', (error: Error) => {
        if (!observed) reject(error);
      });
      response.on('end', () => done(null, undefined));
    });
    pending.end((error) => {
      if (!observed) reject(error ?? new Error('Stream ended before observation.'));
    });
  });
  expect(frames).toHaveLength(1);
  return frames;
}

test('routed confidence gate survives restarts, preserves decisions, fences terminal races and retains historical SQL', async () => {
  await getReaper(await getContainerRuntimeClient());
  const [postgres, apiPort, aiPort, rabbit, management, minio, consolePort] =
    await allocatePorts(7);
  const token = secret(),
    dispatch = secret(),
    capability = secret();
  const fixture = new ComposeFixture(`rei-intent-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    API_PORT: String(apiPort),
    AI_PORT: String(aiPort),
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    MINIO_API_PORT: String(minio),
    MINIO_CONSOLE_PORT: String(consolePort),
    POSTGRES_USER: 'rei_intent',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_intent',
    RABBITMQ_USER: 'rei_intent',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_intent',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: token,
    AI_GATEWAY_API_KEY: '',
    ASK_DISPATCH_SECRET: dispatch,
    SNAPSHOT_ENCRYPTION_KEY_ID: 'intent-fixture-v1',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  const api = `http://127.0.0.1:${apiPort}`,
    ai = `http://127.0.0.1:${aiPort}`;
  const command = (args: string[]) =>
    fixture.execute(
      'docker',
      ['compose', '--file', 'compose.yaml', '--project-name', fixture.project, ...args],
      { cwd: root, env: fixture.environment, timeout: 240000 },
    );
  let database: DatabaseConnection | undefined;
  let scripted = false;
  await preserveCleanup(
    async () => {
      for (const service of ['migrations', 'api', 'ai', 'worker'])
        await fixture.execute('docker', [
          'image',
          'tag',
          `rei-intent-images-${service}`,
          `${fixture.project}-${service}`,
        ]);
      await fixture.up(['postgres']);
      const url = new URL(`postgres://127.0.0.1:${postgres}/rei_intent`);
      url.username = fixture.environment.POSTGRES_USER!;
      url.password = fixture.environment.POSTGRES_PASSWORD!;
      database = new DatabaseConnection(url.toString());
      const db = database;
      await db.query(
        'CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const files = (await readdir(new URL('../migrations/', import.meta.url)))
        .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
        .sort();
      for (const file of files.filter((file) => file < '6007')) {
        await db.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
        await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [file.slice(0, -4)]);
      }
      const repository = new PostgresAskRunRepository(
        db,
        new PostgresTransactionRunner(db),
        new PostgresOutbox(db),
      );
      const facade = new AskRunService(repository, new PricePerSquareMeterService());
      const prior = await facade.create(
        {
          mode: 'structured-price-v1',
          threadId: null,
          placeId: null,
          query: 'Historical upgrade input',
          locale: 'en',
          inputs,
        },
        capability,
        secret(),
      );
      const priorEvent = (
        await db.query<{ event_id: string }>(
          'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
          [prior.id],
        )
      )[0]!;
      const priorIdentity = {
        version: 1 as const,
        eventId: priorEvent.event_id,
        runId: prior.id,
        threadId: prior.threadId,
      };
      const priorClaim = await facade.claim(priorIdentity);
      if (priorClaim.disposition !== 'claimed' || priorClaim.input.step !== 'structured-price-v1')
        throw new Error('Expected historical claim.');
      const priceReceipt = await facade.tool(
        {
          ...priorIdentity,
          executionId: priorClaim.input.executionId,
          operation: 'price-per-square-meter',
          inputs,
        },
        priorClaim.input.toolGrant,
        (at) => new PricePerSquareMeterService().pricePerSquareMeter(inputs, at),
      );
      await facade.complete({
        ...priorIdentity,
        executionId: priorClaim.input.executionId,
        evidence: {
          ...priorIdentity,
          executionId: priorClaim.input.executionId,
          step: 'structured-price-v1',
          outcome: 'price-calculated',
          visitedNodes: ['fixedDecision', 'priceTool'],
          receipt: priceReceipt,
        },
        failure: null,
      });
      const priorRouted = await facade.createRouted(
        {
          mode: 'routed-text-v1',
          threadId: null,
          placeId: null,
          query: 'listing search',
          locale: 'en',
        },
        capability,
        secret(),
      );
      const priorRoutedEvent = (
        await db.query<{ event_id: string }>(
          'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
          [priorRouted.id],
        )
      )[0]!;
      const priorRoutedIdentity = {
        version: 1 as const,
        eventId: priorRoutedEvent.event_id,
        runId: priorRouted.id,
        threadId: priorRouted.threadId,
      };
      const priorRoutedClaim = await facade.claim(priorRoutedIdentity);
      if (priorRoutedClaim.disposition !== 'claimed') throw new Error('Expected routed claim.');
      const reservation = await facade.executeDecision(
        {
          ...priorRoutedIdentity,
          executionId: priorRoutedClaim.input.executionId,
          operation: 'reserve',
          attemptKey: secret(),
        },
        priorRoutedClaim.input.checkpointGrant,
        new AbortController().signal,
      );
      if (reservation.operation !== 'reserve') throw new Error('Expected decision reservation.');
      const priorDecision = await facade.executeDecision(
        {
          ...priorRoutedIdentity,
          executionId: priorRoutedClaim.input.executionId,
          operation: 'accept',
          reservationId: reservation.reservationId,
          decision: parseIntentDecision({
            intent: 'listing_search',
            probability: 0.85,
            probabilities: Object.fromEntries(
              askIntents.map((label) => [label, label === 'listing_search' ? 0.85 : 0.03]),
            ),
            source: 'heuristic-v1',
            degraded: true,
            taxonomyVersion: 'ask-intents-v1',
            privacyEvidenceId: null,
          }),
        },
        priorRoutedClaim.input.checkpointGrant,
        new AbortController().signal,
      );
      if (priorDecision.operation !== 'accept') throw new Error('Expected decision receipt.');
      const priorFailure = await facade.complete({
        ...priorRoutedIdentity,
        executionId: priorRoutedClaim.input.executionId,
        evidence: null,
        failure: 'execution_unavailable',
      });
      const retained = () =>
        db.query<{ id: string; document: unknown; events: unknown; receipt: unknown }>(
          'SELECT id::text,document,(SELECT jsonb_agg(e.document ORDER BY e.sequence) FROM ask.run_event e WHERE e.run_id=r.id) AS events,(SELECT t.document FROM ask.tool_receipt t WHERE t.run_id=r.id) AS receipt FROM ask.run r WHERE id=ANY($1::uuid[]) ORDER BY id',
          [[prior.id, priorRouted.id]],
        );
      const beforeUpgrade = await retained();
      const upgrade = '6007_ask_unavailable_intents.sql';
      await db.query(await readFile(new URL(`../migrations/${upgrade}`, import.meta.url), 'utf8'));
      await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [upgrade.slice(0, -4)]);
      expect(await retained()).toEqual(beforeUpgrade);
      expect(
        await facade.complete({
          ...priorRoutedIdentity,
          executionId: priorRoutedClaim.input.executionId,
          evidence: {
            ...priorRoutedIdentity,
            executionId: priorRoutedClaim.input.executionId,
            step: 'routed-text-v1',
            decisionReceiptId: priorDecision.decision.receiptId,
            outcome: 'execution-unavailable',
          },
          failure: null,
        }),
      ).toEqual(priorFailure);
      expect(await retained()).toEqual(beforeUpgrade);
      await fixture.up(['migrations', 'api', 'rabbitmq', 'minio']);
      expect(await retained()).toEqual(beforeUpgrade);
      await command([
        'run',
        '--detach',
        '--no-deps',
        '--use-aliases',
        '--name',
        `${fixture.project}-scripted-ai`,
        '--publish',
        `${aiPort}:4111`,
        '--volume',
        `${root}:/source:ro`,
        '--entrypoint',
        'node',
        'ai',
        '/source/integration/fixtures/ask-intent-fixture-bootstrap.ts',
      ]);
      scripted = true;
      await vi.waitFor(async () => expect((await requestHttp(`${ai}/health`)).status).toBe(200), {
        timeout: 30000,
        interval: 100,
      });
      const postCreate = (
        query = golden,
        threadId: string | null = null,
        key = secret(),
        authority = capability,
      ) =>
        requestHttp(`${api}/api/v1/runs`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authority}`, 'Idempotency-Key': key },
          body: { mode: 'routed-text-v1', threadId, placeId: null, query, locale: 'en' },
        });
      const create = async (query = golden, threadId: string | null = null) => {
        const response = await postCreate(query, threadId);
        expect(response.status).toBe(202);
        const accepted = parseRoutedAskAccepted(await response.json());
        return read(accepted.runId);
      };
      const confirmPublic = async (
        runId: string,
        decisionReceiptId: string,
        edited: typeof inputs | null,
      ) => {
        const response = await requestHttp(`${api}/api/v1/runs/${runId}/confirm`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${capability}` },
          body: { runId, decisionReceiptId, inputs: edited },
        });
        expect(response.status).toBe(200);
        return routed(parseAskLiveRun(await response.json()));
      };
      const cancelPublic = async (runId: string) => {
        const response = await requestHttp(`${api}/api/v1/runs/${runId}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${capability}` },
          body: { reason: 'visitor_cancelled' },
        });
        expect(response.status).toBe(200);
        return routed(parseAskLiveRun(await response.json()));
      };
      const read = async (id: string) => {
        const response = await requestHttp(`${api}/api/v1/runs/${id}`, {
          headers: { Authorization: `Bearer ${capability}` },
        });
        expect(response.status).toBe(200);
        return routed(parseAskLiveRun(await response.json()));
      };
      const wait = async (id: string, state: RoutedAskLiveRun['state']) => {
        await vi.waitFor(async () => expect((await read(id)).state).toBe(state), {
          timeout: 40000,
          interval: 100,
        });
        return read(id);
      };
      const count = async (id: string) =>
        db.query<{ tools: number; models: number; decisions: number }>(
          'SELECT (SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS tools,(SELECT count(*)::integer FROM ask.model_explanation WHERE run_id=$1) AS models,(SELECT count(*)::integer FROM ask.decision_receipt WHERE run_id=$1) AS decisions',
          [id],
        );
      const identity = async (run: AskLiveRun) => {
        const row = await db.query<{ event_id: string }>(
          'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
          [run.id],
        );
        return {
          version: 1 as const,
          eventId: row[0]!.event_id,
          runId: run.id,
          threadId: run.threadId,
        };
      };
      // Caller-known authority and exact creation replay are proved at the public boundary.
      const creationKey = secret();
      const first = await postCreate(golden, null, creationKey);
      expect(first.status).toBe(202);
      const accepted = parseRoutedAskAccepted(await first.json());
      expect(
        parseRoutedAskAccepted(await (await postCreate(golden, null, creationKey)).json()),
      ).toEqual(accepted);
      expect((await postCreate(`${golden} changed`, null, creationKey)).status).toBe(409);
      expect((await postCreate(golden, null, creationKey, secret())).status).toBe(403);
      expect((await read(accepted.runId)).threadId).toBe(accepted.threadId);
      const unauthorized = await requestHttp(`${api}/api/v1/runs`, {
        method: 'POST',
        headers: { 'Idempotency-Key': secret() },
        body: {
          mode: 'routed-text-v1',
          threadId: null,
          placeId: null,
          query: golden,
          locale: 'en',
        },
      });
      expect(unauthorized.status).toBe(401);
      for (const path of [`runs/${accepted.runId}/cancel`, `runs/${accepted.runId}/confirm`]) {
        expect(
          (
            await requestHttp(`${api}/api/v1/${path}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${secret()}` },
              body: path.endsWith('cancel')
                ? { reason: 'visitor_cancelled' }
                : { runId: accepted.runId, decisionReceiptId: accepted.runId, inputs },
            })
          ).status,
        ).toBe(403);
      }
      // Twice observe a real incomplete stream, abort, accrue events and resume. The
      // second reconnect crosses an API restart using exactly the observed cursor.
      for (const restart of [false, true]) {
        const current = restart ? await create() : await read(accepted.runId);
        const observed = await observeAndDisconnect(api, current.id, capability);
        expect(observed[0]?.terminal).toBe(false);
        const cancelled = await cancelPublic(current.id);
        expect(cancelled).toMatchObject({
          state: 'cancelled',
          terminal: { reason: 'visitor_cancelled' },
          decision: null,
        });
        expect(await cancelPublic(current.id)).toEqual(cancelled);
        if (restart) {
          await command(['restart', 'api']);
          await vi.waitFor(async () => expect(await read(current.id)).toEqual(cancelled), {
            timeout: 30000,
          });
        }
        const stream = await requestHttp(`${api}/api/v1/runs/${current.id}/events`, {
          headers: { Authorization: `Bearer ${capability}`, 'Last-Event-ID': observed.at(-1)!.id },
        });
        expect(stream.status).toBe(200);
        const remaining = streamFrames(await stream.text());
        const all = [...observed, ...remaining];
        expect(all).toEqual(await repository.events(current.id, capability, 0));
        expect(new Set(all.map((frame) => frame.id)).size).toBe(all.length);
        expect(all.at(-1)?.event).toBe('ask.cancelled');
        expect(all.filter((frame) => frame.terminal)).toHaveLength(1);
        const empty = await requestHttp(`${api}/api/v1/runs/${current.id}/events`, {
          headers: { Authorization: `Bearer ${capability}`, 'Last-Event-ID': all.at(-1)!.id },
        });
        expect(empty.status).toBe(200);
        expect(streamFrames(await empty.text())).toEqual([]);
        for (const cursor of [
          '',
          `${current.id}:v2:1`,
          `${current.id}:v1:99999`,
          `${accepted.threadId}:v1:1`,
        ])
          expect(
            (
              await requestHttp(`${api}/api/v1/runs/${current.id}/events`, {
                headers: { Authorization: `Bearer ${capability}`, 'Last-Event-ID': cursor },
              })
            ).status,
          ).toBe(400);
        expect(
          (
            await requestHttp(`${api}/api/v1/runs/${current.id}/events`, {
              headers: { Authorization: `Bearer ${secret()}` },
            })
          ).status,
        ).toBe(403);
      }
      await fixture.up(['worker']);
      const boundary = await create();
      const completed = await wait(boundary.id, 'completed');
      expect(completed.result?.kind).toBe('price_per_square_meter');
      if (completed.result?.kind !== 'price_per_square_meter')
        throw new Error('Expected price result.');
      expect(completed.result.minorUnits).toBe(1154412);
      expect(completed.decision?.probability).toBe(0.85);
      expect(await count(boundary.id)).toEqual([{ tools: 1, models: 0, decisions: 1 }]);
      const low = await create(`${golden} uncertain`);
      const paused = await wait(low.id, 'awaiting_confirmation');
      expect(paused.confirmationDeadline).not.toBeNull();
      expect(await count(low.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
      const decision = paused.decision!;
      const successor = await create(golden, low.threadId);
      const unrelated = await create();
      await wait(unrelated.id, 'completed');
      expect((await read(successor.id)).state).toBe('queued');
      const third = await create(golden, low.threadId);
      expect((await postCreate(golden, low.threadId)).status).toBe(429);
      await expect(
        facade.confirm({ runId: low.id, decisionReceiptId: decision.receiptId, inputs }, secret()),
      ).rejects.toMatchObject({ kind: 'forbidden' });
      const retainedEvents = await repository.events(low.id, capability, 0);
      retainedEvents.forEach(parseAskLiveEvent);
      expect(retainedEvents.at(-1)?.event).toBe('ask.progress');
      expect(retainedEvents.at(-1)?.terminal).toBe(false);
      await command(['stop', 'worker']);
      await command(['restart', 'api']);
      await fixture.execute('docker', ['restart', `${fixture.project}-scripted-ai`]);
      await vi.waitFor(async () => expect((await requestHttp(`${ai}/health`)).status).toBe(200), {
        timeout: 30000,
      });
      await vi.waitFor(async () => expect(await read(low.id)).toEqual(paused), { timeout: 30000 });
      expect(await repository.events(low.id, capability, 0)).toEqual(retainedEvents);
      const edit = { ...inputs, areaSquareMeters: 100 };
      const confirmed = await confirmPublic(low.id, decision.receiptId, edit);
      expect(routed(confirmed).confirmationDeadline).toBe(paused.confirmationDeadline);
      expect(routed(confirmed).originalInputs).toEqual(inputs);
      const replay = await confirmPublic(low.id, decision.receiptId, edit);
      expect(replay).toEqual(confirmed);
      await expect(
        facade.confirm(
          {
            runId: low.id,
            decisionReceiptId: decision.receiptId,
            inputs: { ...inputs, areaSquareMeters: 0 },
          },
          capability,
        ),
      ).rejects.toThrow();
      for (const [path, body, authority, status] of [
        [
          low.id,
          { runId: successor.id, decisionReceiptId: decision.receiptId, inputs: edit },
          capability,
          400,
        ],
        [low.id, { runId: low.id, decisionReceiptId: successor.id, inputs: edit }, capability, 409],
        [
          low.id,
          {
            runId: low.id,
            decisionReceiptId: decision.receiptId,
            inputs: { ...edit, areaSquareMeters: 0 },
          },
          capability,
          400,
        ],
        [
          low.id,
          { runId: low.id, decisionReceiptId: decision.receiptId, inputs: edit, extra: true },
          capability,
          400,
        ],
        [
          low.id,
          { runId: low.id, decisionReceiptId: decision.receiptId, inputs: edit },
          secret(),
          403,
        ],
      ] as const)
        expect(
          (
            await requestHttp(`${api}/api/v1/runs/${path}/confirm`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${authority}` },
              body,
            })
          ).status,
        ).toBe(status);
      await fixture.up(['worker']);
      const resumed = await wait(low.id, 'completed');
      expect(resumed.result?.kind).toBe('price_per_square_meter');
      if (resumed.result?.kind !== 'price_per_square_meter')
        throw new Error('Expected price result.');
      expect(resumed.result.minorUnits).toBe(785000);
      expect(resumed.decision).toEqual(decision);
      await wait(successor.id, 'completed');
      await wait(third.id, 'completed');
      const counters = await requestHttp(`${ai}/fixture/decisions`);
      expect(await counters.json()).toEqual({ decisions: 2 });
      expect(await count(low.id)).toEqual([{ tools: 1, models: 0, decisions: 1 }]);
      const missing = await create('Calculate price per square meter');
      const missingResult = await wait(missing.id, 'failed');
      expect(missingResult.decision?.intent).toBe('price_per_square_meter');
      expect(missingResult.result).toBeNull();
      expect(await count(missing.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
      for (const intent of askIntents.filter((label) => label !== 'price_per_square_meter')) {
        const other = await create(intent.replaceAll('_', ' '));
        const unavailable = await wait(other.id, 'completed');
        expect(unavailable.decision?.intent).toBe(intent);
        expect(unavailable.result).toEqual({
          kind: 'unavailable_intent',
          intent,
          reason: 'not_available',
        });
        expect(unavailable.terminal).toMatchObject({ state: 'completed', reason: null });
        expect(await count(other.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
        const events = await repository.events(other.id, capability, 0);
        events.forEach(parseAskLiveEvent);
        expect(events.filter((event) => event.terminal)).toHaveLength(1);
        expect(events.at(-1)?.run).toEqual(unavailable);
        const stream = await requestHttp(`${api}/api/v1/runs/${other.id}/events`, {
          headers: { Authorization: `Bearer ${capability}` },
        });
        expect(stream.status).toBe(200);
        expect(stream.headers.get('content-type')).toContain('text/event-stream');
        const streamed = (await stream.text())
          .split(/\r?\n\r?\n/)
          .filter((block) => block.trim() && !block.startsWith(':'))
          .map((block) =>
            parseAskLiveEvent(
              JSON.parse(
                block
                  .split(/\r?\n/)
                  .filter((line) => line.startsWith('data:'))
                  .map((line) => line.slice(5).trimStart())
                  .join('\n'),
              ),
            ),
          );
        expect(streamed).toEqual(events);

        const request = await identity(unavailable);
        const execution = (
          await db.query<{ execution_id: string }>(
            'SELECT execution_id::text FROM ask.run WHERE id=$1',
            [other.id],
          )
        )[0]!;
        const evidence = {
          ...request,
          step: 'routed-text-v1' as const,
          executionId: execution.execution_id,
          decisionReceiptId: unavailable.decision!.receiptId,
          outcome: 'execution-unavailable' as const,
        };
        for (const decisionReceiptId of [other.id, undefined]) {
          await expect(async () =>
            repository.complete(
              parseAskCompletion({
                ...request,
                executionId: execution.execution_id,
                evidence: { ...evidence, decisionReceiptId },
                failure: null,
              }),
            ),
          ).rejects.toThrow();
        }
        expect(
          await repository.complete({
            ...request,
            executionId: execution.execution_id,
            evidence,
            failure: null,
          }),
        ).toEqual(unavailable);
        expect(await repository.events(other.id, capability, 0)).toEqual(events);
        expect(
          await db.query<{ terminals: number; outbox: number; inbox: number }>(
            "SELECT (SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1 AND document->'terminal'='true'::jsonb) AS terminals,(SELECT count(*)::integer FROM platform.outbox WHERE event_type='ask.run.completed' AND payload->>'runId'=$1::text) AS outbox,(SELECT count(*)::integer FROM platform.inbox WHERE event_id=$2) AS inbox",
            [other.id, request.eventId],
          ),
        ).toEqual([{ terminals: 1, outbox: 1, inbox: 1 }]);
        for (const result of [
          { ...unavailable.result, reason: 'execution_unavailable' },
          {
            ...unavailable.result,
            intent: intent === 'unsupported' ? 'comparables' : 'unsupported',
          },
          { ...unavailable.result, intent: 'price_per_square_meter' },
          { ...unavailable.result, explanation: 'generated text' },
        ]) {
          await expect(
            db.query(
              "UPDATE ask.run SET document=jsonb_set(document,'{result}',$2::jsonb) WHERE id=$1",
              [other.id, result],
            ),
          ).rejects.toThrow();
          await expect(
            db.query(
              "UPDATE ask.run_event SET document=jsonb_set(document,'{run,result}',$2::jsonb) WHERE run_id=$1 AND document->'terminal'='true'::jsonb",
              [other.id, result],
            ),
          ).rejects.toThrow();
        }
        await command(['restart', 'api']);
        await vi.waitFor(async () => expect(await read(other.id)).toEqual(unavailable), {
          timeout: 30000,
        });
        expect(await repository.events(other.id, capability, 0)).toEqual(events);
      }
      const nonPrice = await create('property history uncertain');
      const nonPricePause = await wait(nonPrice.id, 'awaiting_confirmation');
      expect(nonPricePause.result).toBeNull();
      expect(await count(nonPrice.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
      const beforeConfirm = await (await requestHttp(`${ai}/fixture/decisions`)).json();
      await facade.confirm(
        { runId: nonPrice.id, decisionReceiptId: nonPricePause.decision!.receiptId, inputs: null },
        capability,
      );
      const confirmedUnavailable = await wait(nonPrice.id, 'completed');
      expect(confirmedUnavailable.decision).toEqual(nonPricePause.decision);
      expect(confirmedUnavailable.result).toEqual({
        kind: 'unavailable_intent',
        intent: 'property_history',
        reason: 'not_available',
      });
      expect(await (await requestHttp(`${ai}/fixture/decisions`)).json()).toEqual(beforeConfirm);
      expect(await count(nonPrice.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
      const degraded = await create(`${golden} degraded`);
      expect((await wait(degraded.id, 'completed')).decision).toMatchObject({
        source: 'heuristic-v1',
        degraded: true,
        probability: 0.9,
      });
      const degradedLow = await create(`${golden} degraded search`);
      const degradedPause = await wait(degradedLow.id, 'awaiting_confirmation');
      expect(degradedPause.decision).toMatchObject({ degraded: true, probability: 0.6 });
      await facade.refuse(degradedLow.id, degradedPause.decision!.receiptId, capability);
      expect((await read(degradedLow.id)).terminal?.reason).toBe('visitor_cancelled');
      expect(await count(degradedLow.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
      const race = await create(`${golden} uncertain`);
      const racePause = await wait(race.id, 'awaiting_confirmation');
      await command(['stop', 'worker']);
      const outcomes = await Promise.allSettled([
        facade.confirm(
          { runId: race.id, decisionReceiptId: racePause.decision!.receiptId, inputs },
          capability,
        ),
        facade.refuse(race.id, racePause.decision!.receiptId, capability),
      ]);
      expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const raced = await read(race.id);
      expect(['queued', 'cancelled']).toContain(raced.state);
      if (raced.state === 'queued') {
        await fixture.up(['worker']);
        await wait(race.id, 'completed');
        await command(['stop', 'worker']);
      }
      const malformed = await create(`${golden} malformed`);
      await fixture.up(['worker']);
      const rejected = await wait(malformed.id, 'failed');
      expect(rejected.decision).toBeNull();
      expect(await count(malformed.id)).toEqual([{ tools: 0, models: 0, decisions: 0 }]);
      await command(['stop', 'worker']);
      const expiry = await create(`${golden} uncertain`);
      await fixture.up(['worker']);
      const expiring = await wait(expiry.id, 'awaiting_confirmation');
      await command(['stop', 'worker']);
      // Seed a genuinely aged paused snapshot with new identities. Its entire timeline and
      // receipt are coherent; production clocks, constraints and immutable evidence stay enabled.
      await facade.refuse(expiring.id, expiring.decision!.receiptId, capability);
      const seedAged = async () => {
        const ids = (
          await db.query<{
            id: string;
            event_id: string;
            receipt_id: string;
            reservation_id: string;
          }>(
            'SELECT uuidv7()::text AS id,uuidv7()::text AS event_id,uuidv7()::text AS receipt_id,uuidv7()::text AS reservation_id',
          )
        )[0]!;
        const shift = (at: string) => new Date(Date.parse(at) - 11 * 60 * 1000).toISOString();
        const aged = parseAskLiveRun({
          ...expiring,
          id: ids.id,
          createdAt: shift(expiring.createdAt),
          updatedAt: shift(expiring.updatedAt),
          decision: {
            ...expiring.decision!,
            receiptId: ids.receipt_id,
            acceptedAt: shift(expiring.decision!.acceptedAt),
          },
          confirmationDeadline: shift(expiring.confirmationDeadline!),
          steps: expiring.steps.map((step) => ({ ...step, at: shift(step.at) })),
        });
        await db.query(
          "INSERT INTO ask.run(id,thread_id,creation_key,request_fingerprint,requested_event_id,state,price_minor_units,area_square_meters,document,admitted_at,queue_expires_at,confirmation_deadline) VALUES($1,$2,$3,$4,$5,'awaiting_confirmation',$6,$7,$8,$9::timestamptz,$9::timestamptz+interval '120 seconds',$10)",
          [
            ids.id,
            aged.threadId,
            randomBytes(32).toString('hex'),
            randomBytes(32).toString('hex'),
            ids.event_id,
            inputs.priceMinorUnits,
            inputs.areaSquareMeters,
            aged,
            aged.createdAt,
            routed(aged).confirmationDeadline,
          ],
        );
        await db.query(
          'INSERT INTO ask.decision_attempt(run_id,id,attempt_key,execution_id) VALUES($1,$2,$3,$4)',
          [ids.id, ids.reservation_id, secret(), ids.event_id],
        );
        await db.query(
          'INSERT INTO ask.decision_receipt(run_id,id,reservation_id,document) VALUES($1,$2,$3,$4)',
          [ids.id, ids.receipt_id, ids.reservation_id, aged.decision],
        );
        return { ids, aged };
      };
      const maintained = await seedAged();
      // Read SQL only: API maintenance must expire this run while the worker is stopped.
      await vi.waitFor(
        async () => {
          expect(
            await db.query<{ state: string }>('SELECT state FROM ask.run WHERE id=$1', [
              maintained.ids.id,
            ]),
          ).toEqual([{ state: 'expired' }]);
        },
        { timeout: 30000, interval: 100 },
      );
      expect((await read(maintained.ids.id)).terminal?.reason).toBe('confirmation_expired');
      const { ids, aged } = await seedAged();
      const expiryRace = await Promise.allSettled([
        facade.confirm({ runId: ids.id, decisionReceiptId: ids.receipt_id, inputs }, capability),
        facade.expireQueued(100),
      ]);
      expect(expiryRace.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
      await vi.waitFor(
        async () => expect((await read(ids.id)).terminal?.reason).toBe('confirmation_expired'),
        { timeout: 30000, interval: 100 },
      );
      expect(await count(ids.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
      expect(
        routed(
          await facade.confirm(
            { runId: ids.id, decisionReceiptId: ids.receipt_id, inputs },
            capability,
          ),
        ).state,
      ).toBe('expired');
      const released = await create(golden, aged.threadId);
      await fixture.up(['worker']);
      await wait(released.id, 'completed');
      await command(['stop', 'worker']);
      // Public cancellation covers both paused and confirmed-but-not-yet-claimed work.
      for (const confirmedQueue of [false, true]) {
        const candidate = await create(`${golden} uncertain`);
        await fixture.up(['worker']);
        const pause = await wait(candidate.id, 'awaiting_confirmation');
        await command(['stop', 'worker']);
        const sibling = await create(golden, candidate.threadId);
        const before = confirmedQueue
          ? await confirmPublic(candidate.id, pause.decision!.receiptId, inputs)
          : pause;
        const cancelled = await cancelPublic(candidate.id);
        expect(cancelled).toMatchObject({
          state: 'cancelled',
          decision: before.decision,
          confirmation: before.confirmation,
          confirmationDeadline: before.confirmationDeadline,
        });
        expect(await count(candidate.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
        expect(await cancelPublic(candidate.id)).toEqual(cancelled);
        await fixture.up(['worker']);
        await wait(sibling.id, 'completed');
        await command(['stop', 'worker']);
      }
      const terminalEffects = async (run: AskLiveRun) => {
        const requested = await identity(run);
        return db.query<{
          state: string;
          events: number;
          terminals: number;
          outbox: number;
          inbox: number;
        }>(
          "SELECT state,(SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1) AS events,(SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1 AND document->'terminal'='true'::jsonb) AS terminals,(SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type IN ('ask.run.cancelled','ask.run.completed','ask.run.failed','ask.run.expired')) AS outbox,(SELECT count(*)::integer FROM platform.inbox WHERE event_id=$2) AS inbox FROM ask.run WHERE id=$1",
          [run.id, requested.eventId],
        );
      };
      // Actual rollback failures occur after the terminal/event write, proving one transaction.
      const faulted = await create();
      const faultIdentity = await identity(faulted);
      const untouched = await terminalEffects(faulted);
      for (const table of ['platform.outbox', 'platform.inbox']) {
        const condition =
          table === 'platform.outbox'
            ? `NEW.aggregate_id='${faulted.id}'::uuid AND NEW.event_type='ask.run.cancelled'`
            : `NEW.event_id='${faultIdentity.eventId}'::uuid`;
        await db.query(
          `CREATE FUNCTION public.intent_cancel_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'Synthetic owned cancellation fault'; END IF; RETURN NEW; END $$`,
        );
        await db.query(
          `CREATE TRIGGER intent_cancel_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.intent_cancel_fault()`,
        );
        await preserveCleanup(
          async () => {
            const response = await requestHttp(`${api}/api/v1/runs/${faulted.id}/cancel`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${capability}` },
              body: { reason: 'visitor_cancelled' },
            });
            expect(response.status).toBe(503);
            expect(await read(faulted.id)).toEqual(faulted);
            expect(await terminalEffects(faulted)).toEqual(untouched);
          },
          async () => {
            await db.query(`DROP TRIGGER intent_cancel_fault ON ${table}`);
            await db.query('DROP FUNCTION public.intent_cancel_fault()');
          },
        );
      }
      await cancelPublic(faulted.id);
      expect(await terminalEffects(faulted)).toEqual([
        { state: 'cancelled', events: 2, terminals: 1, outbox: 1, inbox: 1 },
      ]);
      // Authority is checked again after a genuinely blocked thread lock.
      const authorityRun = await create();
      const barrier = await db.leaseClient();
      await barrier.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [
        `ask:${authorityRun.threadId}`,
      ]);
      let pendingCancel: ReturnType<typeof requestHttp> | undefined;
      await preserveCleanup(
        async () => {
          pendingCancel = requestHttp(`${api}/api/v1/runs/${authorityRun.id}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${capability}` },
            body: { reason: 'visitor_cancelled' },
          });
          await vi.waitFor(
            async () =>
              expect(
                (
                  await db.query<{ waiting: boolean }>(
                    "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%') AS waiting",
                  )
                )[0]?.waiting,
              ).toBe(true),
            { timeout: 10000, interval: 50 },
          );
          const replacement = secret();
          await db.query('UPDATE ask.thread SET authority_digest=$2 WHERE id=$1', [
            authorityRun.threadId,
            createHash('sha256').update(replacement).digest('hex'),
          ]);
          await barrier.query('SELECT pg_advisory_unlock_all()');
          expect((await pendingCancel).status).toBe(403);
          expect((await repository.run(authorityRun.id, replacement))?.state).toBe('queued');
          await repository.cancel(authorityRun.id, replacement);
        },
        async () => {
          await barrier.query('SELECT pg_advisory_unlock_all()');
          barrier.release();
          if (pendingCancel) await pendingCancel;
        },
      );
      // SQL queue and confirmation expiry win public cancellation.
      const agedQueued = await create();
      await db.query(
        "UPDATE ask.run SET admitted_at=clock.at-interval '121 seconds',queue_expires_at=clock.at-interval '1 second' FROM (SELECT clock_timestamp() AS at) clock WHERE id=$1",
        [agedQueued.id],
      );
      expect((await cancelPublic(agedQueued.id)).terminal?.reason).toBe('queue_expired');
      const agedPaused = await seedAged();
      expect((await cancelPublic(agedPaused.ids.id)).terminal?.reason).toBe('confirmation_expired');
      // A running claim retains evidence after cancellation and rejects all stale write authorities.
      const claimPublic = async (run: AskLiveRun) => {
        const requested = await identity(run);
        const response = await requestHttp(`${api}/api/v1/internal/ask/runs/${run.id}/claim`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatch, requested)}` },
          body: requested,
        });
        expect(response.status).toBe(200);
        const claimed = parseAskClaim(await response.json());
        if (claimed.disposition !== 'claimed' || claimed.input.step !== 'routed-text-v1')
          throw new Error('Expected routed claim.');
        return claimed.input;
      };
      const running = await create();
      const execution = await claimPublic(running);
      const address = {
        version: execution.version,
        eventId: execution.eventId,
        runId: execution.runId,
        threadId: execution.threadId,
        executionId: execution.executionId,
      };
      const reserve = await facade.executeDecision(
        { ...address, operation: 'reserve', attemptKey: secret() },
        execution.checkpointGrant,
        new AbortController().signal,
      );
      if (reserve.operation !== 'reserve') throw new Error('Expected reserved decision.');
      const acceptedDecision = await facade.executeDecision(
        {
          ...address,
          operation: 'accept',
          reservationId: reserve.reservationId,
          decision: parseIntentDecision({
            intent: 'price_per_square_meter',
            probability: 0.85,
            probabilities: Object.fromEntries(
              askIntents.map((label) => [label, label === 'price_per_square_meter' ? 0.85 : 0.03]),
            ),
            source: 'heuristic-v1',
            degraded: true,
            taxonomyVersion: 'ask-intents-v1',
            privacyEvidenceId: null,
          }),
        },
        execution.checkpointGrant,
        new AbortController().signal,
      );
      const toolRequest = { ...address, operation: 'price-per-square-meter' as const, inputs };
      const retainedTool = await facade.tool(toolRequest, execution.toolGrant, (at) =>
        new PricePerSquareMeterService().pricePerSquareMeter(inputs, at),
      );
      const checkpoint = {
        ...address,
        graphVersion: 'intent-routing-v1',
        namespace: '',
        operation: 'put',
        checkpointId: running.id,
        parentId: null,
        checkpoint: { type: 'json', base64: Buffer.from('{}').toString('base64') },
        metadata: { type: 'json', base64: Buffer.from('{}').toString('base64') },
      };
      expect(
        (
          await requestHttp(`${api}/api/v1/ask/runs/${running.id}/checkpoints`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${execution.checkpointGrant}` },
            body: checkpoint,
          })
        ).status,
      ).toBe(200);
      const beforeCancel = await read(running.id);
      const stopped = await cancelPublic(running.id);
      expect(stopped.decision).toEqual(beforeCancel.decision);
      expect(acceptedDecision.operation).toBe('accept');
      const persistedEvidence = () =>
        db.query<{ receipt: unknown; checkpoint: Buffer }>(
          'SELECT t.document AS receipt,c.checkpoint_bytes AS checkpoint FROM ask.tool_receipt t JOIN ask.graph_checkpoint c ON c.run_id=t.run_id WHERE t.run_id=$1',
          [running.id],
        );
      const evidenceBefore = await persistedEvidence();
      expect(evidenceBefore[0]?.receipt).toEqual(retainedTool);
      const historyBefore = await repository.events(running.id, capability, 0);
      for (const [path, authority, body] of [
        [`ask/runs/${running.id}/tools/price-per-square-meter`, execution.toolGrant, toolRequest],
        [`ask/runs/${running.id}/checkpoints`, execution.checkpointGrant, checkpoint],
        [
          `internal/ask/runs/${running.id}/decision`,
          execution.checkpointGrant,
          { ...address, operation: 'reserve', attemptKey: secret() },
        ],
        [
          `internal/ask/runs/${running.id}/decision`,
          execution.checkpointGrant,
          {
            ...address,
            operation: 'accept',
            reservationId: reserve.reservationId,
            decision: parseIntentDecision({
              intent: 'price_per_square_meter',
              probability: 0.85,
              probabilities: Object.fromEntries(
                askIntents.map((label) => [
                  label,
                  label === 'price_per_square_meter' ? 0.85 : 0.03,
                ]),
              ),
              source: 'heuristic-v1',
              degraded: true,
              taxonomyVersion: 'ask-intents-v1',
              privacyEvidenceId: null,
            }),
          },
        ],
        [
          `internal/ask/runs/${running.id}/model-explanation`,
          execution.checkpointGrant,
          {
            ...address,
            operation: 'reserve',
            attemptKey: secret(),
            purpose: 'privacy-probe',
            model: 'anthropic/claude-haiku-5.5',
            route: 'vercel-ai-gateway',
            maxOutputTokens: 10,
          },
        ],
        [
          `internal/ask/runs/${running.id}/complete`,
          askDispatchProof(dispatch, address),
          {
            ...address,
            evidence: {
              ...address,
              step: 'routed-text-v1',
              outcome: 'price-calculated',
              decisionReceiptId: beforeCancel.decision!.receiptId,
              receipt: retainedTool,
            },
            failure: null,
          },
        ],
      ] as const)
        expect(
          (
            await requestHttp(`${api}/api/v1/${path}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${authority}` },
              body,
            })
          ).status,
        ).toBe(403);
      const lateClaim = await requestHttp(`${api}/api/v1/internal/ask/runs/${running.id}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${askDispatchProof(dispatch, address)}` },
        body: {
          version: address.version,
          eventId: address.eventId,
          runId: address.runId,
          threadId: address.threadId,
        },
      });
      expect(parseAskClaim(await lateClaim.json()).disposition).toBe('terminal');
      expect(await persistedEvidence()).toEqual(evidenceBefore);
      expect(await repository.events(running.id, capability, 0)).toEqual(historyBefore);
      expect((await terminalEffects(running))[0]).toMatchObject({
        state: 'cancelled',
        terminals: 1,
        outbox: 1,
        inbox: 1,
      });
      // Simultaneous completion/cancellation keeps the first terminal, then duplicate cancel is inert.
      const racing = await create();
      const racer = await claimPublic(racing);
      const raceAddress = {
        version: racer.version,
        eventId: racer.eventId,
        runId: racer.runId,
        threadId: racer.threadId,
        executionId: racer.executionId,
      };
      const racingResults = await Promise.all([
        requestHttp(`${api}/api/v1/runs/${racing.id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${capability}` },
          body: { reason: 'visitor_cancelled' },
        }),
        requestHttp(`${api}/api/v1/internal/ask/runs/${racing.id}/complete`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatch, raceAddress)}` },
          body: { ...raceAddress, evidence: null, failure: 'execution_unavailable' },
        }),
      ]);
      expect(racingResults[0]!.status).toBe(200);
      expect([200, 403]).toContain(racingResults[1]!.status);
      const winner = await read(racing.id);
      expect(['failed', 'cancelled']).toContain(winner.state);
      expect(await cancelPublic(racing.id)).toEqual(winner);
      expect((await terminalEffects(racing))[0]).toMatchObject({
        state: winner.state,
        terminals: 1,
        outbox: 1,
        inbox: 1,
      });
      const completedBefore = await read(boundary.id);
      expect(await cancelPublic(boundary.id)).toEqual(completedBefore);
      const logs = await command(['logs', '--no-color', 'api', 'worker']);
      for (const privateValue of [golden, capability, token, dispatch])
        expect(logs.stdout + logs.stderr).not.toContain(privateValue);
      // Persisted historical predicates still reject closed-provenance mutations after 6006.
      const legacy = await facade.create(
        {
          mode: 'structured-price-v1',
          threadId: null,
          placeId: null,
          query: 'Historical structured input',
          locale: 'en',
          inputs,
        },
        capability,
        secret(),
      );
      await expect(
        db.query('UPDATE ask.run SET document=document || \'{"extra":true}\'::jsonb WHERE id=$1', [
          legacy.id,
        ]),
      ).rejects.toThrow();
      const id = await identity(legacy);
      const claimResponse = await requestHttp(
        `${api}/api/v1/internal/ask/runs/${legacy.id}/claim`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${askDispatchProof(dispatch, id)}` },
          body: id,
        },
      );
      expect(parseAskClaim(await claimResponse.json()).disposition).toBe('claimed');
      const wrong = await requestHttp(`${api}/api/v1/internal/ask/runs/${legacy.id}/decision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret()}` },
        body: { ...id, executionId: legacy.id, operation: 'get' },
      });
      expect(wrong.status).toBe(403);
    },
    () =>
      cleanupAll(
        async () => captureAskDiagnostics(fixture, database),
        async () => database?.close(),
        async () => {
          if (scripted) {
            const label = await fixture.execute('docker', [
              'inspect',
              '--format',
              '{{index .Config.Labels "com.docker.compose.project"}}',
              `${fixture.project}-scripted-ai`,
            ]);
            expect(label.stdout.trim()).toBe(fixture.project);
            await fixture.execute('docker', ['rm', '--force', `${fixture.project}-scripted-ai`]);
          }
        },
        () => fixture.down(),
      ),
  );
});
