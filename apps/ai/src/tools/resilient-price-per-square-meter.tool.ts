import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
  RetryPolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import type { PriceToolReceipt, PriceToolRequest } from '@rei/contracts';
import { PriceToolFailure, type PricePerSquareMeterTool } from './price-per-square-meter.port';
import { priceToolResilienceSettings } from './price-per-square-meter-resilience.settings';
export class ResilientPricePerSquareMeterTool implements PricePerSquareMeterTool {
  readonly #policy: ResiliencePolicy;
  readonly #breaker: CircuitBreakerPolicy;
  readonly #attempts: ResiliencePolicy;
  public constructor(
    private readonly adapter: PricePerSquareMeterTool,
    private readonly now: () => number = Date.now,
  ) {
    const names = priceToolResilienceSettings.policies;
    this.#policy = ResiliencePolicy.wrap(
      new FallbackPolicy<never>(
        (error) =>
          Promise.reject(error instanceof PriceToolFailure ? error : new PriceToolFailure()),
        {
          name: names.fallback,
        },
      ),
      new BulkheadPolicy({ name: names.bulkhead, ...priceToolResilienceSettings.bulkhead }),
    );
    this.#breaker = new CircuitBreakerPolicy({
      name: names.circuitBreaker,
      ...priceToolResilienceSettings.circuitBreaker,
    });
    this.#attempts = ResiliencePolicy.wrap(
      new RetryPolicy({ name: names.retry, attempts: 1, retryIf: () => false }),
      new OutboundRateLimitPolicy({
        name: names.rateLimit,
        ...priceToolResilienceSettings.rateLimit,
      }),
      new TimeoutPolicy({ name: names.timeout, timeout: priceToolResilienceSettings.timeoutMs }),
    );
  }
  public async calculate(
    request: PriceToolRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<PriceToolReceipt> {
    if (signal.aborted || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new PriceToolFailure('cancelled');
    try {
      return await this.#policy.execute(
        ({ signal: admitted }) => this.logicalCall(request, grant, admitted, deadlineAt),
        { signal, source: 'PricePerSquareMeterTool' },
      );
    } catch (error) {
      if (error instanceof PriceToolFailure) throw error;
      throw new PriceToolFailure(signal.aborted ? 'cancelled' : 'transient');
    }
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
          const started = this.now();
          const receipt = await this.#attempts.execute(
            ({ signal: bounded }) => this.adapter.calculate(request, grant, bounded, deadlineAt),
            { signal: attempt, source: 'PricePerSquareMeterTool' },
          );
          if (this.now() - started >= priceToolResilienceSettings.slowCallThresholdMs)
            throw new SlowPriceReceipt(receipt);
          return receipt;
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
