import { describe, expect, it, vi } from 'vitest';
import {
  askIntents,
  parseAskLiveRun,
  parseIntentDecision,
  parseIntentDecisionReceipt,
} from '@rei/contracts';
import type { AskLiveRun, IntentDecisionReceipt, RoutedAskLiveRun } from '@rei/domain';
import {
  DatabaseConnection,
  type DatabaseClient,
} from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { askDigest } from './ask-authority.js';
import { PostgresAskRunRepository } from './ask-run.pg-repository.js';

const id = '0199c8f2-2394-7ba0-8f9e-286378779210';
const other = '0199c8f2-2394-7ba0-8f9e-286378779211';
const at = '2026-10-26T00:00:00.000Z';
const later = '2026-10-26T00:01:00.000Z';
const deadline = '2026-10-26T00:10:00.000Z';
const owner = 'o'.repeat(43);
const grant = 'g'.repeat(43);
const inputs = { priceMinorUnits: 100, currency: 'BRL' as const, areaSquareMeters: 2 };
const identity = { version: 1 as const, runId: id, threadId: id, eventId: id, executionId: id };
function decision(probability = 0.84) {
  return parseIntentDecision({
    intent: 'price_per_square_meter',
    probability,
    probabilities: {
      price_per_square_meter: probability,
      listing_search: 1 - probability,
      property_history: 0,
      region_statistics: 0,
      comparables: 0,
      unsupported: 0,
    },
    source: 'heuristic-v1',
    degraded: true,
    taxonomyVersion: 'ask-intents-v1',
    privacyEvidenceId: null,
  });
}
function receipt(probability = 0.84): IntentDecisionReceipt {
  return parseIntentDecisionReceipt({ ...decision(probability), receiptId: id, acceptedAt: at });
}
function run(overrides: Partial<RoutedAskLiveRun> = {}): RoutedAskLiveRun {
  const parsed = parseAskLiveRun({
    basis: 'routed-text-v1',
    id,
    threadId: id,
    principalId: null,
    question: 'Calculate.',
    locale: 'en',
    placeId: null,
    createdAt: at,
    updatedAt: at,
    state: 'running',
    originalInputs: inputs,
    decision: receipt(),
    confirmation: null,
    confirmationDeadline: null,
    result: null,
    terminal: null,
    steps: [{ sequence: 1, phase: 'routing', at }],
    ...overrides,
  });
  if (parsed.basis !== 'routed-text-v1') throw new Error('Expected routed fixture.');
  return parsed;
}
function awaiting() {
  return run({
    state: 'awaiting_confirmation',
    confirmationDeadline: deadline,
    steps: [
      { sequence: 1, phase: 'routing', at },
      { sequence: 2, phase: 'awaiting_confirmation', at },
    ],
  });
}
function stored(document: AskLiveRun) {
  return {
    document,
    requested_event_id: id,
    execution_id: id,
    authority_digest: askDigest(owner),
    grant_digest: askDigest(grant),
    checkpoint_grant_digest: askDigest(grant),
    active: true,
  };
}
async function fixture(
  rows: readonly (readonly object[])[],
  work: (
    repository: PostgresAskRunRepository,
    query: ReturnType<typeof vi.fn<DatabaseClient['query']>>,
    outbox: { append: ReturnType<typeof vi.fn> },
  ) => Promise<void>,
) {
  const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
  const query = vi.fn<DatabaseClient['query']>().mockResolvedValue([]);
  for (const row of rows) query.mockResolvedValueOnce(row);
  vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release: vi.fn() });
  const outbox = { append: vi.fn().mockResolvedValue(undefined) };
  try {
    await work(
      new PostgresAskRunRepository(connection, new PostgresTransactionRunner(connection), outbox),
      query,
      outbox,
    );
  } finally {
    await connection.close();
  }
}
function decisionRows(document = run(), accepted: IntentDecisionReceipt | null = null) {
  return [[], [], [stored(document)], accepted ? [{ document: accepted }] : []];
}
function confirmationRows(document = awaiting()) {
  return [[], [stored(document)], [], [stored(document)]];
}
function appended() {
  return [[], [{ sequence: 3 }], []];
}
const confirm = { runId: id, decisionReceiptId: id, inputs };
const pause = {
  ...identity,
  step: 'routed-text-v1' as const,
  decisionReceiptId: id,
  outcome: 'awaiting-confirmation' as const,
};
const completion = { ...identity, evidence: pause, failure: null };

describe('API-owned routed decision receipts', () => {
  it.each([null, receipt()])(
    'reads retained decision without reserving or mutating (%j)',
    async (accepted) => {
      await fixture(decisionRows(run(), accepted), async (repository, query) => {
        expect(
          await repository.executeDecision(
            { ...identity, operation: 'get' },
            grant,
            new AbortController().signal,
          ),
        ).toEqual({ operation: 'get', decision: accepted, confirmation: null });
        expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
      });
    },
  );
  it('reserves once and replays only within the same execution', async () => {
    await fixture([...decisionRows(), [], [{ id }], []], async (repository, query) => {
      expect(
        await repository.executeDecision(
          { ...identity, operation: 'reserve', attemptKey: 'a'.repeat(32) },
          grant,
          new AbortController().signal,
        ),
      ).toEqual({ operation: 'reserve', reservationId: id });
      expect(
        query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO ask.decision_attempt')),
      ).toHaveLength(1);
    });
    await fixture([...decisionRows(), [{ id, execution_id: id }]], async (repository, query) => {
      expect(
        await repository.executeDecision(
          { ...identity, operation: 'reserve', attemptKey: 'a'.repeat(32) },
          grant,
          new AbortController().signal,
        ),
      ).toEqual({ operation: 'reserve', reservationId: id });
      expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    });
    await fixture([...decisionRows(), [{ id, execution_id: other }]], async (repository) => {
      await expect(
        repository.executeDecision(
          { ...identity, operation: 'reserve', attemptKey: 'a'.repeat(32) },
          grant,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: 'conflict' });
    });
  });
  it('rejects reserve after acceptance and substituted accept replay', async () => {
    await fixture(decisionRows(run(), receipt()), async (repository) => {
      await expect(
        repository.executeDecision(
          { ...identity, operation: 'reserve', attemptKey: 'a'.repeat(32) },
          grant,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: 'conflict' });
    });
    await fixture(decisionRows(run(), receipt()), async (repository) => {
      await expect(
        repository.executeDecision(
          { ...identity, operation: 'accept', reservationId: id, decision: decision(0.85) },
          grant,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: 'conflict' });
    });
  });
  it('accepts a reserved decision before appending progress and returns the same receipt on replay', async () => {
    await fixture(
      [
        ...decisionRows(),
        [{ execution_id: id }],
        [{ at: new Date(at) }],
        [{ id }],
        [],
        [],
        [{ sequence: 2 }],
        [],
      ],
      async (repository, query) => {
        expect(
          await repository.executeDecision(
            { ...identity, operation: 'accept', reservationId: id, decision: decision() },
            grant,
            new AbortController().signal,
          ),
        ).toEqual({ operation: 'accept', decision: receipt() });
        const sql = query.mock.calls.map(([value]) => value);
        expect(
          sql.findIndex((value) => value.startsWith('INSERT INTO ask.decision_receipt')),
        ).toBeLessThan(sql.findIndex((value) => value.startsWith('UPDATE ask.run')));
      },
    );
    await fixture(decisionRows(run(), receipt()), async (repository, query) => {
      expect(
        await repository.executeDecision(
          { ...identity, operation: 'accept', reservationId: id, decision: decision() },
          grant,
          new AbortController().signal,
        ),
      ).toEqual({ operation: 'accept', decision: receipt() });
      expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
    });
  });
  it.each([{ attempts: [] }, { attempts: [{ execution_id: other }] }])(
    'rejects missing or foreign execution reservation (%j)',
    async ({ attempts }) => {
      await fixture([...decisionRows(), attempts], async (repository, query) => {
        await expect(
          repository.executeDecision(
            { ...identity, operation: 'accept', reservationId: id, decision: decision() },
            grant,
            new AbortController().signal,
          ),
        ).rejects.toMatchObject({ kind: 'forbidden' });
        expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
      });
    },
  );
  it('rejects checkpoint authority from another mode', async () => {
    const { confirmation, confirmationDeadline, ...common } = run();
    void confirmation;
    void confirmationDeadline;
    const historical = parseAskLiveRun({
      ...common,
      basis: 'structured-price-v1',
      decision: { source: 'fixed-structured-v1', intent: 'price_per_square_meter', decidedAt: at },
      steps: [{ sequence: 1, phase: 'calculating', at }],
    });
    await fixture([[], [], [stored(historical)]], async (repository) => {
      await expect(
        repository.executeDecision(
          { ...identity, operation: 'get' },
          grant,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: 'forbidden' });
    });
  });
});

describe('retained proposal confirmation and refusal', () => {
  it.each([inputs, null])(
    'queues validated edits including explicit missing inputs (%j)',
    async (edited) => {
      await fixture(
        [...confirmationRows(), [], [{ at: new Date(later) }], ...appended()],
        async (repository, query, outbox) => {
          const confirmed = await repository.confirm({ ...confirm, inputs: edited }, owner);
          expect(confirmed).toMatchObject({
            state: 'queued',
            confirmationDeadline: deadline,
            confirmation: { inputs: edited, at: later, decisionReceiptId: id },
            originalInputs: inputs,
          });
          expect(outbox.append).not.toHaveBeenCalled();
          expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO platform.inbox'))).toBe(
            false,
          );
        },
      );
    },
  );
  it('refuses with one cancellation/outbox/inbox and retains the first deadline', async () => {
    await fixture(
      [...confirmationRows(), [], [{ at: new Date(later) }], ...appended(), [{ id }], []],
      async (repository, query, outbox) => {
        expect(await repository.refuse(id, id, owner)).toMatchObject({
          state: 'cancelled',
          confirmationDeadline: deadline,
          terminal: { reason: 'visitor_cancelled', at: later },
        });
        expect(outbox.append).toHaveBeenCalledOnce();
        expect(
          query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO platform.inbox')),
        ).toHaveLength(1);
      },
    );
  });
  it.each([inputs, null])(
    'replays identical confirmed operands without new events (%j)',
    async (edited) => {
      const confirmed = run({
        ...awaiting(),
        state: 'queued',
        updatedAt: later,
        confirmation: { decisionReceiptId: id, inputs: edited, at: later },
        steps: [...awaiting().steps, { sequence: 3, phase: 'confirmed', at: later }],
      });
      await fixture(confirmationRows(confirmed), async (repository, query) => {
        expect(await repository.confirm({ ...confirm, inputs: edited }, owner)).toEqual(confirmed);
        expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
      });
      await fixture(confirmationRows(confirmed), async (repository) => {
        await expect(
          repository.confirm({ ...confirm, inputs: edited ? null : inputs }, owner),
        ).rejects.toMatchObject({ kind: 'conflict' });
      });
    },
  );
  it('rejects changed non-null operands on replay', async () => {
    const confirmed = run({
      ...awaiting(),
      state: 'queued',
      updatedAt: later,
      confirmation: { decisionReceiptId: id, inputs, at: later },
      steps: [...awaiting().steps, { sequence: 3, phase: 'confirmed', at: later }],
    });
    await fixture(confirmationRows(confirmed), async (repository) => {
      await expect(
        repository.confirm({ ...confirm, inputs: { ...inputs, priceMinorUnits: 200 } }, owner),
      ).rejects.toMatchObject({ kind: 'conflict' });
    });
  });
  it.each(['cancelled', 'expired'] as const)(
    'replays retained %s terminal without renewing time',
    async (state) => {
      const end = state === 'expired' ? deadline : later;
      const terminal = run({
        ...awaiting(),
        state,
        updatedAt: end,
        terminal: {
          state,
          reason: state === 'expired' ? 'confirmation_expired' : 'visitor_cancelled',
          at: end,
        },
        steps: [...awaiting().steps, { sequence: 3, phase: state, at: end }],
      });
      await fixture(confirmationRows(terminal), async (repository, query) => {
        expect(await repository.refuse(id, id, owner)).toEqual(terminal);
        expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
      });
      await fixture(confirmationRows(terminal), async (repository) => {
        if (state === 'expired') expect(await repository.confirm(confirm, owner)).toEqual(terminal);
        else
          await expect(repository.confirm(confirm, owner)).rejects.toMatchObject({
            kind: 'conflict',
          });
      });
    },
  );
  it.each([false, true])(
    'database expiry wins confirmation, including the transition-time crossing (%s)',
    async (crossing) => {
      const expiry = [{ at: new Date(deadline) }];
      await fixture(
        [
          ...confirmationRows(),
          ...(crossing ? [[], expiry, expiry] : [expiry]),
          ...appended(),
          [{ id }],
          [],
        ],
        async (repository, query, outbox) => {
          expect(await repository.confirm(confirm, owner)).toMatchObject({
            state: 'expired',
            confirmation: null,
            terminal: { reason: 'confirmation_expired', at: deadline },
          });
          expect(outbox.append).toHaveBeenCalledOnce();
          expect(query.mock.calls.some(([sql]) => sql.includes('state=$2'))).toBe(false);
        },
      );
    },
  );
  it('fails closed if transition time crosses deadline but SQL cannot retain expiry', async () => {
    await fixture(
      [...confirmationRows(), [], [{ at: new Date(deadline) }], []],
      async (repository) => {
        await expect(repository.confirm(confirm, owner)).rejects.toMatchObject({
          kind: 'unavailable',
        });
      },
    );
  });
  it('rejects unpaused work, substituted decision, missing run and foreign visitor', async () => {
    await fixture([...confirmationRows(run()), []], async (repository) => {
      await expect(repository.confirm(confirm, owner)).rejects.toMatchObject({ kind: 'conflict' });
    });
    await fixture(confirmationRows(), async (repository) => {
      await expect(repository.refuse(id, other, owner)).rejects.toMatchObject({ kind: 'conflict' });
    });
    await fixture([[], []], async (repository) => {
      await expect(repository.refuse(id, id, owner)).rejects.toMatchObject({ kind: 'forbidden' });
    });
    await fixture(confirmationRows(), async (repository, query) => {
      await expect(repository.refuse(id, id, 'x'.repeat(43))).rejects.toMatchObject({
        kind: 'forbidden',
      });
      expect(query.mock.calls.some(([sql]) => sql.includes('advisory'))).toBe(false);
    });
  });
});

describe('pause commit at the dispatch boundary', () => {
  function rows(document = run()) {
    return [[], [], [stored(document)]];
  }
  it('requires a durable routing checkpoint before fixing the first ten-minute deadline', async () => {
    await fixture(
      [
        ...rows(),
        [stored(run())],
        [{ at: new Date(at) }],
        [{ present: true }],
        [{ deadline: new Date(deadline) }],
        ...appended(),
      ],
      async (repository, query, outbox) => {
        expect(await repository.complete(completion)).toEqual(awaiting());
        expect(
          query.mock.calls.some(([sql]) => sql.includes('COALESCE(confirmation_deadline')),
        ).toBe(true);
        expect(outbox.append).not.toHaveBeenCalled();
        expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO platform.inbox'))).toBe(
          false,
        );
      },
    );
    await fixture(
      [...rows(), [stored(run())], [{ at: new Date(at) }], [{ present: false }]],
      async (repository) => {
        await expect(repository.complete(completion)).rejects.toMatchObject({ kind: 'forbidden' });
      },
    );
  });
  it('replays an already committed pause without another event or lease authorization', async () => {
    await fixture(rows(awaiting()), async (repository, query) => {
      expect(await repository.complete(completion)).toEqual(awaiting());
      expect(
        query.mock.calls.some(([sql]) => sql.includes('AS active') || /^(INSERT|UPDATE)/.test(sql)),
      ).toBe(false);
    });
  });
  it.each([run({ decision: null }), run({ decision: receipt(0.85) })])(
    'rejects pausing an absent or already authorized decision (%j)',
    async (document) => {
      await fixture(
        [...rows(document), [stored(document)], [{ at: new Date(at) }]],
        async (repository) => {
          await expect(repository.complete(completion)).rejects.toMatchObject({
            kind: 'forbidden',
          });
        },
      );
    },
  );
  it('rejects substituted receipt and execution identity', async () => {
    await fixture([...rows(), [stored(run())]], async (repository) => {
      await expect(
        repository.complete({ ...completion, evidence: { ...pause, decisionReceiptId: other } }),
      ).rejects.toMatchObject({ kind: 'forbidden' });
    });
    await fixture(rows(), async (repository) => {
      await expect(
        repository.complete({
          ...completion,
          executionId: other,
          evidence: { ...pause, executionId: other },
        }),
      ).rejects.toMatchObject({ kind: 'forbidden' });
    });
  });
  it('never treats below-gate unavailable evidence as permission to finish', async () => {
    await fixture([...rows(), [stored(run())], [{ at: new Date(at) }]], async (repository) => {
      await expect(
        repository.complete({
          ...completion,
          evidence: { ...pause, outcome: 'execution-unavailable' },
        }),
      ).rejects.toMatchObject({ kind: 'forbidden' });
    });
  });
  it.each(askIntents.filter((intent) => intent !== 'price_per_square_meter'))(
    'completes %s only from matching evidence, preserving one terminal on replay',
    async (intent) => {
      const document = run({
        originalInputs: null,
        decision: parseIntentDecisionReceipt({
          ...receipt(0.85),
          intent,
          probabilities: Object.fromEntries(
            askIntents.map((label) => [label, label === intent ? 0.85 : 0.03]),
          ),
        }),
      });
      const evidence = { ...pause, outcome: 'execution-unavailable' as const };
      let terminal: RoutedAskLiveRun | undefined;
      await fixture(
        [
          ...rows(document),
          [stored(document)],
          [{ at: new Date(at) }],
          [{ at: new Date(at) }],
          ...appended(),
          [{ id }],
          [],
        ],
        async (repository, query, outbox) => {
          const completed = await repository.complete({ ...completion, evidence });
          if (completed.basis !== 'routed-text-v1') throw new Error('Expected routed result.');
          terminal = completed;
          expect(terminal).toMatchObject({
            state: 'completed',
            result: { kind: 'unavailable_intent', intent, reason: 'not_available' },
            terminal: { state: 'completed', reason: null },
          });
          expect(outbox.append).toHaveBeenCalledOnce();
          expect(
            query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO platform.inbox')),
          ).toHaveLength(1);
          expect(
            query.mock.calls.some(([sql]) => /ask\.(tool_receipt|model_explanation)/.test(sql)),
          ).toBe(false);
        },
      );
      await fixture(rows(terminal!), async (repository, query, outbox) => {
        expect(await repository.complete({ ...completion, evidence })).toEqual(terminal);
        expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
        expect(outbox.append).not.toHaveBeenCalled();
      });
      await fixture(rows(terminal!), async (repository, query, outbox) => {
        await expect(
          repository.complete({
            ...completion,
            evidence: { ...evidence, decisionReceiptId: other },
          }),
        ).rejects.toMatchObject({ kind: 'forbidden' });
        expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
        expect(outbox.append).not.toHaveBeenCalled();
      });
      await fixture(rows(terminal!), async (repository, query, outbox) => {
        await expect(
          repository.complete({
            ...completion,
            evidence: {
              ...evidence,
              outcome: 'price-calculated',
              receipt: {
                ...identity,
                operation: 'price-per-square-meter',
                inputs,
                receiptId: id,
                provenance: 'market-domain-v1',
                result: {
                  kind: 'price_per_square_meter',
                  minorUnits: 50,
                  currency: 'BRL',
                  areaUnit: 'm2',
                  inputs,
                  computedAt: at,
                },
              },
            },
          }),
        ).rejects.toMatchObject({ kind: 'forbidden' });
        expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
        expect(outbox.append).not.toHaveBeenCalled();
      });
    },
  );
  it('replays a pre-upgrade failed non-price terminal without manufacturing a result', async () => {
    const terminal = run({
      state: 'failed',
      decision: parseIntentDecisionReceipt({
        ...receipt(0.85),
        intent: 'listing_search',
        probabilities: {
          ...decision(0.85).probabilities,
          price_per_square_meter: 0.15,
          listing_search: 0.85,
        },
      }),
      terminal: { state: 'failed', reason: 'execution_unavailable', at },
      steps: [
        { sequence: 1, phase: 'routing', at },
        { sequence: 2, phase: 'failed', at },
      ],
    });
    await fixture(rows(terminal), async (repository, query, outbox) => {
      expect(
        await repository.complete({
          ...completion,
          evidence: { ...pause, outcome: 'execution-unavailable' },
        }),
      ).toEqual(terminal);
      expect(query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
      expect(outbox.append).not.toHaveBeenCalled();
    });
  });
  it('completes a confirmed retained non-price decision without operands', async () => {
    const document = run({
      ...awaiting(),
      state: 'running',
      decision: parseIntentDecisionReceipt({
        ...receipt(),
        intent: 'listing_search',
        probabilities: {
          ...decision().probabilities,
          price_per_square_meter: 0.16,
          listing_search: 0.84,
        },
      }),
      confirmation: { decisionReceiptId: id, inputs: null, at },
    });
    await fixture(
      [
        ...rows(document),
        [stored(document)],
        [{ at: new Date(at) }],
        [{ at: new Date(at) }],
        ...appended(),
        [{ id }],
        [],
      ],
      async (repository) => {
        expect(
          await repository.complete({
            ...completion,
            evidence: { ...pause, outcome: 'execution-unavailable' },
          }),
        ).toMatchObject({
          state: 'completed',
          result: { kind: 'unavailable_intent', intent: 'listing_search' },
        });
      },
    );
  });
  it('retains unavailable gated work as one terminal, without inventing a price receipt', async () => {
    const document = run({ decision: receipt(0.85) });
    await fixture(
      [
        ...rows(document),
        [stored(document)],
        [{ at: new Date(at) }],
        [{ at: new Date(at) }],
        ...appended(),
        [{ id }],
        [],
      ],
      async (repository, query, outbox) => {
        expect(
          await repository.complete({
            ...completion,
            evidence: { ...pause, outcome: 'execution-unavailable' },
          }),
        ).toMatchObject({
          state: 'failed',
          result: null,
          terminal: { reason: 'execution_unavailable' },
        });
        expect(outbox.append).toHaveBeenCalledOnce();
        expect(query.mock.calls.some(([sql]) => sql.includes('ask.tool_receipt'))).toBe(false);
      },
    );
  });
});
