import { describe, expect, it, vi } from 'vitest';
import { parseAskLiveRun, parseStructuredAskCreate } from '@rei/contracts';
import {
  DatabaseConnection,
  type DatabaseClient,
} from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { askDigest } from './ask-authority.js';
import { PostgresAskRunRepository } from './ask-run.pg-repository.js';

const owner = 'c'.repeat(43),
  key = 'k'.repeat(43);
const original = parseStructuredAskCreate({
  mode: 'structured-price-v1',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  placeId: null,
  query: 'Calculate.',
  locale: 'en',
  inputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
});

describe('ordered admission and atomic queued expiry', () => {
  const identity = {
    version: 1 as const,
    eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
    runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
    threadId: original.threadId!,
  };
  async function fixture<T>(
    rows: readonly (readonly object[])[],
    work: (
      repository: PostgresAskRunRepository,
      query: ReturnType<typeof vi.fn<DatabaseClient['query']>>,
      outbox: { append: ReturnType<typeof vi.fn> },
      release: ReturnType<typeof vi.fn>,
    ) => Promise<T>,
  ): Promise<T> {
    const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
    const query = vi.fn<DatabaseClient['query']>();
    for (const result of rows) query.mockResolvedValueOnce(result);
    const release = vi.fn(),
      outbox = { append: vi.fn().mockResolvedValue(undefined) };
    vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release });
    try {
      return await work(
        new PostgresAskRunRepository(connection, new PostgresTransactionRunner(connection), outbox),
        query,
        outbox,
        release,
      );
    } finally {
      await connection.close();
    }
  }
  it('defers a younger queued request before looking at leases or generating authority', async () => {
    await fixture(
      [
        [],
        [],
        [{ ...stored, requested_event_id: identity.eventId }],
        [],
        [{ id: identity.eventId }],
        [],
      ],
      async (repository, query, outbox) => {
        await expect(repository.claim(identity)).resolves.toEqual({
          disposition: 'busy',
          identity,
          retryAfterMs: 1000,
        });
        expect(query.mock.calls.map(([sql]) => sql)).toContainEqual(
          expect.stringContaining('ORDER BY admission_sequence LIMIT 1'),
        );
        expect(
          query.mock.calls.some(
            ([sql]) => sql.includes('claim_expires_at>') || /^(INSERT|UPDATE|DELETE)/.test(sql),
          ),
        ).toBe(false);
        expect(outbox.append).not.toHaveBeenCalled();
      },
    );
  });
  it('treats a missing pending head as unavailable instead of falsely reporting contention', async () => {
    await fixture(
      [[], [], [{ ...stored, requested_event_id: identity.eventId }], [], [], []],
      async (repository, query) => {
        await expect(repository.claim(identity)).rejects.toMatchObject({ kind: 'unavailable' });
        expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
      },
    );
  });
  it('claims the old running head again even though a younger command is queued', async () => {
    const at = run.createdAt;
    const running = parseAskLiveRun({
      ...run,
      state: 'running',
      decision: { source: 'fixed-structured-v1', intent: 'price_per_square_meter', decidedAt: at },
      steps: [{ sequence: 1, phase: 'calculating', at }],
    });
    await fixture(
      [
        [],
        [],
        [
          {
            ...stored,
            document: running,
            requested_event_id: identity.eventId,
            execution_id: identity.eventId,
          },
        ],
        [],
        [{ id: run.id }],
        [],
        [{ id: identity.eventId }],
        [{ at: new Date('2026-10-11T00:00:00Z') }],
        [{ expires_at: new Date('2026-10-11T00:01:00Z') }],
        [],
      ],
      async (repository, query) => {
        const claimed = await repository.claim(identity);
        expect(claimed.disposition).toBe('claimed');
        // The run deadline is checked first; inside it an expired lease is simply reclaimed.
        expect(
          query.mock.calls.filter(([sql]) =>
            sql.includes("state='running' AND claim_expires_at<="),
          ),
        ).toHaveLength(1);
        expect(
          query.mock.calls.some(([sql]) => sql.startsWith("UPDATE ask.run SET state='failed'")),
        ).toBe(false);
        expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO ask.run_event'))).toBe(
          false,
        );
      },
    );
  });
  it.each(['queued', 'running'] as const)(
    'measures only this queued interval when claiming a combined %s run',
    async (state) => {
      const queuedAt = '2026-10-11T00:01:00.000Z';
      const claimedAt = new Date('2026-10-11T00:01:00.125Z');
      const combined = parseAskLiveRun({
        ...run,
        basis: 'routed-text-explanation-v1',
        state,
        updatedAt: queuedAt,
        originalInputs: null,
        decision: null,
        confirmation: null,
        confirmationDeadline: null,
        explanation: null,
        steps: state === 'running' ? [{ sequence: 1, phase: 'routing', at: queuedAt }] : [],
      });
      await fixture(
        [
          [],
          [],
          [
            {
              ...stored,
              document: combined,
              requested_event_id: identity.eventId,
              execution_id: identity.eventId,
            },
          ],
          [],
          [{ id: run.id }],
          [],
          [{ id: identity.eventId }],
          [{ at: claimedAt }],
          [{ expires_at: new Date('2026-10-11T00:01:30.125Z') }],
          [],
        ],
        async (repository, query) => {
          const claimed = await repository.claim(identity);
          expect(claimed.disposition).toBe('claimed');
          if (claimed.disposition !== 'claimed') throw new Error('Expected claim.');
          expect(claimed.input).toMatchObject({
            admittedAt: run.createdAt,
            queueDurationMs: state === 'queued' ? 125 : 0,
          });
          const update = query.mock.calls.find(([sql]) =>
            sql.startsWith("UPDATE ask.run SET state='running'"),
          );
          expect(update?.[1]?.[3]).not.toHaveProperty('queueDurationMs');
        },
      );
    },
  );
  it('commits one honest expired aggregate, event, outbox and inbox using SQL time', async () => {
    const at = new Date('2026-10-11T00:02:00.000Z');
    await fixture(
      [
        [],
        [],
        [{ ...stored, requested_event_id: identity.eventId }],
        [{ at }],
        [],
        [{ sequence: 2 }],
        [],
        [{ id: identity.eventId }],
        [],
        [],
      ],
      async (repository, query, outbox, release) => {
        const terminal = await repository.claim(identity);
        expect(terminal.disposition).toBe('terminal');
        if (terminal.disposition !== 'terminal') throw new Error('Expected expired terminal.');
        expect(terminal.run).toMatchObject({
          state: 'expired',
          decision: null,
          result: null,
          terminal: { state: 'expired', reason: 'queue_expired', at: at.toISOString() },
          steps: [{ sequence: 1, phase: 'expired', at: at.toISOString() }],
        });
        expect(
          query.mock.calls.some(([sql]) => sql.includes('queue_expires_at<=clock_timestamp()')),
        ).toBe(true);
        expect(query.mock.calls.filter(([sql]) => sql === 'BEGIN')).toHaveLength(1);
        expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
        expect(outbox.append).toHaveBeenCalledWith(expect.anything(), [
          expect.objectContaining({ type: 'ask.run.expired', aggregateId: run.id }),
        ]);
        expect(release).toHaveBeenCalledOnce();
      },
    );
  });
  it.each(['structured-price-v1', 'routed-text-explanation-v1'] as const)(
    'fails an overdue %s run whose lease expired exactly once, instead of reclaiming it forever',
    async (basis) => {
      const at = new Date('2026-10-11T00:02:31.000Z');
      const started = run.createdAt;
      const running = parseAskLiveRun(
        basis === 'structured-price-v1'
          ? {
              ...run,
              state: 'running',
              decision: {
                source: 'fixed-structured-v1',
                intent: 'price_per_square_meter',
                decidedAt: started,
              },
              steps: [{ sequence: 1, phase: 'calculating', at: started }],
            }
          : {
              ...run,
              basis,
              state: 'running',
              originalInputs: null,
              confirmation: null,
              confirmationDeadline: null,
              explanation: null,
              steps: [{ sequence: 1, phase: 'routing', at: started }],
            },
      );
      const row = {
        ...stored,
        document: running,
        requested_event_id: identity.eventId,
        execution_id: identity.eventId,
      };
      await fixture(
        [[], [], [row], [{ at }], [], [{ sequence: 2 }], [], [{ id: identity.eventId }], [], []],
        async (repository, query, outbox) => {
          const terminal = await repository.claim(identity);
          expect(terminal.disposition).toBe('terminal');
          if (terminal.disposition !== 'terminal') throw new Error('Expected failed terminal.');
          expect(terminal.run).toMatchObject({
            state: 'failed',
            result: null,
            terminal: { state: 'failed', reason: 'execution_unavailable', at: at.toISOString() },
            steps: [{ sequence: 1 }, { sequence: 2, phase: 'failed', at: at.toISOString() }],
          });
          const eligibility = query.mock.calls.find(([sql]) =>
            sql.includes('clock_timestamp() AS at'),
          );
          expect(eligibility?.[0]).toContain(
            "state='running' AND claim_expires_at<=clock_timestamp()",
          );
          expect(eligibility?.[0]).toContain("interval '120000 milliseconds'");
          expect(
            query.mock.calls.some(([sql]) => sql.startsWith("UPDATE ask.run SET state='running'")),
          ).toBe(false);
          expect(outbox.append).toHaveBeenCalledWith(expect.anything(), [
            expect.objectContaining({ type: 'ask.run.failed', aggregateId: run.id }),
          ]);
          expect(
            query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO platform.inbox')),
          ).toHaveLength(1);
          // Redelivery after the commit: the terminal row answers without another transition.
          query.mockReset();
          for (const result of [[], [], [{ ...row, document: terminal.run }], [], []])
            query.mockResolvedValueOnce(result);
          const replay = await repository.claim(identity);
          expect(replay).toMatchObject({ disposition: 'terminal', run: { state: 'failed' } });
          expect(query.mock.calls.some(([sql]) => /^UPDATE|^INSERT INTO ask/.test(sql))).toBe(
            false,
          );
          expect(outbox.append).toHaveBeenCalledOnce();
        },
      );
    },
  );
  it('fails a confirmed run that was never claimed again and keeps a paused one for its own deadline', async () => {
    const at = new Date('2026-10-11T00:05:00.000Z');
    const candidate = { id: run.id, thread_id: run.threadId, admission_sequence: '7' };
    const decision = {
      intent: 'listing_search',
      probability: 0.6,
      probabilities: {
        price_per_square_meter: 0.1,
        listing_search: 0.6,
        property_history: 0.1,
        region_statistics: 0.1,
        comparables: 0.05,
        unsupported: 0.05,
      },
      source: 'heuristic-v1',
      degraded: true,
      taxonomyVersion: 'ask-intents-v1',
      privacyEvidenceId: null,
      receiptId: '0199c8f2-2394-7ba0-8f9e-286378779215',
      acceptedAt: '2026-10-11T00:00:01.000Z',
    };
    const confirmed = parseAskLiveRun({
      ...run,
      basis: 'routed-text-explanation-v1',
      state: 'queued',
      updatedAt: '2026-10-11T00:00:03.000Z',
      originalInputs: null,
      decision,
      confirmation: {
        decisionReceiptId: decision.receiptId,
        inputs: null,
        at: '2026-10-11T00:00:03.000Z',
      },
      confirmationDeadline: '2026-10-11T00:10:02.000Z',
      explanation: null,
      steps: [
        { sequence: 1, phase: 'routing', at: run.createdAt },
        { sequence: 2, phase: 'awaiting_confirmation', at: '2026-10-11T00:00:02.000Z' },
        { sequence: 3, phase: 'confirmed', at: '2026-10-11T00:00:03.000Z' },
      ],
    });
    await fixture(
      [
        [],
        [candidate],
        [],
        [],
        [{ locked: true }],
        [{ ...stored, document: confirmed, requested_event_id: identity.eventId }],
        [{ at }],
        [],
        [{ sequence: 6 }],
        [],
        [{ id: identity.eventId }],
        [],
        [],
      ],
      async (repository, query, outbox) => {
        expect(await repository.expireQueued(1)).toBe(1);
        const scan = query.mock.calls.find(([sql]) => sql.includes('ORDER BY CASE'))![0];
        expect(scan).toContain("state='queued' AND document->'decision'<>'null'::jsonb");
        expect(scan).toContain("(document->'confirmation'->>'at')::timestamptz+interval");
        expect(scan).toContain("state='awaiting_confirmation' AND confirmation_deadline<=");
        const update = query.mock.calls.find(([sql]) =>
          sql.startsWith('UPDATE ask.run SET state='),
        );
        expect(update?.[0]).toBe("UPDATE ask.run SET state='failed',document=$2 WHERE id=$1");
        expect(update?.[1]?.[1]).toMatchObject({
          state: 'failed',
          decision,
          confirmation: { decisionReceiptId: decision.receiptId, inputs: null },
          terminal: { state: 'failed', reason: 'execution_unavailable', at: at.toISOString() },
        });
        expect(outbox.append).toHaveBeenCalledWith(expect.anything(), [
          expect.objectContaining({ type: 'ask.run.failed' }),
        ]);
      },
    );
  });
  it('rolls back expiry when terminal outbox insertion fails before recording inbox', async () => {
    await fixture(
      [
        [],
        [],
        [{ ...stored, requested_event_id: identity.eventId }],
        [{ at: new Date('2026-10-11T00:02:00Z') }],
        [],
        [{ sequence: 2 }],
        [],
        [{ id: identity.eventId }],
        [],
      ],
      async (repository, query, outbox, release) => {
        outbox.append.mockRejectedValueOnce(new Error('Synthetic outbox failure'));
        await expect(repository.claim(identity)).rejects.toMatchObject({ kind: 'unavailable' });
        expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO platform.inbox'))).toBe(
          false,
        );
        expect(release).toHaveBeenCalledOnce();
      },
    );
  });
  it('rotates numeric scan frontier after skipping an occupied thread without waiting', async () => {
    const candidate = { id: run.id, thread_id: run.threadId, admission_sequence: '10' };
    await fixture(
      [[], [candidate], [], [], [{ locked: false }], [], [], [], []],
      async (repository, query) => {
        expect(await repository.expireQueued(1)).toBe(0);
        expect(await repository.expireQueued(1)).toBe(0);
        const scans = query.mock.calls.filter(([sql]) => sql.includes('ORDER BY CASE'));
        expect(scans.map(([, parameters]) => parameters)).toEqual([
          ['0', 1],
          ['10', 1],
        ]);
        expect(scans[0]?.[0]).toContain('ask.run.admission_sequence>$1::bigint');
        expect(scans[0]?.[0]).toContain('END, ask.run.admission_sequence LIMIT');
        expect(query.mock.calls.some(([sql]) => sql.includes('pg_advisory_xact_lock('))).toBe(
          false,
        );
      },
    );
  });
  it.each([0, 101, 1.5, Number.NaN])(
    'rejects an unbounded expiry scan %s before leasing SQL',
    async (limit) => {
      await fixture([], async (repository, query) => {
        await expect(repository.expireQueued(limit)).rejects.toMatchObject({ kind: 'invalid' });
        expect(query).not.toHaveBeenCalled();
      });
    },
  );
  it('propagates already-aborted maintenance without leasing SQL', async () => {
    await fixture([], async (repository, query) => {
      const reason = new Error('Synthetic shutdown');
      await expect(repository.expireQueued(100, AbortSignal.abort(reason))).rejects.toBe(reason);
      expect(query).not.toHaveBeenCalled();
    });
  });
});
const run = parseAskLiveRun({
  basis: 'structured-price-v1',
  id: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: original.threadId,
  principalId: null,
  question: original.query,
  locale: original.locale,
  placeId: null,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  state: 'queued',
  originalInputs: original.inputs,
  decision: null,
  result: null,
  terminal: null,
  steps: [],
});
const stored = {
  document: run,
  authority_digest: askDigest(owner),
  request_fingerprint: askDigest(
    JSON.stringify([
      original.mode,
      original.threadId,
      original.placeId,
      original.query,
      original.locale,
      original.inputs.priceMinorUnits,
      original.inputs.currency,
      original.inputs.areaSquareMeters,
    ]),
  ),
};

describe('retained Ask creation fence before thread preparation', () => {
  it('bounds a busy sibling retry hint without mutating its active lease', async () => {
    const identity = {
      version: 1 as const,
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
      runId: run.id,
      threadId: run.threadId,
    };
    const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
    const query = vi
      .fn<DatabaseClient['query']>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...stored, requested_event_id: identity.eventId }])
      .mockResolvedValueOnce([]) // still before the fixed queue deadline
      .mockResolvedValueOnce([{ id: run.id }]) // numeric unfinished head
      .mockResolvedValueOnce([{ delay: 30000 }])
      .mockResolvedValueOnce([]);
    vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release: vi.fn() });
    const outbox = { append: vi.fn() };
    try {
      const repository = new PostgresAskRunRepository(
        connection,
        new PostgresTransactionRunner(connection),
        outbox,
      );
      await expect(repository.claim(identity)).resolves.toEqual({
        disposition: 'busy',
        identity,
        retryAfterMs: 1000,
      });
      expect(query.mock.calls.some(([sql]) => /^(?:UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
      expect(outbox.append).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });
  it.each([
    ['foreign null-thread replay', { ...original, threadId: null }, 'f'.repeat(43), 'forbidden'],
    ['owner null-thread changed body', { ...original, threadId: null }, owner, 'conflict'],
    ['owner changed query', { ...original, query: 'Changed.' }, owner, 'conflict'],
    ['owner changed text mode', { ...original, mode: 'text-price-v1' }, owner, 'conflict'],
  ] as const)('%s makes no preparation insertion', async (_label, body, capability, kind) => {
    const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
    const query = vi
      .fn<DatabaseClient['query']>()
      .mockResolvedValueOnce([]) // BEGIN
      .mockResolvedValueOnce([]) // creation-key lock
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([]); // ROLLBACK
    vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release: vi.fn() });
    const outbox = { append: vi.fn() };
    try {
      const repository = new PostgresAskRunRepository(
        connection,
        new PostgresTransactionRunner(connection),
        outbox,
      );
      await expect(
        repository.create(body, capability, key, { visitorDigest: 'a'.repeat(64) }),
      ).rejects.toMatchObject({ kind });
      expect(query.mock.calls.map(([sql]) => sql)).toEqual([
        'BEGIN',
        expect.stringContaining('pg_advisory_xact_lock'),
        'SELECT id::text FROM ask.run WHERE creation_key=$1',
        expect.stringContaining('JOIN ask.thread'),
        'ROLLBACK',
      ]);
      expect(outbox.append).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });

  it('rechecks retained ownership and fingerprint under the second transaction fence', async () => {
    const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
    const query = vi
      .fn<DatabaseClient['query']>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([]);
    vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release: vi.fn() });
    const outbox = { append: vi.fn() };
    try {
      const repository = new PostgresAskRunRepository(
        connection,
        new PostgresTransactionRunner(connection),
        outbox,
      );
      await expect(
        repository.create(original, owner, key, { visitorDigest: 'a'.repeat(64) }),
      ).resolves.toEqual(run);
      expect(
        query.mock.calls.filter(([sql]) => sql.includes('pg_advisory_xact_lock')),
      ).toHaveLength(2);
      expect(query.mock.calls.filter(([sql]) => sql.includes('JOIN ask.thread'))).toHaveLength(2);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
      expect(outbox.append).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });
});

describe('atomic daily quota admission', () => {
  const admission = { visitorDigest: 'a'.repeat(64) };
  const clock = {
    at: new Date('2018-11-04T03:00:00Z'),
    deadline: new Date('2018-11-04T03:02:00Z'),
    day_start: new Date('2018-11-04T03:00:00Z'),
    reopens_at: new Date('2018-11-05T02:00:00Z'),
  };
  it.each([
    ['global', 100, 20, 0],
    ['visitor', 20, 20, 0],
    ['capacity', 100, 20, 3],
    ['accepted', 99, 19, 0],
    ['rollback', 99, 19, 0],
  ] as const)(
    'preserves %s precedence and transaction effects',
    async (outcome, globalCount, visitorCount, pending) => {
      const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
      const query = vi.fn<DatabaseClient['query']>();
      const authority = { authority_digest: askDigest(owner) };
      const rows: readonly (readonly object[])[] = [
        [],
        [],
        [],
        [{ id: original.threadId, ...authority }],
        [],
        [],
        [authority],
        [],
        [],
        [],
        [],
        [],
        [],
        [authority],
        [{ count: pending }],
        ...(pending === 3
          ? []
          : [
              [],
              [{ id: run.id }],
              [{ id: run.id }],
              [clock],
              [{ global_count: globalCount, visitor_count: visitorCount }],
            ]),
        ...(outcome === 'accepted' || outcome === 'rollback'
          ? [[], [{ sequence: 1 }], [], []]
          : []),
        [],
      ];
      for (const value of rows) query.mockResolvedValueOnce(value);
      vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release: vi.fn() });
      const outbox = {
        append: vi.fn().mockImplementation(async () => {
          if (outcome === 'rollback') throw new Error('controlled outbox failure');
        }),
      };
      try {
        const repository = new PostgresAskRunRepository(
          connection,
          new PostgresTransactionRunner(connection),
          outbox,
        );
        const work = repository.create(original, owner, key, admission);
        if (outcome === 'accepted') {
          const accepted = await work;
          expect(accepted.createdAt).toBe(clock.at.toISOString());
          expect(JSON.stringify(accepted)).not.toContain(admission.visitorDigest);
          expect(
            query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO ask.run '))?.[1]?.at(-1),
          ).toBe(admission.visitorDigest);
          expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
        } else {
          await expect(work).rejects.toMatchObject(
            outcome === 'visitor' || outcome === 'global'
              ? { scope: outcome, reopensAt: clock.reopens_at.toISOString() }
              : { kind: outcome === 'rollback' ? 'unavailable' : 'capacity' },
          );
          expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        }
        const calls = query.mock.calls;
        if (outcome !== 'capacity') {
          const lock = calls.findIndex(([, values]) => values?.[0] === 'ask:demo-quota:global');
          const observed = calls.findIndex(([sql]) =>
            sql.includes('WITH observed AS MATERIALIZED'),
          );
          expect(observed).toBeGreaterThan(lock);
          expect(calls[observed]?.[0]).toContain("AT TIME ZONE 'America/Sao_Paulo'");
          expect(calls.find(([sql]) => sql.includes('AS global_count'))?.[1]).toEqual([
            clock.day_start,
            clock.reopens_at,
            admission.visitorDigest,
          ]);
        } else expect(calls.some(([sql]) => sql.includes('AS global_count'))).toBe(false);
        expect(outbox.append).toHaveBeenCalledTimes(
          outcome === 'accepted' || outcome === 'rollback' ? 1 : 0,
        );
      } finally {
        await connection.close();
      }
    },
  );
  it('rejects malformed visitor metadata and invalid policy rather than bypassing limits', async () => {
    const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
    try {
      const transactions = new PostgresTransactionRunner(connection),
        outbox = { append: vi.fn() };
      const repository = new PostgresAskRunRepository(connection, transactions, outbox);
      for (const visitorDigest of ['', 'raw cookie', 'a'.repeat(63)])
        await expect(
          repository.create(original, owner, key, { visitorDigest }),
        ).rejects.toMatchObject({ kind: 'invalid' });
      expect(
        () =>
          new PostgresAskRunRepository(connection, transactions, outbox, {
            visitorDailyLimit: 0,
            globalDailyLimit: 100,
          }),
      ).toThrow('quota configuration');
      expect(outbox.append).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });
});
