import type { ResilienceFallbackEvent } from '@nestjs/resilience';
import { ExternalFailure, type EventEnvelope } from '@rei/application';
import type { UuidV7 } from '@rei/domain';
import { ScriptedEventPublisher, type ScriptedPublishStep } from '@rei/infrastructure';
import { channel } from 'node:diagnostics_channel';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  eventPublisherResilienceSettings,
  type EventPublisherResilienceSettings,
} from './event-publisher-resilience.settings';
import { ResilientEventPublisher } from './resilient-event-publisher';

const event: EventEnvelope = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' as UuidV7,
  type: 'audit.trace.requested',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as UuidV7,
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: null,
  payload: {},
};

const transient = () => new ExternalFailure({ kind: 'transient', operation: 'publish' });
const failTransient: ScriptedPublishStep = async () => Promise.reject(transient());

function settings(
  overrides: {
    bulkhead?: Partial<EventPublisherResilienceSettings['bulkhead']>;
    circuitBreaker?: Partial<EventPublisherResilienceSettings['circuitBreaker']>;
    retry?: Partial<EventPublisherResilienceSettings['retry']>;
    rateLimit?: Partial<EventPublisherResilienceSettings['rateLimit']>;
    attemptTimeoutMs?: number;
  } = {},
): EventPublisherResilienceSettings {
  return {
    ...eventPublisherResilienceSettings,
    bulkhead: { ...eventPublisherResilienceSettings.bulkhead, ...overrides.bulkhead },
    circuitBreaker: {
      ...eventPublisherResilienceSettings.circuitBreaker,
      ...overrides.circuitBreaker,
    },
    retry: { ...eventPublisherResilienceSettings.retry, ...overrides.retry },
    rateLimit: { ...eventPublisherResilienceSettings.rateLimit, ...overrides.rateLimit },
    attemptTimeoutMs:
      overrides.attemptTimeoutMs ?? eventPublisherResilienceSettings.attemptTimeoutMs,
  };
}

async function outcomeKind(promise: Promise<void>): Promise<string> {
  try {
    await promise;
    return 'success';
  } catch (error) {
    return error instanceof ExternalFailure ? error.kind : 'unknown';
  }
}

describe('ResilientEventPublisher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes a successful event once with its stable identifier', async () => {
    const adapter = new ScriptedEventPublisher([async () => undefined]);
    const publisher = new ResilientEventPublisher(adapter);

    await publisher.publish(event, new AbortController().signal, Date.now() + 10_000);

    expect(adapter.attempts.map(({ eventId }) => eventId)).toEqual([event.eventId]);
  });

  it('uses factor-two full jitter capped at the named maximum', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const attemptedAt: number[] = [];
    const adapter = new ScriptedEventPublisher([
      ...Array.from({ length: 4 }, () => async () => {
        attemptedAt.push(Date.now());
        throw transient();
      }),
      async () => {
        attemptedAt.push(Date.now());
      },
    ]);
    const publisher = new ResilientEventPublisher(
      adapter,
      settings({ retry: { maxDelayMs: 250 } }),
      Date.now,
      () => 1,
    );
    for (let index = 0; index < 39; index += 1) publisher.retryBudget.recordCall();

    const published = publisher.publish(event, new AbortController().signal, 10_000);
    await vi.advanceTimersByTimeAsync(800);
    await published;

    expect(attemptedAt).toEqual([0, 100, 300, 550, 800]);
    expect(adapter.attempts.every(({ eventId }) => eventId === event.eventId)).toBe(true);
  });

  it('honours Retry-After only when it and the next attempt fit the caller deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const attemptedAt: number[] = [];
    const retryAfter = new ExternalFailure({
      kind: 'transient',
      operation: 'publish',
      retryAfterMs: 300,
    });
    const adapter = new ScriptedEventPublisher([
      async () => {
        attemptedAt.push(Date.now());
        throw retryAfter;
      },
      async () => {
        attemptedAt.push(Date.now());
      },
    ]);
    const publisher = new ResilientEventPublisher(adapter);

    const recovered = publisher.publish(event, new AbortController().signal, 2_300);
    await vi.advanceTimersByTimeAsync(300);
    await recovered;
    expect(attemptedAt).toEqual([0, 300]);

    const denied = new ResilientEventPublisher(
      new ScriptedEventPublisher([async () => Promise.reject(retryAfter)]),
    );
    await expect(denied.publish(event, new AbortController().signal, 2_299)).rejects.toMatchObject({
      kind: 'exhausted',
    });
  });

  it('denies retries after the rolling budget is spent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new ScriptedEventPublisher([failTransient]);
    const publisher = new ResilientEventPublisher(
      adapter,
      settings({ retry: { lowTrafficRetryReserve: 1 }, attemptTimeoutMs: 50 }),
      Date.now,
      () => 0,
    );

    const result = outcomeKind(publisher.publish(event, new AbortController().signal, 10_000));
    await vi.runAllTimersAsync();

    expect(await result).toBe('exhausted');
    expect(adapter.attempts).toHaveLength(2);
    expect(publisher.retryBudget.state).toEqual({ calls: 1, retries: 1, allowance: 1 });
  });

  it.each(['rejected', 'unauthorized', 'exhausted', 'forbidden'] as const)(
    'does not retry a non-transient %s failure',
    async (kind) => {
      const adapter = new ScriptedEventPublisher([
        async () =>
          Promise.reject(new ExternalFailure({ kind, operation: 'event-publisher.publish' })),
      ]);
      const publisher = new ResilientEventPublisher(adapter);

      await expect(
        publisher.publish(event, new AbortController().signal, Date.now() + 10_000),
      ).rejects.toMatchObject({ kind });
      expect(adapter.attempts).toHaveLength(1);
      expect(publisher.retryBudget.state.retries).toBe(0);
    },
  );

  it('aborts a hanging attempt at the per-attempt timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let attemptSignal: AbortSignal | undefined;
    const adapter = new ScriptedEventPublisher([
      async (_event, signal) => {
        attemptSignal = signal;
        return new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
      },
    ]);
    const publisher = new ResilientEventPublisher(
      adapter,
      settings({ retry: { attempts: 1 }, attemptTimeoutMs: 2_000 }),
    );

    const result = outcomeKind(publisher.publish(event, new AbortController().signal, 10_000));
    await vi.advanceTimersByTimeAsync(2_000);

    expect(await result).toBe('exhausted');
    expect(attemptSignal?.aborted).toBe(true);
  });

  it('bounds active and queued calls and removes a cancelled waiter', async () => {
    const controllers = [new AbortController(), new AbortController(), new AbortController()];
    const adapter = new ScriptedEventPublisher([
      async (_event, signal) =>
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    ]);
    const publisher = new ResilientEventPublisher(
      adapter,
      settings({
        bulkhead: { maxConcurrent: 1, maxQueue: 1, queueTimeoutMs: 10_000 },
        retry: { attempts: 1 },
      }),
    );

    const active = outcomeKind(publisher.publish(event, controllers[0]!.signal));
    await vi.waitFor(() => expect(publisher.bulkhead.active).toBe(1));
    const queued = outcomeKind(publisher.publish(event, controllers[1]!.signal));
    await vi.waitFor(() => expect(publisher.bulkhead.queued).toBe(1));
    expect(await outcomeKind(publisher.publish(event, controllers[2]!.signal))).toBe('exhausted');

    controllers[1]!.abort(new Error('queue cancelled'));
    expect(await queued).toBe('cancelled');
    expect(publisher.bulkhead.queued).toBe(0);
    controllers[0]!.abort(new Error('active cancelled'));
    expect(await active).toBe('cancelled');
  });

  it('opens on logical failures, rejects fast, and closes after one successful half-open probe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new ScriptedEventPublisher([
      failTransient,
      failTransient,
      async () => undefined,
    ]);
    const publisher = new ResilientEventPublisher(
      adapter,
      settings({
        circuitBreaker: {
          minimumCalls: 2,
          windowMs: 10_000,
          openDurationMs: 100,
          halfOpenMaxCalls: 1,
        },
        retry: { attempts: 1 },
      }),
    );

    expect(await outcomeKind(publisher.publish(event, new AbortController().signal))).toBe(
      'exhausted',
    );
    expect(await outcomeKind(publisher.publish(event, new AbortController().signal))).toBe(
      'exhausted',
    );
    expect(publisher.circuitBreaker.state).toBe('open');
    expect(await outcomeKind(publisher.publish(event, new AbortController().signal))).toBe(
      'exhausted',
    );
    expect(adapter.attempts).toHaveLength(2);

    vi.setSystemTime(100);
    expect(publisher.circuitBreaker.state).toBe('half-open');
    await expect(publisher.publish(event, new AbortController().signal)).resolves.toBeUndefined();
    expect(publisher.circuitBreaker.state).toBe('closed');
  });

  it('counts slow successful logical calls as breaker failures without changing their result', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const slowSuccess: ScriptedPublishStep = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    };
    const adapter = new ScriptedEventPublisher([slowSuccess]);
    const publisher = new ResilientEventPublisher(
      adapter,
      settings({
        circuitBreaker: { minimumCalls: 2, slowCallThresholdMs: 50 },
        retry: { attempts: 1 },
        attemptTimeoutMs: 100,
      }),
    );

    const first = publisher.publish(event, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(50);
    await first;
    const second = publisher.publish(event, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(50);
    await second;

    expect(publisher.circuitBreaker.state).toBe('open');
    expect(await outcomeKind(publisher.publish(event, new AbortController().signal))).toBe(
      'exhausted',
    );
    expect(adapter.attempts).toHaveLength(2);
  });

  it('rejects the attempt above the named rate without waiting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = new ScriptedEventPublisher([async () => undefined]);
    const publisher = new ResilientEventPublisher(
      adapter,
      settings({ rateLimit: { limit: 1, intervalMs: 1_000, maxWaitMs: 0 } }),
    );

    await publisher.publish(event, new AbortController().signal);
    expect(await outcomeKind(publisher.publish(event, new AbortController().signal))).toBe(
      'exhausted',
    );
    expect(adapter.attempts).toHaveLength(1);
  });

  it('emits the named rejecting fallback and never turns failure into success', async () => {
    const fallbackChannel = channel('nestjs:resilience:fallback');
    const events: ResilienceFallbackEvent[] = [];
    const listener = (message: unknown) => events.push(message as ResilienceFallbackEvent);
    fallbackChannel.subscribe(listener);
    try {
      const publisher = new ResilientEventPublisher(
        new ScriptedEventPublisher([failTransient]),
        settings({ retry: { attempts: 1 } }),
      );

      await expect(publisher.publish(event, new AbortController().signal)).rejects.toMatchObject({
        kind: 'exhausted',
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'fallback',
          policy: 'event-publisher.leave-outbox-pending',
        }),
      );
    } finally {
      fallbackChannel.unsubscribe(listener);
    }
  });
});
