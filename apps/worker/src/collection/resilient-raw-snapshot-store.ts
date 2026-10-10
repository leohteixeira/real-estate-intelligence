import {
  ExternalFailure,
  type RawSnapshotStore,
  type StoreRawSnapshotInput,
  type SnapshotContentStore,
} from '@rei/application';

import { CollectionDependencyPolicies } from './collection-dependency-policies';
import {
  rawSnapshotStoreResilienceSettings,
  rawSnapshotReadResilienceSettings,
  rawSnapshotDeleteResilienceSettings,
  type CollectionResilienceSettings,
} from './collection-resilience.settings';

export class ResilientRawSnapshotStore implements SnapshotContentStore {
  public readonly policies: CollectionDependencyPolicies;
  public readonly readPolicies: CollectionDependencyPolicies;
  public readonly deletePolicies: CollectionDependencyPolicies;
  public constructor(
    private readonly adapter: RawSnapshotStore,
    settings: CollectionResilienceSettings = rawSnapshotStoreResilienceSettings,
    now: () => number = Date.now,
    random: () => number = Math.random,
  ) {
    this.policies = new CollectionDependencyPolicies(settings, now, random);
    this.readPolicies = new CollectionDependencyPolicies(
      rawSnapshotReadResilienceSettings,
      now,
      random,
    );
    this.deletePolicies = new CollectionDependencyPolicies(
      rawSnapshotDeleteResilienceSettings,
      now,
      random,
    );
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
  public read(
    objectKey: string,
    signal: AbortSignal,
    deadlineAt = Number.POSITIVE_INFINITY,
  ): Promise<Uint8Array> {
    const adapter = this.adapter as Partial<SnapshotContentStore>;
    if (!adapter.read)
      throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.read' });
    return this.readPolicies.execute(
      (attempt) => adapter.read!(objectKey, attempt),
      signal,
      deadlineAt,
    );
  }
  public delete(
    objectKey: string,
    signal: AbortSignal,
    deadlineAt = Number.POSITIVE_INFINITY,
  ): Promise<void> {
    const adapter = this.adapter as Partial<SnapshotContentStore>;
    if (!adapter.delete)
      throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.delete' });
    return this.deletePolicies.execute(
      (attempt) => adapter.delete!(objectKey, attempt),
      signal,
      deadlineAt,
    );
  }
}
