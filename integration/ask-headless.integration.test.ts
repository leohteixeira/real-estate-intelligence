import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import { getContainerRuntimeClient, getReaper } from 'testcontainers';
import { DatabaseConnection } from '../packages/infrastructure/dist/index.js';
import { createHeadlessAskClient, followLiveAsk } from '../apps/web/src/headless/ask-client.ts';
import { LiveAskSession } from '../apps/web/src/headless/ask-session.ts';
import { allocatePorts, ComposeFixture, cleanupAll, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';

const secret = () => randomBytes(32).toString('base64url');
const root = fileURLToPath(new URL('..', import.meta.url));

test('actual headless client resumes edited confirmation and observes explicit cancellation on an owned native stack', async () => {
  await getReaper(await getContainerRuntimeClient());
  const [postgres, apiPort, aiPort, rabbit, management, minio, consolePort] =
    await allocatePorts(7);
  const capability = secret();
  const fixture = new ComposeFixture(`rei-headless-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    API_PORT: String(apiPort),
    AI_PORT: String(aiPort),
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    MINIO_API_PORT: String(minio),
    MINIO_CONSOLE_PORT: String(consolePort),
    POSTGRES_USER: 'rei_headless',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_headless',
    RABBITMQ_USER: 'rei_headless',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_headless',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: secret(),
    AI_GATEWAY_API_KEY: '',
    ASK_DISPATCH_SECRET: secret(),
    SNAPSHOT_ENCRYPTION_KEY_ID: 'headless-fixture-v1',
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
  const inventory = async () => {
    const containers = await fixture.execute('docker', ['ps', '--all', '--format', '{{.ID}}']);
    const volumes = await fixture.execute('docker', ['volume', 'ls', '--format', '{{.Name}}']);
    return {
      containers: containers.stdout.split('\n').filter(Boolean).sort(),
      volumes: volumes.stdout.split('\n').filter(Boolean).sort(),
    };
  };
  const foreign = await inventory();
  let database: DatabaseConnection | undefined;
  let scripted = false;
  await preserveCleanup(
    async () => {
      try {
        for (const service of ['migrations', 'api', 'ai', 'worker'])
          await fixture.execute('docker', [
            'image',
            'tag',
            `rei-intent-images-${service}`,
            `${fixture.project}-${service}`,
          ]);
        await fixture.up(['postgres', 'migrations', 'api', 'rabbitmq', 'minio']);
        const url = new URL(`postgres://127.0.0.1:${postgres}/rei_headless`);
        url.username = fixture.environment.POSTGRES_USER!;
        url.password = fixture.environment.POSTGRES_PASSWORD!;
        database = new DatabaseConnection(url.toString());
        const db = database;
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
        const client = createHeadlessAskClient(api);
        const signal = new AbortController().signal;
        const input = {
          mode: 'routed-text-v1' as const,
          threadId: null,
          placeId: null,
          query:
            'What is the price per square meter for BRL 785,000.00 and 68 square meters? uncertain',
          locale: 'en' as const,
        };
        const key = secret();
        const accepted = await client.create(input, capability, key, signal);
        expect(await client.create(input, capability, key, signal)).toEqual(accepted);
        expect(await client.run(accepted.runId, capability, signal)).toMatchObject({
          id: accepted.runId,
          threadId: accepted.threadId,
          state: 'queued',
        });
        expect(
          (await client.thread(accepted.threadId, capability, signal)).runs.map((run) => run.id),
        ).toEqual([accepted.runId]);
        await expect(
          client.create({ ...input, query: `${input.query} changed` }, capability, key, signal),
        ).rejects.toMatchObject({ status: 409 });
        await expect(client.create(input, secret(), key, signal)).rejects.toMatchObject({
          status: 403,
        });
        await fixture.up(['worker']);

        const session = new LiveAskSession(accepted);
        const observed: { cursor: string; state: string }[] = [];
        const pause = new AbortController();
        const disconnect = new DOMException('Observed complete confirmation frame', 'AbortError');
        await expect(
          followLiveAsk(client, session, capability, pause.signal, (run) => {
            observed.push({ cursor: session.cursor!, state: run.state });
            if (run.state === 'awaiting_confirmation') pause.abort(disconnect);
          }),
        ).rejects.toBe(disconnect);
        expect(observed.map((event) => event.state)).toEqual([
          'queued',
          'running',
          'running',
          'awaiting_confirmation',
        ]);
        expect(session.terminal).toBe(false);
        const retained = session.run!;
        expect(retained.decision?.probability).toBe(0.84);
        const receipt = await db.query<{ id: string; document: unknown }>(
          'SELECT id::text,document FROM ask.decision_receipt WHERE run_id=$1',
          [accepted.runId],
        );
        expect(receipt).toEqual([
          { id: retained.decision!.receiptId, document: retained.decision },
        ]);
        const decisionCount = async () => {
          const response = await requestHttp(`${ai}/fixture/decisions`);
          expect(response.status).toBe(200);
          return response.json();
        };
        expect(await decisionCount()).toEqual({ decisions: 1 });
        const edited = {
          priceMinorUnits: 68000000,
          currency: 'BRL' as const,
          areaSquareMeters: 68,
        };
        const confirmation = {
          runId: accepted.runId,
          decisionReceiptId: retained.decision!.receiptId,
          inputs: edited,
        };
        await expect(client.confirm(confirmation, secret(), signal)).rejects.toMatchObject({
          status: 403,
        });
        expect(await client.confirm(confirmation, capability, signal)).toMatchObject({
          id: accepted.runId,
          state: 'queued',
          confirmation: { inputs: edited },
        });
        expect(session.run).toEqual(retained);
        await followLiveAsk(client, session, capability, signal, (run) =>
          observed.push({ cursor: session.cursor!, state: run.state }),
        );
        expect(session.run).toMatchObject({
          id: accepted.runId,
          threadId: accepted.threadId,
          state: 'completed',
          decision: retained.decision,
          confirmation: { inputs: edited },
          result: { kind: 'price_per_square_meter', minorUnits: 1000000, inputs: edited },
          terminal: { state: 'completed' },
        });
        expect(session.terminal).toBe(true);
        const persisted = await db.query<{ id: string; sequence: number; event: string }>(
          "SELECT document->>'id' AS id,sequence,document->>'event' AS event FROM ask.run_event WHERE run_id=$1 ORDER BY sequence",
          [accepted.runId],
        );
        expect(observed.map((event) => event.cursor)).toEqual(persisted.map((event) => event.id));
        expect(persisted.map((event) => event.sequence)).toEqual(
          persisted.map((_, index) => index + 1),
        );
        expect(persisted.at(-1)?.event).toBe('ask.completed');
        expect(
          await db.query('SELECT id::text,document FROM ask.decision_receipt WHERE run_id=$1', [
            accepted.runId,
          ]),
        ).toEqual(receipt);
        expect(await decisionCount()).toEqual({ decisions: 1 });
        expect(
          await db.query<{ tools: number }>(
            'SELECT count(*)::integer AS tools FROM ask.tool_receipt WHERE run_id=$1',
            [accepted.runId],
          ),
        ).toEqual([{ tools: 1 }]);

        const second = await client.create(input, capability, secret(), signal);
        const cancelledSession = new LiveAskSession(second);
        const cancelPause = new AbortController();
        await expect(
          followLiveAsk(client, cancelledSession, capability, cancelPause.signal, (run) => {
            if (run.state === 'awaiting_confirmation') cancelPause.abort(disconnect);
          }),
        ).rejects.toBe(disconnect);
        await expect(client.run(second.runId, secret(), signal)).rejects.toMatchObject({
          status: 403,
        });
        await expect(client.thread(second.threadId, secret(), signal)).rejects.toMatchObject({
          status: 403,
        });
        await expect(client.cancel(second.runId, secret(), signal)).rejects.toMatchObject({
          status: 403,
        });
        await expect(
          client.events(second.runId, secret(), cancelledSession.cursor, signal, () => undefined),
        ).rejects.toMatchObject({ status: 403 });
        expect(await client.cancel(second.runId, capability, signal)).toMatchObject({
          state: 'cancelled',
          result: null,
        });
        expect(cancelledSession.terminal).toBe(false);
        const terminals: string[] = [];
        await followLiveAsk(client, cancelledSession, capability, signal, (run) =>
          terminals.push(run.terminal!.state),
        );
        expect(terminals).toEqual(['cancelled']);
        expect(cancelledSession.terminal).toBe(true);
        expect(
          await db.query<{ tools: number; decisions: number }>(
            'SELECT (SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS tools,(SELECT count(*)::integer FROM ask.decision_receipt WHERE run_id=$1) AS decisions',
            [second.runId],
          ),
        ).toEqual([{ tools: 0, decisions: 1 }]);
        expect(await decisionCount()).toEqual({ decisions: 2 });
      } catch (error) {
        await captureAskDiagnostics(fixture, database).catch(() => undefined);
        throw error;
      }
    },
    () =>
      cleanupAll(
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
        async () => expect(await inventory()).toEqual(foreign),
      ),
  );
});
