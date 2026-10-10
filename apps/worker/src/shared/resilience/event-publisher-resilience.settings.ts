export const EVENT_PUBLISHER_DEPENDENCY = 'event-publisher';

export interface EventPublisherResilienceSettings {
  readonly dependency: string;
  readonly policies: Readonly<{
    fallback: string;
    bulkhead: string;
    circuitBreaker: string;
    retry: string;
    rateLimit: string;
    timeout: string;
  }>;
  readonly bulkhead: Readonly<{ maxConcurrent: number; maxQueue: number; queueTimeoutMs: number }>;
  readonly circuitBreaker: Readonly<{
    failureRateThreshold: number;
    minimumCalls: number;
    windowMs: number;
    openDurationMs: number;
    halfOpenMaxCalls: number;
    slowCallThresholdMs: number;
  }>;
  readonly retry: Readonly<{
    attempts: number;
    baseDelayMs: number;
    factor: number;
    maxDelayMs: number;
    budgetWindowMs: number;
    budgetRatio: number;
    lowTrafficRetryReserve: number;
  }>;
  readonly rateLimit: Readonly<{ limit: number; intervalMs: number; maxWaitMs: number }>;
  readonly attemptTimeoutMs: number;
}

export const eventPublisherResilienceSettings: EventPublisherResilienceSettings = Object.freeze({
  dependency: EVENT_PUBLISHER_DEPENDENCY,
  policies: Object.freeze({
    fallback: 'event-publisher.leave-outbox-pending',
    bulkhead: 'event-publisher.bulkhead',
    circuitBreaker: 'event-publisher.circuit-breaker',
    retry: 'event-publisher.retry',
    rateLimit: 'event-publisher.rate-limit',
    timeout: 'event-publisher.attempt-timeout',
  }),
  bulkhead: Object.freeze({ maxConcurrent: 10, maxQueue: 15, queueTimeoutMs: 1_000 }),
  circuitBreaker: Object.freeze({
    failureRateThreshold: 50,
    minimumCalls: 20,
    windowMs: 10_000,
    openDurationMs: 30_000,
    halfOpenMaxCalls: 1,
    slowCallThresholdMs: 1_500,
  }),
  retry: Object.freeze({
    attempts: 5,
    baseDelayMs: 100,
    factor: 2,
    maxDelayMs: 30_000,
    budgetWindowMs: 60_000,
    budgetRatio: 0.1,
    lowTrafficRetryReserve: 1,
  }),
  rateLimit: Object.freeze({ limit: 100, intervalMs: 1_000, maxWaitMs: 0 }),
  attemptTimeoutMs: 2_000,
});
