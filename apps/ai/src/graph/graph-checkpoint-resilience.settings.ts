export const graphCheckpointResilienceSettings = Object.freeze({
  policies: {
    fallback: 'checkpoint.fail-closed',
    bulkhead: 'checkpoint.bulkhead',
    circuitBreaker: 'checkpoint.circuit-breaker',
    retry: 'checkpoint.single-attempt',
    rateLimit: 'checkpoint.rate-limit',
    timeout: 'checkpoint.attempt-timeout',
  },
  timeoutMs: 3500,
  bulkhead: { maxConcurrent: 3, maxQueue: 6, queueTimeout: 500 },
  circuitBreaker: {
    failureRateThreshold: 50,
    minimumCalls: 20,
    slidingWindow: { type: 'time' as const, size: 10000 },
    openDuration: 30000,
    halfOpenMaxCalls: 1,
  },
  rateLimit: { limit: 50, interval: 1000, maxWait: 0 },
  slowCallThresholdMs: 2500,
});
