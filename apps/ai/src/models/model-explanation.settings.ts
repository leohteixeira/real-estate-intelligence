export const modelExplanationSettings = Object.freeze({
  /** Anthropic model identifier, sent as written. There is no secondary model (ADR 0029). */
  model: 'claude-haiku-5-5',
  route: 'anthropic-direct' as const,
  provider: 'anthropic' as const,
  explanationTokens: 224,
  timeoutMs: 3500,
  slowCallThresholdMs: 2500,
  retry: {
    attempts: 2,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    maxRetryAfterMs: 30000,
    budgetWindowMs: 10000,
    budgetRatio: 0.1,
    lowTrafficRetryReserve: 2,
  },
  policies: {
    bulkhead: 'model-explanation.bulkhead',
    circuitBreaker: 'model-explanation.circuit-breaker',
    retry: 'model-explanation.transient-retry',
    rateLimit: 'model-explanation.rate-limit',
    timeout: 'model-explanation.attempt-timeout',
  },
  bulkhead: { maxConcurrent: 3, maxQueue: 6, queueTimeout: 500 },
  breaker: {
    failureRateThreshold: 50,
    minimumCalls: 20,
    slidingWindow: { type: 'time' as const, size: 10000 },
    openDuration: 30000,
    halfOpenMaxCalls: 1,
  },
  rateLimit: { limit: 10, interval: 1000, maxWait: 0 },
});
