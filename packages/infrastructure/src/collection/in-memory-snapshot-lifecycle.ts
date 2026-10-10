import {
  ExternalFailure,
  SNAPSHOT_RETENTION_MS,
  Transaction,
  type SnapshotGeneration,
  type SnapshotLifecycle,
} from '@rei/application';

class GenerationTransaction extends Transaction {
  public constructor(public readonly owner: InMemorySnapshotLifecycle) {
    super();
  }
}

/** Serialized durable-state fake with rollback when an upload/delete callback fails. */
export class InMemorySnapshotLifecycle implements SnapshotLifecycle {
  readonly generations = new Map<string, SnapshotGeneration>();
  private readonly nextReconciliation = new Map<string, string>();
  private readonly selectionOrder = new Map<string, bigint>();
  private nextSelectionOrder = 0n;
  private tail: Promise<unknown> = Promise.resolve();
  private async serial<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      release();
    }
  }
  public reserve(
    input: Omit<SnapshotGeneration, 'expiresAt' | 'deleted' | 'available'>,
    signal: AbortSignal,
  ): Promise<SnapshotGeneration> {
    return this.serial(signal, async () => {
      const prior = [...this.generations.values()].find(
        (row) => row.acquisitionScope === input.acquisitionScope,
      );
      if (prior) {
        if (
          prior.objectKey !== input.objectKey ||
          prior.sourceId !== input.sourceId ||
          prior.keyId !== input.keyId ||
          prior.byteLength !== input.byteLength ||
          prior.mediaType !== input.mediaType
        )
          throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.reserve' });
        return prior;
      }
      const row = {
        ...input,
        expiresAt: new Date(Date.parse(input.collectedAt) + SNAPSHOT_RETENTION_MS).toISOString(),
        available: false,
        deleted: false,
      };
      this.generations.set(row.objectKey, row);
      return row;
    });
  }
  public withGeneration<T>(
    objectKey: string,
    signal: AbortSignal,
    work: (generation: SnapshotGeneration, transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.serial(signal, async () => {
      const row = this.generations.get(objectKey);
      const priorReconciliation = this.nextReconciliation.get(objectKey);
      if (!row)
        throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.lifecycle' });
      try {
        return await work(row, new GenerationTransaction(this));
      } catch (error) {
        this.generations.set(objectKey, row);
        if (priorReconciliation === undefined) this.nextReconciliation.delete(objectKey);
        else this.nextReconciliation.set(objectKey, priorReconciliation);
        throw error;
      }
    });
  }
  public async listExpired(
    now: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('Snapshot expiry batch must contain 1-1000 generations.');
    return this.serial(signal, async () => {
      const selected = [...this.generations.values()]
        .filter(
          (row) =>
            Date.parse(row.expiresAt) <= Date.parse(now) &&
            Date.parse(this.nextReconciliation.get(row.objectKey) ?? row.expiresAt) <=
              Date.parse(now),
        )
        .sort((a, b) => this.compareSelection(a.objectKey, b.objectKey))
        .slice(0, limit)
        .map((row) => row.objectKey);
      for (const key of selected) this.selectionOrder.set(key, ++this.nextSelectionOrder);
      return selected;
    });
  }
  private compareSelection(a: string, b: string): number {
    const left = this.selectionOrder.get(a) ?? 0n;
    const right = this.selectionOrder.get(b) ?? 0n;
    return left < right ? -1 : left > right ? 1 : a.localeCompare(b);
  }
  private change(transaction: Transaction, objectKey: string, deleted: boolean): void {
    if (!(transaction instanceof GenerationTransaction) || transaction.owner !== this)
      throw new TypeError('Invalid snapshot transaction.');
    const row = this.generations.get(objectKey);
    if (!row || (row.deleted && !deleted)) throw new TypeError('Unavailable snapshot generation.');
    this.generations.set(objectKey, { ...row, available: !deleted, deleted });
  }
  public async markAvailable(transaction: Transaction, objectKey: string): Promise<void> {
    this.change(transaction, objectKey, false);
  }
  public async markDeleted(
    transaction: Transaction,
    objectKey: string,
    nextReconciliationAt: string,
  ): Promise<void> {
    this.change(transaction, objectKey, true);
    this.nextReconciliation.set(objectKey, nextReconciliationAt);
  }
}
