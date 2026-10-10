import type {
  AuditEventLog,
  EventHandler,
  EventSubscriber,
  Inbox,
  Transaction,
  TransactionRunner,
} from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import { AuditTraceConsumer } from './audit-trace.consumer';

const event = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
  type: 'audit.trace.requested',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220',
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: null,
  payload: {},
} as const;

function fixture(firstDelivery = true) {
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
  const consumer = new AuditTraceConsumer(subscriber, transactions, inbox, auditLog);
  return {
    consumer,
    subscriber,
    transactions,
    transaction,
    inbox,
    auditLog,
    handler: () => handler,
  };
}

describe('AuditTraceConsumer', () => {
  it('registers the stable logical consumer descriptor', async () => {
    const { consumer, subscriber } = fixture();

    await consumer.start();

    expect(subscriber.subscribe).toHaveBeenCalledWith(
      { consumerName: 'audit.event-log', eventTypes: ['audit.trace.requested'] },
      expect.any(Function),
    );
  });

  it('records the inbox key and effect in the same transaction', async () => {
    const { consumer, transaction, inbox, auditLog, handler } = fixture();
    await consumer.start();

    await handler()!(event);

    expect(inbox.record).toHaveBeenCalledWith(transaction, 'audit.event-log', event.eventId);
    expect(auditLog.append).toHaveBeenCalledWith(transaction, event);
    expect(inbox.record).toHaveBeenCalledBefore(auditLog.append as never);
  });

  it('commits and acknowledges a duplicate without repeating the effect', async () => {
    const { consumer, transactions, auditLog, handler } = fixture(false);
    await consumer.start();

    await handler()!(event);

    expect(transactions.runInTransaction).toHaveBeenCalledOnce();
    expect(auditLog.append).not.toHaveBeenCalled();
  });

  it('propagates an effect failure so the transaction rolls back and broker cannot acknowledge', async () => {
    const { consumer, auditLog, handler } = fixture();
    vi.mocked(auditLog.append).mockRejectedValue(new Error('database unavailable'));
    await consumer.start();

    await expect(handler()!(event)).rejects.toThrow('database unavailable');
  });
});
