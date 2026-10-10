import type { EventEnvelope } from '@rei/application';
import type { UuidV7 } from '@rei/domain';
import { describe, expect, it } from 'vitest';

import { InMemoryEventPublisher } from './in-memory-event-publisher.js';

function event(eventId: string): EventEnvelope {
  return {
    eventId: eventId as UuidV7,
    type: 'audit.trace.requested',
    version: 1,
    aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as UuidV7,
    occurredAt: '2026-10-10T12:30:00.000Z',
    traceContext: null,
    payload: { sequence: eventId },
  };
}

describe('InMemoryEventPublisher', () => {
  it('keeps immutable snapshots in publication order', async () => {
    const publisher = new InMemoryEventPublisher();
    const first = event('0199c8f2-2394-7ba0-8f9e-286378779219');
    const second = event('0199c8f2-2394-7ba0-8f9e-286378779221');

    await publisher.publish(first, new AbortController().signal);
    await publisher.publish(second, new AbortController().signal);
    (first.payload as { sequence: string }).sequence = 'changed';

    expect(publisher.events.map(({ eventId }) => eventId)).toEqual([first.eventId, second.eventId]);
    expect(publisher.events[0]?.payload).toEqual({ sequence: first.eventId });
    expect(Object.isFrozen(publisher.events[0]?.payload)).toBe(true);
  });

  it('rejects an aborted publication without recording it', async () => {
    const publisher = new InMemoryEventPublisher();
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(
      publisher.publish(event('0199c8f2-2394-7ba0-8f9e-286378779219'), controller.signal),
    ).rejects.toThrow('cancelled');
    expect(publisher.events).toEqual([]);
  });
});
