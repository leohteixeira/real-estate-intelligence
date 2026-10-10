interface WaitingRun<TResult> {
  readonly sourceId: string;
  readonly signal: AbortSignal;
  readonly work: () => Promise<TResult>;
  readonly resolve: (value: TResult) => void;
  readonly reject: (reason: unknown) => void;
  readonly onAbort: () => void;
}

/** One global bound plus a strict one-active-run-per-source bound. */
export class CollectionRunLimiter {
  private active = 0;
  private readonly activeSources = new Set<string>();
  private readonly waiting: WaitingRun<unknown>[] = [];

  public constructor(private readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) {
      throw new RangeError('Collection concurrency must be between 1 and 32.');
    }
  }

  public run<TResult>(
    sourceId: string,
    signal: AbortSignal,
    work: () => Promise<TResult>,
  ): Promise<TResult> {
    signal.throwIfAborted();
    return new Promise<TResult>((resolve, reject) => {
      const entry: WaitingRun<TResult> = {
        sourceId,
        signal,
        work,
        resolve,
        reject,
        onAbort: () => {
          const index = this.waiting.indexOf(entry as WaitingRun<unknown>);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(signal.reason);
        },
      };
      signal.addEventListener('abort', entry.onAbort, { once: true });
      this.waiting.push(entry as WaitingRun<unknown>);
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.limit) {
      const index = this.waiting.findIndex(
        ({ sourceId, signal }) => !signal.aborted && !this.activeSources.has(sourceId),
      );
      if (index < 0) return;
      const entry = this.waiting.splice(index, 1)[0]!;
      entry.signal.removeEventListener('abort', entry.onAbort);
      this.active += 1;
      this.activeSources.add(entry.sourceId);
      void entry
        .work()
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.active -= 1;
          this.activeSources.delete(entry.sourceId);
          this.pump();
        });
    }
  }
}
