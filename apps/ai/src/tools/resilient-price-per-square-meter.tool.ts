import { AiRetryAllowance, transientAttempt, withinAiDeadline } from '../shared/ai-resilience';
import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import type { PriceToolReceipt, PriceToolRequest } from '@rei/contracts';
import { PriceToolFailure, type PricePerSquareMeterTool } from './price-per-square-meter.port';
import { priceToolResilienceSettings as settings } from './price-per-square-meter-resilience.settings';
export class ResilientPricePerSquareMeterTool implements PricePerSquareMeterTool {
  readonly #policy: ResiliencePolicy;
  readonly #breaker: CircuitBreakerPolicy;
  readonly #attempts: ResiliencePolicy;
  readonly #retry: AiRetryAllowance;
  public constructor(
    private readonly adapter: PricePerSquareMeterTool,
    private readonly now: () => number = Date.now,
    random: () => number = Math.random,
  ) {
    const names = settings.policies;
    this.#retry = new AiRetryAllowance(settings.retry, now, random);
    this.#policy = ResiliencePolicy.wrap(
      new FallbackPolicy<never>(
        (error) =>
          Promise.reject(error instanceof PriceToolFailure ? error : new PriceToolFailure()),
        {
          name: names.fallback,
        },
      ),
      new BulkheadPolicy({ name: names.bulkhead, ...settings.bulkhead }),
    );
    this.#breaker = new CircuitBreakerPolicy({
      name: names.circuitBreaker,
      ...settings.circuitBreaker,
      recordIf: (error) =>
        error instanceof SlowPriceReceipt ||
        transientAttempt(error) ||
        (error instanceof PriceToolFailure && error.kind === 'transient'),
    });
    this.#attempts = ResiliencePolicy.wrap(
      new OutboundRateLimitPolicy({
        name: names.rateLimit,
        ...settings.rateLimit,
      }),
      new TimeoutPolicy({ name: names.timeout, timeout: settings.timeoutMs }),
    );
  }
  public async calculate(
    request: PriceToolRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<PriceToolReceipt> {
    return withinAiDeadline(
      signal,
      deadlineAt,
      this.now,
      () => new PriceToolFailure('cancelled'),
      async (bounded) => {
        this.#retry.recordCall();
        try {
          return await this.#policy.execute(
            ({ signal: admitted }) => this.logicalCall(request, grant, admitted, deadlineAt),
            { signal: bounded, source: 'PricePerSquareMeterTool' },
          );
        } catch (error) {
          if (bounded.aborted || this.now() >= deadlineAt) throw new PriceToolFailure('cancelled');
          if (error instanceof PriceToolFailure) throw error;
          throw new PriceToolFailure('transient');
        }
      },
    );
  }
  private async logicalCall(
    request: PriceToolRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<PriceToolReceipt> {
    try {
      return await this.#breaker.execute(
        async ({ signal: attempt }) => {
          try {
            const started = this.now();
            const retry = this.#retry.policy(
              settings.policies.retry,
              attempt,
              deadlineAt,
              settings.timeoutMs,
              (error) =>
                transientAttempt(error) ||
                (error instanceof PriceToolFailure && error.kind === 'transient'),
            );
            const receipt = await ResiliencePolicy.wrap(retry, this.#attempts).execute(
              ({ signal: bounded }) => {
                if (bounded.aborted || this.now() >= deadlineAt)
                  throw new PriceToolFailure('cancelled');
                return this.adapter.calculate(request, grant, bounded, deadlineAt);
              },
              { signal: attempt, source: 'PricePerSquareMeterTool' },
            );
            if (attempt.aborted || this.now() >= deadlineAt)
              throw new PriceToolFailure('cancelled');
            if (this.now() - started >= settings.slowCallThresholdMs)
              throw new SlowPriceReceipt(receipt);
            return receipt;
          } catch (error) {
            if (attempt.aborted || this.now() >= deadlineAt)
              throw new PriceToolFailure('cancelled');
            throw error;
          }
        },
        { signal, source: 'PricePerSquareMeterTool' },
      );
    } catch (error) {
      if (error instanceof SlowPriceReceipt) return error.receipt;
      throw error;
    }
  }
}
/** An actual slow receipt remains successful to its caller while counting toward breaker health. */
class SlowPriceReceipt extends Error {
  public constructor(public readonly receipt: PriceToolReceipt) {
    super('Slow price tool call.');
  }
}
