import { AiRetryAllowance, transientAttempt, withinAiDeadline } from '../shared/ai-resilience';
import {
  BulkheadPolicy,
  CircuitBreakerPolicy,
  FallbackPolicy,
  OutboundRateLimitPolicy,
  ResiliencePolicy,
  TimeoutPolicy,
} from '@nestjs/resilience';
import type { CheckpointRequest, CheckpointResponse } from '@rei/contracts';
import { GraphCheckpointFailure, type GraphCheckpointTransport } from './graph-checkpoint.port';
import { graphCheckpointResilienceSettings as settings } from './graph-checkpoint-resilience.settings';
export class ResilientGraphCheckpointAdapter implements GraphCheckpointTransport {
  readonly #policy: ResiliencePolicy;
  readonly #breaker: CircuitBreakerPolicy;
  readonly #attempts: ResiliencePolicy;
  readonly #retry: AiRetryAllowance;
  public constructor(
    private readonly adapter: GraphCheckpointTransport,
    private readonly now: () => number = Date.now,
    random: () => number = Math.random,
  ) {
    const names = settings.policies;
    this.#retry = new AiRetryAllowance(settings.retry, now, random);
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
      recordIf: (error) =>
        error instanceof SlowCheckpoint ||
        transientAttempt(error) ||
        (error instanceof GraphCheckpointFailure && error.kind === 'transient'),
    });
    this.#attempts = ResiliencePolicy.wrap(
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
    return withinAiDeadline(
      signal,
      deadlineAt,
      this.now,
      () => new GraphCheckpointFailure('cancelled'),
      async (bounded) => {
        this.#retry.recordCall();
        try {
          return await this.#policy.execute(
            ({ signal: admitted }) => this.logicalCall(request, grant, admitted, deadlineAt),
            { signal: bounded, source: 'GraphCheckpoint' },
          );
        } catch (error) {
          if (bounded.aborted || this.now() >= deadlineAt)
            throw new GraphCheckpointFailure('cancelled');
          if (error instanceof GraphCheckpointFailure) throw error;
          throw new GraphCheckpointFailure('transient');
        }
      },
    );
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
          try {
            const started = this.now();
            const retry = this.#retry.policy(
              settings.policies.retry,
              attempt,
              deadlineAt,
              settings.timeoutMs,
              (error) =>
                transientAttempt(error) ||
                (error instanceof GraphCheckpointFailure && error.kind === 'transient'),
            );
            const result = await ResiliencePolicy.wrap(retry, this.#attempts).execute(
              ({ signal: bounded }) => {
                if (bounded.aborted || this.now() >= deadlineAt)
                  throw new GraphCheckpointFailure('cancelled');
                return this.adapter.execute(request, grant, bounded, deadlineAt);
              },
              { signal: attempt, source: 'GraphCheckpoint' },
            );
            if (attempt.aborted || this.now() >= deadlineAt)
              throw new GraphCheckpointFailure('cancelled');
            if (this.now() - started >= settings.slowCallThresholdMs)
              throw new SlowCheckpoint(result);
            return result;
          } catch (error) {
            if (attempt.aborted || this.now() >= deadlineAt)
              throw new GraphCheckpointFailure('cancelled');
            throw error;
          }
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
