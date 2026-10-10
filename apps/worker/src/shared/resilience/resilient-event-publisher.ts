import {
  BulkheadFullError,
  BulkheadPolicy,
  CircuitBreakerPolicy,
  CircuitOpenError,
  FallbackPolicy,
  OutboundRateLimitError,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
  ResilienceTimeoutError,
  RetryPolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import {
  ExternalFailure,
  isExternalFailure,
  isRetryableExternalFailure,
  type EventEnvelope,
  type EventPublisher,
} from '@rei/application';

import {
  eventPublisherResilienceSettings,
  type EventPublisherResilienceSettings,
} from './event-publisher-resilience.settings';
import { RetryBudget } from './retry-budget';
import { SlowCallCircuitBreaker } from './slow-call-circuit-breaker';

const SOURCE = 'OutboxRelayJob.publishClaim';

function terminalFailure(error: unknown, signal: AbortSignal): ExternalFailure {
  if (signal.aborted) {
    return new ExternalFailure({
      kind: 'cancelled',
      operation: 'event-publisher.publish',
    });
  }
  if (error instanceof BulkheadFullError) {
    return new ExternalFailure({ kind: 'exhausted', operation: 'event-publisher.publish' });
  }
  if (error instanceof OutboundRateLimitError) {
    return new ExternalFailure({
      kind: 'exhausted',
      operation: 'event-publisher.publish',
      retryAfterMs: error.retryAfterMs,
    });
  }
  if (error instanceof CircuitOpenError) {
    return new ExternalFailure({
      kind: 'exhausted',
      operation: 'event-publisher.publish',
      retryAfterMs: error.retryAfterMs,
    });
  }
  if (error instanceof ResilienceTimeoutError) {
    return new ExternalFailure({ kind: 'exhausted', operation: 'event-publisher.publish' });
  }
  if (isExternalFailure(error)) {
    return error.kind === 'transient'
      ? new ExternalFailure({ kind: 'exhausted', operation: error.operation })
      : error;
  }
  return new ExternalFailure({ kind: 'rejected', operation: 'event-publisher.publish' });
}

/** ADR-ordered resilience wrapper used only for relay-facing event publication. */
export class ResilientEventPublisher implements EventPublisher {
  readonly #fallback: FallbackPolicy<never>;
  readonly #bulkhead: BulkheadPolicy;
  readonly #circuitBreaker: SlowCallCircuitBreaker;
  readonly #rateLimit: OutboundRateLimitPolicy;
  readonly #timeout: TimeoutPolicy;
  readonly #retryBudget: RetryBudget;

  public constructor(
    private readonly adapter: EventPublisher,
    private readonly settings: EventPublisherResilienceSettings = eventPublisherResilienceSettings,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {
    const { policies } = settings;
    this.#fallback = new FallbackPolicy<never>(
      (error, { signal }) => Promise.reject(terminalFailure(error, signal)),
      { name: policies.fallback },
    );
    this.#bulkhead = new BulkheadPolicy({
      name: policies.bulkhead,
      maxConcurrent: settings.bulkhead.maxConcurrent,
      maxQueue: settings.bulkhead.maxQueue,
      queueTimeout: settings.bulkhead.queueTimeoutMs,
    });
    this.#circuitBreaker = new SlowCallCircuitBreaker(
      {
        name: policies.circuitBreaker,
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
    this.#rateLimit = new OutboundRateLimitPolicy({
      name: policies.rateLimit,
      limit: settings.rateLimit.limit,
      interval: settings.rateLimit.intervalMs,
      maxWait: settings.rateLimit.maxWaitMs,
    });
    this.#timeout = new TimeoutPolicy({
      name: policies.timeout,
      timeout: settings.attemptTimeoutMs,
    });
    this.#retryBudget = new RetryBudget(
      {
        windowMs: settings.retry.budgetWindowMs,
        ratio: settings.retry.budgetRatio,
        lowTrafficReserve: settings.retry.lowTrafficRetryReserve,
      },
      now,
    );
  }

  public get bulkhead(): BulkheadPolicy {
    return this.#bulkhead;
  }

  public get circuitBreaker(): CircuitBreakerPolicy {
    return this.#circuitBreaker.policy;
  }

  public get retryBudget(): RetryBudget {
    return this.#retryBudget;
  }

  public async publish(
    event: EventEnvelope,
    signal: AbortSignal,
    deadlineAt = Number.POSITIVE_INFINITY,
  ): Promise<void> {
    this.#retryBudget.recordCall();
    const retry = this.retryPolicy(deadlineAt);
    const attempts = ResiliencePolicy.wrap(retry, this.#rateLimit, this.#timeout);

    try {
      await this.#fallback.execute(
        ({ signal: fallbackSignal }) =>
          this.#bulkhead.execute(
            ({ signal: bulkheadSignal }) =>
              this.#circuitBreaker.execute(
                (breakerSignal) =>
                  attempts.execute(
                    ({ signal: attemptSignal }) => this.adapter.publish(event, attemptSignal),
                    { signal: breakerSignal, source: SOURCE },
                  ),
                bulkheadSignal,
                SOURCE,
              ),
            { signal: fallbackSignal, source: SOURCE },
          ),
        { signal, source: SOURCE },
      );
    } catch (error) {
      throw terminalFailure(error, signal);
    }
  }

  private retryPolicy(deadlineAt: number): RetryPolicy {
    const delays = new WeakMap<object, number>();
    const computeDelay = (
      attempt: number,
      error: ExternalFailure | ResilienceTimeoutError,
    ): number => {
      if (error instanceof ExternalFailure && error.retryAfterMs !== undefined) {
        return error.retryAfterMs;
      }
      const exponential = Math.min(
        this.settings.retry.maxDelayMs,
        this.settings.retry.baseDelayMs * this.settings.retry.factor ** (attempt - 1),
      );
      const sample = Math.min(1, Math.max(0, this.random()));
      return sample * exponential;
    };

    return new RetryPolicy({
      name: this.settings.policies.retry,
      attempts: this.settings.retry.attempts,
      retryIf: (error, attempt) => {
        if (!(isRetryableExternalFailure(error) || error instanceof ResilienceTimeoutError)) {
          return false;
        }
        const delay = computeDelay(attempt, error);
        if (this.now() + delay + this.settings.attemptTimeoutMs > deadlineAt) return false;
        if (!this.#retryBudget.tryTake()) return false;
        delays.set(error, delay);
        return true;
      },
      backoff: (_attempt, error) =>
        typeof error === 'object' && error !== null ? (delays.get(error) ?? 0) : 0,
    });
  }
}
