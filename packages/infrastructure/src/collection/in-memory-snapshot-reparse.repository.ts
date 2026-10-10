import {
  ExternalFailure,
  type ReparseObservation,
  type SnapshotReparseIdentity,
  type SnapshotReparseOperation,
  type SnapshotReparseRepository,
  type SnapshotReparseResult,
  type Transaction,
} from '@rei/application';
import { verifySnapshotReparseBytes } from './postgres-snapshot-reparse.repository.js';

/** Deterministic fake for isolated orchestration tests; unavailable fixtures model expiry. */
export class InMemorySnapshotReparseRepository implements SnapshotReparseRepository {
  public readonly observations = new Map<string, ReparseObservation>();
  public readonly operations = new Map<string, SnapshotReparseOperation>();
  public readonly unavailable = new Set<string>();
  private readonly orders = new Map<string, number>();
  public constructor(observations: readonly ReparseObservation[] = []) {
    for (const observation of observations)
      this.observations.set(observation.snapshotId, structuredClone(observation));
  }
  public verifyOriginalBytes = verifySnapshotReparseBytes;
  public async findOperation(key: string, signal: AbortSignal) {
    signal.throwIfAborted();
    return this.operations.get(key) ?? null;
  }
  public async findObservation(id: ReparseObservation['snapshotId'], signal: AbortSignal) {
    signal.throwIfAborted();
    return this.observations.get(id) ?? null;
  }
  public async reserve(
    _transaction: Transaction,
    identity: SnapshotReparseIdentity,
    observation: ReparseObservation,
    fingerprints: readonly string[],
  ) {
    this.assertAvailable(identity.snapshotId);
    const operation = this.operations.get(identity.operationKey);
    if (operation) this.assertIdentity(operation, identity);
    else this.operations.set(identity.operationKey, { ...identity, result: null });
    this.observations.set(identity.snapshotId, {
      ...observation,
      imageFingerprints: [...fingerprints],
    });
    return { result: operation?.result ?? null };
  }
  public async lockForCommit(_transaction: Transaction, identity: SnapshotReparseIdentity) {
    const operation = this.operations.get(identity.operationKey);
    const observation = this.observations.get(identity.snapshotId);
    if (!operation || !observation)
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
    this.assertIdentity(operation, identity);
    if (!operation.result) this.assertAvailable(identity.snapshotId);
    return {
      observation,
      order: operation.result?.order ?? (this.orders.get(identity.snapshotId) ?? 0) + 1,
      result: operation.result,
    };
  }
  public async complete(_transaction: Transaction, result: SnapshotReparseResult) {
    this.assertAvailable(result.snapshotId);
    const operation = this.operations.get(result.operationKey);
    if (!operation || operation.result)
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
    this.assertIdentity(operation, result);
    this.orders.set(result.snapshotId, result.order);
    this.operations.set(result.operationKey, { ...result, result: structuredClone(result) });
  }
  private assertIdentity(operation: SnapshotReparseOperation, identity: SnapshotReparseIdentity) {
    if (
      operation.snapshotId !== identity.snapshotId ||
      operation.parserRevision !== identity.parserRevision
    )
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
  }
  private assertAvailable(id: string) {
    if (!this.observations.has(id) || this.unavailable.has(id))
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.reparse' });
  }
}
