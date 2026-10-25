import type {
  ListingIdentity,
  ListingSuppression,
  ListingSuppressionRepository,
  Transaction,
} from '@rei/application';

/** Deterministic suppression fake; object references deliberately survive failed cleanup. */
export class InMemoryListingSuppression implements ListingSuppressionRepository {
  public readonly records = new Map<string, ListingSuppression>();
  public readonly objects = new Map<string, readonly string[]>();
  public readonly erased: ListingIdentity[] = [];
  private key(identity: ListingIdentity) {
    return JSON.stringify([identity.sourceId, identity.sourceListingId]);
  }
  public async isSuppressed(identity: ListingIdentity, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.records.has(this.key(identity));
  }
  public async lockAndCheck(_transaction: Transaction, identity: ListingIdentity) {
    return this.records.has(this.key(identity));
  }
  public async record(_transaction: Transaction, input: ListingSuppression) {
    const previous = this.records.get(this.key(input));
    if (previous) return { suppression: previous, created: false };
    this.records.set(this.key(input), input);
    return { suppression: input, created: true };
  }
  public async listObjectKeys(identity: ListingIdentity, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.objects.get(this.key(identity)) ?? [];
  }
  public async eraseCollectedData(_transaction: Transaction, identity: ListingIdentity) {
    this.erased.push(identity);
    this.objects.delete(this.key(identity));
  }
  public async complete(_transaction: Transaction, identity: ListingIdentity) {
    const current = this.records.get(this.key(identity));
    if (!current) throw new Error('Suppression must precede cleanup.');
    this.records.set(this.key(identity), { ...current, completed: true });
  }
}
