import { describe, expect, it, vi } from 'vitest';
import { CollectionListingSuppressed, PropertiesListingSuppressed } from '@rei/domain';
import { Transaction, type TransactionRunner } from '../shared/index.js';
import {
  ConsumeMarketSuppression,
  MARKET_SUPPRESSION_CONSUMER,
} from './consume-market-suppression.service.js';
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const cause = new CollectionListingSuppressed({
  traceContext: null,
  eventId: id(1),
  aggregateId: id(2),
  occurredAt: '2026-10-01T00:00:00.000Z',
  payload: { sourceId: 'synthetic-source', sourceListingId: 'erased' },
});
const notification = new PropertiesListingSuppressed({
  eventId: id(3),
  aggregateId: id(4),
  occurredAt: cause.occurredAt,
  payload: {
    ...cause.payload,
    causeEventId: cause.eventId,
    suppressionId: cause.aggregateId,
    listingId: id(4),
    originalPropertyId: id(5),
    listingRevision: 1,
    assignmentRevision: 0,
    changes: [{ previousPropertyId: id(5), propertyId: id(6), previousRevision: 1, revision: 2 }],
  },
});
class Scope extends Transaction {
  public constructor(public effects: string[] = []) {
    super();
  }
}
function fixture(fail?: string, cancel?: string) {
  let state = new Scope();
  const controller = new AbortController();
  const checkpoint = (stage: string) => {
    if (fail === stage) throw new Error(stage);
    if (cancel === stage) controller.abort(new Error(stage));
  };
  const transactions: TransactionRunner = {
    async runInTransaction(work, signal) {
      signal?.throwIfAborted();
      const tx = new Scope([...state.effects]);
      const result = await work(tx);
      signal?.throwIfAborted();
      state = tx;
      return result;
    },
  };
  const lockAndCheck = vi.fn(async () => {
    checkpoint('authority');
    return fail !== 'absent';
  });
  const verifySuppressionEvent = vi.fn(async () => {
    checkpoint('cause');
    return fail !== 'forged';
  });
  const erase = vi.fn(async (tx: Transaction, event: typeof cause | typeof notification) => {
    if (!(tx instanceof Scope)) throw new Error('scope');
    tx.effects.push(event.type);
    checkpoint('erase');
  });
  const record = vi.fn(async (tx: Transaction, consumer: string, eventId: string) => {
    expect(consumer).toBe(MARKET_SUPPRESSION_CONSUMER);
    if (!(tx instanceof Scope)) throw new Error('scope');
    tx.effects.push(eventId);
    checkpoint('inbox');
    return false;
  });
  return {
    service: new ConsumeMarketSuppression(
      { lockAndCheck, verifySuppressionEvent, isSuppressed: async () => true },
      { erase },
      transactions,
      { record },
    ),
    state: () => state,
    controller,
    lockAndCheck,
    verifySuppressionEvent,
    erase,
    record,
  };
}
describe('Market suppression', () => {
  it.each([cause, notification])(
    'authenticates the canonical cause before effects and ignores duplicate inbox early exits: $type',
    async (event) => {
      const f = fixture();
      await f.service.execute({ ...event }, f.controller.signal);
      expect(f.verifySuppressionEvent.mock.calls[0]).toEqual([expect.any(Scope), cause]);
      expect(f.erase.mock.calls[0]?.[1]).toEqual(event);
      expect(f.verifySuppressionEvent.mock.invocationCallOrder[0]).toBeLessThan(
        f.erase.mock.invocationCallOrder[0]!,
      );
      expect(f.erase.mock.invocationCallOrder[0]).toBeLessThan(
        f.record.mock.invocationCallOrder[0]!,
      );
      expect(f.state().effects).toEqual([event.type, event.eventId]);
    },
  );
  it.each(['absent', 'forged', 'authority', 'cause', 'erase', 'inbox'])(
    'rolls back %s without accepting delivery',
    async (stage) => {
      const f = fixture(stage);
      await expect(f.service.execute({ ...notification }, f.controller.signal)).rejects.toThrow();
      expect(f.state().effects).toEqual([]);
      if (['absent', 'forged', 'authority', 'cause'].includes(stage))
        expect(f.erase).not.toHaveBeenCalled();
    },
  );
  it.each(['authority', 'cause', 'erase', 'inbox'])(
    'rolls back cancellation at %s',
    async (stage) => {
      const f = fixture(undefined, stage);
      await expect(f.service.execute({ ...cause }, f.controller.signal)).rejects.toThrow();
      expect(f.state().effects).toEqual([]);
    },
  );
  it('strictly rejects unknown types, extra payload, invalid transitions and cancellation before authority', async () => {
    const f = fixture();
    for (const event of [
      {},
      { ...cause, type: 'collection.run.completed' },
      { ...cause, payload: { ...cause.payload, price: 1 } },
      {
        ...notification,
        payload: {
          ...notification.payload,
          changes: [{ ...notification.payload.changes[0], revision: 0 }],
        },
      },
    ])
      await expect(f.service.execute(event, f.controller.signal)).rejects.toThrow();
    f.controller.abort();
    await expect(f.service.execute({ ...cause }, f.controller.signal)).rejects.toThrow();
    expect(f.lockAndCheck).not.toHaveBeenCalled();
  });
});
