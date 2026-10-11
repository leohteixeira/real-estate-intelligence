import { describe, expect, it } from 'vitest';
import { AskRunRequested, askRequestedIdentity } from './ask-run-requested.event.js';
const identity = {
  version: 1 as const,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
};
describe('durable requested event identity', () => {
  it('contains only immutable retained run/thread identity and optional validated causal context', () => {
    const traceContext = { traceparent: '00-11111111111111111111111111111111-2222222222222222-01' },
      event = new AskRunRequested(identity, '2026-10-11T00:00:00.000Z', traceContext);
    expect(askRequestedIdentity(event)).toEqual(identity);
    expect(event.payload).toEqual({ runId: identity.runId, threadId: identity.threadId });
    expect(event.traceContext).toEqual(traceContext);
    expect(Object.isFrozen(event.payload)).toBe(true);
  });
  it('rejects mismatched aggregate, event version/type and hidden payload fields', () => {
    const event = new AskRunRequested(identity, '2026-10-11T00:00:00.000Z');
    for (const changed of [
      { ...event, version: 2 },
      { ...event, type: 'ask.run.completed' },
      { ...event, aggregateId: event.eventId },
      { ...event, payload: { ...event.payload, query: 'private' } },
      { ...event, payload: { runId: 1, threadId: identity.threadId } },
      { ...event, payload: { threadId: identity.threadId, unknown: 'x' } },
    ])
      expect(() => askRequestedIdentity(changed)).toThrow();
  });
});
