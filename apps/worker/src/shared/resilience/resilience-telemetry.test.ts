import type { ResilienceEvent } from '@nestjs/resilience';
import { metrics } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResilienceTelemetry, safePolicyAttributes } from './resilience-telemetry';

describe('safePolicyAttributes', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['listing-source', 'raw-snapshot-store'])(
    'maps bounded %s policies without source IDs or raw errors',
    (dependency) => {
      const attributes = safePolicyAttributes({
        type: 'fallback',
        policy: `${dependency}.${dependency === 'listing-source' ? 'pause-at-checkpoint' : 'redeliver-without-parsing'}`,
        source: 'source-id cursor URL object key',
        error: new Error('secret payload'),
      });
      expect(attributes?.['dependency.name']).toBe(dependency);
      expect(JSON.stringify(attributes)).not.toMatch(
        /cursor|URL|object key|source-id|secret|payload/,
      );
    },
  );

  it('keeps only named low-cardinality retry fields', () => {
    const event: ResilienceEvent = {
      type: 'retry',
      policy: 'event-publisher.retry',
      source: 'https://user:secret@broker/private',
      attempt: 2,
      delayMs: 100,
      error: new Error('payload token destination'),
    };

    const attributes = safePolicyAttributes(event);

    expect(attributes).toEqual({
      'dependency.name': 'event-publisher',
      'resilience.policy.name': 'event-publisher.retry',
      'resilience.event.type': 'retry',
      'resilience.retry.attempt': 2,
      'resilience.retry.delay_ms': 100,
    });
    expect(JSON.stringify(attributes)).not.toMatch(/secret|payload|destination|https/i);
  });

  it('ignores diagnostics from unrelated policies', () => {
    expect(
      safePolicyAttributes({
        type: 'timeout',
        policy: 'other-dependency.timeout',
        timeoutMs: 5,
      }),
    ).toBeUndefined();
  });

  it('sanitizes every supported policy event shape', () => {
    const events: ResilienceEvent[] = [
      {
        type: 'timeout',
        policy: 'event-publisher.attempt-timeout',
        source: 'secret endpoint',
        timeoutMs: 2_000,
      },
      {
        type: 'circuit-open',
        policy: 'event-publisher.circuit-breaker',
        from: 'closed',
        to: 'open',
      },
      {
        type: 'circuit-half-open',
        policy: 'event-publisher.circuit-breaker',
        from: 'open',
        to: 'half-open',
      },
      {
        type: 'circuit-closed',
        policy: 'event-publisher.circuit-breaker',
        from: 'half-open',
        to: 'closed',
      },
      {
        type: 'circuit-rejected',
        policy: 'event-publisher.circuit-breaker',
        retryAfterMs: 30_000,
      },
      {
        type: 'bulkhead-rejected',
        policy: 'event-publisher.bulkhead',
        reason: 'full',
        active: 10,
        queued: 15,
      },
      {
        type: 'rate-limited',
        policy: 'event-publisher.rate-limit',
        retryAfterMs: 10,
      },
      {
        type: 'fallback',
        policy: 'event-publisher.leave-outbox-pending',
        source: 'secret endpoint',
        error: new Error('credential and payload'),
      },
    ];

    for (const event of events) {
      const attributes = safePolicyAttributes(event);
      expect(attributes).toBeDefined();
      expect(JSON.stringify(attributes)).not.toMatch(/secret|credential|payload|endpoint/i);
    }
  });

  it('keeps exact delay and retry-after values out of counter attributes', () => {
    const add = vi.fn();
    vi.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add }),
    } as never);
    const telemetry = new ResilienceTelemetry();

    telemetry.record({
      type: 'retry',
      policy: 'event-publisher.retry',
      attempt: 2,
      delayMs: 137,
      error: new Error('private failure'),
    });
    telemetry.record({
      type: 'circuit-rejected',
      policy: 'event-publisher.circuit-breaker',
      retryAfterMs: 29_843,
    });

    expect(add).toHaveBeenNthCalledWith(1, 1, {
      'dependency.name': 'event-publisher',
      'resilience.policy.name': 'event-publisher.retry',
      'resilience.event.type': 'retry',
      'resilience.retry.attempt': 2,
    });
    expect(add).toHaveBeenNthCalledWith(2, 1, {
      'dependency.name': 'event-publisher',
      'resilience.policy.name': 'event-publisher.circuit-breaker',
      'resilience.event.type': 'circuit-rejected',
    });
  });

  it('does not change dependency outcomes when telemetry recording fails', () => {
    vi.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({
        add: () => {
          throw new Error('exporter unavailable');
        },
      }),
    } as never);
    const telemetry = new ResilienceTelemetry();

    expect(() =>
      telemetry.record({
        type: 'timeout',
        policy: 'event-publisher.attempt-timeout',
        timeoutMs: 2_000,
      }),
    ).not.toThrow();
  });
});
