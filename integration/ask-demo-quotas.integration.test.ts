import { readFile, readdir } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { getContainerRuntimeClient, getReaper } from 'testcontainers';
import {
  PostgresAskRunRepository,
  PostgresTransactionRunner,
  PostgresOutbox,
  PostgresGraphCheckpointRepository,
  DatabaseConnection,
} from '../packages/infrastructure/dist/index.js';
import {
  parseAskLiveRun,
  parseAskLiveThread,
  parseRoutedAskAccepted,
  parseAskQuotaRejection,
} from '../packages/contracts/dist/index.js';
import { ComposeFixture, allocatePorts, cleanupAll, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

const secret = () => randomBytes(32).toString('base64url');
const inputs = { priceMinorUnits: 78500000, currency: 'BRL' as const, areaSquareMeters: 68 };
const body = {
  mode: 'structured-price-v1',
  threadId: null,
  placeId: null,
  query: 'Price 785000, area 68 m2',
  locale: 'en',
  inputs,
};
const modes = [
  'structured-price-v1',
  'text-price-v1',
  'text-price-explanation-v1',
  'routed-text-v1',
  'routed-text-explanation-v1',
] as const;
function requestBody(mode: (typeof modes)[number]) {
  if (mode === 'structured-price-v1') return body;
  return { mode, threadId: null, placeId: null, query: body.query, locale: 'en' };
}

test('public daily admission is atomic, calendar aware and independent of strong thread authority', async () => {
  await getReaper(await getContainerRuntimeClient());
  const [postgres, apiPort, rabbit, management] = await allocatePorts(4);
  const dispatch = secret(),
    authority = secret();
  const fixture = new ComposeFixture(`rei-demo-quota-${randomUUID()}`, {
    POSTGRES_PORT: String(postgres),
    API_PORT: String(apiPort),
    RABBITMQ_PORT: String(rabbit),
    RABBITMQ_MANAGEMENT_PORT: String(management),
    POSTGRES_USER: 'rei_quota',
    POSTGRES_PASSWORD: secret(),
    POSTGRES_DB: 'rei_quota',
    RABBITMQ_USER: 'rei_quota',
    RABBITMQ_PASSWORD: secret(),
    ASK_DISPATCH_SECRET: dispatch,
    ASK_VISITOR_DAILY_LIMIT: '20',
    ASK_GLOBAL_DAILY_LIMIT: '100',
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  const api = `http://127.0.0.1:${apiPort}/api/v1`;
  const inventory = async () => {
    const containers = await fixture.execute('docker', ['ps', '--all', '--format', '{{.ID}}']);
    const volumes = await fixture.execute('docker', ['volume', 'ls', '--format', '{{.Name}}']);
    return {
      containers: containers.stdout.split('\n').filter(Boolean).sort(),
      volumes: volumes.stdout.split('\n').filter(Boolean).sort(),
    };
  };
  const foreign = await inventory();
  const metadata = async () => ({
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
            '{{.Name}} {{json .Labels}} {{.Driver}} {{.Mountpoint}}',
            ...foreign.volumes,
          ])
        ).stdout
      : '',
  });
  const foreignMetadata = await metadata();
  let database: DatabaseConnection | undefined;
  await preserveCleanup(
    async () => {
      for (const service of ['migrations', 'api'])
        await fixture.execute('docker', [
          'image',
          'tag',
          `rei-quota-images-${service}`,
          `${fixture.project}-${service}`,
        ]);
      await fixture.up(['postgres']);
      const url = new URL(`postgres://127.0.0.1:${postgres}/rei_quota`);
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
      const apply = async (file: string) => {
        await db.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
        await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [file.slice(0, -4)]);
      };
      for (const file of files.filter((file) => file < '6009')) await apply(file);
      // A genuine pre-6009 admission names only historical columns. No backfilled run or count.
      const allocation = (
        await db.query<{ id: string; thread_id: string; event_id: string }>(
          'SELECT uuidv7()::text AS id,uuidv7()::text AS thread_id,uuidv7()::text AS event_id',
        )
      )[0]!;
      const historical = parseAskLiveRun({
        basis: 'routed-text-v1',
        id: allocation.id,
        threadId: allocation.thread_id,
        principalId: null,
        question: body.query,
        locale: body.locale,
        placeId: null,
        createdAt: '2026-10-26T10:00:00.000Z',
        updatedAt: '2026-10-26T10:00:00.000Z',
        state: 'cancelled',
        confirmation: null,
        confirmationDeadline: null,
        originalInputs: inputs,
        decision: null,
        result: null,
        terminal: {
          state: 'cancelled',
          reason: 'visitor_cancelled',
          at: '2026-10-26T10:00:00.000Z',
        },
        steps: [{ sequence: 1, phase: 'cancelled', at: '2026-10-26T10:00:00.000Z' }],
      });
      await db.query('INSERT INTO ask.thread(id,authority_digest) VALUES($1,$2)', [
        historical.threadId,
        createHash('sha256').update(authority).digest('hex'),
      ]);
      await db.query(
        `INSERT INTO ask.run(id,thread_id,creation_key,request_fingerprint,requested_event_id,state,price_minor_units,area_square_meters,document,admitted_at,queue_expires_at) VALUES($1,$2,$3,$4,$5,'cancelled',$6,$7,$8,$9,$9::timestamptz+interval '120 seconds')`,
        [
          historical.id,
          historical.threadId,
          'a'.repeat(64),
          'b'.repeat(64),
          allocation.event_id,
          inputs.priceMinorUnits,
          inputs.areaSquareMeters,
          historical,
          historical.createdAt,
        ],
      );
      const historicalBytes = async () =>
        db.query<{ document: string }>('SELECT document::text FROM ask.run WHERE id=$1', [
          historical.id,
        ]);
      const before = await historicalBytes();
      await apply('6009_ask_demo_quotas.sql');
      expect(await historicalBytes()).toEqual(before);
      expect(
        await db.query<{ visitor_digest: string | null }>(
          'SELECT visitor_digest FROM ask.run WHERE id=$1',
          [historical.id],
        ),
      ).toEqual([{ visitor_digest: null }]);
      // Only this owned role resolves the SQL fixture clock. Keep public first so the
      // migration runner reuses its existing public control table rather than creating one.
      await db.query(`CREATE SCHEMA quota_fixture;
      CREATE TABLE quota_fixture.clock(at timestamptz NOT NULL);
      INSERT INTO quota_fixture.clock VALUES('2026-10-26T12:00:00Z');
      CREATE FUNCTION public.clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE AS 'SELECT at FROM quota_fixture.clock';
      ALTER TABLE platform.idempotency_key ALTER COLUMN created_at SET DEFAULT public.clock_timestamp();
      ALTER TABLE ask.thread ALTER COLUMN created_at SET DEFAULT public.clock_timestamp();
      ALTER TABLE platform.inbox ALTER COLUMN received_at SET DEFAULT public.clock_timestamp();
      ALTER ROLE rei_quota SET search_path=public,quota_fixture,pg_catalog`);
      await fixture.up(['api']);
      const counts = async () =>
        (
          await db.query<{ runs: number; events: number; requested: number; all_outbox: number }>(
            `SELECT (SELECT count(*)::integer FROM ask.run) AS runs,(SELECT count(*)::integer FROM ask.run_event) AS events,(SELECT count(*)::integer FROM platform.outbox WHERE event_type='ask.run.requested') AS requested,(SELECT count(*)::integer FROM platform.outbox) AS all_outbox`,
          )
        )[0]!;
      const create = (
        cookie = '',
        mode: (typeof modes)[number] = 'structured-price-v1',
        key = secret(),
        capability = authority,
        data: object = requestBody(mode),
      ) =>
        requestHttp(`${api}/runs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${capability}`,
            'Idempotency-Key': key,
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: data,
        });
      const firstKey = secret();
      const first = await create('', 'routed-text-v1', firstKey);
      expect(first.status).toBe(202);
      const accepted = parseRoutedAskAccepted(await first.json());
      const setCookie = first.headers.get('set-cookie')!;
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('Max-Age=2592000');
      const cookie = setCookie.split(';')[0]!;
      for (let index = 1; index < 19; index++)
        expect((await create(cookie, modes[index % modes.length]!)).status).toBe(202);
      const visitorRace = await Promise.all([
        create(cookie, 'routed-text-explanation-v1'),
        create(cookie, 'text-price-v1'),
      ]);
      expect(visitorRace.filter((response) => response.status === 202)).toHaveLength(1);
      expect(visitorRace.filter((response) => response.status === 429)).toHaveLength(1);
      const twenty = await counts();
      expect(twenty.runs).toBe(21);
      expect(twenty.events).toBe(20);
      expect(twenty.requested).toBe(20);
      const refusal = await create(cookie);
      expect(refusal.status).toBe(429);
      expect(parseAskQuotaRejection(await refusal.json())).toEqual({
        code: 'quota_exceeded',
        scope: 'visitor',
        reopensAt: '2026-10-27T03:00:00.000Z',
      });
      expect(await counts()).toEqual(twenty);
      const replay = await create(cookie, 'routed-text-v1', firstKey);
      expect(replay.status).toBe(202);
      expect(await replay.json()).toEqual(await first.json());
      expect(
        (
          await create(cookie, 'routed-text-v1', firstKey, authority, {
            ...requestBody('routed-text-v1'),
            query: 'changed',
          })
        ).status,
      ).toBe(409);
      expect((await create(cookie, 'routed-text-v1', firstKey, secret())).status).toBe(403);
      // Every private public surface checks its independent strong thread capability.
      for (const foreign of ['', secret()]) {
        const headers = {
          Cookie: cookie,
          ...(foreign ? { Authorization: `Bearer ${foreign}` } : {}),
        };
        for (const path of [
          `runs/${accepted.runId}`,
          `threads/${accepted.threadId}`,
          `runs/${accepted.runId}/events`,
        ]) {
          const denied = await requestHttp(`${api}/${path}`, { headers });
          expect(denied.status).toBe(foreign ? 403 : 401);
          expect(await denied.text()).not.toContain(body.query);
        }
        for (const operation of ['confirm', 'cancel']) {
          const denied = await requestHttp(`${api}/runs/${accepted.runId}/${operation}`, {
            method: 'POST',
            headers,
            body:
              operation === 'cancel'
                ? { reason: 'visitor_cancelled' }
                : { runId: accepted.runId, decisionReceiptId: allocation.event_id, inputs },
          });
          expect(denied.status).toBe(foreign ? 403 : 401);
        }
      }
      expect(await counts()).toEqual(twenty);
      const ownHeaders = { Cookie: cookie, Authorization: `Bearer ${authority}` };
      expect(
        parseAskLiveThread(
          await (
            await requestHttp(`${api}/threads/${accepted.threadId}`, { headers: ownHeaders })
          ).json(),
        ).runs,
      ).toHaveLength(1);
      expect(
        parseAskLiveRun(
          await (
            await requestHttp(`${api}/runs/${accepted.runId}`, { headers: ownHeaders })
          ).json(),
        ).id,
      ).toBe(accepted.runId);
      // Prepare a real low-confidence pause through the production persistence port, without AI.
      const executionDb = new DatabaseConnection(url.toString());
      await preserveCleanup(
        async () => {
          const repository = new PostgresAskRunRepository(
            executionDb,
            new PostgresTransactionRunner(executionDb),
            new PostgresOutbox(executionDb),
          );
          const event = (
            await db.query<{ event_id: string }>(
              'SELECT requested_event_id::text AS event_id FROM ask.run WHERE id=$1',
              [accepted.runId],
            )
          )[0]!;
          const identity = {
            version: 1 as const,
            eventId: event.event_id,
            runId: accepted.runId,
            threadId: accepted.threadId,
          };
          const claim = await repository.claim(identity);
          if (claim.disposition !== 'claimed' || claim.input.step !== 'routed-text-v1')
            throw new Error('Expected routed quota fixture claim.');
          const address = { ...identity, executionId: claim.input.executionId },
            signal = new AbortController().signal;
          const reservation = await repository.executeDecision(
            { ...address, operation: 'reserve', attemptKey: secret() },
            claim.input.checkpointGrant,
            signal,
          );
          if (reservation.operation !== 'reserve')
            throw new Error('Expected quota fixture decision reservation.');
          const decision = await repository.executeDecision(
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
            claim.input.checkpointGrant,
            signal,
          );
          if (decision.operation !== 'accept')
            throw new Error('Expected quota fixture decision receipt.');
          expect(
            await new PostgresGraphCheckpointRepository(
              executionDb,
              new PostgresTransactionRunner(executionDb),
            ).execute(
              {
                ...address,
                graphVersion: 'intent-routing-v1',
                namespace: '',
                operation: 'put',
                checkpointId: accepted.runId,
                parentId: null,
                checkpoint: { type: 'json', base64: 'e30=' },
                metadata: { type: 'json', base64: 'e30=' },
              },
              claim.input.checkpointGrant,
              signal,
            ),
          ).toEqual({ operation: 'put', saved: true });
          await repository.complete({
            ...address,
            evidence: {
              ...address,
              step: 'routed-text-v1',
              outcome: 'awaiting-confirmation',
              decisionReceiptId: decision.decision.receiptId,
            },
            failure: null,
          });
          const beforeConfirm = await counts();
          const confirmation = {
            runId: accepted.runId,
            decisionReceiptId: decision.decision.receiptId,
            inputs,
          };
          const confirmed = await requestHttp(`${api}/runs/${accepted.runId}/confirm`, {
            method: 'POST',
            headers: ownHeaders,
            body: confirmation,
          });
          expect(confirmed.status).toBe(200);
          expect(parseAskLiveRun(await confirmed.json()).state).toBe('queued');
          const afterConfirm = await counts();
          expect(afterConfirm).toEqual({ ...beforeConfirm, events: beforeConfirm.events + 1 });
          const confirmationReplay = await requestHttp(`${api}/runs/${accepted.runId}/confirm`, {
            method: 'POST',
            headers: ownHeaders,
            body: confirmation,
          });
          expect(confirmationReplay.status).toBe(200);
          expect(await counts()).toEqual(afterConfirm);
          expect((await create(cookie)).status).toBe(429);
        },
        () => executionDb.close(),
      );
      const cancelled = await requestHttp(`${api}/runs/${accepted.runId}/cancel`, {
        method: 'POST',
        headers: ownHeaders,
        body: { reason: 'visitor_cancelled' },
      });
      expect(cancelled.status).toBe(200);
      expect(parseAskLiveRun(await cancelled.json()).state).toBe('cancelled');
      expect((await create(cookie)).status).toBe(429);
      const afterCancel = await counts();
      const malformed = await create('rei_ask_visitor=malformed');
      expect(malformed.status).toBe(202);
      expect(malformed.headers.get('set-cookie')?.split(';')[0]).not.toBe(cookie);
      const tampered = await create(cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a'));
      expect(tampered.status).toBe(202);
      expect(tampered.headers.get('set-cookie')?.split(';')[0]).not.toBe(cookie);
      const expiredSeconds = Math.floor(Date.now() / 1000) - 2592001;
      const expiredPayload = `v1.${cookie.split('.')[1]}.${expiredSeconds}.${expiredSeconds + 2592000}`;
      const signingKey = createHmac('sha256', dispatch)
        .update('rei:ask:visitor-cookie:v1')
        .digest();
      const expiredCookie = `rei_ask_visitor=${expiredPayload}.${createHmac('sha256', signingKey).update(expiredPayload).digest('base64url')}`;
      const expiredResponse = await create(expiredCookie);
      expect(expiredResponse.status).toBe(202);
      expect(expiredResponse.headers.get('set-cookie')?.split(';')[0]).not.toBe(cookie);
      const visitorDigest = (
        await db.query<{ visitor_digest: string }>(
          'SELECT visitor_digest FROM ask.run WHERE id=$1',
          [accepted.runId],
        )
      )[0]!.visitor_digest;
      const publicEvidence = JSON.stringify([
        await first.json(),
        await refusal.json(),
        await cancelled.json(),
      ]);
      for (const privateValue of [cookie, cookie.split('.')[1]!, visitorDigest, dispatch])
        expect(publicEvidence).not.toContain(privateValue);
      // Historical NULL-identity admission counts globally, leaving only two slots at 98.
      while ((await counts()).runs < 98) expect((await create()).status).toBe(202);
      const raced = await Promise.all(Array.from({ length: 6 }, () => create()));
      expect(raced.filter((response) => response.status === 202)).toHaveLength(2);
      for (const response of raced.filter((response) => response.status !== 202)) {
        expect(response.status).toBe(429);
        expect(parseAskQuotaRejection(await response.json())).toEqual({
          code: 'quota_exceeded',
          scope: 'global',
          reopensAt: '2026-10-27T03:00:00.000Z',
        });
      }
      const full = await counts();
      expect(full).toEqual({ runs: 100, events: 104, requested: 99, all_outbox: 100 });
      expect(afterCancel.runs).toBe(21);
      expect((await create(cookie, 'routed-text-v1', firstKey)).status).toBe(202);
      expect((await create('rei_ask_visitor=malformed')).status).toBe(429);
      expect(await counts()).toEqual(full);
      // Observe a real lock wait at midnight: day/reopening must be read after the wait.
      const barrier = await db.leaseClient();
      await preserveCleanup(
        async () => {
          await barrier.query('BEGIN');
          await barrier.query(
            "SELECT pg_advisory_xact_lock(hashtextextended('ask:demo-quota:global',0))",
          );
          const waiting = create(cookie);
          // Starting the promise actually sends the HTTP request; probe native PG lock state.
          await vi.waitFor(
            async () =>
              expect(
                (
                  await db.query<{ count: number }>(
                    "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%'",
                  )
                )[0]!.count,
              ).toBe(1),
            { timeout: 5000, interval: 20 },
          );
          await db.query("UPDATE quota_fixture.clock SET at='2026-10-27T03:00:00Z'");
          await barrier.query('COMMIT');
          expect((await waiting).status).toBe(202);
        },
        async () => {
          await barrier.query('ROLLBACK');
          barrier.release();
        },
      );
      await vi.waitFor(
        async () =>
          expect(
            (
              await db.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM ask.run WHERE state='queued' AND admitted_at < '2026-10-27T03:00:00Z'",
              )
            )[0]!.count,
          ).toBe(0),
        { timeout: 5000, interval: 20 },
      );
      // Inject the real outbox write failure; no run, event, or quota charge survives rollback.
      await db.query(
        `CREATE FUNCTION quota_fixture.fail_outbox() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''controlled fixture fault''; END'; CREATE TRIGGER quota_fault BEFORE INSERT ON platform.outbox FOR EACH ROW EXECUTE FUNCTION quota_fixture.fail_outbox()`,
      );
      const beforeFailure = await counts(),
        failureKey = secret();
      expect((await create(cookie, 'structured-price-v1', failureKey)).status).toBe(503);
      expect(await counts()).toEqual(beforeFailure);
      await db.query('DROP TRIGGER quota_fault ON platform.outbox');
      expect((await create(cookie, 'structured-price-v1', failureKey)).status).toBe(202);
      // 20 slots reopened for the same identity; only two have been charged today.
      for (let index = 2; index < 20; index++) expect((await create(cookie)).status).toBe(202);
      const nextRefusal = await create(cookie);
      expect(nextRefusal.status).toBe(429);
      expect(parseAskQuotaRejection(await nextRefusal.json()).reopensAt).toBe(
        '2026-10-28T03:00:00.000Z',
      );
      // Named calendar handling also covers the historical DST transition (23-hour local day).
      await db.query("UPDATE quota_fixture.clock SET at='2018-11-04T03:00:00Z'");
      for (let index = 0; index < 20; index++) expect((await create(cookie)).status).toBe(202);
      const dstRefusal = await create(cookie);
      expect(dstRefusal.status).toBe(429);
      expect(parseAskQuotaRejection(await dstRefusal.json()).reopensAt).toBe(
        '2018-11-05T02:00:00.000Z',
      );
      expect(await historicalBytes()).toEqual(before);
      // The API's safe logs never contain identity material or the reused protected secret.
      const logs = await fixture.execute('docker', ['logs', `${fixture.project}-api-1`]);
      for (const value of [cookie, visitorDigest, dispatch])
        expect(logs.stdout + (logs.stderr ?? '')).not.toContain(value);
    },
    () =>
      cleanupAll(
        async () => database?.close(),
        () => fixture.down(),
        async () => {
          expect(await inventory()).toEqual(foreign);
          expect(await metadata()).toEqual(foreignMetadata);
        },
      ),
  );
});
