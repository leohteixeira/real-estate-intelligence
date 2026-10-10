import { ExternalFailure, type EventEnvelope } from '@rei/application';
import type { UuidV7 } from '@rei/domain';
import { describe, expect, it } from 'vitest';

import { ScriptedEventPublisher } from './scripted-event-publisher.js';

const event: EventEnvelope = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' as UuidV7,
  type: 'audit.trace.requested',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as UuidV7,
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: null,
  payload: {},
};

describe('ScriptedEventPublisher', () => {
  it('replays deterministic outcomes while preserving the event id', async () => {
    const transient = new ExternalFailure({ kind: 'transient', operation: 'publish' });
    const publisher = new ScriptedEventPublisher([
      async () => Promise.reject(transient),
      async () => undefined,
    ]);

    await expect(publisher.publish(event, new AbortController().signal)).rejects.toBe(transient);
    await expect(publisher.publish(event, new AbortController().signal)).resolves.toBeUndefined();
    expect(publisher.attempts.map(({ eventId }) => eventId)).toEqual([
      event.eventId,
      event.eventId,
    ]);
  });

  it('passes cancellation to active scripted work', async () => {
    const controller = new AbortController();
    const publisher = new ScriptedEventPublisher([
      async (_event, signal) =>
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    ]);

    const active = publisher.publish(event, controller.signal);
    controller.abort(new Error('cancelled by caller'));

    await expect(active).rejects.toThrow('cancelled by caller');
    expect(publisher.attempts).toHaveLength(1);
  });
});
