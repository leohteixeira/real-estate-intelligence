import { describe, expect, it, vi } from 'vitest';
import { CollectionRunCompleted, parseSha256Hash } from '@rei/domain';
import { Transaction, type TransactionRunner } from '../shared/index.js';
import {
  ConsumeMarketCompletion,
  MARKET_COMPLETION_CONSUMER,
} from './consume-market-completion.service.js';
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const event = (n: number, at: string) =>
  new CollectionRunCompleted({
    traceContext: null,
    eventId: id(n),
    aggregateId: id(n + 10),
    occurredAt: at,
    payload: {
      sourceId: 'synthetic-source',
      observedCount: 0,
      parsedCount: 0,
      suppressedCount: 0,
      failedCount: 0,
      manifestHash: parseSha256Hash(`sha256:${'a'.repeat(64)}`),
    },
  });
class Scope extends Transaction {
  public constructor(
    public latest: string | null,
    public inbox: string[],
  ) {
    super();
  }
}
function fixture(fail?: 'completion' | 'inbox', cancel?: 'completion' | 'inbox') {
  let state = new Scope(null, []);
  const controller = new AbortController();
  const checkpoint = (stage: string) => {
    if (fail === stage) throw new Error('Injected failure');
    if (cancel === stage) controller.abort(new Error('Cancelled'));
  };
  const transactions: TransactionRunner = {
    async runInTransaction(work, signal) {
      signal?.throwIfAborted();
      const pending = new Scope(state.latest, [...state.inbox]);
      const result = await work(pending);
      signal?.throwIfAborted();
      state = pending;
      return result;
    },
  };
  const complete = vi.fn(async (tx: Transaction, sourceId: string, at: string) => {
    if (!(tx instanceof Scope)) throw new Error('Wrong transaction');
    expect(sourceId).toBe('synthetic-source');
    if (tx.latest === null || at > tx.latest) tx.latest = at;
    checkpoint('completion');
  });
  const record = vi.fn(async (tx: Transaction, consumer: string, eventId: string) => {
    if (!(tx instanceof Scope)) throw new Error('Wrong transaction');
    expect(consumer).toBe(MARKET_COMPLETION_CONSUMER);
    const fresh = !tx.inbox.includes(eventId);
    if (fresh) tx.inbox.push(eventId);
    checkpoint('inbox');
    return fresh;
  });
  return {
    service: new ConsumeMarketCompletion({ complete }, transactions, { record }),
    state: () => state,
    controller,
    complete,
    record,
  };
}
describe('Market source completion consumer', () => {
  it('strictly parses completion, uses occurredAt and preserves the max after inbox pruning', async () => {
    const f = fixture();
    const newer = event(1, '2026-10-01T12:00:00.000Z');
    const older = event(2, '2026-09-01T12:00:00.000Z');
    for (const incoming of [newer, older, newer])
      await f.service.execute({ ...incoming }, f.controller.signal);
    expect(f.state().latest).toBe(newer.occurredAt);
    expect(f.state().inbox).toEqual([newer.eventId, older.eventId]);
    f.state().inbox.length = 0;
    await f.service.execute({ ...older }, f.controller.signal);
    expect(f.state().latest).toBe(newer.occurredAt);
    expect(f.complete.mock.invocationCallOrder[0]).toBeLessThan(
      f.record.mock.invocationCallOrder[0]!,
    );
  });
  it.each(['completion', 'inbox'] as const)(
    'rolls back on %s failure and cancellation',
    async (stage) => {
      for (const f of [fixture(stage), fixture(undefined, stage)]) {
        await expect(
          f.service.execute({ ...event(1, '2026-10-01T00:00:00Z') }, f.controller.signal),
        ).rejects.toThrow();
        expect(f.state().latest).toBeNull();
        expect(f.state().inbox).toEqual([]);
      }
    },
  );
  it('refuses malformed events and cancellation before effects', async () => {
    const f = fixture();
    const valid = event(1, '2026-10-01T00:00:00Z');
    for (const input of [
      {},
      { ...valid, payload: { ...valid.payload, completedAt: valid.occurredAt } },
      { ...valid, type: 'collection.run.requested' },
    ])
      await expect(f.service.execute(input, f.controller.signal)).rejects.toThrow();
    f.controller.abort();
    await expect(f.service.execute({ ...valid }, f.controller.signal)).rejects.toThrow();
    expect(f.complete).not.toHaveBeenCalled();
  });
});
