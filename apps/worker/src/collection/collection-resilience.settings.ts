import type { EventPublisherResilienceSettings } from '../shared/resilience/event-publisher-resilience.settings';

export type CollectionResilienceSettings = Omit<EventPublisherResilienceSettings, 'rateLimit'> & {
  readonly rateMaxWaitMs: number;
};

function settings(dependency: string, source: boolean): CollectionResilienceSettings {
  return Object.freeze({
    dependency,
    policies: Object.freeze({
      fallback: `${dependency}.${source ? 'pause-at-checkpoint' : 'redeliver-without-parsing'}`,
      bulkhead: `${dependency}.bulkhead`,
      circuitBreaker: `${dependency}.circuit-breaker`,
      retry: `${dependency}.retry`,
      rateLimit: `${dependency}.register-rate-limit`,
      timeout: `${dependency}.attempt-timeout`,
    }),
    bulkhead: Object.freeze({
      maxConcurrent: source ? 1 : 4,
      maxQueue: source ? 4 : 8,
      queueTimeoutMs: 1_000,
    }),
    circuitBreaker: Object.freeze({
      failureRateThreshold: 50,
      minimumCalls: 20,
      windowMs: 10_000,
      openDurationMs: 30_000,
      halfOpenMaxCalls: 1,
      slowCallThresholdMs: source ? 30_000 : 5_000,
    }),
    retry: Object.freeze({
      attempts: 5,
      baseDelayMs: source ? 1_000 : 100,
      factor: 2,
      maxDelayMs: source ? 300_000 : 30_000,
      budgetWindowMs: 60_000,
      budgetRatio: 0.1,
      lowTrafficRetryReserve: 1,
    }),
    attemptTimeoutMs: source ? 30_000 : 5_000,
    rateMaxWaitMs: source ? 300_000 : 0,
  });
}

export const listingSourceResilienceSettings = settings('listing-source', true);
export const rawSnapshotStoreResilienceSettings = settings('raw-snapshot-store', false);
