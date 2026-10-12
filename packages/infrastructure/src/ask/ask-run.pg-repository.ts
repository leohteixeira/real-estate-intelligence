import { randomBytes } from 'node:crypto';
import {
  AskLiveError,
  askAdmissionPolicy,
  type AskRunRepository,
  type OutboxAppendPort,
  type Transaction,
  type TransactionRunner,
} from '@rei/application';
import {
  AskRunRequested,
  askDeliveryPolicy,
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
} from '@rei/domain';
import {
  parseAskCompletion,
  parseAskLiveEvent,
  parseAskLiveRun,
  parseAskRequestedIdentity,
  parsePriceToolReceipt,
  parsePriceToolRequest,
  parseStructuredAskCreate,
  parseTextAskCreate,
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
  'ask.run.completed' | 'ask.run.failed' | 'ask.run.expired',
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
  private expiryFrontier = '0';
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly transactions: TransactionRunner,
    private readonly outbox: OutboxAppendPort,
  ) {
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
      if (signal?.aborted || error instanceof AskLiveError) throw error;
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
    signal?: AbortSignal,
  ): Promise<AskLiveRun> {
    const request: ValidatedAskCreate = structuredClone(
      untrusted.mode === 'text-price-v1'
        ? {
            ...parseTextAskCreate({
              mode: untrusted.mode,
              threadId: untrusted.threadId,
              placeId: untrusted.placeId,
              query: untrusted.query,
              locale: untrusted.locale,
            }),
            inputs: parseStructuredAskCreate({ ...untrusted, mode: 'structured-price-v1' }).inputs,
          }
        : parseStructuredAskCreate(untrusted),
    );
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(capability) || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new AskLiveError('invalid');
    const creationKey = askDigest(key);
    const fingerprint = askDigest(
      JSON.stringify([
        request.mode,
        request.threadId,
        request.placeId,
        request.query,
        request.locale,
        request.inputs.priceMinorUnits,
        request.inputs.currency,
        request.inputs.areaSquareMeters,
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
        "SELECT count(*)::integer AS count FROM ask.run WHERE thread_id=$1 AND state IN ('queued','running')",
        [threadId],
      );
      if (pending[0]!.count >= askDeliveryPolicy.pendingLimit) throw new AskLiveError('capacity');
      const id = await this.uuid(client);
      const eventId = await this.uuid(client);
      const clock = await client.query<{ at: Date; deadline: Date }>(
        "WITH observed AS MATERIALIZED (SELECT clock_timestamp() AS at) SELECT at, at + interval '120 seconds' AS deadline FROM observed",
      );
      const at = clock[0]!.at.toISOString();
      const run: AskLiveRun = {
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
      };
      await client.query(
        `INSERT INTO ask.run (id,thread_id,creation_key,request_fingerprint,requested_event_id,state,price_minor_units,area_square_meters,document,admitted_at,queue_expires_at) VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9,$10)`,
        [
          id,
          threadId,
          creationKey,
          fingerprint,
          eventId,
          request.inputs.priceMinorUnits,
          request.inputs.areaSquareMeters,
          run,
          clock[0]!.at,
          clock[0]!.deadline,
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
      const head = await client.query<{ id: string }>(
        "SELECT id::text FROM ask.run WHERE thread_id=$1 AND state IN ('queued','running') ORDER BY admission_sequence LIMIT 1",
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
      if (run.state === 'queued')
        run = {
          ...run,
          state: 'running',
          updatedAt: at,
          decision: {
            source: run.basis === 'text-price-v1' ? 'validated-text-v1' : 'fixed-structured-v1',
            intent: 'price_per_square_meter',
            decidedAt: at,
          },
          steps: [{ sequence: 1, phase: 'calculating', at }],
        };
      const claims = await client.query<{ expires_at: Date }>(
        `UPDATE ask.run SET state='running',execution_id=$2,claim_expires_at=clock_timestamp()+interval '30 seconds',grant_digest=$3,document=$4,checkpoint_grant_digest=$5 WHERE id=$1 RETURNING claim_expires_at AS expires_at`,
        [run.id, executionId, askDigest(grant), run, askDigest(checkpointGrant)],
      );
      if (row.execution_id === null) await this.append(client, run);
      return {
        disposition: 'claimed',
        identity,
        expiresAt: claims[0]!.expires_at.toISOString(),
        input: {
          ...identity,
          step: run.basis,
          query: run.question,
          locale: run.locale,
          executionId,
          toolGrant: grant,
          checkpointGrant,
          inputs: run.originalInputs,
        },
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
    if (previous.state !== 'queued') return null;
    const eligible = await client.query<{ at: Date }>(
      "SELECT clock_timestamp() AS at FROM ask.run WHERE id=$1 AND state='queued' AND queue_expires_at<=clock_timestamp()",
      [identity.runId],
    );
    if (!eligible[0]) return null;
    const at = eligible[0].at.toISOString();
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
        "SELECT id::text FROM ask.run WHERE thread_id=$1 AND state='queued' AND queue_expires_at<=clock_timestamp() ORDER BY admission_sequence LIMIT 100",
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
          "SELECT id::text,thread_id::text,admission_sequence::text FROM ask.run WHERE state='queued' AND queue_expires_at<=clock_timestamp() ORDER BY CASE WHEN ask.run.admission_sequence>$1::bigint THEN 0 ELSE 1 END, ask.run.admission_sequence LIMIT $2",
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
      if (
        !row.grant_digest ||
        !equalAskDigest(row.grant_digest, askDigest(grant)) ||
        !sameAskInputs(run.originalInputs, request.inputs)
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
      if (
        row.execution_id !== request.executionId ||
        (previous.terminal && previous.state !== (request.evidence ? 'completed' : 'failed'))
      )
        throw new AskLiveError('forbidden');
      if (!previous.terminal) await authorizeAskExecution(client, request);
      let result: PriceResult | null = null;
      if (request.evidence) {
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
      }
      if (previous.terminal) {
        await this.inbox.record(tx, ASK_STRUCTURED_CONSUMER, parseUuidV7(request.eventId));
        return structuredClone(previous);
      }
      const at = await this.lifecycleAt(client, result?.computedAt ?? previous.updatedAt);
      const state = result ? 'completed' : 'failed';
      const run: AskLiveRun = {
        ...previous,
        state,
        updatedAt: at,
        result,
        terminal: { state, reason: result ? null : 'execution_unavailable', at },
        steps: [...previous.steps, { sequence: previous.steps.length + 1, phase: state, at }],
      };
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
}
