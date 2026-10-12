import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
  RetryPolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import type { CheckpointRequest, CheckpointResponse } from '@rei/contracts';
import { GraphCheckpointFailure, type GraphCheckpointTransport } from './graph-checkpoint.port';
import { graphCheckpointResilienceSettings as settings } from './graph-checkpoint-resilience.settings';
export class ResilientGraphCheckpointAdapter implements GraphCheckpointTransport {
  readonly #policy: ResiliencePolicy;
  readonly #breaker: CircuitBreakerPolicy;
  readonly #attempts: ResiliencePolicy;
  public constructor(
    private readonly adapter: GraphCheckpointTransport,
    private readonly now: () => number = Date.now,
  ) {
    const names = settings.policies;
    this.#policy = ResiliencePolicy.wrap(
      new FallbackPolicy<never>(
        (error) =>
          Promise.reject(
            error instanceof GraphCheckpointFailure ? error : new GraphCheckpointFailure(),
          ),
        { name: names.fallback },
      ),
      new BulkheadPolicy({ name: names.bulkhead, ...settings.bulkhead }),
    );
    this.#breaker = new CircuitBreakerPolicy({
      name: names.circuitBreaker,
      ...settings.circuitBreaker,
    });
    this.#attempts = ResiliencePolicy.wrap(
      new RetryPolicy({ name: names.retry, attempts: 1, retryIf: () => false }),
      new OutboundRateLimitPolicy({ name: names.rateLimit, ...settings.rateLimit }),
      new TimeoutPolicy({ name: names.timeout, timeout: settings.timeoutMs }),
    );
  }
  public async execute(
    request: CheckpointRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<CheckpointResponse> {
    if (signal.aborted || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new GraphCheckpointFailure('cancelled');
    try {
      return await this.#policy.execute(
        ({ signal: admitted }) => this.logicalCall(request, grant, admitted, deadlineAt),
        { signal, source: 'GraphCheckpoint' },
      );
    } catch (error) {
      if (error instanceof GraphCheckpointFailure) throw error;
      throw new GraphCheckpointFailure(signal.aborted ? 'cancelled' : 'transient');
    }
  }
  private async logicalCall(
    request: CheckpointRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<CheckpointResponse> {
    try {
      return await this.#breaker.execute(
        async ({ signal: attempt }) => {
          const started = this.now();
          const result = await this.#attempts.execute(
            ({ signal: bounded }) => this.adapter.execute(request, grant, bounded, deadlineAt),
            { signal: attempt, source: 'GraphCheckpoint' },
          );
          if (this.now() - started >= settings.slowCallThresholdMs)
            throw new SlowCheckpoint(result);
          return result;
        },
        { signal, source: 'GraphCheckpoint' },
      );
    } catch (error) {
      if (error instanceof SlowCheckpoint) return error.result;
      throw error;
    }
  }
}
class SlowCheckpoint extends Error {
  public constructor(public readonly result: CheckpointResponse) {
    super('Slow checkpoint operation.');
  }
}
