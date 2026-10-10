import type { EventEnvelope, OutboxAppendPort, UuidV7Generator } from '../shared/index.js';
import { Transaction, type TransactionRunner } from '../shared/index.js';
import { describe, expect, it, vi } from 'vitest';

import { RequestAuditTrace } from './request-audit-trace.service.js';

class FakeTransaction extends Transaction {
  public constructor() {
    super();
  }
}

describe('RequestAuditTrace', () => {
  it('generates both identifiers and appends the event inside the exact transaction', async () => {
    const transaction = new FakeTransaction();
    const transactions: TransactionRunner = {
      runInTransaction: async (work) => work(transaction),
    };
    const generate = vi
      .fn<UuidV7Generator['generate']>()
      .mockResolvedValueOnce('0199c8f2-2394-7ba0-8f9e-286378779219')
      .mockResolvedValueOnce('0199c8f2-2394-7ba0-9f9e-286378779220');
    const append = vi.fn<OutboxAppendPort['append']>();
    const service = new RequestAuditTrace(
      transactions,
      { generate },
      { now: () => '2026-10-10T12:30:00.000Z' },
      { append },
    );

    const traceContext = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      tracestate: 'vendor=opaque',
    };
    await expect(service.execute(traceContext)).resolves.toBe(
      '0199c8f2-2394-7ba0-8f9e-286378779219',
    );
    expect(generate).toHaveBeenNthCalledWith(1, transaction);
    expect(generate).toHaveBeenNthCalledWith(2, transaction);
    expect(append).toHaveBeenCalledOnce();
    const [usedTransaction, events] = append.mock.calls[0] as [Transaction, EventEnvelope[]];
    expect(usedTransaction).toBe(transaction);
    expect(events).toEqual([
      expect.objectContaining({
        eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
        aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220',
        type: 'audit.trace.requested',
        traceContext,
        payload: {},
      }),
    ]);
  });

  it('does not hide an append failure from the transaction runner', async () => {
    const transaction = new FakeTransaction();
    const rollback = vi.fn();
    const transactions: TransactionRunner = {
      runInTransaction: async (work) => {
        try {
          return await work(transaction);
        } catch (error) {
          rollback();
          throw error;
        }
      },
    };
    const identifiers: UuidV7Generator = {
      generate: vi
        .fn()
        .mockResolvedValueOnce('0199c8f2-2394-7ba0-8f9e-286378779219')
        .mockResolvedValueOnce('0199c8f2-2394-7ba0-9f9e-286378779220'),
    };
    const service = new RequestAuditTrace(
      transactions,
      identifiers,
      { now: () => '2026-10-10T12:30:00.000Z' },
      { append: async () => Promise.reject(new Error('append failed')) },
    );

    await expect(service.execute(null)).rejects.toThrow('append failed');
    expect(rollback).toHaveBeenCalledOnce();
  });
});
