import { expect, it, vi } from 'vitest';
import {
  CollectionListingSuppressed,
  parsePropertiesListingSuppressed,
  parseUuidV7,
} from '@rei/domain';
import { Transaction, type TransactionRunner, type EventEnvelope } from '../shared/index.js';
import { ConsumeListingSuppression } from './consume-listing-suppression.service.js';
const id = (n: number) => parseUuidV7(`0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`);
const event = new CollectionListingSuppressed({
  eventId: id(1),
  aggregateId: id(2),
  occurredAt: '2026-10-25T12:00:00.000Z',
  payload: { sourceId: 'synthetic-data', sourceListingId: 'erased' },
});
class Scope extends Transaction {
  public constructor(
    public state: { inbox: boolean; receipt: boolean; publications: EventEnvelope[] },
  ) {
    super();
  }
}
function fixture() {
  let committed = { inbox: false, receipt: false, publications: [] as EventEnvelope[] };
  const controller = new AbortController();
  const authority = {
    isSuppressed: vi.fn(async () => true),
    lockAndCheck: vi.fn(async () => true),
    verifySuppressionEvent: vi.fn(async () => true),
  };
  const transactions: TransactionRunner = {
    async runInTransaction(work, signal) {
      const tx = new Scope(structuredClone(committed));
      const result = await work(tx);
      signal?.throwIfAborted();
      committed = tx.state;
      return result;
    },
  };
  const erase = vi.fn(async (tx: Transaction) => {
    const state = (tx as Scope).state;
    if (state.receipt) return null;
    state.receipt = true;
    return {
      causeEventId: event.eventId,
      suppressionId: event.aggregateId,
      ...event.payload,
      listingId: null,
      originalPropertyId: null,
      listingRevision: null,
      assignmentRevision: null,
      changes: [],
    };
  });
  const append = vi.fn(async (tx: Transaction, events: readonly EventEnvelope[]) => {
    (tx as Scope).state.publications.push(...events);
  });
  const create = () =>
    new ConsumeListingSuppression(
      authority,
      { erase },
      transactions,
      {
        record: async (tx) => {
          const state = (tx as Scope).state;
          if (state.inbox) return false;
          state.inbox = true;
          return true;
        },
      },
      { append },
      { generate: async () => id(3) },
    );
  return { authority, erase, append, create, controller, state: () => committed };
}
it('authenticates before receipt and publishes one minimal no-op, including restart and pruned-inbox replay', async () => {
  const f = fixture();
  await f.create().execute({ ...event }, f.controller.signal);
  expect(f.authority.lockAndCheck).toHaveBeenCalledBefore(f.authority.verifySuppressionEvent);
  expect(f.authority.verifySuppressionEvent).toHaveBeenCalledBefore(f.erase);
  expect(parsePropertiesListingSuppressed(f.state().publications[0]).payload).toMatchObject({
    ...event.payload,
    changes: [],
    listingId: null,
  });
  await f.create().execute({ ...event }, f.controller.signal);
  expect(f.erase).toHaveBeenCalledTimes(1);
  f.state().inbox = false;
  await f.create().execute({ ...event }, f.controller.signal);
  expect(f.state().publications).toHaveLength(1);
  expect(f.state().receipt).toBe(true);
});
it.each(['identity', 'cause'] as const)('refuses unconfirmed %s without writes', async (kind) => {
  const f = fixture();
  if (kind === 'identity') f.authority.lockAndCheck.mockResolvedValue(false);
  else f.authority.verifySuppressionEvent.mockResolvedValue(false);
  await expect(f.create().execute({ ...event }, f.controller.signal)).rejects.toMatchObject({
    kind: 'rejected',
  });
  expect(f.state()).toEqual({ inbox: false, receipt: false, publications: [] });
  expect(f.erase).not.toHaveBeenCalled();
});
it.each(['erasure', 'outbox', 'cancellation'] as const)(
  'rolls back receipt/inbox and all publications on %s',
  async (kind) => {
    const f = fixture();
    if (kind === 'erasure') f.erase.mockRejectedValue(new Error('controlled erasure failure'));
    else
      f.append.mockImplementation(async () => {
        if (kind === 'cancellation') f.controller.abort(new Error('controlled cancellation'));
        else throw new Error('controlled publication failure');
      });
    await expect(f.create().execute({ ...event }, f.controller.signal)).rejects.toThrow(
      'controlled',
    );
    expect(f.state()).toEqual({ inbox: false, receipt: false, publications: [] });
  },
);
it('refuses malformed/wrong-type events and cancellation before calling authority', async () => {
  const f = fixture();
  for (const wire of [
    { ...event, type: 'collection.run.completed' },
    { ...event, extra: true },
    { ...event, payload: { ...event.payload, sourceUrl: 'https://forbidden.invalid' } },
  ])
    await expect(f.create().execute(wire, f.controller.signal)).rejects.toThrow();
  f.controller.abort(new Error('cancelled'));
  await expect(f.create().execute({ ...event }, f.controller.signal)).rejects.toThrow('cancelled');
  expect(f.authority.lockAndCheck).not.toHaveBeenCalled();
});
