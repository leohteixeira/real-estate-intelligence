import { describe, expect, it } from 'vitest';

import { eventPublisherResilienceSettings } from './event-publisher-resilience.settings';

describe('eventPublisherResilienceSettings', () => {
  it('pins every D-005 calibration in one named configuration', () => {
    expect(eventPublisherResilienceSettings).toEqual({
      dependency: 'event-publisher',
      policies: {
        fallback: 'event-publisher.leave-outbox-pending',
        bulkhead: 'event-publisher.bulkhead',
        circuitBreaker: 'event-publisher.circuit-breaker',
        retry: 'event-publisher.retry',
        rateLimit: 'event-publisher.rate-limit',
        timeout: 'event-publisher.attempt-timeout',
      },
      bulkhead: { maxConcurrent: 10, maxQueue: 15, queueTimeoutMs: 1_000 },
      circuitBreaker: {
        failureRateThreshold: 50,
        minimumCalls: 20,
        windowMs: 10_000,
        openDurationMs: 30_000,
        halfOpenMaxCalls: 1,
        slowCallThresholdMs: 1_500,
      },
      retry: {
        attempts: 5,
        baseDelayMs: 100,
        factor: 2,
        maxDelayMs: 30_000,
        budgetWindowMs: 60_000,
        budgetRatio: 0.1,
        lowTrafficRetryReserve: 1,
      },
      rateLimit: { limit: 100, intervalMs: 1_000, maxWaitMs: 0 },
      attemptTimeoutMs: 2_000,
    });
  });
});
