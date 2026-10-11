import {
  BulkheadFullError,
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
import {
  ExternalFailure,
  isExternalFailure,
  isRetryableExternalFailure,
  type RunExecutor,
} from '@rei/application';
import type { RunExecutionEvidence, RunExecutionInput } from '@rei/domain';
import { SlowCallCircuitBreaker } from '../shared/resilience/slow-call-circuit-breaker';
import {
  runExecutorResilienceSettings,
  type RunExecutorResilienceSettings,
} from './run-executor-resilience.settings';

const OPERATION = 'run-executor.execute';
const SOURCE = 'RunExecutor.executeFoundation';
function failure(error: unknown, signal: AbortSignal, deadlineExpired = false): ExternalFailure {
  const kind = signal.aborted
    ? 'cancelled'
    : deadlineExpired ||
        error instanceof BulkheadFullError ||
        error instanceof OutboundRateLimitError ||
        error instanceof CircuitOpenError ||
        error instanceof ResilienceTimeoutError
      ? 'exhausted'
      : isExternalFailure(error)
        ? error.kind
        : 'rejected';
  return new ExternalFailure({ kind, operation: OPERATION });
}

/** ADR-ordered policy composition: fallback → admission → breaker → retry → rate → timeout. */
export class ResilientRunExecutor implements RunExecutor {
  readonly #fallback: FallbackPolicy<never>;
  readonly #bulkhead: BulkheadPolicy;
  readonly #breaker: SlowCallCircuitBreaker;
  readonly #attempts: ResiliencePolicy;
  public constructor(
    private readonly adapter: RunExecutor,
    settings: RunExecutorResilienceSettings = runExecutorResilienceSettings,
  ) {
    const names = settings.policies;
    this.#fallback = new FallbackPolicy<never>(
      (error) => Promise.reject(failure(error, new AbortController().signal)),
      { name: names.fallback },
    );
    this.#bulkhead = new BulkheadPolicy({
      name: names.bulkhead,
      maxConcurrent: settings.bulkhead.maxConcurrent,
      maxQueue: settings.bulkhead.maxQueue,
      queueTimeout: settings.bulkhead.queueTimeoutMs,
    });
    this.#breaker = new SlowCallCircuitBreaker(
      {
        name: names.circuitBreaker,
        failureRateThreshold: settings.circuitBreaker.failureRateThreshold,
        minimumCalls: settings.circuitBreaker.minimumCalls,
        slidingWindow: { type: 'time', size: settings.circuitBreaker.windowMs },
        openDuration: settings.circuitBreaker.openDurationMs,
        halfOpenMaxCalls: settings.circuitBreaker.halfOpenMaxCalls,
        recordIf: (error) =>
          isRetryableExternalFailure(error) || error instanceof ResilienceTimeoutError,
      },
      settings.circuitBreaker.slowCallThresholdMs,
    );
    this.#attempts = ResiliencePolicy.wrap(
      new RetryPolicy({ name: names.retry, attempts: 1, retryIf: () => false }),
      new OutboundRateLimitPolicy({
        name: names.rateLimit,
        limit: settings.rateLimit.limit,
        interval: settings.rateLimit.intervalMs,
        maxWait: settings.rateLimit.maxWaitMs,
      }),
      new TimeoutPolicy({ name: names.timeout, timeout: settings.attemptTimeoutMs }),
    );
  }
  public async execute(
    input: RunExecutionInput,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<RunExecutionEvidence> {
    if (signal.aborted || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw failure(undefined, signal, true);
    const deadline = new AbortController();
    const combined = AbortSignal.any([signal, deadline.signal]);
    let timer: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () => reject(failure(undefined, signal, true));
      combined.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => deadline.abort(), Math.min(2_147_483_647, deadlineAt - Date.now()));
    });
    try {
      return await Promise.race([
        this.#fallback.execute(
          ({ signal: fallback }) =>
            this.#bulkhead.execute(
              ({ signal: admitted }) =>
                this.#breaker.execute(
                  (breaker) =>
                    this.#attempts.execute(
                      ({ signal: attempt }) => this.adapter.execute(input, attempt, deadlineAt),
                      { signal: breaker, source: SOURCE },
                    ),
                  admitted,
                  SOURCE,
                ),
              { signal: fallback, source: SOURCE },
            ),
          { signal: combined, source: SOURCE },
        ),
        stopped,
      ]);
    } catch (error) {
      throw failure(error, signal, deadline.signal.aborted);
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) combined.removeEventListener('abort', abort);
    }
  }
}
