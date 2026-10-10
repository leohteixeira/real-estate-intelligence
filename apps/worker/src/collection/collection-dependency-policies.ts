import {
  BulkheadPolicy,
  CircuitOpenError,
  FallbackPolicy,
  OutboundRateLimitError,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
  ResilienceTimeoutError,
  RetryPolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import { ExternalFailure, isExternalFailure, isRetryableExternalFailure } from '@rei/application';
import type { SourceRatePolicy } from '@rei/domain';

import { RetryBudget } from '../shared/resilience/retry-budget';
import { SlowCallCircuitBreaker } from '../shared/resilience/slow-call-circuit-breaker';
import type { CollectionResilienceSettings } from './collection-resilience.settings';

/** Dependency-local public policy composition; the deadline covers every queue and wait. */
export class CollectionDependencyPolicies {
  public readonly bulkhead: BulkheadPolicy;
  public readonly breaker: SlowCallCircuitBreaker;
  public readonly retryBudget: RetryBudget;
  private readonly fallback: FallbackPolicy<never>;
  private rate: OutboundRateLimitPolicy | undefined;
  private rateIdentity = '';
  private notBefore = 0;

  public constructor(
    private readonly settings: CollectionResilienceSettings,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {
    this.bulkhead = new BulkheadPolicy({
      name: settings.policies.bulkhead,
      maxConcurrent: settings.bulkhead.maxConcurrent,
      maxQueue: settings.bulkhead.maxQueue,
      queueTimeout: settings.bulkhead.queueTimeoutMs,
    });
    this.breaker = new SlowCallCircuitBreaker(
      {
        name: settings.policies.circuitBreaker,
        failureRateThreshold: settings.circuitBreaker.failureRateThreshold,
        minimumCalls: settings.circuitBreaker.minimumCalls,
        slidingWindow: { type: 'time', size: settings.circuitBreaker.windowMs },
        openDuration: settings.circuitBreaker.openDurationMs,
        halfOpenMaxCalls: settings.circuitBreaker.halfOpenMaxCalls,
        recordIf: (error) =>
          isRetryableExternalFailure(error) || error instanceof ResilienceTimeoutError,
      },
      settings.circuitBreaker.slowCallThresholdMs,
      now,
    );
    this.retryBudget = new RetryBudget(
      {
        windowMs: settings.retry.budgetWindowMs,
        ratio: settings.retry.budgetRatio,
        lowTrafficReserve: settings.retry.lowTrafficRetryReserve,
      },
      now,
    );
    this.fallback = new FallbackPolicy<never>(
      (error, { signal }) => Promise.reject(this.failure(error, signal)),
      { name: settings.policies.fallback },
    );
  }

  public configureRate(rate: SourceRatePolicy): void {
    const identity = JSON.stringify(rate);
    if (identity === this.rateIdentity) return;
    this.rateIdentity = identity;
    this.rate =
      rate.status === 'configured'
        ? new OutboundRateLimitPolicy({
            name: this.settings.policies.rateLimit,
            limit: rate.limit,
            interval: rate.windowSeconds * 1_000,
            maxWait: this.settings.rateMaxWaitMs,
          })
        : undefined;
  }

  public async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    deadlineAt = Number.POSITIVE_INFINITY,
  ): Promise<T> {
    return this.withinDeadline(
      (scoped) => this.executePolicies(operation, scoped, deadlineAt),
      signal,
      deadlineAt,
    );
  }

  /** Starts before registry I/O; abort also bounds a persistence adapter that settles late. */
  public async withinDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const remaining = deadlineAt - this.now();
    const timer =
      Number.isFinite(remaining) && remaining > 0
        ? setTimeout(
            () =>
              controller.abort(
                new ExternalFailure({ kind: 'exhausted', operation: this.settings.dependency }),
              ),
            remaining,
          )
        : undefined;
    if (remaining <= 0)
      controller.abort(
        new ExternalFailure({ kind: 'exhausted', operation: this.settings.dependency }),
      );
    const scoped = controller.signal;
    let rejectAbort: (() => void) | undefined;
    try {
      scoped.throwIfAborted();
      const abort = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(this.failure(scoped.reason, signal, scoped.aborted));
        scoped.addEventListener('abort', rejectAbort, { once: true });
      });
      return await Promise.race([operation(scoped), abort]);
    } catch (error) {
      throw this.failure(error, signal, scoped.aborted);
    } finally {
      if (timer) clearTimeout(timer);
      if (rejectAbort) scoped.removeEventListener('abort', rejectAbort);
      signal.removeEventListener('abort', cancel);
    }
  }

  private async executePolicies<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    scoped: AbortSignal,
    deadlineAt: number,
  ): Promise<T> {
    this.retryBudget.recordCall();
    const delays = new WeakMap<object, number>();
    const retry = new RetryPolicy({
      name: this.settings.policies.retry,
      attempts: this.settings.retry.attempts,
      retryIf: (error, attempt) => {
        if (
          scoped.aborted ||
          !(isRetryableExternalFailure(error) || error instanceof ResilienceTimeoutError)
        )
          return false;
        const delay =
          error instanceof ExternalFailure && error.retryAfterMs !== undefined
            ? error.retryAfterMs
            : Math.min(
                this.settings.retry.maxDelayMs,
                this.settings.retry.baseDelayMs * this.settings.retry.factor ** (attempt - 1),
              ) * Math.min(1, Math.max(0, this.random()));
        if (
          this.now() + delay + this.settings.attemptTimeoutMs > deadlineAt ||
          !this.retryBudget.tryTake()
        )
          return false;
        delays.set(error, delay);
        return true;
      },
      backoff: (_attempt, error) =>
        typeof error === 'object' && error !== null ? (delays.get(error) ?? 0) : 0,
    });
    const timeout = new TimeoutPolicy({
      name: this.settings.policies.timeout,
      timeout: this.settings.attemptTimeoutMs,
    });
    const attemptPolicies = this.rate ? ResiliencePolicy.wrap(this.rate, timeout) : timeout;
    return this.fallback.execute(
      ({ signal: outer }) =>
        this.bulkhead.execute(
          ({ signal: queued }) =>
            this.breaker.execute(
              (inner) =>
                retry.execute(
                  async ({ signal: retrySignal }) => {
                    await this.waitForAdmission(retrySignal);
                    return attemptPolicies.execute(
                      async ({ signal: attempt }) => {
                        attempt.throwIfAborted();
                        if (this.now() >= deadlineAt)
                          throw new ExternalFailure({
                            kind: 'exhausted',
                            operation: this.settings.dependency,
                          });
                        try {
                          return await operation(attempt);
                        } catch (error) {
                          // Record before retry admission, including the final permitted attempt.
                          if (isRetryableExternalFailure(error) && error.retryAfterMs !== undefined)
                            this.notBefore = Math.max(
                              this.notBefore,
                              this.now() + error.retryAfterMs,
                            );
                          throw error;
                        }
                      },
                      { signal: retrySignal, source: this.settings.dependency },
                    );
                  },
                  { signal: inner, source: this.settings.dependency },
                ),
              queued,
              this.settings.dependency,
            ),
          { signal: outer, source: this.settings.dependency },
        ),
      { signal: scoped, source: this.settings.dependency },
    );
  }

  private async waitForAdmission(signal: AbortSignal): Promise<void> {
    for (;;) {
      signal.throwIfAborted();
      const remaining = this.notBefore - this.now();
      if (remaining <= 0) return;
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', cancel);
          resolve();
        }, remaining);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
    }
  }

  private failure(error: unknown, signal: AbortSignal, deadlineExpired = false): ExternalFailure {
    if (signal.aborted)
      return new ExternalFailure({ kind: 'cancelled', operation: this.settings.dependency });
    if (deadlineExpired)
      return new ExternalFailure({
        kind: 'exhausted',
        operation: this.settings.dependency,
        ...(this.notBefore > this.now() ? { retryAfterMs: this.notBefore - this.now() } : {}),
      });
    if (isExternalFailure(error) && error.kind !== 'transient') return error;
    return new ExternalFailure({
      kind: 'exhausted',
      operation: this.settings.dependency,
      ...((error instanceof CircuitOpenError || error instanceof OutboundRateLimitError) &&
      error.retryAfterMs !== undefined
        ? { retryAfterMs: Math.max(error.retryAfterMs, this.notBefore - this.now()) }
        : this.notBefore > this.now() ||
            (isExternalFailure(error) && error.retryAfterMs !== undefined)
          ? { retryAfterMs: Math.max(0, this.notBefore - this.now()) }
          : {}),
    });
  }
}
