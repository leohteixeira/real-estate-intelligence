import type {
  AuditEventLog,
  EventHandler,
  EventSubscriber,
  Inbox,
  Transaction,
  TransactionRunner,
} from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import { COLLECTION_AUDIT_CONSUMER, CollectionAuditConsumer } from './collection-audit.consumer';

const event = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  type: 'collection.snapshot.parsed',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  occurredAt: '2026-10-10T12:00:00.000Z',
  traceContext: null,
  payload: {},
} as const;

function fixture(firstDelivery: boolean) {
  let handler: EventHandler | undefined;
  const transaction = {} as Transaction;
  const subscriber: EventSubscriber = {
    subscribe: vi.fn(async (_subscription, registered) => {
      handler = registered;
    }),
  };
  const transactions: TransactionRunner = {
    runInTransaction: vi.fn(async (work) => work(transaction)),
  };
  const inbox: Inbox = { record: vi.fn().mockResolvedValue(firstDelivery) };
  const auditLog: AuditEventLog = { append: vi.fn().mockResolvedValue(undefined) };
  return {
    consumer: new CollectionAuditConsumer(subscriber, transactions, inbox, auditLog),
    subscriber,
    transactions,
    transaction,
    inbox,
    auditLog,
    handler: () => handler,
  };
}

describe('CollectionAuditConsumer', () => {
  it('subscribes one durable consumer to parsed and completed collection facts', async () => {
    const context = fixture(true);
    await context.consumer.start();

    expect(context.subscriber.subscribe).toHaveBeenCalledWith(
      {
        consumerName: COLLECTION_AUDIT_CONSUMER,
        eventTypes: ['collection.snapshot.parsed', 'collection.run.completed'],
      },
      expect.any(Function),
    );
  });

  it('records its inbox marker and append-only audit effect in the same transaction', async () => {
    const context = fixture(true);
    await context.consumer.start();
    await context.handler()!(event);

    expect(context.inbox.record).toHaveBeenCalledWith(
      context.transaction,
      COLLECTION_AUDIT_CONSUMER,
      event.eventId,
    );
    expect(context.auditLog.append).toHaveBeenCalledWith(context.transaction, event);
    expect(context.inbox.record).toHaveBeenCalledBefore(context.auditLog.append as never);
  });

  it('acknowledges redelivery after the existing inbox marker without repeating the effect', async () => {
    const context = fixture(false);
    await context.consumer.start();
    await context.handler()!(event);

    expect(context.transactions.runInTransaction).toHaveBeenCalledOnce();
    expect(context.auditLog.append).not.toHaveBeenCalled();
  });

  it('propagates an audit failure so inbox and effect roll back before broker acknowledgement', async () => {
    const context = fixture(true);
    vi.mocked(context.auditLog.append).mockRejectedValue(new Error('database unavailable'));
    await context.consumer.start();

    await expect(context.handler()!(event)).rejects.toThrow('database unavailable');
  });
});
