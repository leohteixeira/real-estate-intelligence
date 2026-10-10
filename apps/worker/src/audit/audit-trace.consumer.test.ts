import type { AuditEventLog, EventHandler, EventSubscriber } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import { AuditTraceConsumer } from './audit-trace.consumer';

describe('AuditTraceConsumer', () => {
  it('completes delivery handling only after the audit append commits', async () => {
    let handler: EventHandler | undefined;
    const subscriber: EventSubscriber = {
      subscribe: vi.fn(async (_type, registered) => {
        handler = registered;
      }),
    };
    const append = vi.fn<AuditEventLog['append']>();
    const consumer = new AuditTraceConsumer(subscriber, { append });
    await consumer.start();

    const event = {
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
      type: 'audit.trace.requested',
      version: 1,
      aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220',
      occurredAt: '2026-10-10T12:30:00.000Z',
      traceContext: null,
      payload: {},
    } as const;
    await handler!(event);

    expect(append).toHaveBeenCalledWith(event);
  });

  it('propagates an audit failure so the broker cannot acknowledge it', async () => {
    let handler: EventHandler | undefined;
    const subscriber: EventSubscriber = {
      subscribe: async (_type, registered) => {
        handler = registered;
      },
    };
    const consumer = new AuditTraceConsumer(subscriber, {
      append: async () => Promise.reject(new Error('database unavailable')),
    });
    await consumer.start();

    await expect(
      handler!({
        eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' as never,
        type: 'audit.trace.requested',
        version: 1,
        aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as never,
        occurredAt: '2026-10-10T12:30:00.000Z',
        traceContext: null,
        payload: {},
      }),
    ).rejects.toThrow('database unavailable');
  });
});
