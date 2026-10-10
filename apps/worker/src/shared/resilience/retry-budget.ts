export interface RetryBudgetOptions {
  readonly windowMs: number;
  readonly ratio: number;
  readonly lowTrafficReserve: number;
}

/** Rolling retry budget: retries may consume at most a fraction of logical calls in the window. */
export class RetryBudget {
  readonly #calls: number[] = [];
  readonly #retries: number[] = [];

  public constructor(
    private readonly options: RetryBudgetOptions,
    private readonly now: () => number = Date.now,
  ) {
    if (
      !Number.isFinite(options.windowMs) ||
      options.windowMs <= 0 ||
      !Number.isFinite(options.ratio) ||
      options.ratio <= 0 ||
      options.ratio > 1 ||
      !Number.isInteger(options.lowTrafficReserve) ||
      options.lowTrafficReserve < 0
    ) {
      throw new TypeError('Retry budget options are invalid.');
    }
  }

  public recordCall(): void {
    const now = this.now();
    this.trim(now);
    this.#calls.push(now);
  }

  public tryTake(): boolean {
    const now = this.now();
    this.trim(now);
    const allowance = Math.max(
      this.options.lowTrafficReserve,
      Math.floor(this.#calls.length * this.options.ratio),
    );
    if (this.#retries.length >= allowance) return false;
    this.#retries.push(now);
    return true;
  }

  public get state(): Readonly<{ calls: number; retries: number; allowance: number }> {
    const now = this.now();
    this.trim(now);
    return Object.freeze({
      calls: this.#calls.length,
      retries: this.#retries.length,
      allowance: Math.max(
        this.options.lowTrafficReserve,
        Math.floor(this.#calls.length * this.options.ratio),
      ),
    });
  }

  private trim(now: number): void {
    const oldest = now - this.options.windowMs;
    while (this.#calls[0] !== undefined && this.#calls[0] <= oldest) this.#calls.shift();
    while (this.#retries[0] !== undefined && this.#retries[0] <= oldest) this.#retries.shift();
  }
}
