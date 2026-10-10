import { ExternalFailure, type Clock } from '../shared/index.js';
import type { SnapshotLifecycle, SnapshotRetention } from './snapshot-lifecycle.port.js';
import type { SnapshotContentStore } from './raw-snapshot-store.port.js';

/** Bounded caller-owned cycle; counts only confirmed deletions/reconciliations, including tombstones. */
export class ExpireSnapshots implements SnapshotRetention {
  public constructor(
    private readonly lifecycle: SnapshotLifecycle,
    private readonly store: SnapshotContentStore,
    private readonly clock: Clock,
  ) {}
  public async expire(limit: number, signal: AbortSignal, deadlineAt?: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('Snapshot expiry batch must contain 1-1000 generations.');
    const attempted = new Set<string>();
    let reconciled = 0;
    let failed = false;
    for (let attempt = 0; attempt < limit; attempt++) {
      this.assertCycleBudget(signal, deadlineAt);
      const [key] = await this.lifecycle.listExpired(this.clock.now(), 1, signal);
      this.assertCycleBudget(signal, deadlineAt);
      if (key === undefined || attempted.has(key)) break;
      attempted.add(key);
      try {
        await this.store.delete(key, signal, deadlineAt);
        reconciled++;
      } catch {
        signal.throwIfAborted();
        failed = true;
      }
    }
    if (failed)
      throw new ExternalFailure({ kind: 'exhausted', operation: 'snapshot-retention.expire' });
    return reconciled;
  }
  private assertCycleBudget(signal: AbortSignal, deadlineAt: number | undefined): void {
    signal.throwIfAborted();
    // The caller's policy may exhaust its deadline before its cancellation timer is delivered.
    // This wall-clock attempt budget is independent of the trusted collection/expiry clock.
    if (deadlineAt !== undefined && Date.now() >= deadlineAt)
      throw new ExternalFailure({ kind: 'exhausted', operation: 'snapshot-retention.expire' });
  }
}
