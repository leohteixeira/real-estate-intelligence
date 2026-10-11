import type { AskLiveFacade } from '@rei/application';
import { parseAskLiveEvent } from '@rei/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askLiveStream } from './ask-live-stream';
const id = '0199c8f2-2394-7ba0-8f9e-286378779210',
  at = '2026-10-11T00:00:00.000Z';
const frame = parseAskLiveEvent({
  version: 1,
  id: `${id}:v1:1`,
  runId: id,
  sequence: 1,
  event: 'ask.progress',
  terminal: false,
  run: {
    basis: 'structured-price-v1',
    id,
    threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
    principalId: null,
    question: 'Calculate.',
    locale: 'en',
    placeId: null,
    createdAt: at,
    updatedAt: at,
    state: 'queued',
    originalInputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
    decision: null,
    result: null,
    terminal: null,
    steps: [],
  },
});
afterEach(() => vi.useRealTimers());
describe('durable Ask SSE resource lifetime', () => {
  it('emits retained frames and closes cleanly on transport failure without fabricating terminal data', async () => {
    vi.useFakeTimers();
    const events = vi.fn().mockRejectedValue(new Error('Database unavailable')),
      received: unknown[] = [],
      closed = vi.fn();
    const live = { events } as unknown as AskLiveFacade;
    askLiveStream(live, id, 'capability', 0, [frame], false).subscribe({
      next: (event) => received.push(event),
      complete: closed,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(received).toHaveLength(1);
    expect(closed).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels the single outstanding poll and never schedules more work after unsubscribe', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const events = vi.fn().mockImplementation((_id, _cap, _after, stop) => {
      signal = stop;
      return new Promise(() => {});
    });
    const subscription = askLiveStream(
      { events } as unknown as AskLiveFacade,
      id,
      'capability',
      0,
      [],
      false,
    ).subscribe();
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toHaveBeenCalledOnce();
    subscription.unsubscribe();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('closes terminal replay at its cursor with no poll or fabricated event', () => {
    const events = vi.fn(),
      next = vi.fn(),
      complete = vi.fn();
    askLiveStream({ events } as unknown as AskLiveFacade, id, 'capability', 3, [], true).subscribe({
      next,
      complete,
    });
    expect(next).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });
});
