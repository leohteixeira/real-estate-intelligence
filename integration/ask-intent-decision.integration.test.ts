import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
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
  parseAskLiveRun,
  parseAskClaim,
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
      await fixture.up(['--build', 'postgres', 'migrations', 'api', 'rabbitmq', 'minio']);
      await command(['build', 'ai']);
      await command(['build', 'worker']);
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
      const url = new URL(`postgres://127.0.0.1:${postgres}/rei_intent`);
      url.username = fixture.environment.POSTGRES_USER!;
      url.password = fixture.environment.POSTGRES_PASSWORD!;
      database = new DatabaseConnection(url.toString());
      const db = database;
      const repository = new PostgresAskRunRepository(
        db,
        new PostgresTransactionRunner(db),
        new PostgresOutbox(db),
      );
      const facade = new AskRunService(repository, new PricePerSquareMeterService());
      const create = (query = golden, threadId: string | null = null) =>
        facade.createRouted(
          { mode: 'routed-text-v1', threadId, placeId: null, query, locale: 'en' },
          capability,
          secret(),
        );
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
      await fixture.up(['worker']);
      const boundary = await create();
      const completed = await wait(boundary.id, 'completed');
      expect(completed.result?.minorUnits).toBe(1154412);
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
      await expect(create(golden, low.threadId)).rejects.toMatchObject({ kind: 'capacity' });
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
      const confirmed = await facade.confirm(
        { runId: low.id, decisionReceiptId: decision.receiptId, inputs: edit },
        capability,
      );
      expect(routed(confirmed).confirmationDeadline).toBe(paused.confirmationDeadline);
      expect(routed(confirmed).originalInputs).toEqual(inputs);
      const replay = await facade.confirm(
        { runId: low.id, decisionReceiptId: decision.receiptId, inputs: edit },
        capability,
      );
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
      await fixture.up(['worker']);
      const resumed = await wait(low.id, 'completed');
      expect(resumed.result?.minorUnits).toBe(785000);
      expect(resumed.decision).toEqual(decision);
      await wait(successor.id, 'completed');
      await wait(third.id, 'completed');
      const counters = await requestHttp(`${ai}/fixture/decisions`);
      expect(await counters.json()).toEqual({ decisions: 2 });
      expect(await count(low.id)).toEqual([{ tools: 1, models: 0, decisions: 1 }]);
      const missing = await create('Calculate price per square meter');
      expect((await wait(missing.id, 'failed')).decision?.intent).toBe('price_per_square_meter');
      expect(await count(missing.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
      const other = await create('listing search');
      expect((await wait(other.id, 'failed')).decision?.intent).toBe('listing_search');
      expect(await count(other.id)).toEqual([{ tools: 0, models: 0, decisions: 1 }]);
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
