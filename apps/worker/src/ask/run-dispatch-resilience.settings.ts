export const runDispatchResilienceSettings = Object.freeze({
  dependency: 'run-dispatch',
  bulkhead: { maxConcurrent: 3, maxQueue: 6, queueTimeout: 1000 },
  circuitBreaker: {
    failureRateThreshold: 50,
    minimumCalls: 20,
    slidingWindow: { type: 'time' as const, size: 10000 },
    openDuration: 30000,
    halfOpenMaxCalls: 1,
  },
  rateLimit: { limit: 10, interval: 1000, maxWait: 0 },
  slowCallThresholdMs: 4000,
  policies: {
    fallback: 'run-dispatch.fail-closed',
    bulkhead: 'run-dispatch.bulkhead',
    circuitBreaker: 'run-dispatch.circuit-breaker',
    retry: 'run-dispatch.single-attempt',
    rateLimit: 'run-dispatch.rate-limit',
    timeout: 'run-dispatch.attempt-timeout',
  },
  attemptTimeoutMs: 5000,
  admissionTimeoutMs: 40000,
  activeTimeoutMs: 10000,
});
