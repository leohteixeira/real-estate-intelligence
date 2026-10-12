import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import {
  parseAskClaim,
  parseAskLiveRun,
  parseAskLiveThread,
  parseAskLiveEvent,
  parseTextAskAccepted,
  parseTextAskRefused,
  parseTextExecutionEvidence,
  parseAskRequestedIdentity,
  parsePriceToolReceipt,
  type TextAskCreate,
  type AskLiveEvent,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  PostgresAskRunRepository,
  PostgresTransactionRunner,
  PostgresOutbox,
  askDispatchProof,
  askDigest,
} from '../packages/infrastructure/dist/index.js';
import { AskRunRequested } from '../packages/domain/dist/index.js';
import { PricePerSquareMeterService } from '../packages/application/dist/index.js';
import { allocatePorts, cleanupAll, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { captureAskDiagnostics } from './support/ask-diagnostics.ts';

const secret = () => randomBytes(32).toString('base64url');
const golden: TextAskCreate = {
  mode: 'text-price-v1',
  threadId: null,
  placeId: null,
  query: 'Qual é o preço por metro quadrado de um imóvel de R$ 785.000,00 com 68 m²?',
  locale: 'pt-BR',
};
const english: TextAskCreate = {
  ...golden,
  query: 'What is the price per square meter for BRL 785,000.00 and 68 square meters?',
  locale: 'en',
};
const inputs = { priceMinorUnits: 78500000, currency: 'BRL' as const, areaSquareMeters: 68 };
type TextFixture = {
  fixture: ComposeFixture;
  database: DatabaseConnection;
  api: string;
  ai: string;
  token: string;
  dispatchSecret: string;
  capability: string;
  command: (args: string[]) => Promise<{ stdout: string; stderr?: string }>;
};

async function withFixture(work: (context: TextFixture) => Promise<void>, legacy = false) {
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
    capability = secret();
  const fixture = new ComposeFixture(`rei-ask-text-${randomUUID()}`, {
    POSTGRES_PORT: String(postgresPort),
    API_PORT: String(apiPort),
    AI_PORT: String(aiPort),
    RABBITMQ_PORT: String(rabbitPort),
    RABBITMQ_MANAGEMENT_PORT: String(rabbitManagementPort),
    MINIO_API_PORT: String(minioPort),
    MINIO_CONSOLE_PORT: String(minioConsolePort),
    POSTGRES_USER: 'rei_ask_text',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_ask_text',
    RABBITMQ_USER: 'rei_ask_text',
    RABBITMQ_PASSWORD: secret(),
    MINIO_ROOT_USER: 'rei_ask_text',
    MINIO_ROOT_PASSWORD: secret(),
    AI_INTERNAL_TOKEN: token,
    ASK_DISPATCH_SECRET: dispatchSecret,
    SNAPSHOT_ENCRYPTION_KEY_ID: 'ask-text-fixture-v1',
    SNAPSHOT_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'),
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  let database: DatabaseConnection | undefined;
  await preserveCleanup(
    async () => {
      await fixture.up(
        legacy
          ? ['--build', 'postgres']
          : ['--build', 'postgres', 'migrations', 'api', 'ai', 'rabbitmq', 'minio'],
      );
      const url = new URL(`postgres://127.0.0.1:${postgresPort}/rei_ask_text`);
      url.username = fixture.environment.POSTGRES_USER!;
      url.password = fixture.environment.POSTGRES_PASSWORD!;
      database = new DatabaseConnection(url.toString());
      const command = (args: string[]) =>
        fixture.execute(
          'docker',
          ['compose', '--file', 'compose.yaml', '--project-name', fixture.project, ...args],
          { env: fixture.environment, timeout: 240000 },
        );
      try {
        await work({
          fixture,
          database,
          api: `http://127.0.0.1:${apiPort}`,
          ai: `http://127.0.0.1:${aiPort}`,
          token,
          dispatchSecret,
          capability,
          command,
        });
      } catch (error) {
        await captureAskDiagnostics(fixture, database);
        throw error;
      }
    },
    () =>
      cleanupAll(
        async () => database?.close(),
        () => fixture.down(),
      ),
  );
}

function frames(text: string): AskLiveEvent[] {
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
      return frame;
    });
}

test('text PT/EN public admission traverses real worker, validated graph, Market receipt and durable SSE', async () => {
  await withFixture(
    async ({ fixture, database, api, ai, token, dispatchSecret, capability, command }) => {
      await command(['build', 'worker']);
      const headers = { Authorization: `Bearer ${capability}` };
      const post = (body: object, key = secret(), authority = capability) =>
        requestHttp(`${api}/api/v1/runs`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authority}`, 'Idempotency-Key': key },
          body,
        });
      const create = async (body: TextAskCreate, key = secret()) => {
        const response = await post(body, key);
        expect(response.status).toBe(202);
        return parseTextAskAccepted(await response.json());
      };
      const snapshot = async (id: string) => {
        const response = await requestHttp(`${api}/api/v1/runs/${id}`, { headers });
        expect(response.status).toBe(200);
        return parseAskLiveRun(await response.json());
      };
      const counts = () =>
        database.query<{
          threads: number;
          runs: number;
          events: number;
          receipts: number;
          outbox: number;
          inbox: number;
        }>(
          `SELECT (SELECT count(*)::integer FROM ask.thread) AS threads, (SELECT count(*)::integer FROM ask.run) AS runs, (SELECT count(*)::integer FROM ask.run_event) AS events, (SELECT count(*)::integer FROM ask.tool_receipt) AS receipts, (SELECT count(*)::integer FROM platform.outbox) AS outbox, (SELECT count(*)::integer FROM platform.inbox) AS inbox`,
        );
      const before = await counts();
      for (const [query, reason, locale = 'en'] of [
        ['Price 10', 'missing_area'],
        ['Area 68 m2', 'missing_price'],
        ['Price 10 or 20, area 68 m2', 'ambiguous_price'],
        ['Price 10, area 68-70 m2', 'ambiguous_area'],
        ['Price 10 and 20, area 68 m2', 'ambiguous_price'],
        ['Price 785000, area 68 m², price is 900000', 'ambiguous_price'],
        ['Price 785000, area 68 m2, area is 70', 'ambiguous_area'],
        ['Price 785000, area 68 m2 or area is 70', 'ambiguous_area'],
        ['Preço 10 e 20, área 68 m2', 'ambiguous_price', 'pt-BR'],
        ['Price 785000, area 68 m² and 70', 'ambiguous_area'],
        ['Preço 785000, área 68 m² e 70', 'ambiguous_area', 'pt-BR'],
        ['Price 10 vs 20, area 68 m2', 'ambiguous_price'],
        ['Price 10, area 68 m2 vs 70', 'ambiguous_area'],
        ['Price between 10 and 20 BRL, area 68 m2', 'ambiguous_price'],
        ['Price 785000, area between 68 and 70 m2', 'ambiguous_area'],
        ['Preço entre 10 e 20 reais, área 68 m2', 'ambiguous_price', 'pt-BR'],
        ['Preço 785000, área entre 68 e 70 m2', 'ambiguous_area', 'pt-BR'],
        ['Between 785000 and 900000 reais, area 68 m2', 'ambiguous_price'],
        ['Entre 785000 e 900000 reais, área 68 m2', 'ambiguous_price', 'pt-BR'],
        ['Between 785 thousand and 900 thousand BRL, area 68 m2', 'ambiguous_price'],
        ['Price 785000, between 68 and 70 thousand m2', 'ambiguous_area'],
        ['Price 785000, between 0.068 thousand and 0.07 thousand square meters', 'ambiguous_area'],
        ['Preço 785000, entre 0,068 mil e 0,070 mil metros quadrados', 'ambiguous_area', 'pt-BR'],
        ['Price 1e6, area 68 m2', 'invalid_price'],
        ['Price 10 billion BRL, area 68 m2', 'invalid_price'],
        ['Preço 10 bilhões de reais, área 68 m2', 'invalid_price', 'pt-BR'],
        ['Price 10 trillion BRL, area 68 m2', 'invalid_price'],
        ['Preço 10 trilhões de reais, área 68 m2', 'invalid_price', 'pt-BR'],
        ['Price 10 quadrillion BRL, area 68 m2', 'invalid_price'],
        ['Price 10, area 0 m2', 'invalid_area'],
        ['Price 785000, area 68 sextillion m2', 'invalid_area'],
        ['Price USD 785000, area 68 m2', 'unsupported_currency'],
        ['Price 10 CHF, area 68 m2', 'unsupported_currency'],
        ['Price 10 thousand CHF, area 68 m2', 'unsupported_currency'],
        ['Price 785000 in CHF, area 68 m2', 'unsupported_currency'],
        ['Price BRL 785000 quoted in CHF, area 68 m2', 'unsupported_currency'],
        ['Price 785000 BRL quoted in CHF, area 68 m2', 'unsupported_currency'],
        ['Price 785000, currency BRL and CHF, area 68 m2', 'unsupported_currency'],
        ['Preço 785000 em CHF, área 68 m2', 'unsupported_currency', 'pt-BR'],
        ['Preço BRL 785000 cotado em CHF, área 68 m2', 'unsupported_currency', 'pt-BR'],
        ['Price 785000 pesos, area 68 m2', 'unsupported_currency'],
        ['Preço 785000 pesos, área 68 m2', 'unsupported_currency', 'pt-BR'],
        ['Price 785000 swiss francs, area 68 m2', 'unsupported_currency'],
        ['Price 785000 Mexican pesos, area 68 m2', 'unsupported_currency'],
        ['Price 785000 in Argentine pesos, area 68 m2', 'unsupported_currency'],
        ['Preço 785000 francos suíços, área 68 m2', 'unsupported_currency', 'pt-BR'],
        ['Price 785000 yen, area 68 m2', 'unsupported_currency'],
        ['Price 785000 rupees, area 68 m2', 'unsupported_currency'],
        ['Price 785000 in Turkish lira, area 68 m2', 'unsupported_currency'],
        ['Price 785000 Russian rubles, area 68 m2', 'unsupported_currency'],
        ['Preço 785000 ienes, área 68 m2', 'unsupported_currency', 'pt-BR'],
        ['CHF R$ 785000, area 68 m2', 'unsupported_currency'],
        ['Price 10 RUB, area 68 m2', 'unsupported_currency'],
        ['Price 10, currency BTC, area 68 m2', 'unsupported_currency'],
        ['Price ₹10, area 68 m2', 'unsupported_currency'],
        ['Price 10, area 68 ft²', 'unsupported_area_unit'],
        ['Preço 785000, área 68 pés quadrados', 'unsupported_area_unit', 'pt-BR'],
        ['Price 785000, area 68 square kilometers', 'unsupported_area_unit'],
        ['Price 785000, area 68 m3', 'unsupported_area_unit'],
        ['Preço 785000, área 68 m³', 'unsupported_area_unit', 'pt-BR'],
        ['Price 785000, area 68 square miles', 'unsupported_area_unit'],
        ['Preço 785000, área 68 milhas quadradas', 'unsupported_area_unit', 'pt-BR'],
        ['Price 785000, area 68 square centimetres', 'unsupported_area_unit'],
        ['Preço 785000, área 68 centímetros quadrados', 'unsupported_area_unit', 'pt-BR'],
        ['Price 785000, area 68 square decimeters', 'unsupported_area_unit'],
        ['Price 785000, area 68 sqft', 'unsupported_area_unit'],
        ['Price 785000, area 68 cm³', 'unsupported_area_unit'],
        ['Price 785000, area 68 cubic meters', 'unsupported_area_unit'],
        ['Price 785000, area 68 meters', 'unsupported_area_unit'],
        ['Price 785000, area 68 meter', 'unsupported_area_unit'],
        ['Price 785000, area 68 m', 'unsupported_area_unit'],
        ['Preço 785000, área 68 metros', 'unsupported_area_unit', 'pt-BR'],
        ['Price 785000, area 68 dm²', 'unsupported_area_unit'],
        ['Price 785000, area 68 sq in', 'unsupported_area_unit'],
        ['Price 785000, area 68 ares', 'unsupported_area_unit'],
        ['Price 785000, area 0.068 thousand ares', 'unsupported_area_unit'],
        ['Price 785000, area 0.068 thousand sq in', 'unsupported_area_unit'],
        ['Price 785000, area 68 ft from street 42', 'unsupported_area_unit'],
        ['Price 785000, area 68 foot from street 42', 'unsupported_area_unit'],
        ['Price 785000, area 68 feet from street 42', 'unsupported_area_unit'],
        ['Price 785000, area is 68 feet from street 42', 'unsupported_area_unit'],
        ['Price 785000, area 68 square feet from street 42', 'unsupported_area_unit'],
        ['Price 785000, area 68 square ft from street 42', 'unsupported_area_unit'],
        ['Price 785000, area is 0.068 thousand foot from street 42', 'unsupported_area_unit'],
        ['Price 785000, area is 0.068 thousand feet from street 42', 'unsupported_area_unit'],
        ['Price 785000, area is 0.068 thousand ft from street 42', 'unsupported_area_unit'],
        ['Preço 785000, área 68 ha', 'unsupported_area_unit', 'pt-BR'],
        ['Price 785000, area ha 68', 'unsupported_area_unit'],
        ['Price 0.01, area 1000000 m2', 'unsafe_result'],
      ] as const) {
        const response = await post({ ...english, query, locale });
        expect(response.status).toBe(422);
        expect(parseTextAskRefused(await response.json())).toEqual({
          mode: 'text-price-v1',
          code: 'price_input_refused',
          reason,
        });
        expect(await counts()).toEqual(before);
      }
      for (const body of [
        { ...english, inputs },
        { ...english, extra: true },
        { ...english, query: '\u0001' },
        { ...english, locale: 'fr' },
      ])
        expect((await post(body)).status).toBe(400);
      expect(await counts()).toEqual(before);
      const key = secret(),
        pt = await create(golden, key);
      expect(await create(golden, key)).toEqual(pt);
      expect((await post({ ...golden, query: `${golden.query} Please.` }, key)).status).toBe(409);
      expect((await post({ ...golden, mode: 'structured-price-v1', inputs }, key)).status).toBe(
        409,
      );
      expect((await post(golden, key, secret())).status).toBe(403);
      const en = await create({ ...english, threadId: pt.threadId });
      expect((await snapshot(pt.runId)).originalInputs).toEqual(inputs);
      expect((await snapshot(en.runId)).originalInputs).toEqual(inputs);
      const requested = await database.query<{
        payload: { runId: string; threadId: string };
        event_id: string;
        event_version: number;
      }>(
        "SELECT payload,event_id::text,event_version FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.requested'",
        [pt.runId],
      );
      expect(requested[0]!.payload).toEqual({ runId: pt.runId, threadId: pt.threadId });
      const identity = parseAskRequestedIdentity({
        ...requested[0]!.payload,
        eventId: requested[0]!.event_id,
        version: requested[0]!.event_version,
      });
      expect(Object.keys(identity).sort()).toEqual(['eventId', 'runId', 'threadId', 'version']);
      const streams = [pt, en].map(({ runId }) =>
        requestHttp(`${api}/api/v1/runs/${runId}/events`, { headers }),
      );
      const observedStreams = Promise.all(streams).then(
        (delivered) => ({ delivered }),
        (error) => ({ error }),
      );
      await fixture.up(['worker']);
      const observed = await observedStreams;
      if ('error' in observed) throw observed.error;
      for (const [index, delivered] of observed.delivered.entries()) {
        expect(delivered.status).toBe(200);
        const events = frames(await delivered.text());
        expect(events[0]?.run.state).toBe('queued');
        expect(events.at(-1)?.run.id).toBe([pt, en][index]!.runId);
        expect(events.at(-1)?.run.state).toBe('completed');
        expect(events.at(-1)?.run.result?.minorUnits).toBe(1154412);
        expect(events.at(-1)?.run.decision?.source).toBe('validated-text-v1');
        expect(events.filter((event) => event.terminal)).toHaveLength(1);
        const runId = [pt, en][index]!.runId;
        const replay = await requestHttp(`${api}/api/v1/runs/${runId}/events`, {
          headers: { ...headers, 'Last-Event-ID': events[0]!.id },
        });
        expect(replay.status).toBe(200);
        expect(frames(await replay.text())).toEqual(events.slice(1));
        const consumed = await requestHttp(`${api}/api/v1/runs/${runId}/events`, {
          headers: { ...headers, 'Last-Event-ID': events.at(-1)!.id },
        });
        expect(consumed.status).toBe(200);
        expect(await consumed.text()).toBe('');
      }
      await vi.waitFor(async () => expect((await snapshot(en.runId)).state).toBe('completed'), {
        timeout: 30000,
        interval: 100,
      });
      for (const id of [pt.runId, en.runId]) {
        expect(
          await database.query<{
            events: number;
            receipts: number;
            inbox: number;
            terminals: number;
          }>(
            `SELECT (SELECT count(*)::integer FROM ask.run_event WHERE run_id=$1) AS events, (SELECT count(*)::integer FROM ask.tool_receipt WHERE run_id=$1) AS receipts, (SELECT count(*)::integer FROM platform.inbox WHERE event_id=(SELECT requested_event_id FROM ask.run WHERE id=$1) AND consumer_name='ask.structured-run') AS inbox, (SELECT count(*)::integer FROM platform.outbox WHERE aggregate_id=$1 AND event_type='ask.run.completed') AS terminals`,
            [id],
          ),
        ).toEqual([{ events: 3, receipts: 1, inbox: 1, terminals: 1 }]);
      }
      const contextQueries = [
        ['Preço 785000, área 68 m², há 2 quartos', 'pt-BR'],
        ['Preço 785000, área 68, há 2 quartos', 'pt-BR'],
        ['Price 785000, 3 bedrooms, area 68 m2', 'en'],
        ['Price 785000, 2026 year, area 68 m2', 'en'],
        ['Price 785000, area 68 m2, 10 meters from street 42', 'en'],
        ['Price 785000, area 68 m2, 10 feet from street 42', 'en'],
        ['Price 785000, area 68 m2, 10 ft from street 42', 'en'],
        ['Price 785000, area 68 m2, 1 foot from street 42', 'en'],
        ['Street 42 is 10 meters away: price 785000, area 68 m2', 'en'],
      ] as const;
      for (const [contextQuery, locale] of contextQueries) {
        const contextual = await create({
          ...golden,
          threadId: pt.threadId,
          query: contextQuery,
          locale,
        });
        expect((await snapshot(contextual.runId)).originalInputs).toEqual(inputs);
        const contextualStream = await requestHttp(
          `${api}/api/v1/runs/${contextual.runId}/events`,
          {
            headers,
          },
        );
        expect(contextualStream.status).toBe(200);
        const contextualTerminal = frames(await contextualStream.text()).at(-1);
        expect(contextualTerminal?.run.id).toBe(contextual.runId);
        expect(contextualTerminal?.run.state).toBe('completed');
        expect(contextualTerminal?.run.result?.minorUnits).toBe(1154412);
      }
      const structured = await post({
        mode: 'structured-price-v1',
        threadId: pt.threadId,
        placeId: null,
        query: 'Structured synthetic legacy input',
        locale: 'en',
        inputs,
      });
      expect(structured.status).toBe(202);
      const thread = await requestHttp(`${api}/api/v1/threads/${pt.threadId}`, { headers });
      expect(parseAskLiveThread(await thread.json()).basis).toBe('mixed-price-v1');
      expect(
        (
          await requestHttp(`${api}/api/v1/runs/${pt.runId}`, {
            headers: { Authorization: `Bearer ${secret()}` },
          })
        ).status,
      ).toBe(403);
      await command(['stop', 'worker']);
      const attack = await create(english);
      const row = await database.query<{ event_id: string }>(
        'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
        [attack.runId],
      );
      const attackIdentity = {
        version: 1 as const,
        eventId: row[0]!.event_id,
        runId: attack.runId,
        threadId: attack.threadId,
      };
      const dispatchHeaders = {
        Authorization: `Bearer ${askDispatchProof(dispatchSecret, attackIdentity)}`,
      };
      const claimedResponse = await requestHttp(
        `${api}/api/v1/internal/ask/runs/${attack.runId}/claim`,
        { method: 'POST', headers: dispatchHeaders, body: attackIdentity },
      );
      expect(claimedResponse.status).toBe(200);
      const claim = parseAskClaim(await claimedResponse.json());
      expect(claim.disposition).toBe('claimed');
      if (claim.disposition !== 'claimed') throw new Error('Expected an owned claim.');
      expect(claim.input.step).toBe('text-price-v1');
      const tool = {
        ...attackIdentity,
        executionId: claim.input.executionId,
        operation: 'price-per-square-meter',
        inputs,
      };
      const toolUrl = `${api}/api/v1/ask/runs/${attack.runId}/tools/price-per-square-meter`;
      for (const [body, authority, status] of [
        [{ ...tool, operation: 'select-sql' }, claim.input.toolGrant, 400],
        [{ ...tool, inputs: { ...inputs, priceMinorUnits: 1 } }, claim.input.toolGrant, 403],
        [{ ...tool, eventId: tool.executionId }, claim.input.toolGrant, 403],
        [{ ...tool, executionId: attackIdentity.eventId }, claim.input.toolGrant, 403],
        [tool, capability, 403],
      ] as const)
        expect(
          (
            await requestHttp(toolUrl, {
              method: 'POST',
              headers: { Authorization: `Bearer ${authority}` },
              body,
            })
          ).status,
        ).toBe(status);
      expect(
        await database.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM ask.tool_receipt WHERE run_id=$1',
          [attack.runId],
        ),
      ).toEqual([{ count: 0 }]);
      const executed = await requestHttp(`${ai}/internal/v1/runs/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: claim.input,
      });
      expect(executed.status).toBe(200);
      const evidence = parseTextExecutionEvidence(await executed.json());
      expect(evidence.visitedNodes).toEqual(['validatedInputs', 'priceTool']);
      const completionUrl = `${api}/api/v1/internal/ask/runs/${attack.runId}/complete`;
      const completion = {
        ...attackIdentity,
        executionId: tool.executionId,
        failure: null,
        evidence,
      };
      expect(
        (
          await requestHttp(completionUrl, {
            method: 'POST',
            headers: dispatchHeaders,
            body: {
              ...completion,
              evidence: {
                ...evidence,
                step: 'structured-price-v1',
                visitedNodes: ['fixedDecision', 'priceTool'],
              },
            },
          })
        ).status,
      ).toBe(403);
      await database.query(
        "UPDATE ask.run SET claim_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [attack.runId],
      );
      expect(
        (
          await requestHttp(toolUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${claim.input.toolGrant}` },
            body: tool,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await requestHttp(completionUrl, {
            method: 'POST',
            headers: dispatchHeaders,
            body: completion,
          })
        ).status,
      ).toBe(403);
      await fixture.up(['worker']);
      await vi.waitFor(async () => expect((await snapshot(attack.runId)).state).toBe('completed'), {
        timeout: 30000,
        interval: 100,
      });
      const retained = await snapshot(pt.runId);
      await command(['restart', 'api']);
      await vi.waitFor(async () => expect(await snapshot(pt.runId)).toEqual(retained), {
        timeout: 30000,
        interval: 200,
      });
      const restartedStream = await requestHttp(`${api}/api/v1/runs/${pt.runId}/events`, {
        headers,
      });
      expect(restartedStream.status).toBe(200);
      expect(frames(await restartedStream.text()).at(-1)?.run).toEqual(retained);
      const logs = await command(['logs', '--no-color', 'api', 'worker', 'ai']);
      for (const value of [
        golden.query,
        english.query,
        ...contextQueries.map(([query]) => query),
        token,
        dispatchSecret,
        capability,
        claim.input.toolGrant,
      ]) {
        expect(logs.stdout).not.toContain(value);
        expect(logs.stderr ?? '').not.toContain(value);
      }
    },
  );
});

test('6002 upgrades populated structured history without rewriting evidence and retains closed SQL provenance', async () => {
  await withFixture(async ({ database, fixture, capability, api }) => {
    await database.query(
      'CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const migrationFiles = (await readdir(new URL('../migrations/', import.meta.url)))
      .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
      .sort();
    const apply = async (file: string) => {
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
    };
    for (const file of migrationFiles.filter((file) => file < '6002')) await apply(file);
    expect(
      await database.query<{ present: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='ask' AND table_name='run' AND column_name='admission_sequence') AS present",
      ),
    ).toEqual([{ present: false }]);
    const market = new PricePerSquareMeterService();
    // Historical fixture SQL names only 6001 columns; current repositories never
    // run against an older schema or select a compatibility fallback.
    const allocated = await database.query<{
      id: string;
      thread_id: string;
      event_id: string;
      execution_id: string;
      receipt_id: string;
      terminal_event_id: string;
      at: Date;
    }>(
      'SELECT uuidv7()::text AS id,uuidv7()::text AS thread_id,uuidv7()::text AS event_id,uuidv7()::text AS execution_id,uuidv7()::text AS receipt_id,uuidv7()::text AS terminal_event_id,clock_timestamp() AS at',
    );
    const allocation = allocated[0]!;
    const at = allocation.at.toISOString();
    const creationKey = askDigest(secret());
    const fingerprint = askDigest(
      JSON.stringify([
        'structured-price-v1',
        null,
        null,
        'Legacy structured synthetic question',
        'en',
        inputs.priceMinorUnits,
        inputs.currency,
        inputs.areaSquareMeters,
      ]),
    );
    const run = parseAskLiveRun({
      basis: 'structured-price-v1',
      id: allocation.id,
      threadId: allocation.thread_id,
      principalId: null,
      question: 'Legacy structured synthetic question',
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
    const identity = {
      version: 1 as const,
      eventId: allocation.event_id,
      runId: run.id,
      threadId: run.threadId,
    };
    const running = parseAskLiveRun({
      ...run,
      state: 'running',
      decision: {
        source: 'fixed-structured-v1',
        intent: 'price_per_square_meter',
        decidedAt: at,
      },
      steps: [{ sequence: 1, phase: 'calculating', at }],
    });
    const receipt = parsePriceToolReceipt({
      ...identity,
      executionId: allocation.execution_id,
      operation: 'price-per-square-meter',
      inputs,
      receiptId: allocation.receipt_id,
      provenance: 'market-domain-v1',
      result: market.pricePerSquareMeter(inputs, at),
    });
    const completed = parseAskLiveRun({
      ...running,
      state: 'completed',
      result: receipt.result,
      terminal: { state: 'completed', reason: null, at },
      steps: [...running.steps, { sequence: 2, phase: 'completed', at }],
    });
    const client = await database.leaseClient();
    let committed = false;
    await preserveCleanup(
      async () => {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO ask.thread(id,authority_digest,preparation_key) VALUES($1,$2,$3)',
          [run.threadId, askDigest(capability), creationKey],
        );
        await client.query(
          "INSERT INTO ask.run(id,thread_id,creation_key,request_fingerprint,requested_event_id,state,price_minor_units,area_square_meters,execution_id,claim_expires_at,grant_digest,document) VALUES($1,$2,$3,$4,$5,'completed',$6,$7,$8,clock_timestamp()+interval '30 seconds',$9,$10)",
          [
            run.id,
            run.threadId,
            creationKey,
            fingerprint,
            identity.eventId,
            inputs.priceMinorUnits,
            inputs.areaSquareMeters,
            allocation.execution_id,
            askDigest(secret()),
            completed,
          ],
        );
        for (const [index, document] of [run, running, completed].entries()) {
          const sequence = index + 1;
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
        }
        await client.query('INSERT INTO ask.tool_receipt(run_id,id,document) VALUES($1,$2,$3)', [
          run.id,
          receipt.receiptId,
          receipt,
        ]);
        await client.query(
          "INSERT INTO platform.inbox(event_id,consumer_name) VALUES($1,'ask.structured-run')",
          [identity.eventId],
        );
        await client.query(
          "INSERT INTO platform.idempotency_key(scope,idempotency_key,request_fingerprint,result_reference,expires_at) VALUES('ask.structured-create',$1,$2,$3,clock_timestamp()+interval '24 hours')",
          [creationKey, fingerprint, run.id],
        );
        const requested = new AskRunRequested(identity, at);
        await client.query(
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
        await client.query(
          "INSERT INTO platform.outbox(event_id,event_type,event_version,aggregate_id,occurred_at,payload) VALUES($1,'ask.run.completed',1,$2,$3,$4)",
          [allocation.terminal_event_id, run.id, at, { runId: run.id, threadId: run.threadId }],
        );
        await client.query('COMMIT');
        committed = true;
      },
      () =>
        cleanupAll(
          async () => {
            if (!committed) await client.query('ROLLBACK');
          },
          async () => client.release(),
        ),
    );
    const digest = () =>
      database.query<{
        runs: string;
        events: string;
        receipts: string;
        outbox: string;
        inbox: string;
        idempotency: string;
      }>(
        `SELECT (SELECT md5(string_agg((to_jsonb(r)-ARRAY['checkpoint_grant_digest','graph_started_at','graph_expires_at','graph_pruned_at','admission_sequence','admitted_at','queue_expires_at'])::text,'' ORDER BY id)) FROM ask.run r) AS runs, (SELECT md5(string_agg(document::text,'' ORDER BY run_id,sequence)) FROM ask.run_event) AS events, (SELECT md5(string_agg(document::text,'' ORDER BY run_id)) FROM ask.tool_receipt) AS receipts, (SELECT md5(string_agg(row_to_json(o)::text,'' ORDER BY event_id)) FROM platform.outbox o) AS outbox, (SELECT md5(string_agg(row_to_json(i)::text,'' ORDER BY event_id)) FROM platform.inbox i) AS inbox, (SELECT md5(string_agg(row_to_json(k)::text,'' ORDER BY idempotency_key)) FROM platform.idempotency_key k) AS idempotency`,
      );
    const before = await digest();
    await apply('6002_ask_text_price_runs.sql');
    expect(await digest()).toEqual(before);
    for (const file of migrationFiles.filter((file) => file > '6002_ask_text_price_runs.sql'))
      await apply(file);
    expect(await digest()).toEqual(before);
    const repository = new PostgresAskRunRepository(
      database,
      new PostgresTransactionRunner(database),
      new PostgresOutbox(database),
    );
    expect(await repository.run(run.id, capability)).toEqual(completed);
    const history = await repository.events(run.id, capability, 0);
    expect(history).toHaveLength(3);
    history.forEach(parseAskLiveEvent);
    for (const sql of [
      "UPDATE ask.run SET document=jsonb_set(document,'{basis}','\"text-price-v1\"') WHERE id=$1",
      "UPDATE ask.run SET document=jsonb_set(document,'{decision,source}','\"validated-text-v1\"') WHERE id=$1",
      "UPDATE ask.run SET document=jsonb_set(document,'{originalInputs,priceMinorUnits}','1') WHERE id=$1",
      'UPDATE ask.run SET document=document || \'{"extra":true}\'::jsonb WHERE id=$1',
      "UPDATE ask.run_event SET document=jsonb_set(document,'{run,basis}','\"text-price-v1\"') WHERE run_id=$1 AND sequence=3",
    ])
      await expect(database.query(sql, [run.id])).rejects.toThrow();
    expect(await digest()).toEqual(before);
    await fixture.up(['--build', 'migrations', 'api', 'ai', 'rabbitmq', 'minio', 'worker']);
    const response = await requestHttp(`${api}/api/v1/runs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${capability}`, 'Idempotency-Key': secret() },
      body: { ...english, threadId: run.threadId },
    });
    expect(response.status).toBe(202);
    const accepted = parseTextAskAccepted(await response.json());
    await vi.waitFor(
      async () => {
        const response = await requestHttp(`${api}/api/v1/runs/${accepted.runId}`, {
          headers: { Authorization: `Bearer ${capability}` },
        });
        expect(parseAskLiveRun(await response.json()).result?.minorUnits).toBe(1154412);
      },
      { timeout: 30000, interval: 200 },
    );
    const thread = await requestHttp(`${api}/api/v1/threads/${run.threadId}`, {
      headers: { Authorization: `Bearer ${capability}` },
    });
    expect(parseAskLiveThread(await thread.json()).basis).toBe('mixed-price-v1');
    expect(await repository.run(run.id, capability)).toEqual(completed);
  }, true);
});
