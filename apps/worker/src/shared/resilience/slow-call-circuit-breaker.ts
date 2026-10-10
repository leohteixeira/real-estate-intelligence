import {
  CircuitBreakerPolicy,
  isClientError,
  type CircuitBreakerOptions,
} from '@nestjs/resilience';

class SlowSuccessfulCall<TResult> extends Error {
  public constructor(public readonly result: TResult) {
    super('The logical dependency call crossed its slow-call threshold.');
  }
}

/** Adds slow successful logical calls to a public CircuitBreakerPolicy's failure input. */
export class SlowCallCircuitBreaker {
  public readonly policy: CircuitBreakerPolicy;

  public constructor(
    options: CircuitBreakerOptions,
    private readonly slowCallThresholdMs: number,
    private readonly now: () => number = Date.now,
  ) {
    const recordIf = options.recordIf ?? ((error: unknown) => !isClientError(error));
    this.policy = new CircuitBreakerPolicy({
      ...options,
      recordIf: (error) => error instanceof SlowSuccessfulCall || recordIf(error),
    });
  }

  public async execute<TResult>(
    operation: (signal: AbortSignal) => Promise<TResult>,
    signal: AbortSignal,
    source: string,
  ): Promise<TResult> {
    try {
      return await this.policy.execute(
        async ({ signal: attemptSignal }) => {
          const startedAt = this.now();
          const result = await operation(attemptSignal);
          if (this.now() - startedAt >= this.slowCallThresholdMs) {
            throw new SlowSuccessfulCall(result);
          }
          return result;
        },
        { signal, source },
      );
    } catch (error) {
      if (error instanceof SlowSuccessfulCall) return error.result as TResult;
      throw error;
    }
  }
}
