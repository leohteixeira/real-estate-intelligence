import { isDeepStrictEqual } from 'node:util';
import {
  parseRoutedAskCreate,
  parseRoutedExplainedAskCreate,
  parseRoutedAskConfirmation,
  parseIntentDecisionRequest,
  parseIntentDecisionReceipt,
  parseIntentDecisionResponse,
} from '@rei/contracts';
import type {
  RoutedAskConfirmation,
  IntentDecisionRequest,
  IntentDecisionResponse,
  RoutedLiveRun,
} from '@rei/domain';
import { randomBytes } from 'node:crypto';
import {
  AskLiveError,
  AskQuotaError,
  validatedAskDemoQuotaPolicy,
  type AskDemoQuotaPolicy,
  type AskVisitorAdmission,
  askAdmissionPolicy,
  type AskRunRepository,
  type OutboxAppendPort,
  type Transaction,
  type TransactionRunner,
} from '@rei/application';
import {
  AskRunRequested,
  askDeliveryPolicy,
  askExecutionBudget,
  ASK_STRUCTURED_CONSUMER,
  DomainEvent,
  parseUuidV7,
  type AskClaim,
  type AskCompletion,
  type AskLiveEvent,
  type AskLiveRun,
  type AskLiveThread,
  type AskRequestedIdentity,
  type PriceResult,
  type PriceToolReceipt,
  type PriceToolRequest,
  type ValidatedAskCreate,
  validModelExplanation,
  sameModelExplanation,
} from '@rei/domain';
import {
  parseAskCompletion,
  parseRunExecutionRequest,
  parseAskLiveEvent,
  parseAskLiveRun,
  parseAskRequestedIdentity,
  parsePriceToolReceipt,
  parsePriceToolRequest,
  parseStructuredAskCreate,
  parseTextAskCreate,
  parseExplainedAskCreate,
  parseModelExplanation,
  sameAskIdentity,
  sameAskInputs,
} from '@rei/contracts';
import type {
  DatabaseClient,
  DatabaseConnection,
} from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { PostgresInbox } from '../shared/persistence/postgres-inbox.js';
import { askDigest, equalAskDigest } from './ask-authority.js';
import { authorizeAskExecution, lockAskThread } from './ask-execution.authorization.js';
import {
  activeAmqpTraceHeaders,
  extractAmqpTraceContext,
} from '../shared/telemetry/trace-context.js';

/** Unstarted or paused work past its queue or confirmation deadline ends as `expired`. */
const EXPIRED =
  "((state='queued' AND document->'decision'='null'::jsonb AND queue_expires_at<=clock_timestamp()) OR (state='awaiting_confirmation' AND confirmation_deadline<=clock_timestamp()))";
/**
 * Started or confirmed work gets the same lifetime, from admission or from its confirmation, to
 * reach a terminal state. Past it, and with no live claim, the run ends as `failed`: a dead-lettered
 * or endlessly redelivered request would otherwise stay queued or running forever.
 */
const OVERDUE = `(((state='running' AND claim_expires_at<=clock_timestamp()) OR (state='queued' AND document->'decision'<>'null'::jsonb)) AND GREATEST(queue_expires_at,(document->'confirmation'->>'at')::timestamptz+interval '${askDeliveryPolicy.queueLifetimeMs} milliseconds')<=clock_timestamp())`;
const ENDED = `(${EXPIRED} OR ${OVERDUE})`;
interface StoredRun {
  readonly document: unknown;
  readonly requested_event_id: string;
  readonly creation_key: string;
  readonly request_fingerprint: string;
  readonly authority_digest: string;
  readonly execution_id: string | null;
  readonly claim_expires_at: Date | null;
  readonly grant_digest: string | null;
}
class AskTerminalEvent extends DomainEvent<
  'ask.run.completed' | 'ask.run.failed' | 'ask.run.expired' | 'ask.run.cancelled',
  { readonly runId: string; readonly threadId: string }
> {
  public constructor(eventId: string, run: AskLiveRun) {
    super({
      eventId,
      aggregateId: run.id,
      type:
        run.state === 'completed'
          ? 'ask.run.completed'
          : run.state === 'expired'
            ? 'ask.run.expired'
            : run.state === 'cancelled'
              ? 'ask.run.cancelled'
              : 'ask.run.failed',
      version: 1,
      occurredAt: run.updatedAt,
      traceContext: extractAmqpTraceContext({ ...activeAmqpTraceHeaders() }),
      payload: { runId: run.id, threadId: run.threadId },
    });
  }
}
/** Every lifecycle mutation is a short API-owned transaction; network work holds no SQL scope. */
export class PostgresAskRunRepository implements AskRunRepository {
  private readonly inbox: PostgresInbox;
  private readonly quotas: AskDemoQuotaPolicy;
  private expiryFrontier = '0';
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly transactions: TransactionRunner,
    private readonly outbox: OutboxAppendPort,
    quotas: AskDemoQuotaPolicy = { visitorDailyLimit: 20, globalDailyLimit: 100 },
  ) {
    this.quotas = validatedAskDemoQuotaPolicy(quotas);
    this.inbox = new PostgresInbox(connection);
  }
  private async transaction<T>(
    work: (tx: Transaction, client: DatabaseClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      return await this.transactions.runInTransaction(
        (tx) => work(tx, postgresClientFor(tx, this.connection)),
        signal,
      );
    } catch (error) {
      if (signal?.aborted || error instanceof AskLiveError || error instanceof AskQuotaError)
        throw error;
      throw new AskLiveError('unavailable');
    }
  }
  private async stored(client: DatabaseClient, id: string): Promise<StoredRun | null> {
    const rows = await client.query<StoredRun>(
      `SELECT r.document, r.requested_event_id::text, r.creation_key, r.request_fingerprint, t.authority_digest, r.execution_id::text, r.claim_expires_at, r.grant_digest FROM ask.run r JOIN ask.thread t ON t.id=r.thread_id WHERE r.id=$1`,
      [id],
    );
    return rows[0] ?? null;
  }
  private authorize(row: { authority_digest: string }, capability: string): void {
    if (!equalAskDigest(row.authority_digest, askDigest(capability)))
      throw new AskLiveError('forbidden');
  }
  private identity(row: StoredRun, requested: AskRequestedIdentity): AskLiveRun {
    const run = parseAskLiveRun(row.document);
    if (
      row.requested_event_id !== requested.eventId ||
      run.id !== requested.runId ||
      run.threadId !== requested.threadId
    )
      throw new AskLiveError('forbidden');
    return run;
  }
  private async append(client: DatabaseClient, run: AskLiveRun): Promise<void> {
    parseAskLiveRun(run);
    const rows = await client.query<{ sequence: number }>(
      'SELECT COALESCE(max(sequence),0)::integer+1 AS sequence FROM ask.run_event WHERE run_id=$1',
      [run.id],
    );
    const sequence = rows[0]!.sequence;
    const frame: AskLiveEvent = {
      version: 1,
      id: `${run.id}:v1:${sequence}`,
      runId: run.id,
      sequence,
      event: run.terminal
        ? run.state === 'completed'
          ? 'ask.completed'
          : run.state === 'expired'
            ? 'ask.expired'
            : run.state === 'cancelled'
              ? 'ask.cancelled'
              : 'ask.failed'
        : 'ask.progress',
      terminal: run.terminal !== null,
      run,
    };
    await client.query('INSERT INTO ask.run_event (run_id,sequence,document) VALUES ($1,$2,$3)', [
      run.id,
      sequence,
      parseAskLiveEvent(frame),
    ]);
  }
  private async uuid(client: DatabaseClient): Promise<string> {
    const rows = await client.query<{ id: string }>('SELECT uuidv7()::text AS id');
    return rows[0]!.id;
  }
  private async lifecycleAt(client: DatabaseClient, notBefore: string): Promise<string> {
    const rows = await client.query<{ at: Date }>(
      'SELECT GREATEST(clock_timestamp(),$1::timestamptz) AS at',
      [notBefore],
    );
    return rows[0]!.at.toISOString();
  }
  private async lock(client: DatabaseClient, key: string): Promise<void> {
    await lockAskThread(client, key);
  }
  public async create(
    untrusted: ValidatedAskCreate,
    capability: string,
    key: string,
    admission: AskVisitorAdmission,
    signal?: AbortSignal,
  ): Promise<AskLiveRun> {
    const request: ValidatedAskCreate = structuredClone(
      untrusted.mode === 'routed-text-v1' || untrusted.mode === 'routed-text-explanation-v1'
        ? {
            ...(untrusted.mode === 'routed-text-explanation-v1'
              ? parseRoutedExplainedAskCreate
              : parseRoutedAskCreate)({
              mode: untrusted.mode,
              threadId: untrusted.threadId,
              placeId: untrusted.placeId,
              query: untrusted.query,
              locale: untrusted.locale,
            }),
            inputs: untrusted.inputs
              ? parseStructuredAskCreate({ ...untrusted, mode: 'structured-price-v1' }).inputs
              : null,
          }
        : untrusted.mode !== 'structured-price-v1'
          ? {
              ...(untrusted.mode === 'text-price-explanation-v1'
                ? parseExplainedAskCreate
                : parseTextAskCreate)({
                mode: untrusted.mode,
                threadId: untrusted.threadId,
                placeId: untrusted.placeId,
                query: untrusted.query,
                locale: untrusted.locale,
              }),
              inputs: parseStructuredAskCreate({ ...untrusted, mode: 'structured-price-v1' })
                .inputs,
            }
          : parseStructuredAskCreate(untrusted),
    );
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(capability) || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new AskLiveError('invalid');
    if (!admission || !/^[0-9a-f]{64}$/.test(admission.visitorDigest))
      throw new AskLiveError('invalid');
    const visitorDigest = admission.visitorDigest;
    const creationKey = askDigest(key);
    const fingerprint = askDigest(
      JSON.stringify([
        request.mode,
        request.threadId,
        request.placeId,
        request.query,
        request.locale,
        request.inputs?.priceMinorUnits ?? null,
        request.inputs?.currency ?? null,
        request.inputs?.areaSquareMeters ?? null,
      ]),
    );
    let replay = false;
    const threadId = await this.transaction(async (_tx, client) => {
      await this.lock(client, creationKey);
      const previous = await client.query<{ id: string }>(
        'SELECT id::text FROM ask.run WHERE creation_key=$1',
        [creationKey],
      );
      if (previous[0]) {
        const row = (await this.stored(client, previous[0].id))!;
        this.authorize(row, capability);
        if (row.request_fingerprint !== fingerprint) throw new AskLiveError('conflict');
        replay = true;
        return parseAskLiveRun(row.document).threadId;
      }
      if (request.threadId) {
        const rows = await client.query<{ id: string; authority_digest: string }>(
          'SELECT id::text, authority_digest FROM ask.thread WHERE id=$1',
          [request.threadId],
        );
        if (!rows[0]) throw new AskLiveError('forbidden');
        this.authorize(rows[0], capability);
        return rows[0].id;
      }
      const rows = await client.query<{ id: string; authority_digest: string }>(
        'SELECT id::text, authority_digest FROM ask.thread WHERE preparation_key=$1',
        [creationKey],
      );
      if (rows[0]) {
        this.authorize(rows[0], capability);
        return rows[0].id;
      }
      const id = await this.uuid(client);
      await client.query(
        'INSERT INTO ask.thread (id,authority_digest,preparation_key) VALUES ($1,$2,$3)',
        [id, askDigest(capability), creationKey],
      );
      return id;
    }, signal);
    if (!replay) await this.expireThread(threadId, capability, signal);
    return this.transaction(async (tx, client) => {
      await this.lock(client, creationKey);
      const previous = await client.query<{ id: string }>(
        'SELECT id::text FROM ask.run WHERE creation_key=$1',
        [creationKey],
      );
      if (previous[0]) {
        const row = (await this.stored(client, previous[0].id))!;
        this.authorize(row, capability);
        if (row.request_fingerprint !== fingerprint) throw new AskLiveError('conflict');
        return structuredClone(parseAskLiveRun(row.document));
      }
      await this.lock(client, threadId);
      const authority = await client.query<{ authority_digest: string }>(
        'SELECT authority_digest FROM ask.thread WHERE id=$1',
        [threadId],
      );
      if (!authority[0]) throw new AskLiveError('forbidden');
      this.authorize(authority[0], capability);
      const pending = await client.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM ask.run WHERE thread_id=$1 AND state IN ('queued','running','awaiting_confirmation')",
        [threadId],
      );
      if (pending[0]!.count >= askDeliveryPolicy.pendingLimit) throw new AskLiveError('capacity');
      // Serialize all new acceptances; replay and authorization have already returned.
      await this.lock(client, 'demo-quota:global');
      const id = await this.uuid(client);
      const eventId = await this.uuid(client);
      const clock = await client.query<{
        at: Date;
        deadline: Date;
        day_start: Date;
        reopens_at: Date;
      }>(
        `WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS at),
         local_day AS (SELECT at, (at AT TIME ZONE 'America/Sao_Paulo')::date AS day FROM observed)
         SELECT at, at + interval '120 seconds' AS deadline,
           day::timestamp AT TIME ZONE 'America/Sao_Paulo' AS day_start,
           (day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo' AS reopens_at FROM local_day`,
      );
      const usage = await client.query<{ global_count: number; visitor_count: number }>(
        `SELECT count(*)::integer AS global_count,
         count(*) FILTER (WHERE visitor_digest=$3)::integer AS visitor_count
         FROM ask.run WHERE admitted_at >= $1 AND admitted_at < $2`,
        [clock[0]!.day_start, clock[0]!.reopens_at, visitorDigest],
      );
      if (usage[0]!.global_count >= this.quotas.globalDailyLimit)
        throw new AskQuotaError('global', clock[0]!.reopens_at.toISOString());
      if (usage[0]!.visitor_count >= this.quotas.visitorDailyLimit)
        throw new AskQuotaError('visitor', clock[0]!.reopens_at.toISOString());
      const at = clock[0]!.at.toISOString();
      const run = parseAskLiveRun({
        basis: request.mode,
        id,
        threadId,
        principalId: null,
        question: request.query,
        locale: request.locale,
        placeId: request.placeId,
        createdAt: at,
        updatedAt: at,
        state: 'queued',
        originalInputs: request.inputs,
        decision: null,
        result: null,
        terminal: null,
        steps: [],
        ...(request.mode === 'text-price-explanation-v1' ||
        request.mode === 'routed-text-explanation-v1'
          ? { explanation: null }
          : {}),
        ...(request.mode === 'routed-text-v1' || request.mode === 'routed-text-explanation-v1'
          ? { confirmation: null, confirmationDeadline: null }
          : {}),
      });
      await client.query(
        `INSERT INTO ask.run (id,thread_id,creation_key,request_fingerprint,requested_event_id,state,price_minor_units,area_square_meters,document,admitted_at,queue_expires_at,visitor_digest) VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9,$10,$11)`,
        [
          id,
          threadId,
          creationKey,
          fingerprint,
          eventId,
          request.inputs?.priceMinorUnits ?? null,
          request.inputs?.areaSquareMeters ?? null,
          run,
          clock[0]!.at,
          clock[0]!.deadline,
          visitorDigest,
        ],
      );
      await this.append(client, run);
      await client.query(
        `INSERT INTO platform.idempotency_key(scope,idempotency_key,request_fingerprint,result_reference,expires_at) VALUES ('ask.structured-create',$1,$2,$3,clock_timestamp()+interval '24 hours') ON CONFLICT DO NOTHING`,
        [creationKey, fingerprint, id],
      );
      await this.outbox.append(tx, [
        new AskRunRequested(
          { version: 1, eventId, runId: id, threadId },
          at,
          extractAmqpTraceContext({ ...activeAmqpTraceHeaders() }),
        ),
      ]);
      return structuredClone(run);
    }, signal);
  }
  public async run(
    id: string,
    capability: string,
    signal?: AbortSignal,
  ): Promise<AskLiveRun | null> {
    parseUuidV7(id);
    return this.transaction(async (_tx, client) => {
      const row = await this.stored(client, id);
      if (!row) return null;
      this.authorize(row, capability);
      return structuredClone(parseAskLiveRun(row.document));
    }, signal);
  }
  public async thread(
    id: string,
    capability: string,
    signal?: AbortSignal,
  ): Promise<AskLiveThread | null> {
    parseUuidV7(id);
    return this.transaction(async (_tx, client) => {
      const rows = await client.query<{ authority_digest: string }>(
        'SELECT authority_digest FROM ask.thread WHERE id=$1',
        [id],
      );
      if (!rows[0]) return null;
      this.authorize(rows[0], capability);
      const runs = await client.query<{ document: unknown }>(
        'SELECT document FROM ask.run WHERE thread_id=$1 ORDER BY admission_sequence',
        [id],
      );
      const parsedRuns = runs.map((row) => structuredClone(parseAskLiveRun(row.document)));
      return {
        basis:
          new Set(parsedRuns.map((run) => run.basis)).size > 1
            ? 'mixed-price-v1'
            : (parsedRuns[0]?.basis ?? 'structured-price-v1'),
        id,
        principalId: null,
        runs: parsedRuns,
      };
    }, signal);
  }
  public async events(
    id: string,
    capability: string,
    after: number,
    signal?: AbortSignal,
  ): Promise<readonly AskLiveEvent[]> {
    parseUuidV7(id);
    return this.transaction(async (_tx, client) => {
      const row = await this.stored(client, id);
      if (!row) throw new AskLiveError('forbidden');
      this.authorize(row, capability);
      const latest = await client.query<{ sequence: number }>(
        'SELECT COALESCE(max(sequence),0)::integer AS sequence FROM ask.run_event WHERE run_id=$1',
        [id],
      );
      if (!Number.isSafeInteger(after) || after < 0 || after > latest[0]!.sequence)
        throw new AskLiveError('invalid');
      const rows = await client.query<{ document: unknown }>(
        'SELECT document FROM ask.run_event WHERE run_id=$1 AND sequence>$2 ORDER BY sequence',
        [id, after],
      );
      return rows.map((row) => structuredClone(parseAskLiveEvent(row.document)));
    }, signal);
  }
  public async claim(untrusted: AskRequestedIdentity, signal?: AbortSignal): Promise<AskClaim> {
    const identity = parseAskRequestedIdentity(untrusted);
    return this.transaction(async (tx, client) => {
      await this.lock(client, identity.threadId);
      const row = await this.stored(client, identity.runId);
      if (!row) throw new AskLiveError('forbidden');
      let run = this.identity(row, identity);
      if (run.terminal) {
        await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(identity.eventId));
        return { disposition: 'terminal', identity, run };
      }
      const expired = await this.expire(tx, client, row, identity);
      if (expired) return { disposition: 'terminal', identity, run: expired };
      if (run.state === 'awaiting_confirmation')
        return {
          disposition: 'busy',
          identity,
          retryAfterMs: askAdmissionPolicy.maximumBusyRetryAfterMs,
        };
      const head = await client.query<{ id: string }>(
        "SELECT id::text FROM ask.run WHERE thread_id=$1 AND state IN ('queued','running','awaiting_confirmation') ORDER BY admission_sequence LIMIT 1",
        [identity.threadId],
      );
      if (!head[0]) throw new AskLiveError('unavailable');
      if (head[0].id !== run.id)
        return {
          disposition: 'busy',
          identity,
          retryAfterMs: askAdmissionPolicy.maximumBusyRetryAfterMs,
        };
      const busy = await client.query<{ delay: number }>(
        `SELECT LEAST(30000,GREATEST(1,ceil(EXTRACT(epoch FROM (claim_expires_at-clock_timestamp()))*1000)))::integer AS delay FROM ask.run WHERE thread_id=$1 AND state='running' AND claim_expires_at>clock_timestamp() LIMIT 1`,
        [identity.threadId],
      );
      // A sibling can finish long before its lease expires. Recheck promptly without
      // replacing that active claim or consuming the caller's entire admission budget.
      if (busy[0])
        return {
          disposition: 'busy',
          identity,
          retryAfterMs: Math.min(askAdmissionPolicy.maximumBusyRetryAfterMs, busy[0].delay),
        };
      const executionId = await this.uuid(client);
      const grant = randomBytes(32).toString('base64url');
      const checkpointGrant = randomBytes(32).toString('base64url');
      const at = await this.lifecycleAt(client, run.updatedAt);
      const queueDurationMs =
        run.state === 'queued'
          ? Math.min(
              Number.MAX_SAFE_INTEGER,
              Math.max(0, Date.parse(at) - Date.parse(run.updatedAt)),
            )
          : 0;
      if (run.state === 'queued')
        run = parseAskLiveRun({
          ...run,
          state: 'running',
          updatedAt: at,
          ...(run.basis === 'routed-text-v1' || run.basis === 'routed-text-explanation-v1'
            ? {
                decision: run.decision,
                steps: run.steps.length
                  ? run.steps
                  : [{ sequence: 1, phase: 'routing' as const, at }],
              }
            : {
                decision: {
                  source:
                    run.basis !== 'structured-price-v1'
                      ? ('validated-text-v1' as const)
                      : ('fixed-structured-v1' as const),
                  intent: 'price_per_square_meter' as const,
                  decidedAt: at,
                },
                steps: [{ sequence: 1, phase: 'calculating' as const, at }],
              }),
        });
      const claims = await client.query<{ expires_at: Date }>(
        `UPDATE ask.run SET state='running',execution_id=$2,claim_expires_at=clock_timestamp()+interval '${askExecutionBudget.claimLeaseMs} milliseconds',grant_digest=$3,document=$4,checkpoint_grant_digest=$5 WHERE id=$1 RETURNING claim_expires_at AS expires_at`,
        [run.id, executionId, askDigest(grant), run, askDigest(checkpointGrant)],
      );
      if (row.execution_id === null) await this.append(client, run);
      const input = parseRunExecutionRequest({
        ...identity,
        step: run.basis,
        ...(run.basis === 'routed-text-explanation-v1'
          ? { admittedAt: run.createdAt, queueDurationMs }
          : {}),
        query: run.question,
        locale: run.locale,
        executionId,
        toolGrant: grant,
        checkpointGrant,
        inputs: run.originalInputs,
      });
      if (input.step === 'foundation') throw new AskLiveError('invalid');
      return {
        disposition: 'claimed',
        identity,
        expiresAt: claims[0]!.expires_at.toISOString(),
        input,
      };
    }, signal);
  }
  /** The caller has already fenced and authenticated this single run. */
  private async expire(
    tx: Transaction,
    client: DatabaseClient,
    row: StoredRun,
    identity: AskRequestedIdentity,
  ): Promise<AskLiveRun | null> {
    const previous = this.identity(row, identity);
    if (previous.basis === 'routed-text-v1' || previous.basis === 'routed-text-explanation-v1')
      return this.expireRouted(tx, client, previous, identity);
    if (previous.terminal) return null;
    const eligible = await client.query<{ at: Date }>(
      `SELECT clock_timestamp() AS at FROM ask.run WHERE id=$1 AND ${ENDED}`,
      [identity.runId],
    );
    if (!eligible[0]) return null;
    const at = eligible[0].at.toISOString();
    if (previous.state === 'running') return this.failOverdue(tx, client, previous, identity, at);
    const run: AskLiveRun = {
      ...previous,
      state: 'expired',
      updatedAt: at,
      decision: null,
      result: null,
      terminal: { state: 'expired', reason: 'queue_expired', at },
      steps: [{ sequence: 1, phase: 'expired', at }],
    };
    await client.query("UPDATE ask.run SET state='expired',document=$2 WHERE id=$1", [
      run.id,
      parseAskLiveRun(run),
    ]);
    await this.append(client, run);
    await this.outbox.append(tx, [new AskTerminalEvent(await this.uuid(client), run)]);
    await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(identity.eventId));
    return structuredClone(run);
  }
  /** One fenced terminal transition; the admission keeps counting towards the daily quotas. */
  private async failOverdue(
    tx: Transaction,
    client: DatabaseClient,
    previous: AskLiveRun,
    identity: AskRequestedIdentity,
    at: string,
  ): Promise<AskLiveRun> {
    const run = parseAskLiveRun({
      ...previous,
      state: 'failed',
      updatedAt: at,
      result: null,
      terminal: { state: 'failed', reason: 'execution_unavailable', at },
      steps: [...previous.steps, { sequence: previous.steps.length + 1, phase: 'failed', at }],
    });
    await client.query("UPDATE ask.run SET state='failed',document=$2 WHERE id=$1", [run.id, run]);
    await this.append(client, run);
    await this.outbox.append(tx, [new AskTerminalEvent(await this.uuid(client), run)]);
    await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(identity.eventId));
    return structuredClone(run);
  }
  private async expireThread(
    threadId: string,
    capability: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const candidates = await this.transaction(async (_tx, client) => {
      const rows = await client.query<{ authority_digest: string }>(
        'SELECT authority_digest FROM ask.thread WHERE id=$1',
        [threadId],
      );
      if (!rows[0]) throw new AskLiveError('forbidden');
      this.authorize(rows[0], capability);
      return client.query<{ id: string }>(
        `SELECT id::text FROM ask.run WHERE thread_id=$1 AND ${ENDED} ORDER BY admission_sequence LIMIT 100`,
        [threadId],
      );
    }, signal);
    for (const candidate of candidates) {
      signal?.throwIfAborted();
      await this.transaction(async (tx, client) => {
        await this.lock(client, threadId);
        const row = await this.stored(client, candidate.id);
        if (!row) return;
        this.authorize(row, capability);
        await this.expire(tx, client, row, {
          version: 1,
          eventId: row.requested_event_id,
          runId: candidate.id,
          threadId,
        });
      }, signal);
    }
  }
  public async expireQueued(limit: number, signal?: AbortSignal): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AskLiveError('invalid');
    signal?.throwIfAborted();
    const candidates = await this.transaction(
      (_tx, client) =>
        client.query<{ id: string; thread_id: string; admission_sequence: string }>(
          `SELECT id::text,thread_id::text,admission_sequence::text FROM ask.run WHERE ${ENDED} ORDER BY CASE WHEN ask.run.admission_sequence>$1::bigint THEN 0 ELSE 1 END, ask.run.admission_sequence LIMIT $2`,
          [this.expiryFrontier, limit],
        ),
      signal,
    );
    let count = 0;
    for (const candidate of candidates) {
      signal?.throwIfAborted();
      this.expiryFrontier = candidate.admission_sequence;
      count += await this.transaction(async (tx, client) => {
        const locked = await client.query<{ locked: boolean }>(
          'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
          [`ask:${candidate.thread_id}`],
        );
        if (!locked[0]?.locked) return 0;
        const row = await this.stored(client, candidate.id);
        if (!row) return 0;
        return (await this.expire(tx, client, row, {
          version: 1,
          eventId: row.requested_event_id,
          runId: candidate.id,
          threadId: candidate.thread_id,
        }))
          ? 1
          : 0;
      }, signal);
    }
    return count;
  }
  public async tool(
    untrusted: PriceToolRequest,
    grant: string,
    calculate: (at: string) => PriceResult,
    signal?: AbortSignal,
  ): Promise<PriceToolReceipt> {
    const request = parsePriceToolRequest(untrusted);
    return this.transaction(async (_tx, client) => {
      await this.lock(client, request.threadId);
      const row = await this.stored(client, request.runId);
      if (!row) throw new AskLiveError('forbidden');
      const run = this.identity(row, request);
      await authorizeAskExecution(client, request, { scope: 'tool', grant });
      const executableInputs =
        run.basis === 'routed-text-v1' || run.basis === 'routed-text-explanation-v1'
          ? run.confirmation
            ? run.confirmation.inputs
            : run.originalInputs
          : run.originalInputs;
      if (run.basis === 'routed-text-v1' || run.basis === 'routed-text-explanation-v1') {
        const accepted = await client.query<{ document: unknown }>(
          'SELECT document FROM ask.decision_receipt WHERE run_id=$1',
          [run.id],
        );
        if (
          !run.decision ||
          !accepted[0] ||
          !isDeepStrictEqual(parseIntentDecisionReceipt(accepted[0].document), run.decision) ||
          run.decision.intent !== 'price_per_square_meter' ||
          (run.decision.probability < 0.85 && !run.confirmation)
        )
          throw new AskLiveError('forbidden');
      }
      if (
        !executableInputs ||
        !row.grant_digest ||
        !equalAskDigest(row.grant_digest, askDigest(grant)) ||
        !sameAskInputs(executableInputs, request.inputs)
      )
        throw new AskLiveError('forbidden');
      const rows = await client.query<{ document: unknown }>(
        'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
        [run.id],
      );
      if (rows[0]) {
        const previous = parsePriceToolReceipt(rows[0].document);
        if (!sameAskIdentity(previous, request) || !sameAskInputs(previous.inputs, request.inputs))
          throw new AskLiveError('forbidden');
        const receipt = { ...previous, executionId: request.executionId };
        await client.query('UPDATE ask.tool_receipt SET document=$2 WHERE run_id=$1', [
          run.id,
          receipt,
        ]);
        return structuredClone(receipt);
      }
      const receipt: PriceToolReceipt = {
        ...request,
        receiptId: await this.uuid(client),
        provenance: 'market-domain-v1',
        result: calculate(await this.lifecycleAt(client, run.updatedAt)),
      };
      parsePriceToolReceipt(receipt);
      await client.query('INSERT INTO ask.tool_receipt(run_id,id,document) VALUES ($1,$2,$3)', [
        run.id,
        receipt.receiptId,
        receipt,
      ]);
      return structuredClone(receipt);
    }, signal);
  }
  public async complete(untrusted: AskCompletion, signal?: AbortSignal): Promise<AskLiveRun> {
    const request = parseAskCompletion(untrusted);
    return this.transaction(async (tx, client) => {
      await this.lock(client, request.threadId);
      const row = await this.stored(client, request.runId);
      if (!row) throw new AskLiveError('forbidden');
      const previous = this.identity(row, request);
      if (previous.basis === 'routed-text-v1' || previous.basis === 'routed-text-explanation-v1')
        return this.completeRouted(tx, client, row, previous, request);
      if (
        row.execution_id !== request.executionId ||
        (previous.terminal && previous.state !== (request.evidence ? 'completed' : 'failed'))
      )
        throw new AskLiveError('forbidden');
      if (!previous.terminal) await authorizeAskExecution(client, request);
      let result: PriceResult | null = null;
      let explanation = null;
      if (request.evidence) {
        if (
          request.evidence.step === 'routed-text-v1' ||
          request.evidence.step === 'routed-text-explanation-v1'
        )
          throw new AskLiveError('forbidden');
        if (request.evidence.step !== previous.basis) throw new AskLiveError('forbidden');
        const rows = await client.query<{ document: unknown }>(
          'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
          [request.runId],
        );
        if (!rows[0]) throw new AskLiveError('forbidden');
        const receipt = parsePriceToolReceipt(rows[0].document);
        const supplied = request.evidence.receipt;
        if (
          !sameAskIdentity(receipt, supplied) ||
          receipt.executionId !== supplied.executionId ||
          receipt.receiptId !== supplied.receiptId ||
          receipt.provenance !== supplied.provenance ||
          receipt.operation !== supplied.operation ||
          !sameAskInputs(receipt.inputs, supplied.inputs) ||
          receipt.result.kind !== supplied.result.kind ||
          receipt.result.minorUnits !== supplied.result.minorUnits ||
          receipt.result.currency !== supplied.result.currency ||
          receipt.result.areaUnit !== supplied.result.areaUnit ||
          receipt.result.computedAt !== supplied.result.computedAt ||
          !sameAskInputs(receipt.result.inputs, supplied.result.inputs) ||
          !sameAskInputs(previous.originalInputs, receipt.inputs)
        )
          throw new AskLiveError('forbidden');
        result = receipt.result;
        if (previous.basis === 'text-price-explanation-v1') {
          if (request.evidence.step !== 'text-price-explanation-v1')
            throw new AskLiveError('forbidden');
          const accepted = await client.query<{ document: unknown }>(
            'SELECT document FROM ask.model_explanation WHERE run_id=$1',
            [request.runId],
          );
          if (!accepted[0]) throw new AskLiveError('forbidden');
          explanation = parseModelExplanation(accepted[0].document);
          if (
            !validModelExplanation(explanation, receipt, previous.locale) ||
            !sameModelExplanation(explanation, request.evidence.explanation)
          )
            throw new AskLiveError('forbidden');
        }
      }
      if (previous.terminal) {
        await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(request.eventId));
        return structuredClone(previous);
      }
      const at = await this.lifecycleAt(client, result?.computedAt ?? previous.updatedAt);
      const state = result ? 'completed' : 'failed';
      const run = parseAskLiveRun({
        ...previous,
        state,
        updatedAt: at,
        result,
        terminal: { state, reason: result ? null : 'execution_unavailable', at },
        steps: [...previous.steps, { sequence: previous.steps.length + 1, phase: state, at }],
        ...(previous.basis === 'text-price-explanation-v1' ? { explanation } : {}),
      });
      await client.query('UPDATE ask.run SET state=$2,document=$3 WHERE id=$1', [
        run.id,
        state,
        parseAskLiveRun(run),
      ]);
      await this.append(client, run);
      await this.outbox.append(tx, [new AskTerminalEvent(await this.uuid(client), run)]);
      await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(request.eventId));
      return structuredClone(run);
    }, signal);
  }
  public async executeDecision(
    untrusted: IntentDecisionRequest,
    grant: string,
    signal: AbortSignal,
  ): Promise<IntentDecisionResponse> {
    const request = parseIntentDecisionRequest(untrusted);
    return this.transaction(async (_tx, client) => {
      await this.lock(client, request.threadId);
      const run = await authorizeAskExecution(client, request, { scope: 'checkpoint', grant });
      if (run.basis !== 'routed-text-v1' && run.basis !== 'routed-text-explanation-v1')
        throw new AskLiveError('forbidden');
      const rows = await client.query<{ document: unknown }>(
        'SELECT document FROM ask.decision_receipt WHERE run_id=$1',
        [run.id],
      );
      const previous = rows[0] ? parseIntentDecisionReceipt(rows[0].document) : null;
      if (request.operation === 'get')
        return { operation: 'get', decision: previous, confirmation: run.confirmation };
      if (request.operation === 'reserve') {
        if (previous) throw new AskLiveError('conflict');
        const attempts = await client.query<{ id: string; execution_id: string }>(
          'SELECT id::text,execution_id::text FROM ask.decision_attempt WHERE run_id=$1 AND attempt_key=$2',
          [run.id, request.attemptKey],
        );
        if (attempts[0]) {
          if (attempts[0].execution_id !== request.executionId) throw new AskLiveError('conflict');
          return { operation: 'reserve', reservationId: attempts[0].id };
        }
        const id = await this.uuid(client);
        await client.query(
          'INSERT INTO ask.decision_attempt(run_id,id,attempt_key,execution_id) VALUES($1,$2,$3,$4)',
          [run.id, id, request.attemptKey, request.executionId],
        );
        return { operation: 'reserve', reservationId: id };
      }
      if (previous) {
        const { receiptId, acceptedAt, ...decision } = previous;
        void receiptId;
        void acceptedAt;
        if (!isDeepStrictEqual(decision, request.decision)) throw new AskLiveError('conflict');
        return { operation: 'accept', decision: previous };
      }
      const attempts = await client.query<{ execution_id: string }>(
        'SELECT execution_id::text FROM ask.decision_attempt WHERE run_id=$1 AND id=$2',
        [run.id, request.reservationId],
      );
      if (attempts[0]?.execution_id !== request.executionId) throw new AskLiveError('forbidden');
      const at = await this.lifecycleAt(client, run.updatedAt);
      const decision = parseIntentDecisionReceipt({
        ...request.decision,
        receiptId: await this.uuid(client),
        acceptedAt: at,
      });
      await client.query(
        'INSERT INTO ask.decision_receipt(run_id,id,reservation_id,document) VALUES($1,$2,$3,$4)',
        [run.id, decision.receiptId, request.reservationId, decision],
      );
      const updated = parseAskLiveRun({ ...run, decision, updatedAt: at });
      await client.query('UPDATE ask.run SET document=$2 WHERE id=$1', [run.id, updated]);
      await this.append(client, updated);
      return parseIntentDecisionResponse({ operation: 'accept', decision });
    }, signal);
  }
  private async expireRouted(
    tx: Transaction,
    client: DatabaseClient,
    previous: RoutedLiveRun,
    identity: AskRequestedIdentity,
  ): Promise<AskLiveRun | null> {
    const eligible = await client.query<{ at: Date }>(
      `SELECT clock_timestamp() AS at FROM ask.run WHERE id=$1 AND ${ENDED}`,
      [previous.id],
    );
    if (!eligible[0]) return null;
    const at = eligible[0].at.toISOString();
    if (previous.state === 'running' || (previous.state === 'queued' && previous.decision))
      return this.failOverdue(tx, client, previous, identity, at);
    const run = parseAskLiveRun({
      ...previous,
      state: 'expired',
      updatedAt: at,
      terminal: {
        state: 'expired',
        reason: previous.decision ? 'confirmation_expired' : 'queue_expired',
        at,
      },
      steps: [...previous.steps, { sequence: previous.steps.length + 1, phase: 'expired', at }],
    });
    await client.query("UPDATE ask.run SET state='expired',document=$2 WHERE id=$1", [run.id, run]);
    await this.append(client, run);
    await this.outbox.append(tx, [new AskTerminalEvent(await this.uuid(client), run)]);
    await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(identity.eventId));
    return run;
  }
  public async confirm(
    untrusted: RoutedAskConfirmation,
    capability: string,
    signal?: AbortSignal,
  ): Promise<AskLiveRun> {
    const request = parseRoutedAskConfirmation(untrusted);
    if (request.inputs)
      parseStructuredAskCreate({
        mode: 'structured-price-v1',
        threadId: null,
        placeId: null,
        query: 'Validate confirmation operands',
        locale: 'en',
        inputs: request.inputs,
      });
    return this.resolveConfirmation(
      request.runId,
      request.decisionReceiptId,
      capability,
      request,
      signal,
    );
  }
  public async cancel(id: string, capability: string, signal?: AbortSignal): Promise<AskLiveRun> {
    parseUuidV7(id);
    return this.transaction(async (tx, client) => {
      const initial = await this.stored(client, id);
      if (!initial) throw new AskLiveError('forbidden');
      this.authorize(initial, capability);
      await this.lock(client, parseAskLiveRun(initial.document).threadId);
      const row = await this.stored(client, id);
      if (!row) throw new AskLiveError('forbidden');
      this.authorize(row, capability);
      const previous = parseAskLiveRun(row.document);
      if (previous.basis !== 'routed-text-v1' && previous.basis !== 'routed-text-explanation-v1')
        throw new AskLiveError('conflict');
      if (previous.terminal) return previous;
      const identity = {
        version: 1 as const,
        eventId: row.requested_event_id,
        runId: id,
        threadId: previous.threadId,
      };
      const expired = await this.expireRouted(tx, client, previous, identity);
      if (expired) return expired;
      const at = await this.lifecycleAt(client, previous.updatedAt);
      // Check the SQL clock again at the transition, including queued work whose
      // deadline lives in SQL rather than the public document.
      const expiredAtTransition = await this.expireRouted(tx, client, previous, identity);
      if (expiredAtTransition) return expiredAtTransition;
      const run = parseAskLiveRun({
        ...previous,
        state: 'cancelled',
        updatedAt: at,
        terminal: { state: 'cancelled', reason: 'visitor_cancelled', at },
        steps: [...previous.steps, { sequence: previous.steps.length + 1, phase: 'cancelled', at }],
      });
      await client.query("UPDATE ask.run SET state='cancelled',document=$2 WHERE id=$1", [id, run]);
      await this.append(client, run);
      await this.outbox.append(tx, [new AskTerminalEvent(await this.uuid(client), run)]);
      await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(identity.eventId));
      return run;
    }, signal);
  }
  public async refuse(
    runId: string,
    decisionReceiptId: string,
    capability: string,
    signal?: AbortSignal,
  ): Promise<AskLiveRun> {
    parseUuidV7(runId);
    parseUuidV7(decisionReceiptId);
    return this.resolveConfirmation(runId, decisionReceiptId, capability, null, signal);
  }
  private async resolveConfirmation(
    id: string,
    decisionReceiptId: string,
    capability: string,
    confirmation: RoutedAskConfirmation | null,
    signal?: AbortSignal,
  ): Promise<AskLiveRun> {
    return this.transaction(async (tx, client) => {
      const initial = await this.stored(client, id);
      if (!initial) throw new AskLiveError('forbidden');
      this.authorize(initial, capability);
      await this.lock(client, parseAskLiveRun(initial.document).threadId);
      const row = (await this.stored(client, id))!;
      this.authorize(row, capability);
      const previous = parseAskLiveRun(row.document);
      if (
        (previous.basis !== 'routed-text-v1' && previous.basis !== 'routed-text-explanation-v1') ||
        previous.decision?.receiptId !== decisionReceiptId
      )
        throw new AskLiveError('conflict');
      if (confirmation && previous.confirmation) {
        if (
          !previous.confirmation.inputs !== !confirmation.inputs ||
          (confirmation.inputs &&
            previous.confirmation.inputs &&
            !sameAskInputs(previous.confirmation.inputs, confirmation.inputs))
        )
          throw new AskLiveError('conflict');
        return previous;
      }
      if (previous.terminal) {
        if (!confirmation && previous.state === 'cancelled') return previous;
        if (previous.state === 'expired') return previous;
        throw new AskLiveError('conflict');
      }
      const identity = {
        version: 1 as const,
        eventId: row.requested_event_id,
        runId: id,
        threadId: previous.threadId,
      };
      const expired = await this.expireRouted(tx, client, previous, identity);
      if (expired) return expired;
      if (previous.state !== 'awaiting_confirmation') throw new AskLiveError('conflict');
      const at = await this.lifecycleAt(client, previous.updatedAt);
      // The deadline can pass between the eligibility query and this transition's
      // timestamp. Fence the actual retained confirmation instant as well.
      if (
        previous.confirmationDeadline &&
        Date.parse(at) >= Date.parse(previous.confirmationDeadline)
      ) {
        const expiredAtTransition = await this.expireRouted(tx, client, previous, identity);
        if (expiredAtTransition) return expiredAtTransition;
        throw new AskLiveError('unavailable');
      }
      const state = confirmation ? 'queued' : 'cancelled';
      const run = parseAskLiveRun({
        ...previous,
        state,
        updatedAt: at,
        confirmation: confirmation ? { decisionReceiptId, inputs: confirmation.inputs, at } : null,
        terminal: confirmation ? null : { state: 'cancelled', reason: 'visitor_cancelled', at },
        steps: [
          ...previous.steps,
          {
            sequence: previous.steps.length + 1,
            phase: confirmation ? 'confirmed' : 'cancelled',
            at,
          },
        ],
      });
      await client.query('UPDATE ask.run SET state=$2,document=$3 WHERE id=$1', [id, state, run]);
      await this.append(client, run);
      if (!confirmation) {
        await this.outbox.append(tx, [new AskTerminalEvent(await this.uuid(client), run)]);
        await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(identity.eventId));
      }
      return run;
    }, signal);
  }
  private async completeRouted(
    tx: Transaction,
    client: DatabaseClient,
    row: StoredRun,
    previous: RoutedLiveRun,
    request: AskCompletion,
  ): Promise<AskLiveRun> {
    if (row.execution_id !== request.executionId) throw new AskLiveError('forbidden');
    const evidence = request.evidence;
    if (evidence && evidence.step !== previous.basis) throw new AskLiveError('forbidden');
    if (evidence && evidence.decisionReceiptId !== previous.decision?.receiptId)
      throw new AskLiveError('forbidden');
    const unavailable =
      evidence?.outcome === 'execution-unavailable' &&
      previous.decision &&
      previous.decision.intent !== 'price_per_square_meter' &&
      (previous.decision.probability >= 0.85 || previous.confirmation);
    if (
      previous.basis === 'routed-text-explanation-v1' &&
      evidence?.outcome === 'price-calculated'
    ) {
      if (evidence.step !== 'routed-text-explanation-v1') throw new AskLiveError('forbidden');
      const retained = await client.query<{ document: unknown }>(
        'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
        [previous.id],
      );
      if (
        !retained[0] ||
        !isDeepStrictEqual(parsePriceToolReceipt(retained[0].document), evidence.receipt)
      )
        throw new AskLiveError('forbidden');
      const accepted = await client.query<{ document: unknown }>(
        'SELECT document FROM ask.model_explanation WHERE run_id=$1',
        [previous.id],
      );
      if (
        !accepted[0] ||
        !validModelExplanation(
          parseModelExplanation(accepted[0].document),
          evidence.receipt,
          previous.locale,
        ) ||
        !sameModelExplanation(parseModelExplanation(accepted[0].document), evidence.explanation)
      )
        throw new AskLiveError('forbidden');
    }
    if (previous.terminal) {
      const completedReplay =
        evidence?.outcome === 'price-calculated'
          ? previous.result?.kind === 'price_per_square_meter' &&
            previous.decision?.intent === 'price_per_square_meter'
          : unavailable &&
            previous.result?.kind === 'unavailable_intent' &&
            previous.result.intent === previous.decision.intent;
      if (
        !(previous.state === 'completed' && completedReplay) &&
        !(previous.state === 'failed' && evidence?.outcome !== 'price-calculated')
      )
        throw new AskLiveError('forbidden');
      return previous;
    }
    if (
      previous.state === 'awaiting_confirmation' &&
      evidence?.outcome === 'awaiting-confirmation' &&
      evidence.decisionReceiptId === previous.decision?.receiptId
    )
      return previous;
    await authorizeAskExecution(client, request);
    const at = await this.lifecycleAt(client, previous.updatedAt);
    if (evidence?.outcome === 'awaiting-confirmation') {
      if (!previous.decision || previous.decision.probability >= 0.85 || previous.confirmation)
        throw new AskLiveError('forbidden');
      const checkpoints = await client.query<{ present: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2) AS present',
        [
          previous.id,
          previous.basis === 'routed-text-explanation-v1'
            ? 'intent-price-explanation-v1'
            : 'intent-routing-v1',
        ],
      );
      if (!checkpoints[0]?.present) throw new AskLiveError('forbidden');
      const deadlines = await client.query<{ deadline: Date }>(
        "SELECT COALESCE(confirmation_deadline,$2::timestamptz+interval '10 minutes') AS deadline FROM ask.run WHERE id=$1",
        [previous.id, at],
      );
      const deadline = deadlines[0]!.deadline.toISOString();
      const run = parseAskLiveRun({
        ...previous,
        state: 'awaiting_confirmation',
        updatedAt: at,
        confirmationDeadline: deadline,
        steps: [
          ...previous.steps,
          { sequence: previous.steps.length + 1, phase: 'awaiting_confirmation', at },
        ],
      });
      await client.query(
        "UPDATE ask.run SET state='awaiting_confirmation',confirmation_deadline=$2,document=$3 WHERE id=$1",
        [run.id, deadline, run],
      );
      await this.append(client, run);
      return run;
    }
    let result: RoutedLiveRun['result'] = null;
    if (evidence?.outcome === 'price-calculated') {
      const accepted = await client.query<{ document: unknown }>(
        'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
        [previous.id],
      );
      if (!accepted[0]) throw new AskLiveError('forbidden');
      const receipt = parsePriceToolReceipt(accepted[0].document);
      if (
        !isDeepStrictEqual(receipt, evidence.receipt) ||
        receipt.executionId !== request.executionId ||
        !previous.decision ||
        previous.decision.intent !== 'price_per_square_meter' ||
        (previous.decision.probability < 0.85 && !previous.confirmation)
      )
        throw new AskLiveError('forbidden');
      result = receipt.result;
    } else if (
      evidence?.outcome === 'execution-unavailable' &&
      previous.decision?.probability !== undefined &&
      previous.decision.probability < 0.85 &&
      !previous.confirmation
    )
      throw new AskLiveError('forbidden');
    if (unavailable)
      result = {
        kind: 'unavailable_intent',
        intent: previous.decision.intent,
        reason: 'not_available',
      };
    const state = result ? 'completed' : 'failed';
    const finalAt = await this.lifecycleAt(
      client,
      result?.kind === 'price_per_square_meter' ? result.computedAt : at,
    );
    const run = parseAskLiveRun({
      ...previous,
      state,
      updatedAt: finalAt,
      result,
      ...(previous.basis === 'routed-text-explanation-v1'
        ? {
            explanation:
              evidence?.step === 'routed-text-explanation-v1' &&
              evidence.outcome === 'price-calculated'
                ? evidence.explanation
                : null,
          }
        : {}),
      terminal: { state, reason: result ? null : 'execution_unavailable', at: finalAt },
      steps: [
        ...previous.steps,
        { sequence: previous.steps.length + 1, phase: state, at: finalAt },
      ],
    });
    await client.query('UPDATE ask.run SET state=$2,document=$3 WHERE id=$1', [run.id, state, run]);
    await this.append(client, run);
    await this.outbox.append(tx, [new AskTerminalEvent(await this.uuid(client), run)]);
    await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(request.eventId));
    return run;
  }
}
