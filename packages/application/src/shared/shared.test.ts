import type { DomainEventEnvelope, UuidV7 } from '@rei/domain';
import { describe, expect, it } from 'vitest';

import type { Clock } from './clock.js';
import { DATABASE_AVAILABILITY_PROBE } from './database-availability-probe.js';
import type { EventEnvelope, OutboxAppendPort, OutboxRow } from './outbox.js';
import { Transaction, type TransactionRunner } from './transaction.js';

class FakeTransaction extends Transaction {
  public constructor() {
    super();
  }
}

class InMemoryTransactionRunner implements TransactionRunner {
  public readonly transaction = new FakeTransaction();

  public async runInTransaction<TResult>(
    work: (transaction: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return work(this.transaction);
  }
}

class RecordingOutbox implements OutboxAppendPort {
  public transaction: Transaction | undefined;
  public events: readonly EventEnvelope[] = [];

  public async append(transaction: Transaction, events: readonly EventEnvelope[]): Promise<void> {
    this.transaction = transaction;
    this.events = events;
  }
}

const event: DomainEventEnvelope = {
  eventId: '01890f47-e6b5-7cc3-98c4-1c9d6a1f7e11' as UuidV7,
  type: 'properties.listing.price-changed',
  version: 1,
  aggregateId: '01890f47-e6b5-7cc3-a8c4-1c9d6a1f7e12' as UuidV7,
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: null,
  payload: { priceInMinorUnits: 78_500_000 },
};

describe('shared application contracts', () => {
  it('binds outbox appends to the active transaction', async () => {
    const transactions = new InMemoryTransactionRunner();
    const outbox = new RecordingOutbox();

    await transactions.runInTransaction(async (transaction) => {
      await outbox.append(transaction, [event]);
    });

    expect(outbox.transaction).toBe(transactions.transaction);
    expect(outbox.events).toEqual([event]);
  });

  it('uses the same explicit trace-context slot in event envelopes and outbox rows', () => {
    const tracedEvent: EventEnvelope = {
      ...event,
      traceContext: {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    };
    const pendingRow: OutboxRow = { ...tracedEvent, publishedAt: null };
    const untracedRow: OutboxRow = { ...event, publishedAt: null };

    expect(pendingRow.traceContext).toBe(tracedEvent.traceContext);
    expect(untracedRow.traceContext).toBeNull();
  });

  it('allows deterministic clocks and keeps the readiness token stable', () => {
    const clock: Clock = { now: () => '2026-10-10T12:30:00.000Z' };

    expect(clock.now()).toBe('2026-10-10T12:30:00.000Z');
    expect(DATABASE_AVAILABILITY_PROBE).toBe(Symbol.for('rei.DatabaseAvailabilityProbe'));
  });
});
