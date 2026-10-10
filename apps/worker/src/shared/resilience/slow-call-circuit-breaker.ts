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

class SlowFailedCall extends Error {
  public constructor(public readonly failure: unknown) {
    super('The failed logical dependency call crossed its slow-call threshold.');
  }
}

/** Adds slow successful and failed logical calls to a CircuitBreakerPolicy's failure input. */
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
      recordIf: (error) =>
        error instanceof SlowSuccessfulCall || error instanceof SlowFailedCall || recordIf(error),
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
          try {
            const result = await operation(attemptSignal);
            if (this.now() - startedAt >= this.slowCallThresholdMs) {
              throw new SlowSuccessfulCall(result);
            }
            return result;
          } catch (error) {
            if (error instanceof SlowSuccessfulCall) throw error;
            if (this.now() - startedAt >= this.slowCallThresholdMs) {
              throw new SlowFailedCall(error);
            }
            throw error;
          }
        },
        { signal, source },
      );
    } catch (error) {
      if (error instanceof SlowSuccessfulCall) return error.result as TResult;
      if (error instanceof SlowFailedCall) throw error.failure;
      throw error;
    }
  }
}
