import {
  BulkheadPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
  RetryPolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import {
  ExternalFailure,
  isExternalFailure,
  isRetryableExternalFailure,
  type RunDispatch,
} from '@rei/application';
import type { AskRequestedIdentity, AskCompletion } from '@rei/domain';
import { SlowCallCircuitBreaker } from '../shared/resilience/slow-call-circuit-breaker';
import { runDispatchResilienceSettings } from './run-dispatch-resilience.settings';
export class ResilientRunDispatch implements RunDispatch {
  readonly #policy: ResiliencePolicy;
  readonly #breaker: SlowCallCircuitBreaker;
  readonly #attempts: ResiliencePolicy;
  public constructor(private readonly adapter: RunDispatch) {
    const names = runDispatchResilienceSettings.policies;
    this.#attempts = ResiliencePolicy.wrap(
      new RetryPolicy({ name: names.retry, attempts: 1, retryIf: () => false }),
      new OutboundRateLimitPolicy({
        name: names.rateLimit,
        ...runDispatchResilienceSettings.rateLimit,
      }),
      new TimeoutPolicy({
        name: names.timeout,
        timeout: runDispatchResilienceSettings.attemptTimeoutMs,
      }),
    );
    this.#breaker = new SlowCallCircuitBreaker(
      {
        name: names.circuitBreaker,
        ...runDispatchResilienceSettings.circuitBreaker,
        recordIf: isRetryableExternalFailure,
      },
      runDispatchResilienceSettings.slowCallThresholdMs,
    );
    this.#policy = ResiliencePolicy.wrap(
      new FallbackPolicy<never>(
        (error) =>
          Promise.reject(
            new ExternalFailure({
              kind: isExternalFailure(error) ? error.kind : 'exhausted',
              operation: 'run-dispatch',
            }),
          ),
        { name: names.fallback },
      ),
      new BulkheadPolicy({
        name: names.bulkhead,
        ...runDispatchResilienceSettings.bulkhead,
      }),
    );
  }
  private async execute<T>(
    work: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<T> {
    if (signal.aborted) throw new ExternalFailure({ kind: 'cancelled', operation: 'run-dispatch' });
    const remaining = deadlineAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new ExternalFailure({ kind: 'exhausted', operation: 'run-dispatch' });
    try {
      return await this.#policy.execute(
        ({ signal: admitted }) =>
          this.#breaker.execute(
            (breaker) =>
              this.#attempts.execute(({ signal: attempt }) => work(attempt), {
                signal: breaker,
                source: 'RunDispatch',
              }),
            admitted,
            'RunDispatch',
          ),
        { signal, source: 'RunDispatch' },
      );
    } catch (error) {
      throw new ExternalFailure({
        kind: signal.aborted ? 'cancelled' : isExternalFailure(error) ? error.kind : 'exhausted',
        operation: 'run-dispatch',
      });
    }
  }
  public claim(identity: AskRequestedIdentity, signal: AbortSignal, deadlineAt: number) {
    return this.execute(
      (attempt) => this.adapter.claim(identity, attempt, deadlineAt),
      signal,
      deadlineAt,
    );
  }
  public complete(request: AskCompletion, signal: AbortSignal, deadlineAt: number) {
    return this.execute(
      (attempt) => this.adapter.complete(request, attempt, deadlineAt),
      signal,
      deadlineAt,
    );
  }
}
