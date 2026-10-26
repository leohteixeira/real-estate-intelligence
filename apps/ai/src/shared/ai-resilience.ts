import { ResilienceTimeoutError, RetryPolicy } from '@nestjs/resilience';

export interface AiRetrySettings {
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxRetryAfterMs: number;
  readonly budgetWindowMs: number;
  readonly budgetRatio: number;
  readonly lowTrafficRetryReserve: number;
}

/** AI-owned rolling allowance; retries cannot amplify an outage indefinitely. */
export class AiRetryAllowance {
  readonly #calls: number[] = [];
  readonly #retries: number[] = [];
  public constructor(
    private readonly settings: AiRetrySettings,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {}
  public recordCall(): void {
    this.trim();
    this.#calls.push(this.now());
  }
  private trim(): void {
    const oldest = this.now() - this.settings.budgetWindowMs;
    while (this.#calls[0] !== undefined && this.#calls[0] <= oldest) this.#calls.shift();
    while (this.#retries[0] !== undefined && this.#retries[0] <= oldest) this.#retries.shift();
  }
  public policy(
    name: string,
    signal: AbortSignal,
    deadlineAt: number,
    timeoutMs: number,
    transient: (error: unknown) => boolean,
    retryAfter: (error: unknown) => number | undefined = () => undefined,
  ): RetryPolicy {
    const delays = new Map<unknown, number>();
    return new RetryPolicy({
      name,
      attempts: this.settings.attempts,
      retryIf: (error, attempt) => {
        if (signal.aborted || !transient(error)) return false;
        const advice = retryAfter(error);
        if (advice !== undefined && advice > this.settings.maxRetryAfterMs) return false;
        const delay =
          advice ??
          Math.min(1, Math.max(0, this.random())) *
            Math.min(this.settings.maxDelayMs, this.settings.baseDelayMs * 2 ** (attempt - 1));
        // A retry needs room for its complete attempt, including provider advice.
        if (this.now() + delay + timeoutMs > deadlineAt) return false;
        this.trim();
        const allowance = Math.max(
          this.settings.lowTrafficRetryReserve,
          Math.floor(this.#calls.length * this.settings.budgetRatio),
        );
        if (this.#retries.length >= allowance) return false;
        this.#retries.push(this.now());
        delays.set(error, delay);
        return true;
      },
      backoff: (_attempt, error) => delays.get(error) ?? 0,
    });
  }
}

export function transientAttempt(error: unknown): boolean {
  return error instanceof ResilienceTimeoutError;
}

/** The original caller deadline covers admission, backoff and even uncooperative HTTP clients. */
export async function withinAiDeadline<T>(
  signal: AbortSignal,
  deadlineAt: number,
  now: () => number,
  cancelled: () => Error,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const live = () => {
    if (signal.aborted || !Number.isFinite(deadlineAt) || now() >= deadlineAt) throw cancelled();
  };
  live();
  const deadline = new AbortController();
  const combined = AbortSignal.any([signal, deadline.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => reject(cancelled());
    combined.addEventListener('abort', abort, { once: true });
    timer = setTimeout(
      () => deadline.abort(),
      Math.min(2_147_483_647, Math.max(1, Math.ceil(deadlineAt - now()))),
    );
  });
  try {
    const result = await Promise.race([work(combined), stopped]);
    live();
    if (combined.aborted) throw cancelled();
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) combined.removeEventListener('abort', abort);
  }
}
