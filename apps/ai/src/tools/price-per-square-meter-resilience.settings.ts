export const priceToolResilienceSettings = Object.freeze({
  policies: {
    fallback: 'price-tool.fail-closed',
    bulkhead: 'price-tool.bulkhead',
    circuitBreaker: 'price-tool.circuit-breaker',
    retry: 'price-tool.single-attempt',
    rateLimit: 'price-tool.rate-limit',
    timeout: 'price-tool.attempt-timeout',
  },
  timeoutMs: 3500,
  graphDeadlineMs: 4500,
  bulkhead: { maxConcurrent: 3, maxQueue: 6, queueTimeout: 500 },
  circuitBreaker: {
    failureRateThreshold: 50,
    minimumCalls: 20,
    slidingWindow: { type: 'time' as const, size: 10000 },
    openDuration: 30000,
    halfOpenMaxCalls: 1,
  },
  rateLimit: { limit: 10, interval: 1000, maxWait: 0 },
  slowCallThresholdMs: 2500,
});
