/** One attempt per worker admission; durable checkpoint/receipt replay belongs to a fresh claim. */
export const runExecutorResilienceSettings = Object.freeze({
  dependency: 'run-executor',
  policies: Object.freeze({
    fallback: 'run-executor.fail-closed',
    bulkhead: 'run-executor.bulkhead',
    circuitBreaker: 'run-executor.circuit-breaker',
    retry: 'run-executor.single-attempt',
    rateLimit: 'run-executor.rate-limit',
    timeout: 'run-executor.attempt-timeout',
  }),
  bulkhead: Object.freeze({ maxConcurrent: 3, maxQueue: 6, queueTimeoutMs: 1000 }),
  circuitBreaker: Object.freeze({
    failureRateThreshold: 50,
    minimumCalls: 20,
    windowMs: 10000,
    openDurationMs: 30000,
    halfOpenMaxCalls: 1,
    slowCallThresholdMs: 20000,
  }),
  retry: Object.freeze({ attempts: 1 }),
  rateLimit: Object.freeze({ limit: 10, intervalMs: 1000, maxWaitMs: 0 }),
  /**
   * Covers the AI graph deadline (`askExecutionBudget.graphDeadlineMs`) plus transport, and leaves
   * the completion call its own five-second attempt inside `askExecutionBudget.claimedWorkMs`.
   */
  attemptTimeoutMs: 22000,
  commandDeadlineMs: 10000,
  cleanupTimeoutMs: 2000,
});
export type RunExecutorResilienceSettings = typeof runExecutorResilienceSettings;
