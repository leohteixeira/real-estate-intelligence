import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  OutboundRateLimitError,
  ResiliencePolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import type { IntentDecision } from '@rei/contracts';
import { AiRetryAllowance, withinAiDeadline } from '../shared/ai-resilience';
import { AnthropicIntentDecider, heuristicDecision, type IntentDecider } from './intent-decider';
import { ModelExplanationFailure } from './language-model.port';
import { modelFailure, recordModelFailure } from './model-failure';
import { intentResilienceSettings as settings } from './intent-resilience.settings';

/** One decision breaker outcome; every physical classification attempt consumes admission. */
export class ResilientIntentDecider implements IntentDecider {
  readonly #bulkhead = new BulkheadPolicy({
    name: settings.policies.bulkhead,
    ...settings.bulkhead,
  });
  readonly #breaker = new CircuitBreakerPolicy({
    name: settings.policies.circuitBreaker,
    ...settings.breaker,
    recordIf: (error) =>
      error instanceof SlowIntentDecision ||
      (error instanceof ModelExplanationFailure &&
        recordModelFailure(error) &&
        this.#physicalFailures.has(error)),
  });
  readonly #attempt = ResiliencePolicy.wrap(
    new OutboundRateLimitPolicy({ name: settings.policies.rateLimit, ...settings.rateLimit }),
    new TimeoutPolicy({ name: settings.policies.timeout, timeout: settings.timeoutMs }),
  );
  readonly #retry: AiRetryAllowance;
  readonly #physicalFailures = new WeakSet<ModelExplanationFailure>();
  public constructor(
    private readonly adapter: AnthropicIntentDecider,
    private readonly now: () => number = Date.now,
    random: () => number = Math.random,
  ) {
    this.#retry = new AiRetryAllowance(settings.retry, now, random);
  }
  public decide(
    query: string,
    locale: 'en' | 'pt-BR',
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<IntentDecision> {
    return withinAiDeadline(
      signal,
      deadlineAt,
      this.now,
      () => new ModelExplanationFailure('cancelled'),
      async (bounded) => {
        this.#retry.recordCall();
        const fallback = new FallbackPolicy<IntentDecision>(
          () => {
            if (bounded.aborted || this.now() >= deadlineAt)
              throw new ModelExplanationFailure('cancelled');
            return heuristicDecision(query);
          },
          {
            name: settings.policies.fallback,
            handleIf: (error) =>
              error instanceof ModelExplanationFailure &&
              error.kind !== 'cancelled' &&
              error.kind !== 'rejected',
          },
        );
        try {
          return await fallback.execute(
            ({ signal: outer }) =>
              this.#bulkhead
                .execute(
                  ({ signal: admitted }) =>
                    this.#breaker.execute(
                      async ({ signal: logical }) => {
                        try {
                          const started = this.now();
                          const decision = await this.adapter.decide(
                            query,
                            locale,
                            logical,
                            deadlineAt,
                            {
                              execute: (work, phaseSignal) =>
                                this.phase(work, phaseSignal, deadlineAt),
                            },
                          );
                          if (logical.aborted || this.now() >= deadlineAt)
                            throw new ModelExplanationFailure('cancelled');
                          if (this.now() - started >= settings.slowCallThresholdMs)
                            throw new SlowIntentDecision(decision);
                          return decision;
                        } catch (error) {
                          if (error instanceof SlowIntentDecision) throw error;
                          const failure = modelFailure(error, logical);
                          if (failure.kind === 'exhausted') this.#breaker.trip();
                          throw failure;
                        }
                      },
                      { signal: admitted, source: 'IntentDecider' },
                    ),
                  { signal: outer, source: 'IntentDecider' },
                )
                .catch((error: unknown) => {
                  if (error instanceof SlowIntentDecision) return error.decision;
                  throw modelFailure(error, bounded);
                }),
            { signal: bounded, source: 'IntentDecider' },
          );
        } catch (error) {
          throw modelFailure(error, bounded);
        }
      },
    );
  }
  private phase<T>(
    work: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<T> {
    const retry = this.#retry.policy(
      settings.policies.retry,
      signal,
      deadlineAt,
      settings.timeoutMs,
      (error) =>
        error instanceof ModelExplanationFailure &&
        error.kind === 'transient' &&
        this.#physicalFailures.has(error),
      (error) => (error instanceof ModelExplanationFailure ? error.retryAfterMs : undefined),
    );
    return retry.execute(
      async ({ signal: logical }) => {
        if (logical.aborted || this.now() >= deadlineAt)
          throw new ModelExplanationFailure('cancelled');
        try {
          return await this.#attempt.execute(({ signal: attempt }) => work(attempt), {
            signal: logical,
            source: 'IntentDecider',
          });
        } catch (error) {
          if (logical.aborted || this.now() >= deadlineAt)
            throw new ModelExplanationFailure('cancelled');
          const failure = modelFailure(error, logical);
          if (!(error instanceof OutboundRateLimitError)) this.#physicalFailures.add(failure);
          throw failure;
        }
      },
      { signal, source: 'IntentDecider' },
    );
  }
}

class SlowIntentDecision extends Error {
  public constructor(public readonly decision: IntentDecision) {
    super('Slow intent decision.');
  }
}
