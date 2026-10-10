import type { RawSnapshotStore, StoreRawSnapshotInput } from '@rei/application';

import { CollectionDependencyPolicies } from './collection-dependency-policies';
import {
  rawSnapshotStoreResilienceSettings,
  type CollectionResilienceSettings,
} from './collection-resilience.settings';

export class ResilientRawSnapshotStore implements RawSnapshotStore {
  public readonly policies: CollectionDependencyPolicies;
  public constructor(
    private readonly adapter: RawSnapshotStore,
    settings: CollectionResilienceSettings = rawSnapshotStoreResilienceSettings,
    now: () => number = Date.now,
    random: () => number = Math.random,
  ) {
    this.policies = new CollectionDependencyPolicies(settings, now, random);
  }
  public store(
    input: StoreRawSnapshotInput,
    signal: AbortSignal,
    deadlineAt = Number.POSITIVE_INFINITY,
  ) {
    // Keep an immutable retry payload even when callers retain their input buffer.
    const stable = { ...input, bytes: Uint8Array.from(input.bytes) };
    return this.policies.execute(
      (attempt) => this.adapter.store(stable, attempt),
      signal,
      deadlineAt,
    );
  }
}
